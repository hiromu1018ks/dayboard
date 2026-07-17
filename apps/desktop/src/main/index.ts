/**
 * Electron メインプロセス
 *
 * アプリ起動フロー（[architecture.md §6.1]）:
 *   1. SQLite ファイルパス解決（userData/dayborad.db）
 *   2. DB 接続確認（ファイル作成・読み書き可否）
 *   3. マイグレーション実行（最新でなければ適用）
 *   4. Hono API を localhost 動的ポートで起動
 *   5. BrowserWindow 生成、Renderer に API ベースURLを注入（preload 経由）
 *
 * main はドメインロジックを持たず（[architecture.md §3.1]）、起動・ライフサイクル管理のみを行う。
 */

import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import nodePath, { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ping, closePool, runMigrations } from 'repository';
import { startServer, type StartedServer } from 'api';

const __dirname = dirname(fileURLToPath(import.meta.url));

let apiServer: StartedServer | null = null;

/**
 * カスタムプロトコル `app://dayborad` を特権スキーマとして登録する
 * （[architecture.md §7] の CORS契約）。
 *
 * `protocol.registerSchemesAsPrivileged` は app の ready イベントより前に
 * 1度だけ呼ぶ必要がある。`secure: true` で secure context として扱い、
 * `supportFetchAPI: true` で Renderer からの fetch 対象にする。
 * `corsEnabled: false` は CORS 判定を Hono 側の cors.ts に一任するため
 * （true にすると Electron が独自の CORS ヘッダを付与して二重管理になる）。
 *
 * このスキーマにより、Renderer の Origin は `file://`（= null）ではなく
 * `app://dayborad` になり、cors.ts の許可リストと一致する。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

/**
 * Renderer の静的資産ディレクトリ（index.html を含む）を返す。
 *
 * 開発時・パッケージ版ともに `__dirname`（out/main/index.js の位置）から
 * 1階層上の `renderer/` に配置されるため、`app.isPackaged` で分岐しない。
 * パッケージ版では asar 内の同じ相対位置になる。
 */
function resolveRendererRoot(): string {
  return join(__dirname, '../renderer');
}

/**
 * `app://dayborad` プロトコルのリクエストハンドラを登録する。
 *
 * リクエスト URL の pathname（例: `/index.html`, `/assets/index-xxx.js`）を
 * renderer ルートからの相対パスへ解決し、`net.fetch` + `pathToFileURL` で返す。
 * パストラバーサル（`../../etc/passwd` 等）は相対パス検査で拒否する。
 *
 * app の ready 後に呼ぶこと（`protocol.handle` の前提）。
 */
function registerAppProtocol(): void {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rendererRoot = resolveRendererRoot();
    // 先頭 `/` を除去して renderer ルートからの相対パスへ
    const relativeResource = decodeURIComponent(pathname).replace(/^\//, '');
    const resolved = resolvePath(rendererRoot, relativeResource);
    const rel = nodePath.relative(rendererRoot, resolved);
    // renderer ルートの外へ出る解決結果（`..` を含む、または絶対）は拒否
    if (rel.startsWith('..') || nodePath.isAbsolute(rel)) {
      return new Response('forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

/**
 * preload へ渡す API ベースURL（Hono 起動後に決定）。
 * preload は `get-api-base-url` 同期IPCでこの値を取りに来る。
 */
let injectedApiBaseUrl: string | undefined;

// preload からの API ベースURL 問い合わせを受け付ける同期ハンドラ。
// createWindow の前にこのハンドラが登録済みであることが前提。
// （BrowserWindow 生成 → preload 読込 の順のため、モジュール初期化時に登録する）
ipcMain.on('get-api-base-url', (event) => {
  event.returnValue = injectedApiBaseUrl;
});

/**
 * 全 BrowserWindow へ flush-all を要求し、flush-done を待つ（[roadmap.md T-2-13]）。
 *
 * [autosave_spec.md §10.1]: before-quit で Renderer へ flush-all を要求し、
 * Renderer が全保留対象を localStorage へ同期書き込みするまで待機する。
 *
 * タイムアウト（2s）を設け、Renderer が応答しない場合は待たずに終了へ進む。
 * localStorage バッファ（§6.2）が真の保険になるため、flush 未完了でも入力喪失は
 * 起きない（編集ごとに localStorage へ書き込んでいるため）。
 */
function requestFlushAll(): Promise<void> {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let remaining = windows.length;
    let settled = false;

    const onDone = () => {
      if (settled) return;
      remaining -= 1;
      if (remaining <= 0) {
        settled = true;
        ipcMain.removeListener('flush-done', onDone);
        resolve();
      }
    };
    ipcMain.on('flush-done', onDone);

    for (const win of windows) {
      win.webContents.send('flush-all');
    }

    // タイムアウト: Renderer が応答しない場合でも終了へ進む（§10.1 の待ち時間上限）
    setTimeout(() => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('flush-done', onDone);
      resolve();
    }, 2000);
  });
}

/**
 * マイグレーションフォルダを解決する。
 *
 * 開発時: monorepo のリポジトリパッケージ（packages/repository/migrations）を参照。
 *   electron-vite dev では main は apps/desktop/out/main/index.js にバンドルされるため、
 *   そこからリポジトリパッケージの migrations を絶対パスで指す。
 * パッケージ版: 配布物の resources/migrations を参照（Phase 8 で整備）。
 */
function resolveMigrationsFolder(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'migrations');
  }
  // 開発時: apps/desktop/out/main → apps/desktop/out → apps/desktop → apps → ルート
  //   4階層上がったルートから packages/repository/migrations を指す。
  return join(__dirname, '../../../../packages/repository/migrations');
}

/**
 * SQLite データベースファイルの配置パスを解決し、DATABASE_URL を設定する。
 *
 * [architecture.md §2.2] の「ローカル保存（SQLite）」方針に基づき、
 * ユーザーの userData ディレクトリ（OS 標準のアプリ別データ領域）配下へ
 * `dayborad.db` を置く。これにより利用者は何もセットアップせずに起動できる。
 *
 * DATABASE_URL が既に環境変数で設定されている場合はそれを尊重する
 * （E2E テストで一時ディレクトリを明示指定する場合等）。
 */
function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const dbPath = join(app.getPath('userData'), 'dayborad.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

/**
 * アプリ起動フロー（DBパス解決 → DB接続確認 → マイグレーション → API起動）。
 * BrowserWindow 生成前に呼ぶ。
 *
 * [architecture.md §6.1] の起動シーケンスに従う。
 * マイグレーション実行は repository パッケージに委譲し、
 * main プロセスは drizzle に直接依存しない。
 */
async function bootstrap(): Promise<StartedServer> {
  // 0. SQLite ファイルパスを userData 配下へ解決し DATABASE_URL を設定
  //    （既に環境変数が設定されている場合は尊重する）
  ensureDatabaseUrl();

  // 1. DB 接続確認（ファイル作成可否・読み書き権限の検証を兼ねる）
  await ping();
  console.log(`[main] SQLite connected: ${process.env.DATABASE_URL}`);

  // 2. マイグレーション実行（repository パッケージ経由）
  await runMigrations(resolveMigrationsFolder());
  console.log('[main] migrations applied');

  // 3. Hono API 起動（動的ポート: port=0 で空きポート取得）
  apiServer = await startServer({ host: '127.0.0.1', port: 0 });
  console.log(`[main] API server started at ${apiServer.baseUrl}`);

  return apiServer;
}

/**
 * BrowserWindow を生成し、Renderer を読み込む。
 * API ベースURLは preload 経由で `window.__API_BASE_URL__` に注入する。
 */
function createWindow(apiBaseUrl: string): void {
  // preload が IPC（get-api-base-url）で取りに来るため、BrowserWindow 生成前に設定。
  // 従来の process.env.INJECTED_API_BASE_URL はフォールバック兼開発時分離起動用。
  injectedApiBaseUrl = apiBaseUrl;
  process.env['INJECTED_API_BASE_URL'] = apiBaseUrl;

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    // E2E テスト実行時（E2E_HEADLESS=1）はウィンドウを表示せず完全ヘッドレスで動かす。
    // Playwright の _electron API は show:false の BrowserWindow でも操作可能だが、
    // ready-to-show で show() すると画面にウィンドウが出て他の作業の邪魔になるため。
    if (process.env['E2E_HEADLESS'] !== '1') {
      mainWindow.show();
    }
  });

  // 外部リンクは既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 開発時: HMR 付きの Renderer を読み込む（Vite dev server の Origin は cors.ts で許可済み）
  // プロダクション・E2E: app://dayborad カスタムプロトコルで読み込む。
  //   file:// 由来の Origin: null を避け、Origin を固定して CORS を安定させる
  //   （[architecture.md §7] の CORS契約）。loadFile は使わない。
  const isDev = !app.isPackaged;
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadURL('app://dayborad/index.html');
  }
}

/**
 * アプリ初期化後のエントリポイント。
 */
app.whenReady().then(async () => {
  // app://dayborad カスタムプロトコルのハンドラを登録（最初の loadURL より前）
  registerAppProtocol();

  try {
    const server = await bootstrap();
    createWindow(server.baseUrl);
  } catch (err) {
    console.error('[main] bootstrap failed:', err);
    // ユーザーへエラー表示して終了。
    // SQLite（libSQL）環境では主な原因は userData ディレクトリのアクセス権限・
    // ディスク容量・マイグレーション破損等。DATABASE_URL を明示設定している場合は併記する。
    const dbInfo = process.env.DATABASE_URL ? `\n\nDB: ${process.env.DATABASE_URL}` : '';
    dialog.showErrorBox(
      '起動エラー',
      `アプリを起動できませんでした:\n${err}${dbInfo}\n\nディスクの空き容量・フォルダのアクセス権限をご確認ください。`,
    );
    app.quit();
  }

  // macOS: Dock アイコンクリックでウィンドウ再生成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (apiServer) createWindow(apiServer.baseUrl);
    }
  });
});

// 全ウィンドウクローズ時（Windows/Linux はアプリ終了）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリ終了前にリソースを安全に解放（[architecture.md §3.1]）
app.on('before-quit', async (event) => {
  if (apiServer) {
    event.preventDefault();
    try {
      // Renderer の保留中編集を localStorage へ保護（[autosave_spec.md §10.1]、T-2-13）
      await requestFlushAll();
      await apiServer.close();
      await closePool();
      console.log('[main] resources released');
    } catch (err) {
      console.error('[main] error during shutdown:', err);
    } finally {
      apiServer = null;
      app.quit();
    }
  }
});

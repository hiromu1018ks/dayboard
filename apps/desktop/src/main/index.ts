/**
 * Electron メインプロセス
 *
 * アプリ起動フロー（[architecture.md §6.1]）:
 *   1. PostgreSQL 接続確認（未起動ならエラー）
 *   2. マイグレーション実行（最新でなければ適用）
 *   3. Hono API を localhost 動的ポートで起動
 *   4. BrowserWindow 生成、Renderer に API ベースURLを注入（preload 経由）
 *
 * main はドメインロジックを持たず（[architecture.md §3.1]）、起動・ライフサイクル管理のみを行う。
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ping, closePool, runMigrations } from 'repository';
import { startServer, type StartedServer } from 'api';

const __dirname = dirname(fileURLToPath(import.meta.url));

let apiServer: StartedServer | null = null;

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
 * アプリ起動フロー（DB接続 → マイグレーション → API起動）。
 * BrowserWindow 生成前に呼ぶ。
 *
 * [architecture.md §6.1] の起動シーケンスに従う。
 * マイグレーション実行は repository パッケージに委譲し、
 * main プロセスは drizzle に直接依存しない。
 */
async function bootstrap(): Promise<StartedServer> {
  // 1. PostgreSQL 接続確認
  await ping();
  console.log('[main] PostgreSQL connected');

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
    mainWindow.show();
  });

  // 外部リンクは既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 開発時: HMR 付きの Renderer を読み込む
  // プロダクション: ビルド済みファイルを読み込む
  const isDev = !app.isPackaged;
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // preload が API URL を読み取れるよう、main プロセス側で保持
  // （preload の contextBridge で expose する値を固定するため）
  process.env['INJECTED_API_BASE_URL'] = apiBaseUrl;
}

/**
 * アプリ初期化後のエントリポイント。
 */
app.whenReady().then(async () => {
  try {
    const server = await bootstrap();
    createWindow(server.baseUrl);
  } catch (err) {
    console.error('[main] bootstrap failed:', err);
    // ユーザーへエラー表示して終了
    dialog.showErrorBox('起動エラー', `アプリを起動できませんでした:\n${err}`);
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

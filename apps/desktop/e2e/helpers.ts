/**
 * Electron E2E テスト用ヘルパー（[roadmap.md T-2-15] / [T-8-01]）
 *
 * Playwright の `_electron` API で実 Electron アプリを起動する
 * （[test_strategy.md §5.1]）。
 *
 * 前提: `pnpm build`（electron-vite build）済みで、
 * apps/desktop/out に main/preload/renderer のビルド成果物があること。
 *
 * 注意: リポジトリは ESM (`"type": "module"`) のため、`__dirname` は未定義。
 * `import.meta.url` から生成する（main/index.ts と同じパターン）。
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * E2E テスト用 DATABASE_URL の既定値。
 *
 * 開発用DB（dayborad_dev）を汚さないため、E2E 専用の dayborad_e2e を使う
 * （[test_strategy.md §4.1] の隔離方針）。事前作成・マイグレーションが必要
 * （docs/release_checklist.md の手順参照）。
 */
const DEFAULT_E2E_DATABASE_URL = 'postgres://localhost:5432/dayborad_e2e';

/**
 * launchApp で生成した一時 userData ディレクトリの履歴。
 * closeApp 時に削除する。テスト間で localStorage・キャッシュを完全に隔離するため、
 * 各起動で新しいディレクトリを作る（recoverOnStartup の localStorage 再送が
 * 前テストのデータをリークしないようにする）。
 */
const tempUserDataDirs: string[] = [];

/**
 * テスト用の isolated な一時 userData ディレクトリを作成する。
 * クラッシュ→復元等、同一テスト内で複数回 launchApp する際に同じ localStorage を
 * 共有したい場合に使う。呼び出し元が cleanup も行う。
 */
export function createTempUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'dayborad-e2e-'));
}

/**
 * 一時 userData ディレクトリを削除する（createTempUserDataDir の後処理用）。
 */
export function removeTempUserDataDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 削除失敗は無視
  }
}

/**
 * テスト用 Electron アプリを起動し、最初のウィンドウを返す。
 *
 * @param options
 *   - env: 環境変数のオーバーライド（DATABASE_URL 等）
 *   - userDataDir: 同一テスト内で複数回起動し localStorage を共有したい場合に指定。
 *     省略時は毎回新規の一時ディレクトリを作る（テスト間隔離）。
 */
export async function launchApp(options?: {
  env?: Record<string, string>;
  userDataDir?: string;
}): Promise<{ app: ElectronApplication; window: Page }> {
  const mainPath = resolve(__dirname, '../out/main/index.js');
  // DATABASE_URL が未設定なら E2E 専用DBへ（開発用DB dayborad_dev の汚染防止）
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_E2E_DATABASE_URL;

  // userDataDir が指定されればそれを使い、未指定なら新規作成（テスト間隔離）。
  // クラッシュ→復元テストのように「同一 localStorage を再利用」したい場合は
  // 呼び出し元で createTempUserDataDir() して同じ dir を渡す。
  const userDataDir = options?.userDataDir ?? mkdtempSync(join(tmpdir(), 'dayborad-e2e-'));
  if (!options?.userDataDir) {
    tempUserDataDirs.push(userDataDir);
  }

  const app = await electron.launch({
    args: [mainPath, `--user-data-dir=${userDataDir}`],
    env: {
      // 既定環境変数を引き継ぎつつ上書き
      ...process.env,
      DATABASE_URL: databaseUrl,
      ...(options?.env ?? {}),
      // ヘッドレス GPU を無効化（CI 環境向け）
      ELECTRON_DISABLE_GPU: '1',
    },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  // ウィンドウが安定するまで少し待つ（renderer の初期描画・初回fetch）
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

/**
 * アプリを安全に終了する。
 *
 * before-quit ハンドラ（flush-all + API close + pool close）の完了を待つため、
 * app.close() の後に短い待機を挟む。これにより、次の launchApp が前回プロセスの
 * リソース解放と競合するのを防ぐ（[autosave_spec.md §10.1]、T-2-13）。
 * また、launchApp で作成した一時 userData ディレクトリを削除する。
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // 既に閉じている場合は無視
  }
  // before-quit の非同期処理（最大2sのflushタイムアウト含む）が収束する余地を与える
  await new Promise((resolve) => setTimeout(resolve, 500));
  // 一時 userData ディレクトリを削除（テスト間の localStorage リーク防止）
  while (tempUserDataDirs.length > 0) {
    const dir = tempUserDataDirs.pop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 削除失敗は無視（OS の一時ディレクトリなので残っても害はない）
      }
    }
  }
}

/**
 * アプリ起動直後の「準備完了」を待つ共通ヘルパ。
 *
 * launchApp の domcontentloaded 待ちだけでは、Renderer の初回 fetch・keydown リスナ登録・
 * React 初期描画が完了していないことがあり、直後のショートカット（⌘+J 等）が未到着になる
 * レースが起きる。本関数で仕事整理モードの初期要素（テーマ入力欄）が表示されるのを待ち、
 * モード切替等の操作を安全に実行できるようにする。
 */
export async function waitForAppReady(window: Page, timeoutMs = 15_000): Promise<void> {
  await window.locator('#theme-input').waitFor({ state: 'visible', timeout: timeoutMs });
}

/**
 * launchApp + waitForAppReady を組み合わせた便利ヘルパ。
 * 起動直後にショートカット操作を行うテストで、レースを避けるために使う。
 */
export async function launchAppReady(options?: {
  env?: Record<string, string>;
  userDataDir?: string;
}): Promise<{ app: ElectronApplication; window: Page }> {
  const launched = await launchApp(options);
  await waitForAppReady(launched.window);
  return launched;
}

/**
 * 自動保存の完了を待つ共通ヘルパ（[ui_interaction_spec.md §10] 準拠）。
 *
 * SaveStatus コンポーネントは:
 * - `idle`/`saving` = 「保存中...」を表示
 * - `saved` = **非表示**（表示が消えることで保存完了を伝える設計、§10）
 *
 * 従来の E2E は `text=保存済み` の出現を待っていたが、仕様上「保存済み」表示は存在しない
 * ためタイムアウトしていた。本ヘルパは「保存中...」の出現→消失で保存完了を検知する。
 *
 * 使い分け:
 * - `waitForSaved(window)`: 編集後に呼ぶ。「保存中...」が出て消えるのを待つ（保存完了）。
 * - `waitForSavedSteady(window)`: アプリ起動直後など、初期状態が saved（=非表示）に
 *   収束するのを待つ。編集前の初期安定待ちに使う。
 *
 * @param window Electron の Page
 * @param timeoutMs タイムアウト（既定 10s）
 */
export async function waitForSaved(window: Page, timeoutMs = 10_000): Promise<void> {
  // 保存中（idle/saving）の表示を待つ → 消える（= saved へ遷移）のを待つ
  // ※ debounce 800ms + サーバー往復を想定。保存中が一瞬で抜ける場合もあるため、
  //   最初から無い場合は即完了とみなす（waitForSelector のタイムアウトを短めに設定）。
  const savingLocator = window.getByText('保存中...');
  try {
    await savingLocator.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    // 保存中表示を捕捉できなかった場合は既に saved へ遷移したとみなす
    return;
  }
  await savingLocator.waitFor({ state: 'detached', timeout: timeoutMs });
}

/**
 * アプリ起動直後の初期状態（saved = 保存中表示なし）が安定するまで待つ。
 * 初期 fetch や localStorage 復元の保存が落ち着くのを待つ用途。
 */
export async function waitForSavedSteady(window: Page, timeoutMs = 10_000): Promise<void> {
  // 「保存中...」が表示されていれば消えるまで待つ。無ければ即完了。
  const savingLocator = window.getByText('保存中...');
  if (await savingLocator.isVisible().catch(() => false)) {
    await savingLocator.waitFor({ state: 'detached', timeout: timeoutMs });
  }
}

/**
 * E2E 用 DB のデータテーブルを TRUNCATE して隔離する（[test_strategy.md §4.1]）。
 *
 * すべての spec の beforeEach で呼び、前のテストの DayNote/TODO 等が残らないようにする。
 * マイグレーション状態・スキーマは保持。user_settings は既定行が必要なため含めない。
 *
 * launchApp と同じ DATABASE_URL を見るため、未設定時は dayborad_e2e を既定値とする。
 * 前提: DATABASE_URL（既定 dayborad_e2e）がマイグレーション済みであること。
 */
export async function resetE2eDatabase(): Promise<void> {
  // launchApp と同じ既定値を保証（プロセス env へ設定してから getPool で読ませる）
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_E2E_DATABASE_URL;
  }
  // 動的 import で repository パッケージから。テスト実行時に解決。
  const { getPool, closePool } = await import('repository');
  const pool = getPool();
  await pool.query(
    `TRUNCATE TABLE
       note_line_metas,
       note_entries,
       reflections,
       blocker_items,
       todo_items,
       day_notes
     RESTART IDENTITY CASCADE`,
  );
  // user_settings は「標準キーバインド」へ戻す（テスト間で Vim 設定がリークしないよう）
  await pool.query(
    `INSERT INTO user_settings (id, keybinding_mode, vim_default_state)
     VALUES ('default', 'standard', 'normal')
     ON CONFLICT (id) DO UPDATE SET
       keybinding_mode = EXCLUDED.keybinding_mode,
       vim_default_state = EXCLUDED.vim_default_state`,
  );
  await closePool();
}

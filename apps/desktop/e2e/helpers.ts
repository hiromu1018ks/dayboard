/**
 * Electron E2E テスト用ヘルパー（[roadmap.md T-2-15]）
 *
 * Playwright の `_electron` API で実 Electron アプリを起動する
 * （[test_strategy.md §5.1]）。
 *
 * 前提: `pnpm build`（electron-vite build）済みで、
 * apps/desktop/out に main/preload/renderer のビルド成果物があること。
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * テスト用 Electron アプリを起動し、最初のウィンドウを返す。
 *
 * @param options
 *   - envFile: 環境変数のオーバーライド（DATABASE_URL 等）
 *   - recordVideo: 動画録画（デバッグ用、既定 false）
 */
export async function launchApp(options?: {
  env?: Record<string, string>;
}): Promise<{ app: ElectronApplication; window: Page }> {
  const mainPath = resolve(__dirname, '../out/main/index.js');
  const app = await electron.launch({
    args: [mainPath],
    env: {
      // 既定環境変数を引き継ぎつつ上書き
      ...process.env,
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
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // 既に閉じている場合は無視
  }
}

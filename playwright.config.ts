import { defineConfig } from '@playwright/test';

/**
 * Playwright 設定（[roadmap.md T-2-15]）
 *
 * Electron アプリの E2E テスト（[test_strategy.md §5.1]）。
 * Playwright の `_electron` API で実 Electron アプリを起動する。
 *
 * 注意:
 * - Electron E2E は launch のタイミングやビルド状態に依存するため、
 *   CI 必須化はしない（[test_strategy.md §5.3]、[roadmap.md T-2-15]）。
 *   ローカルで `pnpm test:e2e` で実行可能。
 * - 実行前に対象のビルド（main/preload/renderer）が必要。
 *   test:e2e スクリプトが build → test の順で実行する。
 *
 * [test_strategy.md §5]: docs/test_strategy.md
 */

export default defineConfig({
  testDir: './apps/desktop/e2e',
  // Electron 起動は重いため、テストごとのタイムアウトを長めに設定
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 直列実行（Electron アプリは並列起動が困難）
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

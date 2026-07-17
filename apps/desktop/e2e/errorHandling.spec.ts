/**
 * エラー処理・AC-14 E2E テスト
 *
 * 既存テストで未カバーだったエラー系の UI 挙動を検証:
 * - AC-14: 保存失敗時の SaveStatus error 表示 + 「再試行」ボタン → saved 復帰
 * - 「自動保存失敗による入力喪失 0件」（要件 4.3）のエラー経路
 *
 * アプローチ: Playwright の route interception で Hono API の PATCH を 500 に差し替え、
 * サーバー保存を安全に失敗させる。アプリプロセス（Electron + Hono + PostgreSQL）は
 * 停止せず、リクエスト/レスポンスだけを Mock するため他のテストへ影響しない。
 *
 * 注意:
 * - Electron アプリの BrowserWindow に対して route を設定可能（Chromium ベース）。
 * - route はテスト終了時に page.unroute で解除し、次テストへの影響を防ぐ。
 * - error 状態でも localStorage への編集保護は機能するため、編集内容は失われない。
 */

import { expect, test, type ElectronApplication, type Page, type Route } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';

/**
 * PATCH/POST /api/day-notes/** をインターセプトし、failMode に応じて成功/失敗を切替える。
 *
 * - failMode=true:  500 Internal Server Error を返す（保存失敗を再現）
 * - failMode=false: route.continue() で本来のエンドポイントへ通す（保存成功）
 *
 * unroute のタイミング問題を回避するため、フラグで動的に切替える。
 * テスト終了時に unroute を呼び、次テストへの影響を防ぐ。
 *
 * @returns { setFailMode, unroute } フラグ切替と route 解除の関数
 */
async function interceptPatchWithFailFlag(window: Page): Promise<{
  setFailMode: (fail: boolean) => void;
  unroute: () => Promise<void>;
}> {
  let failMode = true;
  await window.route('**/api/day-notes/**', async (route: Route) => {
    const method = route.request().method();
    if (failMode && (method === 'PATCH' || method === 'POST')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'mock: internal server error' },
        }),
      });
      return;
    }
    // GET 等または failMode=false は本来のエンドポイントへ通す
    await route.continue();
  });
  return {
    setFailMode: (fail: boolean) => {
      failMode = fail;
    },
    unroute: async () => {
      await window.unroute('**/api/day-notes/**');
    },
  };
}

test.describe('AC-14: 保存失敗時の SaveStatus error 表示と再試行', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('保存失敗 → error表示 + 再試行ボタン → 再試行で saved 復帰（AC-14）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // PATCH/POST を動的に成功/失敗切替えられるインターセプタを設定
    const interceptor = await interceptPatchWithFailFlag(window);

    try {
      // テーマ入力 → デバウンス800ms後、PATCH が 500 で失敗 → error 状態へ
      await window.locator(THEME_INPUT).fill('保存失敗させるテーマ');

      // 「保存できませんでした」+ 再試行ボタンが表示される（AC-14）
      // リトライは 1s→2s→4s 間隔で自動試行されるが、全て失敗し最終 error 状態へ収束する。
      await expect(window.getByText('保存できませんでした')).toBeVisible({ timeout: 30_000 });
      await expect(window.locator('button:has-text("再試行")')).toBeVisible();

      // error 状態でもテーマ入力は保持される（入力喪失 0件、要件 4.3）
      await expect(window.locator(THEME_INPUT)).toHaveValue('保存失敗させるテーマ');

      // 自動リトライ（1s→2s→4s）が全て終わり、最終 error 状態へ収束するのを待つ。
      // これを待たないと failMode 切替後に自動リトライが走り、再試行ボタン押下と競合する。
      await window.waitForTimeout(8000);

      // インターセプタを「成功モード」へ切替（次回の PATCH は本来のエンドポイントへ通る）
      interceptor.setFailMode(false);

      // 「再試行」ボタンをクリック → PATCH が成功 → saved へ（SaveStatus 非表示）
      await window.locator('button:has-text("再試行")').click();
      // saved 状態では SaveStatus が非表示になる（「保存できませんでした」「保存中...」共に消える）
      await expect(window.getByText('保存できませんでした')).not.toBeVisible({ timeout: 30_000 });
      await expect(window.getByText('保存中...')).not.toBeVisible({ timeout: 15_000 });
    } finally {
      await interceptor.unroute();
    }
  });
});

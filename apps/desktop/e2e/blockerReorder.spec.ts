/**
 * Blocker ↑/↓ ボタン並替え E2E テスト（要件7.4 補完）
 *
 * workCrud.spec では TODO の ↑/↓ ボタン並替えを検証しているが、
 * Blocker 側は未カバーのため追加する。同じ onReorder → POST /blockers/reorder 経路。
 *
 * 検証項目:
 * - ↑/↓ ボタンでBlocker順序を入替 → reorder API へ反映
 * - 先頭アイテムの「上へ」、末尾アイテムの「下へ」は disabled
 * - 並替え後の順序が永続化される（再起動後も維持）
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_BLOCKER_INPUT = 'input[aria-label="新規障害入力"]';

/** Blockerを1件追加するヘルパ。POST /blockers の 201 を待つ。 */
async function addBlocker(window: Page, text: string): Promise<void> {
  await window.locator(NEW_BLOCKER_INPUT).click();
  await window.locator(NEW_BLOCKER_INPUT).fill(text);
  const postPromise = window.waitForResponse(
    (res) =>
      res.url().includes('/blockers') &&
      res.request().method() === 'POST' &&
      !res.url().includes('reorder') &&
      res.status() === 201,
    { timeout: 10_000 },
  );
  await window.keyboard.press('Enter');
  await postPromise;
}

/**
 * リストアイテムのホバー時のみ表示されるボタンをクリックするヘルパ（workCrud と同実装）。
 */
async function clickHoverButton(
  item: import('@playwright/test').Locator,
  ariaLabel: string,
): Promise<void> {
  await item.hover();
  const button = item.locator(`button[aria-label="${ariaLabel}"]`);
  await expect(button).toBeVisible({ timeout: 5_000 });
  await button.click();
}

test.describe('仕事整理モード: Blocker ↑/↓ ボタン並替え（要件7.4）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('↑/↓ ボタンでBlocker順序を入替 → reorder API へ反映', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, 'BLK-UPDOWN-A');
    await addBlocker(window, 'BLK-UPDOWN-B');

    const section = window.locator('section[aria-label="障害・詰まり"]');
    const items = section.locator('li:has(button[data-focus-item])');

    // 初期順序: [A, B]
    await expect(items.nth(0)).toContainText('BLK-UPDOWN-A');
    await expect(items.nth(1)).toContainText('BLK-UPDOWN-B');

    // B（2番目）の「上へ移動」をクリック → Bが先頭へ
    const reorderPromise = window.waitForResponse(
      (res) =>
        res.url().includes('/blockers/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await clickHoverButton(items.nth(1), '上へ移動');
    await reorderPromise;

    // 順序が入れ替わる: [B, A]
    await expect(items.nth(0)).toContainText('BLK-UPDOWN-B');
    await expect(items.nth(1)).toContainText('BLK-UPDOWN-A');

    // 先頭アイテムの「上へ」は disabled
    await items.nth(0).hover();
    await expect(items.nth(0).locator('button[aria-label="上へ移動"]')).toBeDisabled();
    // 末尾アイテムの「下へ」は disabled
    await items.nth(1).hover();
    await expect(items.nth(1).locator('button[aria-label="下へ移動"]')).toBeDisabled();
  });

  test('Blocker 並替え → 再起動後も順序が維持される（永続化）', async () => {
    // 1回目: 3件追加して並替え
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, 'BLK-PERSIST-1');
    await addBlocker(window, 'BLK-PERSIST-2');
    await addBlocker(window, 'BLK-PERSIST-3');

    const section = window.locator('section[aria-label="障害・詰まり"]');
    const items = section.locator('li:has(button[data-focus-item])');

    // 3番目を先頭へ（↑を2回）
    const reorder1 = window.waitForResponse(
      (res) =>
        res.url().includes('/blockers/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await clickHoverButton(items.nth(2), '上へ移動');
    await reorder1;
    const reorder2 = window.waitForResponse(
      (res) =>
        res.url().includes('/blockers/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    // 1回目の並替え直後の DOM インデックスは更新されているため、nth(1) を再取得
    await clickHoverButton(items.nth(1), '上へ移動');
    await reorder2;

    // 並替え後: [3, 1, 2]
    await expect(items.nth(0)).toContainText('BLK-PERSIST-3');
    await expect(items.nth(1)).toContainText('BLK-PERSIST-1');
    await expect(items.nth(2)).toContainText('BLK-PERSIST-2');

    await closeApp(app);

    // 2回目: 再起動後も同じ順序が維持
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    const section2 = window.locator('section[aria-label="障害・詰まり"]');
    const items2 = section2.locator('li:has(button[data-focus-item])');
    await expect(items2.nth(0)).toContainText('BLK-PERSIST-3', { timeout: 10_000 });
    await expect(items2.nth(1)).toContainText('BLK-PERSIST-1');
    await expect(items2.nth(2)).toContainText('BLK-PERSIST-2');
  });
});

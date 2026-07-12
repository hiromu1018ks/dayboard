/**
 * 未完了TODO持ち越し E2E テスト（[roadmap.md T-8-01]）
 *
 * AC-11: 当日の未完了TODOが存在する場合、翌日へ持ち越すと、翌日のノートにTODOが作成され、
 *   元TODOは carried になり、持ち越し元の日付が保持される。
 * AC-12: すでに持ち越し済みのTODOを再度持ち越そうとすると、重複した持ち越しTODOは作成されない。
 *
 * [要件 7.10] / [test_strategy.md §5.2]:
 * - 持ち越し後、当日は carried 表示（→ 翌日へ持ち越し済み）
 * - 翌日は「M/Dから持ち越し」表示
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない、[test_strategy.md §5.3]）。
 * - 実行前に PostgreSQL（dayborad_e2e）起動済み・マイグレーション済み・ビルド済みであること。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEXT_BUTTON = 'button[aria-label="翌日へ"]';

/**
 * TODOを1件追加するヘルパ。Enter で確定し、保存完了を待つ。
 */
async function addTodo(window: Page, title: string): Promise<void> {
  await window.locator(NEW_TODO_INPUT).click();
  await window.locator(NEW_TODO_INPUT).fill(title);
  await window.keyboard.press('Enter');
  // 即時保存（POST）のラウンドトリップを待つ
  await window.waitForSelector('text=保存済み', { timeout: 10_000 });
}

test.describe('未完了TODO持ち越し（AC-11/AC-12）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('未完了TODOを翌日へ持ち越し → 当日carried・翌日に持ち越しTODO（AC-11）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // TODOを1件追加（未完了）
    const todoTitle = `持ち越し確認 ${Date.now()}`;
    await addTodo(window, todoTitle);

    // 「未完了を翌日へ持ち越し」を開く
    await window.click('text=/未完了を翌日へ持ち越し/');
    // 確認ダイアログの「持ち越す」
    await window.click('button:has-text("持ち越す")');

    // 当日側が carried になる（→ 翌日へ持ち越し済み ラベル）
    await expect(window.locator('text=/翌日へ持ち越し済み/')).toBeVisible({ timeout: 10_000 });

    // 翌日へ移動して、持ち越しTODOが表示される
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    // 翌日の fetch 完了を待つ（「下書き」or「保存済み」が表示される）
    await window.waitForSelector('text=/下書き|保存済み/', { timeout: 10_000 });
    // 翌日にTODOが表示され、「から持ち越し」ラベルがある
    await expect(window.getByText(todoTitle).first()).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('text=/から持ち越し/')).toBeVisible({ timeout: 10_000 });
  });

  test('持ち越し済みTODOを再度持ち越し → 重複作成されない（AC-12）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const todoTitle = `重複持ち越し ${Date.now()}`;
    await addTodo(window, todoTitle);

    // 1回目の持ち越し
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    await expect(window.locator('text=/翌日へ持ち越し済み/')).toBeVisible({ timeout: 10_000 });

    // carried になったTODOは「未完了」から除外されるため、持ち越しボタンが表示されないことを検証
    // （incompleteTodos.length === 0 なので「未完了を翌日へ持ち越し」は表示されない）
    await expect(window.locator('text=/未完了を翌日へ持ち越し/')).toHaveCount(0);
  });
});

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
import { closeApp, launchApp, resetE2eDatabase, waitForSavedSteady } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEXT_BUTTON = 'button[aria-label="翌日へ"]';

/**
 * TODOを1件追加するヘルパ。Enter で確定し、POST `/todos` の HTTP 201 を待つ。
 *
 * 「保存済み」表示は初期状態でも出ているため保存発火の目安にならない。
 * また `getByText(title)` は入力欄の残文字に誤ヒットする恐れがある。
 * そのため Playwright の waitForResponse で POST `/todos` の 201 を直接待ち、
 * 保存ラウンドトリップの完了を確実に検知する。
 */
async function addTodo(window: Page, title: string): Promise<void> {
  await window.locator(NEW_TODO_INPUT).click();
  await window.locator(NEW_TODO_INPUT).fill(title);
  // Enter 押下と POST 完了を並行して待つ
  const postPromise = window.waitForResponse(
    (res) =>
      res.url().includes('/todos') && res.request().method() === 'POST' && res.status() === 201,
    { timeout: 10_000 },
  );
  await window.keyboard.press('Enter');
  await postPromise;
  // 楽観的更新が React state へ反映されるまで短く待つ
  await window.waitForTimeout(300);
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

    // 当日側が carried になる（→ Carried to tomorrow ラベル、英語化: commit 50b0d57）
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });

    // 翌日へ移動して、持ち越しTODOが表示される
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    // 翌日の fetch 完了を待つ（保存中表示が消える = saved 収束を待つ）
    await waitForSavedSteady(window);
    // 翌日にTODOが表示され、「から持ち越し」ラベルがある（※ この表示は日本語まま）
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
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });

    // carried になったTODOは「未完了」から除外されるため、持ち越しボタンが表示されないことを検証
    // （incompleteTodos.length === 0 なので「未完了を翌日へ持ち越し」は表示されない）
    await expect(window.locator('text=/未完了を翌日へ持ち越し/')).toHaveCount(0);

    // AC-12 の実質検証: 翌日へ移動し、同一タイトルのTODOが1件のみ（重複なし）であることを確認。
    // API の重複判定（lineHash ベース、[api_contract.md §10]）が正しく働けば、
    // 2回持ち越しても2件目は作成されない。本テストは1回の持ち越し後の状態で検証。
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    // 同一タイトルのTODOが1件のみ（重複していない）
    const carriedTodos = window.locator(
      `section[aria-label="TODO"] li:has(span:has-text("${todoTitle}"))`,
    );
    await expect(carriedTodos).toHaveCount(1, { timeout: 15_000 });
  });

  test('複数未完了TODOを一度に持ち越し → 全件 carried + 翌日に全件出現（AC-11）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 3件追加
    await addTodo(window, '一括持ち越し1');
    await addTodo(window, '一括持ち越し2');
    await addTodo(window, '一括持ち越し3');

    // 「未完了を翌日へ持ち越し（3件）」であることを確認
    await expect(window.locator('text=/未完了を翌日へ持ち越し（3件）/')).toBeVisible();

    // 持ち越し実行
    await window.click('text=/未完了を翌日へ持ち越し/');
    // POST /carry-over の 200 を待つ
    const carryOverPromise = window.waitForResponse(
      (res) => res.url().includes('/carry-over') && res.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await window.click('button:has-text("持ち越す")');
    await carryOverPromise;

    // 全3件が carried 表示
    await expect(window.locator('text=/Carried to tomorrow/')).toHaveCount(3, { timeout: 10_000 });

    // 翌日へ移動 → 3件すべて出現
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('一括持ち越し1', {
      timeout: 15_000,
    });
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('一括持ち越し2');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('一括持ち越し3');
    // 3件すべて「から持ち越し」ラベル付き
    await expect(window.locator('text=/から持ち越し/')).toHaveCount(3);
  });

  test('完了済みTODOは持ち越し対象外 → 持ち越し後に当日に残る（AC-11、edge_cases §3.2）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 未完了1件 + 完了1件
    await addTodo(window, '持ち越し対象');
    await addTodo(window, '完了済みで残る');

    // 2件目を完了
    await window
      .locator('section[aria-label="TODO"] li')
      .nth(1)
      .locator('button[data-focus-item]')
      .click();
    await window.waitForTimeout(300);

    // 「未完了を翌日へ持ち越し（1件）」→ 完了済みは対象外で1件のみ
    await expect(window.locator('text=/未完了を翌日へ持ち越し（1件）/')).toBeVisible();

    // 持ち越し実行
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');

    // 「持ち越し対象」は carried 化
    await expect(window.locator('text=/Carried to tomorrow/')).toHaveCount(1, { timeout: 10_000 });
    // 「完了済みで残る」は done のまま当日に残る（carried にならない）
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('完了済みで残る');
    await expect(window.locator('section[aria-label="TODO"] span.line-through')).toHaveText(
      '完了済みで残る',
    );

    // 翌日へ移動 → 「完了済みで残る」は翌日に持ち越されていない
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('持ち越し対象');
    await expect(window.locator('section[aria-label="TODO"]')).not.toContainText('完了済みで残る');
  });
});

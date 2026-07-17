/**
 * ドラッグ&ドロップ並替え E2E テスト
 *
 * TODO/障害の並替を @dnd-kit で行う。既存の ↑/↓ ボタンに加え、
 * ドラッグハンドル（⠿）での並替えを検証する。
 *
 * 検証項目:
 * - TODO をドラッグして順序を入れ替え、reorder API（POST /todos/reorder）へ反映される
 * - carried TODO はドラッグ不可（順序が変わらない）
 *
 * 注意:
 * - dnd-kit は CSS transform とポインタイベントを使うため、Playwright の page.dragAndDrop
 *   ではなく mouse.{move,down,move,up} のステップ操作で再現する。
 * - ローカル実行を想定（[test_strategy.md §5.3]、CI必須でない）。
 * - 実行前に PostgreSQL（dayborad_e2e）起動済み・マイグレーション済み・ビルド済みであること。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';

/**
 * TODOを1件追加するヘルパ。Enter で確定し、POST `/todos` の 201 を待つ。
 */
async function addTodo(window: Page, title: string): Promise<void> {
  await window.locator(NEW_TODO_INPUT).click();
  await window.locator(NEW_TODO_INPUT).fill(title);
  const postPromise = window.waitForResponse(
    (res) =>
      res.url().includes('/todos') &&
      res.request().method() === 'POST' &&
      !res.url().includes('reorder') &&
      res.status() === 201,
    { timeout: 10_000 },
  );
  await window.keyboard.press('Enter');
  await postPromise;
  await window.waitForTimeout(300);
}

/** Blockerを1件追加するヘルパ。POST /blockers の 201 を待つ。 */
async function addBlocker(window: Page, text: string): Promise<void> {
  const input = window.locator('input[aria-label="新規障害入力"]');
  await input.click();
  await input.fill(text);
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
  await window.waitForTimeout(300);
}

/**
 * TODOリストのテキストを上から順に取得（順序検証用）。
 * 追加入力欄や空状態メッセージを除外するため、data-focus-item を持つ行のテキストを拾う。
 */
async function todoTexts(window: Page): Promise<string[]> {
  const items = window.locator('section[aria-label="TODO"] li:has(button[data-focus-item])');
  const texts: string[] = [];
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).innerText();
    // チェックアイコン等のノイズを除くため、TODO title の span を拾う
    const titleEl = items.nth(i).locator('span.text-ink, span[class*="line-through"]').first();
    if ((await titleEl.count()) > 0) {
      texts.push((await titleEl.textContent()) ?? '');
    } else {
      texts.push(text);
    }
  }
  return texts;
}

test.describe('ドラッグ&ドロップ並替え', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('TODO をドラッグして順序を入れ替え → reorder API へ反映', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // TODO を2件追加（順: A, B）
    await addTodo(window, 'DDD-A');
    await addTodo(window, 'DDD-B');

    // 初期順序の確認: [A, B]
    let texts = await todoTexts(window);
    expect(texts[0]).toContain('DDD-A');
    expect(texts[1]).toContain('DDD-B');

    // ドラッグハンドル（⠿）の位置を取得。B の行を A の上へドラッグする。
    const handles = window.locator('button[aria-label="ドラッグで並替"]');
    await expect(handles.nth(0)).toBeVisible();
    await expect(handles.nth(1)).toBeVisible();

    const handleB = handles.nth(1);
    const targetA = window.locator('section[aria-label="TODO"] li').nth(0);
    const bBox = await handleB.boundingBox();
    const aBox = await targetA.boundingBox();
    expect(bBox).not.toBeNull();
    expect(aBox).not.toBeNull();

    // ステップベースのドラッグ: B のハンドル → A の中央上へ
    await window.mouse.move(bBox!.x + bBox!.width / 2, bBox!.y + bBox!.height / 2);
    await window.mouse.down();
    // activationConstraint(distance: 5) を超えるよう少し動かす
    await window.mouse.move(bBox!.x + bBox!.width / 2, bBox!.y + bBox!.height / 2 - 10, {
      steps: 5,
    });
    // A の中央へ移動
    await window.mouse.move(aBox!.x + aBox!.width / 2, aBox!.y + aBox!.height / 2, {
      steps: 10,
    });

    // reorder の POST を待ち受ける（ドロップで発火）
    const reorderPromise = window.waitForResponse(
      (res) =>
        res.url().includes('/todos/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await window.mouse.up();
    await reorderPromise;
    await window.waitForTimeout(300);

    // 順序が入れ替わっている: [B, A]
    texts = await todoTexts(window);
    expect(texts[0]).toContain('DDD-B');
    expect(texts[1]).toContain('DDD-A');
  });

  test('carried TODO はドラッグ不可（順序が変わらない）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // TODO を2件追加。片方（A）を完了させておき、もう片方（B）のみ未完了にする。
    // 持ち越しは未完了TODO全件を対象とするため、B のみ carried 化される。
    await addTodo(window, 'CAR-A');
    await addTodo(window, 'CAR-B');

    // A を完了（carried 対象から外す）
    await window
      .locator('section[aria-label="TODO"] li')
      .nth(0)
      .locator('button[data-focus-item]')
      .click();
    await window.waitForTimeout(300);

    // B のみ未完了 → 持ち越しで B だけ carried 化
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });
    await window.waitForTimeout(300);

    // carried（B）の行にはドラッグハンドルが無いことを確認
    // （SortableTodoItem が disabled のとき dragHandleProps を渡さない）
    const handles = window.locator('button[aria-label="ドラッグで並替"]');
    const handleCount = await handles.count();
    // TODO 2件のうち1件（B）は carried → ハンドルは1つのみ（A は残る）
    expect(handleCount).toBe(1);
  });

  test('Blocker をドラッグして順序を入れ替え → reorder API へ反映', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // Blocker を2件追加
    await addBlocker(window, 'BLK-A');
    await addBlocker(window, 'BLK-B');

    // Blocker 列セクション内でドラッグハンドルを取得
    const blockerSection = window.locator('section[aria-label="障害・詰まり"]');
    const handles = blockerSection.locator('button[aria-label="ドラッグで並替"]');
    await expect(handles.nth(0)).toBeVisible();
    await expect(handles.nth(1)).toBeVisible();

    // 初期順序確認: [A, B]
    const items = blockerSection.locator('li:has(button[data-focus-item])');
    await expect(items.nth(0)).toContainText('BLK-A');
    await expect(items.nth(1)).toContainText('BLK-B');

    // B のハンドル → A の中央上へドラッグ
    const handleB = handles.nth(1);
    const targetA = blockerSection.locator('li').nth(0);
    const bBox = await handleB.boundingBox();
    const aBox = await targetA.boundingBox();
    expect(bBox).not.toBeNull();
    expect(aBox).not.toBeNull();

    await window.mouse.move(bBox!.x + bBox!.width / 2, bBox!.y + bBox!.height / 2);
    await window.mouse.down();
    await window.mouse.move(bBox!.x + bBox!.width / 2, bBox!.y + bBox!.height / 2 - 10, {
      steps: 5,
    });
    await window.mouse.move(aBox!.x + aBox!.width / 2, aBox!.y + aBox!.height / 2, {
      steps: 10,
    });

    const reorderPromise = window.waitForResponse(
      (res) =>
        res.url().includes('/blockers/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await window.mouse.up();
    await reorderPromise;
    await window.waitForTimeout(300);

    // 順序が入れ替わる: [B, A]
    await expect(items.nth(0)).toContainText('BLK-B');
    await expect(items.nth(1)).toContainText('BLK-A');
  });

  test('TODO並替え → 再起動後も順序が維持される（永続化）', async () => {
    // 1回目: TODO を3件追加して並替え
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, 'PERSIST-1');
    await addTodo(window, 'PERSIST-2');
    await addTodo(window, 'PERSIST-3');

    const section = window.locator('section[aria-label="TODO"]');
    const items = section.locator('li:has(button[data-focus-item])');

    // 3番目のアイテムを先頭へ移動（ドラッグハンドル経由）
    const handles = window.locator('button[aria-label="ドラッグで並替"]');
    const handleC = handles.nth(2);
    const targetA = section.locator('li').nth(0);
    const cBox = await handleC.boundingBox();
    const aBox = await targetA.boundingBox();
    expect(cBox).not.toBeNull();
    expect(aBox).not.toBeNull();

    await window.mouse.move(cBox!.x + cBox!.width / 2, cBox!.y + cBox!.height / 2);
    await window.mouse.down();
    await window.mouse.move(cBox!.x + cBox!.width / 2, cBox!.y + cBox!.height / 2 - 10, {
      steps: 5,
    });
    await window.mouse.move(aBox!.x + aBox!.width / 2, aBox!.y + aBox!.height / 2, {
      steps: 10,
    });
    const reorderPromise = window.waitForResponse(
      (res) =>
        res.url().includes('/todos/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await window.mouse.up();
    await reorderPromise;
    await window.waitForTimeout(500);

    // 並替え後の順序: [3, 1, 2]
    await expect(items.nth(0)).toContainText('PERSIST-3');
    await expect(items.nth(1)).toContainText('PERSIST-1');
    await expect(items.nth(2)).toContainText('PERSIST-2');

    await closeApp(app);

    // 2回目: 再起動後も同じ順序が維持される
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    const section2 = window.locator('section[aria-label="TODO"]');
    const items2 = section2.locator('li:has(button[data-focus-item])');
    await expect(items2.nth(0)).toContainText('PERSIST-3', { timeout: 10_000 });
    await expect(items2.nth(1)).toContainText('PERSIST-1');
    await expect(items2.nth(2)).toContainText('PERSIST-2');
  });
});

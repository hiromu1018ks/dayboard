/**
 * 仕事整理モード基本CRUD E2E テスト
 *
 * 既存テストで未カバーだった仕事整理モードの基本操作を包括的に検証:
 * - AC-02: TODO追加・編集・削除が日付に紐づき永続化、再起動後も維持
 * - AC-09: TODO完了切替（done↔todo）
 * - 要件 7.2〜7.5: TODO/障害/振り返りのCRUD
 * - edge_cases §2.1: 空確定で削除確認ダイアログ
 * - 空状態（No tasks yet / No blockers）
 *
 * 既存の dnd.spec / carryOver.spec と協調（重複しない範囲):
 * - dnd.spec: 並替え（ドラッグ&ドロップ）に特化
 * - carryOver.spec: 翌日持ち越しに特化
 * - 本ファイル: 追加・編集・完了切替・削除・空状態・永続化・Blocker を包括的に
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase, waitForSaved } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEW_BLOCKER_INPUT = 'input[aria-label="新規障害入力"]';

/** TODOの完了ボタンを取得（data-focus-item で特定。未完了は aria-label="完了にする"） */
const TODO_INCOMPLETE_BUTTON = 'button[aria-label="完了にする"]';
const TODO_DONE_BUTTON = 'button[aria-label="未完了に戻す"]';

/**
 * TODOを1件追加するヘルパ。POST /todos の 201 を確実に待つ。
 * dnd.spec.ts の addTodo と同等だが、本ファイルは並替えを伴わないため独立定義。
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
}

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
 * リストアイテムの「編集」「削除」等ホバー時のみ表示されるボタンをクリックするヘルパ。
 *
 * TodoItem/BlockerItem のボタン群は `opacity-0 group-hover:opacity-100` で、
 * 親 `li.group` へのホバー時のみ表示される。Playwright の click() は actionability check で
 * opacity:0 を不可視と判定する場合があり、クリックが失敗または onClick 未発火となり不安定。
 * これを回避するため、まず `li` へホバーしてボタンを可視化してからクリックする。
 * （実際のユーザー操作と同じ：マウスオーバーでボタンを表示 → クリック）
 *
 * ※編集モード開始には本文ダブルクリック（enterEditMode ヘルパ）を推奨。
 *   編集ボタン経路はホバー状態の揺らぎで onClick が発火しないケースがあるため。
 */
async function clickHoverButton(
  item: import('@playwright/test').Locator,
  ariaLabel: string,
): Promise<void> {
  // li.group へホバー → group-hover:opacity-100 が適用されボタンが可視化
  await item.hover();
  const button = item.locator(`button[aria-label="${ariaLabel}"]`);
  await expect(button).toBeVisible({ timeout: 5_000 });
  await button.click();
}

/**
 * TODO/Blocker アイテムをダブルクリックで編集モードへ入るヘルパ。
 *
 * TodoItem/BlockerItem の span には `onDoubleClick={startEdit}` が設定されており、
 * ホバー時のみ表示される「編集」ボタンよりも堅牢に編集モードへ入れる。
 * 実際のユーザー操作（本文をダブルクリックして編集）と同じ経路。
 *
 * @param item `li` 要素の Locator
 */
async function enterEditMode(item: import('@playwright/test').Locator): Promise<void> {
  // li の中の title 表示 span をダブルクリック
  const titleSpan = item.locator('span.text-ink, span[class*="line-through"]').first();
  await titleSpan.dblclick();
  // 編集 input が表示されるまで待つ
  const editInput = item.locator('input[type="text"]');
  await expect(editInput).toBeVisible({ timeout: 5_000 });
}

test.describe('仕事整理モード: TODO基本CRUD（AC-02/AC-09、要件7.3）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('初期状態は空リスト（No tasks yet）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 空状態プレースホルダの表示
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');
    // 持ち越しボタンは未完了TODOがないため非表示
    await expect(window.locator('text=/未完了を翌日へ持ち越し/')).toHaveCount(0);
  });

  test('TODO追加 → リストへ即時反映 → 再起動後も維持（AC-02）', async () => {
    const title = `永続化テスト ${Date.now()}`;

    // 1回目: 追加
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, title);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText(title);
    await closeApp(app);

    // 2回目: 再起動後も維持される
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('section[aria-label="TODO"]')).toContainText(title, {
      timeout: 10_000,
    });
  });

  test('TODO完了切替 → 取り消し線 + ✓ → 再度切替で戻る（AC-09）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '完了切替テスト');

    // 初期: 未完了（完了にする ボタンが表示）
    await expect(window.locator(TODO_INCOMPLETE_BUTTON)).toBeVisible();
    await expect(window.locator(TODO_DONE_BUTTON)).toHaveCount(0);

    // 完了へ切替（PATCH /todos/:id を待つ）
    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(TODO_INCOMPLETE_BUTTON).click();
    await patchPromise;

    // 完了状態: ✓アイコン + 取り消し線 + ボタンaria-label変更
    await expect(window.locator(TODO_DONE_BUTTON)).toBeVisible();
    await expect(window.locator(TODO_INCOMPLETE_BUTTON)).toHaveCount(0);
    await expect(window.locator('section[aria-label="TODO"] span.line-through')).toHaveText(
      '完了切替テスト',
    );

    // 再度クリックで未完了へ戻る（AC-09: 双方向）
    const patchPromise2 = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(TODO_DONE_BUTTON).click();
    await patchPromise2;
    await expect(window.locator(TODO_INCOMPLETE_BUTTON)).toBeVisible();
    await expect(window.locator(TODO_DONE_BUTTON)).toHaveCount(0);
  });

  test('TODO本文編集 → ダブルクリック → Enter確定で保存（要件7.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '編集前');

    // 本文ダブルクリックで編集モードへ（ホバー依存の✎ボタンより堅牢）
    const todoItem = window.locator('section[aria-label="TODO"] li').first();
    await enterEditMode(todoItem);

    // 編集inputが表示され、既存値が入っている
    const editInput = todoItem.locator('input[type="text"]');
    await expect(editInput).toHaveValue('編集前');

    // PATCHを待ち受けて確定
    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await editInput.fill('編集後');
    await window.keyboard.press('Enter');
    await patchPromise;

    // 編集後の値が表示される
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('編集後');
    await expect(window.locator('section[aria-label="TODO"]')).not.toContainText('編集前');
  });

  test('TODO編集キャンセル → Esc → 元の値に戻る（要件7.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, 'キャンセル対象');

    const todoItem = window.locator('section[aria-label="TODO"] li').first();
    await enterEditMode(todoItem);
    const editInput = todoItem.locator('input[type="text"]');
    await editInput.fill('一時的に変更');

    // Esc キャンセル
    await window.keyboard.press('Escape');

    // 元の値に戻る
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('キャンセル対象');
    await expect(window.locator('section[aria-label="TODO"]')).not.toContainText('一時的に変更');
  });

  test('TODO削除 → ×ボタン → 即座にリストから除去（要件7.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '削除対象A');
    await addTodo(window, '削除対象B');

    // 2件あることを確認
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('削除対象A');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('削除対象B');

    // Aを削除（DELETE /todos/:id を待つ）
    const todoItem = window.locator('section[aria-label="TODO"] li').first();
    const deletePromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'DELETE',
      { timeout: 10_000 },
    );
    await clickHoverButton(todoItem, '削除');
    await deletePromise;

    // Aが消え、Bが残る
    await expect(window.locator('section[aria-label="TODO"]')).not.toContainText('削除対象A');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('削除対象B');
  });

  test('空入力でEnter → 追加されずフォーカス維持（要件7.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 空入力でEnter
    await window.locator(NEW_TODO_INPUT).click();
    await window.locator(NEW_TODO_INPUT).fill('   ');
    await window.keyboard.press('Enter');

    // 追加されず、空状態が維持
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');
    // 入力欄はクリアされる（空白trim後、空とみなされクリア）
    await expect(window.locator(NEW_TODO_INPUT)).toHaveValue('');
  });

  test('連続追加 → フォーカス維持で複数件追加（要件7.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 連続で3件追加
    await addTodo(window, '連続1');
    await addTodo(window, '連続2');
    await addTodo(window, '連続3');

    // 3件すべて表示
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('連続1');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('連続2');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('連続3');
  });
});

test.describe('仕事整理モード: TODO編集の空確定（edge_cases §2.1）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('編集で空にしてEnter → 削除確認ダイアログ → 削除実行', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '空にして削除');

    const todoItem = window.locator('section[aria-label="TODO"] li').first();
    await enterEditMode(todoItem);
    const editInput = todoItem.locator('input[type="text"]');
    await editInput.fill('');
    await window.keyboard.press('Enter');

    // 削除確認ダイアログ表示（edge_cases §2.1）
    await expect(window.locator('text=本文が空です。このTODOを削除しますか？')).toBeVisible();

    // 「削除」クリック → DELETE 送信
    const deletePromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'DELETE',
      { timeout: 10_000 },
    );
    await window.locator('button:has-text("削除")').click();
    await deletePromise;

    // TODOが削除され、空状態に戻る
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');
  });

  test('編集で空にしてEnter → 削除確認ダイアログ → 編集に戻る', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '残す対象');

    const todoItem = window.locator('section[aria-label="TODO"] li').first();
    await enterEditMode(todoItem);
    const editInput = todoItem.locator('input[type="text"]');
    await editInput.fill('');
    await window.keyboard.press('Enter');

    await expect(window.locator('text=本文が空です。このTODOを削除しますか？')).toBeVisible();
    // 「編集に戻る」でキャンセル
    await window.locator('button:has-text("編集に戻る")').click();

    // TODOは残り、再度編集モードへ入る
    const editInput2 = todoItem.locator('input[type="text"]');
    await expect(editInput2).toBeVisible();
    await expect(editInput2).toHaveValue('残す対象');
  });
});

test.describe('仕事整理モード: Blocker基本CRUD（要件7.4）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('初期状態は空リスト（No blockers）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('No blockers');
  });

  test('Blocker追加 → リストへ即時反映 → 再起動後も維持（AC-02）', async () => {
    const text = `障害永続化 ${Date.now()}`;

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, text);
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText(text);
    await closeApp(app);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText(text, {
      timeout: 10_000,
    });
  });

  test('Blocker解消切替 → ✓ + 取り消し線 + Resolved → 再度切替で戻る（要件7.4）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, '解消切替テスト');

    const blockerSection = window.locator('section[aria-label="障害・詰まり"]');

    // 初期: 未解消
    await expect(blockerSection.locator('button[aria-label="解消済みにする"]')).toBeVisible();
    await expect(blockerSection.locator('button[aria-label="未解消に戻す"]')).toHaveCount(0);

    // 解消へ切替
    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await blockerSection.locator('button[aria-label="解消済みにする"]').click();
    await patchPromise;

    // 解消状態: ✓ + 取り消し線 + Resolved ラベル
    await expect(blockerSection.locator('button[aria-label="未解消に戻す"]')).toBeVisible();
    await expect(blockerSection.locator('button[aria-label="解消済みにする"]')).toHaveCount(0);
    await expect(blockerSection.locator('span.line-through')).toBeVisible();
    await expect(blockerSection.locator('text=Resolved')).toBeVisible();

    // 再度クリックで未解消へ戻る
    const patchPromise2 = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await blockerSection.locator('button[aria-label="未解消に戻す"]').click();
    await patchPromise2;
    await expect(blockerSection.locator('button[aria-label="解消済みにする"]')).toBeVisible();
  });

  test('Blocker本文編集 → ダブルクリック → Enter確定で保存（要件7.4）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, '障害編集前');

    const blockerItem = window.locator('section[aria-label="障害・詰まり"] li').first();
    await enterEditMode(blockerItem);

    const editInput = blockerItem.locator('input[type="text"]');
    await expect(editInput).toHaveValue('障害編集前');

    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await editInput.fill('障害編集後');
    await window.keyboard.press('Enter');
    await patchPromise;

    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('障害編集後');
    await expect(window.locator('section[aria-label="障害・詰まり"]')).not.toContainText(
      '障害編集前',
    );
  });

  test('Blocker削除 → ×ボタン → 即座にリストから除去（要件7.4）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, '削除対象障害');

    const blockerItem = window.locator('section[aria-label="障害・詰まり"] li').first();
    const deletePromise = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'DELETE',
      { timeout: 10_000 },
    );
    await clickHoverButton(blockerItem, '削除');
    await deletePromise;

    await expect(window.locator('section[aria-label="障害・詰まり"]')).not.toContainText(
      '削除対象障害',
    );
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('No blockers');
  });

  test('Blocker-TODO紐付け → セレクトで選択 → ラベル表示（要件7.4）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, '紐付け先TODO');
    await addBlocker(window, '紐付け元障害');

    // TODO紐付けセレクトでTODOを選択
    const blockerItem = window.locator('section[aria-label="障害・詰まり"] li').first();
    const linkedSelect = blockerItem.locator('select[aria-label="紐づくTODO"]');

    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await linkedSelect.selectOption({ label: '紐付け先TODO' });
    await patchPromise;

    // 紐付け先TODOがラベル表示される
    await expect(blockerItem.locator('text=/→ 紐付け先TODO/')).toBeVisible();
  });

  test('Blocker編集で空確定 → 削除確認ダイアログ（edge_cases §2.1）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addBlocker(window, '空にする障害');

    const blockerItem = window.locator('section[aria-label="障害・詰まり"] li').first();
    await enterEditMode(blockerItem);
    const editInput = blockerItem.locator('input[type="text"]');
    await editInput.fill('');
    await window.keyboard.press('Enter');

    // 削除確認ダイアログ
    await expect(window.locator('text=本文が空です。この障害を削除しますか？')).toBeVisible();

    const deletePromise = window.waitForResponse(
      (res) => res.url().includes('/blockers/') && res.request().method() === 'DELETE',
      { timeout: 10_000 },
    );
    await window.locator('button:has-text("削除")').click();
    await deletePromise;

    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('No blockers');
  });
});

test.describe('仕事整理モード: ↑/↓ ボタンによる並替え（要件7.3/7.4）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('↑/↓ ボタンでTODO順序を入替 → reorder APIへ反映', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await addTodo(window, 'UPDOWN-A');
    await addTodo(window, 'UPDOWN-B');

    const section = window.locator('section[aria-label="TODO"]');
    const items = section.locator('li:has(button[data-focus-item])');
    const text = (await items.nth(0).innerText()).includes('UPDOWN-A');
    expect(text).toBeTruthy();

    // B（2番目）の「上へ移動」ボタンをクリック → Bが先頭へ
    // ホバー時のみ表示されるため、hover → click の順で（clickHoverButton ヘルパ使用）
    const reorderPromise = window.waitForResponse(
      (res) =>
        res.url().includes('/todos/reorder') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10_000 },
    );
    await clickHoverButton(items.nth(1), '上へ移動');
    await reorderPromise;

    // 順序が入れ替わる: [B, A]
    await expect(items.nth(0)).toContainText('UPDOWN-B');
    await expect(items.nth(1)).toContainText('UPDOWN-A');

    // 先頭アイテムへホバーして「上へ移動」が disabled であることを検証
    await items.nth(0).hover();
    await expect(items.nth(0).locator('button[aria-label="上へ移動"]')).toBeDisabled();
    // 末尾アイテムへホバーして「下へ移動」が disabled であることを検証
    await items.nth(1).hover();
    await expect(items.nth(1).locator('button[aria-label="下へ移動"]')).toBeDisabled();
  });
});

test.describe('仕事整理モード: 日付をまたぐデータ分離（AC-02/AC-10）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('別日付のTODO/Blockerは混ざらない', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日にTODO追加
    await addTodo(window, '当日TODO');
    await addBlocker(window, '当日障害');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('当日TODO');

    // テーマも入力して保存
    await window.fill(THEME_INPUT, '当日テーマ');
    await waitForSaved(window);

    // 翌日へ移動
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // 翌日のTODO/Blockerは空
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('No blockers');

    // 翌日に別のTODOを追加
    await addTodo(window, '翌日TODO');
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('翌日TODO');
    await expect(window.locator('section[aria-label="TODO"]')).not.toContainText('当日TODO');

    // 前日（当日）へ戻ると、当日のTODO/Blockerが維持される
    await window.click('button[aria-label="前日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('当日テーマ', { timeout: 10_000 });
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('当日TODO');
    await expect(window.locator('section[aria-label="障害・詰まり"]')).toContainText('当日障害');
  });
});

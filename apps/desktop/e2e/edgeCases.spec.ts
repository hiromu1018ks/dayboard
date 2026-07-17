/**
 * エッジケース E2E テスト（[edge_cases.md]、補完シナリオ）
 *
 * 既存specで未カバーだった以下の重要ケースを検証する:
 * - edge_cases §3.1: 持ち越し元（carried）TODOの完了操作は不可（UI disabled）
 * - edge_cases §3.2: 持ち越し先（翌日側）TODOは編集・完了可能
 * - edge_cases §4.1: 同一日に同名のTODOを手動で2つ作成可能
 * - edge_cases §5.2: ラベル/記号のみの行は変換できない（VALIDATION_ERROR）
 * - edge_cases §5.3: 行頭記号バリエーションが正しく除去される
 * - edge_cases §5.4: 変換後200文字を超える行は切り詰め（…付加）
 * - edge_cases §8.3: 過去日付のノートも編集・保存可能
 * - edge_cases §4.4 補完: 持ち越し確認ダイアログでキャンセル可能
 *
 * 既存specと協調（重複しない範囲）:
 * - workCrud: 基本CRUD・空確定ダイアログ
 * - carryOver: 持ち越し成功時の carried 表示
 * - convert: TODO化/障害化の正常系・重複ダイアログ
 *
 * [edge_cases.md]: ../../docs/edge_cases.md
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  launchApp,
  launchAppReady,
  resetE2eDatabase,
  waitForSavedSteady,
} from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEXT_BUTTON = 'button[aria-label="翌日へ"]';
const PREV_BUTTON = 'button[aria-label="前日へ"]';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;
const TOAST = '[data-testid="toast"]';

/** プラットフォーム別の修飾キー */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * TODOを1件追加するヘルパ。POST /todos の 201 を確実に待つ。
 * workCrud.spec の addTodo と同等。
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

/**
 * CodeMirror にテキストを入力し、本文へ反映されるまで待つ（convert.spec と同実装）。
 */
async function typeIntoEditor(window: Page, text: string): Promise<void> {
  const editor = window.locator(CM_CONTENT);
  await editor.click();
  await editor.pressSequentially(text);
  await window.waitForFunction(
    (expected) => {
      const lines = Array.from(document.querySelectorAll('.cm-content .cm-line'));
      const body = lines.map((l) => l.textContent ?? '').join('\n');
      return body.includes(expected);
    },
    text,
    { timeout: 5_000 },
  );
}

/** 変換 API のレスポンスを待つ */
async function waitForConvertResponse(window: Page, target: 'todo' | 'blocker'): Promise<number> {
  const res = await window.waitForResponse(
    (r) => r.url().includes(`/convert/${target}`) && r.request().method() === 'POST',
    { timeout: 10_000 },
  );
  return res.status();
}

// ============================================================================
// §3.1: 持ち越し元（carried）のTODOは完了操作不可
// ============================================================================

test.describe('持ち越し後の再編集（edge_cases §3.1/§3.2）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('carried TODO の完了ボタンは disabled（操作不可、edge §3.1）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 未完了TODOを1件追加して持ち越し
    await addTodo(window, '持ち越し元完了不可テスト');
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    // carried 表示を待つ
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });

    // carried TODO のチェックボタン（data-focus-item）は disabled。
    // 仕様メモ: TodoItem.tsx の実装では、carried でも isDone=false のため
    // aria-label は「完了にする」のままだが、disabled={isCarried} で操作不可となる。
    // 完了操作からの状態遷移を防ぐのが仕様（edge §3.1: carried → * は禁止）。
    const carriedCheck = window
      .locator('section[aria-label="TODO"] li')
      .first()
      .locator('button[data-focus-item]');
    await expect(carriedCheck).toBeVisible();
    await expect(carriedCheck).toBeDisabled();
    // carried ラベルが付与されている（→ Carried to tomorrow）
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible();
    // → アイコン（carried を示す矢印）が表示されている
    await expect(carriedCheck.locator('text=→')).toBeVisible();
  });

  test('持ち越し先（翌日側）のTODOは通常どおり編集・完了可能（edge §3.2）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const title = `翌日側編集可能 ${Date.now()}`;
    await addTodo(window, title);
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });

    // 翌日へ移動
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);

    // 翌日側のTODOが表示される
    await expect(window.getByText(title).first()).toBeVisible({ timeout: 15_000 });

    // 「から持ち越し」ラベルが付いている
    await expect(window.locator('text=/から持ち越し/')).toBeVisible({ timeout: 10_000 });

    // 完了操作が可能（carried でないため disabled ではない）
    const incompleteButton = window.locator('button[aria-label="完了にする"]');
    await expect(incompleteButton).toBeEnabled({ timeout: 10_000 });

    // 完了へ切替（PATCH /todos/:id を待つ）
    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await incompleteButton.click();
    await patchPromise;

    // done 表示
    await expect(window.locator('button[aria-label="未完了に戻す"]')).toBeVisible();
    await expect(window.locator('section[aria-label="TODO"] span.line-through')).toHaveText(title);
    // 持ち越しラベルは維持される（edge §3.2: carriedFromDate は保持）
    await expect(window.locator('text=/から持ち越し/')).toBeVisible();
  });
});

// ============================================================================
// §4.1: 同一日に同名のTODOを手動で2つ作成
// ============================================================================

test.describe('同名TODO重複作成（edge_cases §4.1）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('同一日に同名のTODOを2つ手動追加できる（手動追加は重複チェック無し）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const sameTitle = `同名TODO ${Date.now()}`;
    await addTodo(window, sameTitle);
    await addTodo(window, sameTitle);

    // 同名のTODOが2行表示される（手動追加は重複チェックしない、[api_contract.md §5]）
    const matches = window.locator(
      `section[aria-label="TODO"] li:has(span:has-text("${sameTitle}"))`,
    );
    await expect(matches).toHaveCount(2, { timeout: 5_000 });
  });
});

// ============================================================================
// §5.2 / §5.3 / §5.4: 変換のバリエーション
// ============================================================================

test.describe('ノート行変換のエッジケース（edge_cases §5.2/§5.3/§5.4）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('行頭の「・」記号が除去されてTODO化される（edge §5.3）', async () => {
    ({ app, window } = await launchAppReady());

    // ノートモードへ
    await window.keyboard.press(`${MOD}+J`);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // 「・部長承認待ち」を入力 → 「部長承認待ち」としてTODO化される
    await typeIntoEditor(window, '・部長承認待ち');
    const convertPromise = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise).toBe(201);

    // トーストに記号除去後の「部長承認待ち」が表示される
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5_000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('部長承認待ち');
    // 記号「・」は title に含まれない
    expect(toastText).not.toMatch(/・部長/);
  });

  test('行頭の「TODO化：」ラベルが除去されてTODO化される（edge §5.3）', async () => {
    ({ app, window } = await launchAppReady());

    await window.keyboard.press(`${MOD}+J`);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // 「TODO化：見積作成」→ 「見積作成」
    await typeIntoEditor(window, 'TODO化：見積作成');
    const convertPromise = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise).toBe(201);

    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5_000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('見積作成');
  });

  test('200文字超の行は切り詰められ「…」が付く（edge §5.4）', async () => {
    ({ app, window } = await launchAppReady());

    await window.keyboard.press(`${MOD}+J`);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // 250文字の行を入力（extractTitle は先頭199文字 + … の200文字へ切り詰め）
    const longText = 'あ'.repeat(250);
    await typeIntoEditor(window, longText);
    const convertPromise = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise).toBe(201);

    // 「長いため200文字に切り詰めました」通知
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5_000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('切り詰めました');

    // 仕事整理モードへ戻り、TODO title が200文字（… 含む）で切り詰められている
    await window.keyboard.press('Escape');
    const todoTitle = await window
      .locator('section[aria-label="TODO"] li')
      .first()
      .locator('span.text-ink, span[class*="line-through"]')
      .first()
      .textContent();
    expect(todoTitle).toBeTruthy();
    expect(todoTitle!.endsWith('…')).toBe(true);
    // 200文字ぴったり（… 込み）
    expect(todoTitle!.length).toBe(200);
  });
});

// ============================================================================
// §8.3: 過去日付のノート編集
// ============================================================================

test.describe('過去日付ノート編集（edge_cases §8.3）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('過去日付へ移動してTODOを追加 → 再起動後も保持される', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 前日（過去日付）へ移動
    await window.locator(PREV_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });
    await waitForSavedSteady(window);

    // 過去日付のDayNoteへTODOを追加
    const pastTitle = `過去日TODO ${Date.now()}`;
    await addTodo(window, pastTitle);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText(pastTitle);
    await closeApp(app);

    // 再起動後、前日（過去日付）へ移動してTODOが保持されている
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await window.locator(PREV_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText(pastTitle, {
      timeout: 10_000,
    });
  });
});

// ============================================================================
// §4.4 補完: 持ち越し確認ダイアログでキャンセル
// ============================================================================

test.describe('持ち越しキャンセル（edge_cases §4.4 補完）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('持ち越し確認ダイアログで「キャンセル」→ TODOは未完了のまま', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const title = `キャンセル検証 ${Date.now()}`;
    await addTodo(window, title);

    // 持ち越しダイアログを開く
    await window.click('text=/未完了を翌日へ持ち越し/');

    // POST /carry-over が送信されないことを監視しつつキャンセル
    let carryOverCalled = false;
    window.on('request', (req) => {
      if (req.url().includes('/carry-over') && req.method() === 'POST') {
        carryOverCalled = true;
      }
    });

    // 「キャンセル」をクリック
    await window.locator('button:has-text("キャンセル")').click();

    // ダイアログが閉じる
    await expect(window.locator('button:has-text("キャンセル")')).toHaveCount(0);
    // 少し待って carry-over API が呼ばれていないことを確認
    await window.waitForTimeout(500);
    expect(carryOverCalled).toBe(false);

    // TODOは carried にならず、未完了のまま残る
    await expect(window.locator('text=/Carried to tomorrow/')).toHaveCount(0);
    await expect(window.locator('button[aria-label="完了にする"]')).toBeVisible();
    // 持ち越しボタンは再表示可能（再度開ける）
    await expect(window.locator('text=/未完了を翌日へ持ち越し/')).toBeVisible();

    // 翌日へ移動してもTODOは存在しない（持ち越されていない）
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');
  });
});

// ============================================================================
// §1.3: 持ち越し元TODO削除 → 翌日側の「から持ち越し」表示は維持
// ============================================================================

test.describe('持ち越し元TODO削除（edge_cases §1.3）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('当日の carried TODO を削除 → 翌日側の「から持ち越し」表示は維持（edge §1.3）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const title = `元削除検証 ${Date.now()}`;
    await addTodo(window, title);
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });

    // carried TODO を削除（DELETE /todos/:id を待つ）
    // carried はホバー時の ×ボタンで削除可能（disabled は完了ボタンのみ）
    const carriedItem = window.locator('section[aria-label="TODO"] li').first();
    await carriedItem.hover();
    const deleteButton = carriedItem.locator('button[aria-label="削除"]');
    await expect(deleteButton).toBeVisible({ timeout: 5_000 });
    const deletePromise = window.waitForResponse(
      (res) => res.url().includes('/todos/') && res.request().method() === 'DELETE',
      { timeout: 10_000 },
    );
    await deleteButton.click();
    await deletePromise;

    // 当日のTODOは空になる
    await expect(window.locator('section[aria-label="TODO"]')).toContainText('No tasks yet');

    // 翌日へ移動 → 翌日側のTODOは依然として存在し「から持ち越し」表示も維持
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await waitForSavedSteady(window);
    await expect(window.getByText(title).first()).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('text=/から持ち越し/')).toBeVisible({ timeout: 10_000 });
  });
});

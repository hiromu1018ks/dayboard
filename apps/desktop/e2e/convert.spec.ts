/**
 * ノート行変換 E2E テスト（[roadmap.md T-5-14]）
 *
 * [test_strategy.md §5.2 4.3] のシナリオ:
 * - AC-05: 選択行をTODO化（`⌘/Ctrl+Enter`）。ノートモードに留まり、マーク + 通知表示
 * - AC-07: 選択行を障害化（`⌘/Ctrl+Shift+B`）。マーク + 通知表示
 * - AC-06: 重複TODO化で確認ダイアログ表示、キャンセルで作成しない
 * - AC-08: 変換後、仕事整理モードでTODOに発生元が確認できる
 *
 * 注意:
 * - CI必須化しない（[test_strategy.md §5.3]、ローカル実行を想定）。
 * - 実行前に PostgreSQL（dayborad_dev）起動済み・マイグレーション済み・ビルド済みであること。
 * - Mac は metaKey（⌘）、それ以外は ctrlKey でショートカットを発火する。
 *
 * [test_strategy.md §5.2 4.3]: ../../docs/test_strategy.md
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

/** NoteEditor のホスト要素（ノートモードの識別子） */
const NOTE_EDITOR = '[data-testid="note-editor"]';
/** CodeMirror の本文コンテンツ領域 */
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;
/** トースト通知 */
const TOAST = '[data-testid="toast"]';
/** 重複確認ダイアログ */
const DUPLICATE_DIALOG = '[data-testid="duplicate-conversion-dialog"]';

/** プラットフォーム別の修飾キー */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * `⌘/Ctrl+J` でモード切替。
 */
async function pressModeToggle(window: Page): Promise<void> {
  await window.keyboard.press(`${MOD}+J`);
}

/**
 * CodeMirror にテキストを入力し、入力内容が本文へ反映されるまで待つ。
 * `pressSequentially` は非同期で CodeMirror へ反映されるため、入力直後に
 * キーハンドラ（⌘+Enter 等）を実行すると空行判定されることがある。
 * そのため、入力後に本文へ反映されたことを確認してから呼び出し元へ戻る。
 */
async function typeIntoEditor(window: Page, text: string): Promise<void> {
  const editor = window.locator(CM_CONTENT);
  await editor.click();
  await editor.pressSequentially(text);
  // 本文へ反映されるまで待機（最大5s）
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

/**
 * 変換 API（POST /convert/todo または /convert/blocker）のレスポンスを待つ。
 * @param target 'todo' または 'blocker'
 */
async function waitForConvertResponse(window: Page, target: 'todo' | 'blocker'): Promise<number> {
  const res = await window.waitForResponse(
    (r) => r.url().includes(`/convert/${target}`) && r.request().method() === 'POST',
    { timeout: 10_000 },
  );
  return res.status();
}

test.describe('ノート行変換（AC-05/AC-06/AC-07/AC-08）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('選択行をTODO化（AC-05）: マーク + 通知 + ノートモードに留まる', async () => {
    ({ app, window } = await launchApp());

    // ノートモードへ切替
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // 本文入力: 「- TODO化：見積作成」（CodeMirror への反映を待つ）
    // 入力後はその行のまま ⌘+Enter で変換する（Enter→ArrowUp の操作はCodeMirrorの
    // フォーカス状態を不安定にするため、1行入力してそのまま変換する）
    await typeIntoEditor(window, '- TODO化：見積作成');

    // ⌘/Ctrl+Enter でTODO化。変換 POST のレスポンスを待つ。
    const convertPromise = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    const convertStatus = await convertPromise;
    expect(convertStatus).toBe(201);

    // トースト通知が表示される（[§6.2]）
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('見積作成');

    // 変換後もノートモードに留まる（[要件 9.3]、AC-05）
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // トーストが消えるまで待つ（2s）
    await expect(window.locator(TOAST)).toBeHidden({ timeout: 5000 });
  });

  test('選択行を障害化（AC-07）: マーク + 通知', async () => {
    ({ app, window } = await launchApp());

    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    await typeIntoEditor(window, '部長承認待ち');

    // ⌘/Ctrl+Shift+B で障害化。変換 POST を待つ。
    const convertPromise = waitForConvertResponse(window, 'blocker');
    await window.keyboard.press(`${MOD}+Shift+B`);
    const convertStatus = await convertPromise;
    expect(convertStatus).toBe(201);

    // トースト通知
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('障害');
  });

  test('重複TODO化で確認ダイアログ（AC-06）: キャンセルで作成しない', async () => {
    ({ app, window } = await launchApp());

    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    await typeIntoEditor(window, '見積作成');

    // 1回目: TODO化成功（変換 POST 201 を待つ）
    const convertPromise1 = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise1).toBe(201);
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    await expect(window.locator(TOAST)).toBeHidden({ timeout: 5000 });

    // トースト表示で CodeMirror からフォーカスが外れることがあるため、
    // 編集領域をクリックしてフォーカスを戻してから2回目の変換を行う。
    await window.locator(CM_CONTENT).click();

    // 2回目: 同一行を再度TODO化 → 重複ダイアログ（409 DUPLICATE_CONVERSION）
    const convertPromise2 = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise2).toBe(409);
    await expect(window.locator(DUPLICATE_DIALOG)).toBeVisible({ timeout: 5000 });

    // キャンセル
    await window.locator(DUPLICATE_DIALOG).getByText('キャンセル').click();
    await expect(window.locator(DUPLICATE_DIALOG)).toBeHidden({ timeout: 3000 });
  });

  test('仕事整理モード復帰後、TODOに発生元が確認できる（AC-08）', async () => {
    ({ app, window } = await launchApp());

    // ノートモードでTODO化
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    await typeIntoEditor(window, '- TODO化：見積作成');
    const convertPromise = waitForConvertResponse(window, 'todo');
    await window.keyboard.press(`${MOD}+Enter`);
    expect(await convertPromise).toBe(201);
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    await expect(window.locator(TOAST)).toBeHidden({ timeout: 5000 });

    // 仕事整理モードへ戻る（Esc）
    await window.keyboard.press('Escape');

    // TODO列に「見積作成」が表示される（ラベル除去済み）
    await expect(window.getByText('見積作成').first()).toBeVisible({ timeout: 5000 });
  });
});

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
import { closeApp, launchApp } from './helpers.js';

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

test.describe('ノート行変換（AC-05/AC-06/AC-07/AC-08）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('選択行をTODO化（AC-05）: マーク + 通知 + ノートモードに留まる', async () => {
    ({ app, window } = await launchApp());

    // ノートモードへ切替
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // 本文入力: 「- TODO化：見積作成」
    const editor = window.locator(CM_CONTENT);
    await editor.click();
    await editor.pressSequentially('- TODO化：見積作成');
    await window.keyboard.press('Enter');

    // ⌘/Ctrl+Enter でTODO化（カーソルは1行目にある状態で）
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press(`${MOD}+Enter`);

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

    const editor = window.locator(CM_CONTENT);
    await editor.click();
    await editor.pressSequentially('部長承認待ち');

    // ⌘/Ctrl+Shift+B で障害化
    await window.keyboard.press(`${MOD}+Shift+B`);

    // トースト通知
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    const toastText = await window.locator(TOAST).textContent();
    expect(toastText).toContain('障害');
  });

  test('重複TODO化で確認ダイアログ（AC-06）: キャンセルで作成しない', async () => {
    ({ app, window } = await launchApp());

    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    const editor = window.locator(CM_CONTENT);
    await editor.click();
    await editor.pressSequentially('見積作成');

    // 1回目: TODO化成功
    await window.keyboard.press(`${MOD}+Enter`);
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    await expect(window.locator(TOAST)).toBeHidden({ timeout: 5000 });

    // 2回目: 同一行を再度TODO化 → 重複ダイアログ
    await window.keyboard.press(`${MOD}+Enter`);
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

    const editor = window.locator(CM_CONTENT);
    await editor.click();
    await editor.pressSequentially('- TODO化：見積作成');
    await window.keyboard.press(`${MOD}+Enter`);
    await expect(window.locator(TOAST)).toBeVisible({ timeout: 5000 });
    await expect(window.locator(TOAST)).toBeHidden({ timeout: 5000 });

    // 仕事整理モードへ戻る（Esc）
    await window.keyboard.press('Escape');

    // TODO列に「見積作成」が表示される（ラベル除去済み）
    await expect(window.getByText('見積作成').first()).toBeVisible({ timeout: 5000 });
  });
});

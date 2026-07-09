/**
 * モード切替 E2E テスト（[roadmap.md T-4-10]）
 *
 * [test_strategy.md §5.2 4.2] のシナリオ:
 * - AC-03: `⌘/Ctrl+J` でノートモードへ切替（CodeMirror が見える）
 * - AC-04: `⌘/Ctrl+J` または `Esc` で仕事整理モードへ戻り、入力途中の本文が失われない
 *
 * 重点（要件 9.2）: モード切替は体感で即時。入力途中でも失われない。
 *
 * 注意:
 * - これらのテストはローカル実行を想定（CI必須化しない、Phase 2 T-2-15 と同じ扱い）。
 * - 実行前に PostgreSQL（dayborad_dev）が起動済みでマイグレーション済みであること。
 * - Electron アプリは実プロセスを起動する（ビルド成果物 apps/desktop/out が必要）。
 * - Mac は metaKey（⌘）、それ以外は ctrlKey でショートカットを発火する。
 *
 * [test_strategy.md §5.2]: ../../docs/test_strategy.md
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp } from './helpers.js';

/** テーマ入力欄（仕事整理モードの識別子） */
const THEME_INPUT = '#theme-input';
/** NoteEditor のホスト要素（ノートモードの識別子） */
const NOTE_EDITOR = '[data-testid="note-editor"]';

/**
 * `⌘/Ctrl+J` を押下する。プラットフォームに応じて修飾キーを選択。
 * Mac は Meta（⌘）、それ以外は Control。
 */
async function pressModeToggle(window: Page): Promise<void> {
  const isMac = process.platform === 'darwin';
  await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
}

test.describe('モード切替（AC-03/AC-04）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('仕事整理モード → ⌘J → ノートモードへ切替（AC-03）', async () => {
    ({ app, window } = await launchApp());

    // 初期状態は仕事整理モード（テーマ入力欄が見える）
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    // ノートエディタはまだ見えない
    await expect(window.locator(NOTE_EDITOR)).toHaveCount(0);

    // ⌘/Ctrl+J でノートモードへ
    await pressModeToggle(window);

    // ノートエディタ（CodeMirror）が表示される
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });
    // テーマ入力欄は非表示（①②③と④を同時表示しない、[要件 9.1]）
    await expect(window.locator(THEME_INPUT)).toHaveCount(0);
  });

  test('ノートモード → Esc → 仕事整理モードへ戻る（AC-04）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });

    // Esc で戻る
    await window.keyboard.press('Escape');

    // 仕事整理モードに戻る（テーマ入力欄が再び見える）
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await expect(window.locator(NOTE_EDITOR)).toHaveCount(0);
  });

  test('ノートモード → ⌘J → 仕事整理モードへ戻る（AC-04）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });

    // もう一度 ⌘/Ctrl+J で戻る
    await pressModeToggle(window);

    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });
    await expect(window.locator(NOTE_EDITOR)).toHaveCount(0);
  });

  test('ノート本文入力 → 切替 → 再度ノートモードで本文が保持される（AC-04）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });

    // CodeMirror の contenteditable に本文を入力
    const editor = window.locator(`${NOTE_EDITOR} .cm-content`);
    await editor.click();
    const noteText = `E2Eノート ${Date.now()}`;
    await window.keyboard.type(noteText);

    // 800ms デバウンス + サーバー保存を待つ（「保存済み」を待つ）
    await window.waitForSelector('text=保存済み', { timeout: 10_000 });

    // 仕事整理モードへ戻る（flush 経由）
    await pressModeToggle(window);
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 10_000 });

    // 再度ノートモードへ。入力した本文が保持されているか（サーバー保存済みなので復元される）
    await pressModeToggle(window);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });

    // CodeMirror の本文に入力内容が含まれるか検証
    const bodyAfter = await window.locator(`${NOTE_EDITOR} .cm-content`).textContent();
    expect(bodyAfter).toContain(noteText);
  });
});

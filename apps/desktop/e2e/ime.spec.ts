/**
 * IME 変換中の Esc 優先順位 E2E テスト（[roadmap.md T-7-11]、AC-19）
 *
 * [test_strategy.md §5.2 4.5] のシナリオ:
 * - AC-19: 日本語IMEで変換中に Esc を押した場合、まずIME変換をキャンセル/確定し、
 *   意図せず表示モードを切り替えない
 *
 * 合成 CompositionEvent で IME 変換を擬似的に再現する（[test_strategy.md §5.2]）。
 *
 * 注意:
 * - ローカル実行を想定。
 * - 実際のIME（ATOK等）の挙動は OS 依存であるため、ここでは Playwright の
 *   CompositionEvent 合成でブラウザ層のガード（isComposing / keyCode 229）を検証する。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp } from './helpers.js';

const THEME_INPUT = '#theme-input';

/**
 * 指定要素に対し合成 compositionstart / compositionupdate / compositionend イベントを
 * 発火し、IME 変換中状態を擬似的に再現する（[test_strategy.md §5.2]）。
 *
 * 本テストでは compositionupdate の最中（isComposing===true）に keydown(Escape) を
 * 発火し、アプリ層がこれを無視する（ショートカットとして処理しない）ことを検証する。
 */
async function dispatchComposition(window: Page, selector: string, reading: string): Promise<void> {
  await window.evaluate(
    ({ sel, text }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      el.focus();
      // compositionstart
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      // compositionupdate
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: text }));
    },
    { sel: selector, text: reading },
  );
}

test.describe('IME 変換中の Esc 優先順位（AC-19）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('IME 変換中の Esc でモード切替が起きない（AC-19）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ切替（Esc 押下で work 戻りが発動する状況を作る）
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
    const NOTE_EDITOR = '[data-testid="note-editor"]';
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });

    // CodeMirror の本文エリアで IME 変換を擬似開始
    const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;
    await window.locator(CM_CONTENT).click();
    await dispatchComposition(window, CM_CONTENT, 'あ');

    // compositionupdate 中（isComposing===true）に Esc を押す
    // → アプリ層のガードが発動し、work 戻りが起きないはず（AC-19）
    await window.keyboard.press('Escape');

    // ノートモードのまま（work へ戻らない）
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();
  });

  test('IME 変換中で無い Esc は通常どおり処理される', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
    const NOTE_EDITOR = '[data-testid="note-editor"]';
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });

    // IME 変換中で無い状態で Esc → work 戻り
    await window.keyboard.press('Escape');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
  });
});

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
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';

/**
 * 指定要素に対し合成 compositionstart / compositionupdate イベントを発火し、
 * IME 変換中状態を擬似的に再現する（[test_strategy.md §5.2]）。
 *
 * さらに、指定のキー（既定: Escape）を `isComposing: true` の合成 KeyboardEvent として
 * 発火する。実際の Playwright の keyboard.press は OS 由来の isComposing フラグを
 * 再現できないため、変換中の keydown を偽装するには合成イベントが必要。
 *
 * アプリ層のガード（guardIme.isComposing）は `e.isComposing === true || keyCode === 229`
 * を見るため、合成 KeyboardEvent で `isComposing: true` を渡せばガードが発動する。
 */
async function dispatchCompositionAndKey(
  window: Page,
  selector: string,
  reading: string,
  key: string = 'Escape',
): Promise<void> {
  await window.evaluate(
    ({ sel, text, keyName }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      el.focus();
      // compositionstart → compositionupdate（変換中状態）
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: text }));
      // 変換中の keydown を isComposing: true で合成発火
      // 実際のIME変換中は KeyboardEvent.isComposing が true になる。
      // OS 連携なしでこれを再現するには、合成イベントの isComposing を明示する。
      const ev = new KeyboardEvent('keydown', {
        key: keyName,
        code: 'Escape',
        bubbles: true,
        cancelable: true,
        composed: true,
        // isComposing は KeyboardEventInit で渡す
        isComposing: true,
      });
      el.dispatchEvent(ev);
    },
    { sel: selector, text: reading, keyName: key },
  );
}

test.describe('IME 変換中の Esc 優先順位（AC-19）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

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

    // CodeMirror の本文エリアで IME 変換中を擬似的に再現し、
    // 変換中の Esc（isComposing: true）でガードが発動するか検証
    const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;
    await window.locator(CM_CONTENT).click();
    await dispatchCompositionAndKey(window, CM_CONTENT, 'あ', 'Escape');

    // ガードが発動し work 戻りが起きないはず（AC-19）。ノートモードのまま。
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

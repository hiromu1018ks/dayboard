/**
 * Vim キーバインド E2E テスト（[roadmap.md T-7-11]、AC-16〜AC-20）
 *
 * [test_strategy.md §5.2 4.4] のシナリオ:
 * - AC-15: 設定で Vim へ切替（再起動後も維持）
 * - AC-16: Vim で `i` を押すと Insert 状態になりテキスト入力できる
 * - AC-17: Vim Insert で `Esc` を押すと Normal へ戻り、ノートモードから離脱しない
 * - AC-18: Vim Normal でノートモード中に `Esc` を押すと仕事整理モードへ戻る
 * - AC-20: Vim Normal で `h/j/k/l` で基本移動
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - Vim の CodeMirror 連携は実 Electron 上で安定するまで時間がかかる場合がある。
 *   待機を十分に入れている。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const SETTINGS_BUTTON = 'button[aria-label="設定を開く"]';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;

/** 設定で Vim へ切替するヘルパ */
async function enableVim(window: Page): Promise<void> {
  await window.locator(SETTINGS_BUTTON).click();
  await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });
  await window.locator('input[type="radio"][value="vim"]').check();
  await window.waitForTimeout(500);
  await window.keyboard.press('Escape'); // モーダルを閉じる
  await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
}

/** 設定で標準へ戻すヘルパ（後続テストへの影響を防ぐ） */
async function restoreStandard(window: Page): Promise<void> {
  await window.locator(SETTINGS_BUTTON).click();
  await window.locator('input[type="radio"][value="standard"]').check();
  await window.waitForTimeout(500);
  await window.keyboard.press('Escape');
}

test.describe('Vim キーバインド（AC-16〜AC-20）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) {
      // 標準へ戻す試行（失敗しても無視）
      try {
        await restoreStandard(window);
      } catch {
        // ignore
      }
      await closeApp(app);
    }
  });

  test('Vim 有効化で VIM NORMAL バッジが表示される（AC-15）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // 右下に VIM NORMAL バッジ
    await expect(window.locator('[data-testid="vim-state-badge"]')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=VIM NORMAL')).toBeVisible();
  });

  test('Vim で Space n でモード切替（AC-20 関連）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // 仕事整理モードで Space n → ノートモードへ
    await window.keyboard.press('Space');
    await window.keyboard.press('n');

    // ノートエディタが表示される
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });
  });

  test('Vim ノートモードで Esc → Normal、再度 Esc → work 戻り（AC-17/AC-18）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // ⌘J でノートモードへ
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });

    // CodeMirror へフォーカス後、`i` で Insert へ（AC-16）
    await window.locator(CM_CONTENT).click();
    await window.keyboard.press('i');
    // VIM INSERT バッジに切替わる（AC-16）
    await expect(window.locator('text=VIM INSERT')).toBeVisible({ timeout: 5_000 });

    // Esc → Normal へ戻る（AC-17）。ノートモードには留まる
    await window.keyboard.press('Escape');
    await expect(window.locator('text=VIM NORMAL')).toBeVisible({ timeout: 5_000 });
    // ノートモードのまま
    await expect(window.locator(NOTE_EDITOR)).toBeVisible();

    // もう一度 Esc → 仕事整理モードへ戻る（AC-18）
    await window.keyboard.press('Escape');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
  });
});

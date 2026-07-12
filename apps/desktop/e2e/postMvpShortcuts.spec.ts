/**
 * Post-MVP ショートカット無効化 E2E テスト（[roadmap.md T-7-11]、AC-22）
 *
 * [test_strategy.md §5.2 4.6] のシナリオ:
 * - AC-22: Post-MVP ショートカット（⌘K, ⌘Shift+R, ⌘Shift+M）を押しても
 *   入力内容が破壊されない（何も起きない）
 *
 * これらのキーは MVP では未実装だが、ブラウザ/CodeMirror のデフォルト挙動で
 * 入力が壊れないよう preventDefault で握り潰す（[要件 8.6]）。
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - Mac は metaKey（⌘）、それ以外は ctrlKey。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp } from './helpers.js';

const THEME_INPUT = '#theme-input';

test.describe('Post-MVP ショートカットの無効化（AC-22）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('⌘/Ctrl+K を押しても入力内容が破壊されない', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマを入力
    await window.locator(THEME_INPUT).click();
    const text = `ポストMVP検証 ${Date.now()}`;
    await window.keyboard.type(text);
    await expect(window.locator(THEME_INPUT)).toHaveValue(text);

    // ⌘/Ctrl+K（コマンドパレット、Post-MVP）を押す
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+K' : 'Control+K');

    // 入力内容が保持されている（破壊されない）
    await expect(window.locator(THEME_INPUT)).toHaveValue(text);
    // 仕事整理モードのまま（モード切替等は起きない）
    await expect(window.locator(THEME_INPUT)).toBeVisible();
  });

  test('⌘/Ctrl+Shift+R を押しても入力内容が破壊されない', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(THEME_INPUT).click();
    const text = `振り返り送信無効化 ${Date.now()}`;
    await window.keyboard.type(text);

    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+Shift+R' : 'Control+Shift+R');

    await expect(window.locator(THEME_INPUT)).toHaveValue(text);
  });

  test('⌘/Ctrl+Shift+M を押しても入力内容が破壊されない', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(THEME_INPUT).click();
    const text = `時刻見出し無効化 ${Date.now()}`;
    await window.keyboard.type(text);

    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+Shift+M' : 'Control+Shift+M');

    await expect(window.locator(THEME_INPUT)).toHaveValue(text);
  });
});

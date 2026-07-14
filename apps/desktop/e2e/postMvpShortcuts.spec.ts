/**
 * Post-MVP ショートカット E2E テスト（[roadmap.md T-7-11]、AC-22）
 *
 * [test_strategy.md §5.2 4.6] のシナリオ:
 * - AC-22: Post-MVP ショートカット（⌘K, ⌘Shift+R）を押しても
 *   入力内容が破壊されない（何も起きない）
 * - ⌘Shift+M（時刻見出し）は実装済み機能へ昇格。ノートモードで `### HH:mm` が挿入される
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - Mac は metaKey（⌘）、それ以外は ctrlKey。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NOTE_EDITOR = '[data-testid="note-editor"]';

test.describe('Post-MVP ショートカットの無効化（AC-22）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

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
});

test.describe('時刻つきメモ追加（⌘/Ctrl+Shift+M、実装済み機能へ昇格）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('ノートモードで ⌘/Ctrl+Shift+M を押すと ### HH:mm 見出しが挿入される', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ノートモードへ切替（⌘/Ctrl+J）
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 10_000 });

    // CodeMirror 本文へフォーカス
    await window.locator(`${NOTE_EDITOR} .cm-content`).click();

    // ⌘/Ctrl+Shift+M で時刻見出し挿入
    await window.keyboard.press(isMac ? 'Meta+Shift+M' : 'Control+Shift+M');

    // 本文に `### HH:mm` 形式の見出しが挿入されたことを検証
    const bodyText = await window.locator(`${NOTE_EDITOR} .cm-content`).textContent();
    expect(bodyText).toMatch(/### \d{2}:\d{2}/);
  });
});

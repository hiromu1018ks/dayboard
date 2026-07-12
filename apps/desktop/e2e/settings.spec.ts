/**
 * 設定モーダル・キーバインド切替 E2E テスト（[roadmap.md T-7-02]、AC-15）
 *
 * [test_strategy.md §5.2]、[ui_interaction_spec.md §8]:
 * - 歯車アイコンクリックで設定モーダルが開く
 * - 標準/Vim ラジオで切替、即座に PATCH /api/settings
 * - 再起動後も設定が維持される（AC-15）
 * - Esc または背景クリックで閉じる
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - 再起動後の設定維持確認には、設定変更後にアプリを閉じて再起動する。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp } from './helpers.js';

const THEME_INPUT = '#theme-input';
/** 設定（歯車）ボタン */
const SETTINGS_BUTTON = 'button[aria-label="設定を開く"]';

test.describe('設定モーダル（AC-15）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('歯車アイコンで設定モーダルが開き、閉じられる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 設定ボタン（歯車）をクリック
    await window.locator(SETTINGS_BUTTON).click();
    // モーダルが表示される
    await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });

    // Esc で閉じる（段3: モーダル）
    await window.keyboard.press('Escape');
    await expect(window.locator('text=キーバインド')).toHaveCount(0);
  });

  test('Vim へ切替 → 再起動後も維持（AC-15）', async () => {
    // 1回目の起動: Vim へ切替
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(SETTINGS_BUTTON).click();
    await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });

    // Vim ラジオを選択
    await window.locator('input[type="radio"][value="vim"]').check();
    // 少し待って保存（即時保存）
    await window.waitForTimeout(500);

    // アプリを閉じる
    await closeApp(app);

    // 2回目の起動: Vim バッジが表示される（設定が維持されている）
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    // Vim バッジが右下に表示される（[要件 9.4]）
    await expect(window.locator('[data-testid="vim-state-badge"]')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=VIM NORMAL')).toBeVisible();

    // 後続テストのために標準へ戻す
    await window.locator(SETTINGS_BUTTON).click();
    await window.locator('input[type="radio"][value="standard"]').check();
    await window.waitForTimeout(500);
  });
});

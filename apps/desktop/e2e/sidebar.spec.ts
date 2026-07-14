/**
 * サイドバー・検索・Markdown出力 E2E テスト（Post-MVP）
 *
 * シナリオ:
 * 1. サイドバーが表示され、カレンダーで日付選択できる
 * 2. ⌘/Ctrl+\ でサイドバー表示切替
 * 3. 検索ボックスに入力 → 結果表示 → クリックでジャンプ
 * 4. Export ボタンで Markdown をクリップボードへコピー
 *
 * 前提: `pnpm --filter desktop build` 済み。dayborad_e2e DB がマイグレーション済み。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';

test.describe('サイドバー・検索・Markdown出力（Post-MVP）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('サイドバーが表示され、カレンダーから日付へジャンプできる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // サイドバーが表示されている（検索ボックスの placeholder で確認）
    const searchInput = window.locator('input[aria-label="検索"]');
    await expect(searchInput).toBeVisible();

    // 今日の日付セルをクリック（カレンダーの当日セル）
    const today = new Date();
    const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayCell = window.locator(`button[data-date="${todayDateStr}"]`);
    await expect(todayCell).toBeVisible();
    await todayCell.click();

    // 仕事整理モードのまま（モード切替は起きない）
    await expect(window.locator(THEME_INPUT)).toBeVisible();
  });

  test('⌘/Ctrl+\\ でサイドバーの表示/非表示を切替できる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const searchInput = window.locator('input[aria-label="検索"]');
    await expect(searchInput).toBeVisible();

    // ⌘/Ctrl+\ でサイドバーを非表示
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+Backslash' : 'Control+Backslash');
    await expect(searchInput).not.toBeVisible();

    // もう一度押して再表示
    await window.keyboard.press(isMac ? 'Meta+Backslash' : 'Control+Backslash');
    await expect(searchInput).toBeVisible();
  });

  test('検索ボックスに入力すると結果が表示される', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマを入力して保存（デバウンス800ms + サーバー保存完了を待機）
    const themeText = `検索テスト対象テーマ${Date.now()}`;
    await window.fill(THEME_INPUT, themeText);
    // 保存完了を確実に待つ: 「保存中...」が表示されてから消えるまで待機（M-4）
    // SaveStatus は saved 状態で非表示になるため、保存中テキストの消失 = 保存完了
    await window
      .locator('text=保存中')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {
        /* 既に保存完了している場合は無視 */
      });
    await window.locator('text=保存中').waitFor({ state: 'detached', timeout: 10_000 });

    // 検索ボックスに入力（デバウンス300ms + fetch）
    const searchInput = window.locator('input[aria-label="検索"]');
    await searchInput.click();
    await window.keyboard.type('検索テスト');

    // 検索結果が表示される（最大10秒待機）
    await expect(window.locator('text=検索テスト対象テーマ')).toBeVisible({ timeout: 10_000 });
  });

  test('Export ボタンで Markdown をクリップボードへコピーできる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマを入力
    const themeText = `エクスポート検証${Date.now()}`;
    await window.locator(THEME_INPUT).click();
    await window.keyboard.type(themeText);

    // Export ボタンをクリック
    const exportButton = window.locator('button[aria-label="Markdownとしてコピー"]');
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    // トースト通知で「Copied to clipboard」が表示される
    await expect(window.locator('[data-testid="toast"]')).toContainText('Copied to clipboard', {
      timeout: 5_000,
    });
  });
});

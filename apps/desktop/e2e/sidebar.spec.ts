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

  test('サイドバーが表示され、カレンダーから別日付へジャンプできる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // サイドバーが表示されている（検索ボックスの placeholder で確認）
    const searchInput = window.locator('input[aria-label="検索"]');
    await expect(searchInput).toBeVisible();

    // 当日の日付表示を取得（ジャンプ前後で変わることを検証するため）
    const initialDateText = await window.locator('h1[data-testid="date-display"]').textContent();

    // 翌日の日付セルを特定してクリック（当日の1日後）
    // カレンダーの翌日セルは data-date 属性で一意に特定できる
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const tomorrowCell = window.locator(`button[data-date="${tomorrowDateStr}"]`);

    // 翌日が当月内ならクリック可能。月末を跨ぐ場合は月送りボタンで翌月へ移動してからクリック
    if (await tomorrowCell.isVisible().catch(() => false)) {
      await tomorrowCell.click();
    } else {
      // 月送りボタンで翌月へ
      await window.locator('button[aria-label="翌月へ"]').click();
      await expect(tomorrowCell).toBeVisible({ timeout: 5_000 });
      await tomorrowCell.click();
    }

    // 日付表示が切り替わる（別日付へジャンプした）
    const afterDateText = await window.locator('h1[data-testid="date-display"]').textContent();
    expect(afterDateText).not.toBe(initialDateText);

    // テーマ入力欄が空（別日付の DayNote が自動生成される）
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

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

    // テーマを入力して保存（保存完了後に Export することでクリップボード内容に反映させる）
    const themeText = `エクスポート検証${Date.now()}`;
    await window.locator(THEME_INPUT).click();
    await window.keyboard.type(themeText);
    // デバウンス + サーバー保存完了を待つ
    await window
      .locator('text=保存中')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {
        /* 既に保存完了している場合は無視 */
      });
    await window.locator('text=保存中').waitFor({ state: 'detached', timeout: 10_000 });

    // Export ボタンをクリック
    const exportButton = window.locator('button[aria-label="Markdownとしてコピー"]');
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    // トースト通知で「Copied to clipboard」が表示される
    await expect(window.locator('[data-testid="toast"]')).toContainText('Copied to clipboard', {
      timeout: 5_000,
    });

    // クリップボードへ実際にテーマが含まれる Markdown がコピーされたか検証
    // （Electron の clipboard API 経由でクリップボード内容を読み取る）
    const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(clipboardText).toContain(themeText);
  });

  test('検索結果をクリック → 対象日付へジャンプする', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日に特徴的なテーマを入力して保存
    const themeText = `検索ジャンプ対象テーマ${Date.now()}`;
    await window.fill(THEME_INPUT, themeText);
    await window
      .locator('text=保存中')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
    await window.locator('text=保存中').waitFor({ state: 'detached', timeout: 10_000 });

    // 翌日へ移動して、当日のテーマが見えない状態にする
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });
    const initialDateText = await window.locator('h1[data-testid="date-display"]').textContent();

    // 検索ボックスへ入力
    const searchInput = window.locator('input[aria-label="検索"]');
    await searchInput.click();
    await window.keyboard.type('検索ジャンプ');

    // 検索結果が出現し、特徴的なテーマが含まれる
    const resultButton = window.locator('text=検索ジャンプ対象テーマ');
    await expect(resultButton.first()).toBeVisible({ timeout: 10_000 });

    // 検索結果をクリック → 当日（テーマ入力済みの日付）へジャンプ
    await resultButton.first().click();
    // テーマ入力欄に対象テーマが復元される（ジャンプ成功の証拠）
    await expect(window.locator(THEME_INPUT)).toHaveValue(themeText, { timeout: 15_000 });
    // 日付表示が変わっている（別日付へジャンプした）
    const afterDateText = await window.locator('h1[data-testid="date-display"]').textContent();
    expect(afterDateText).not.toBe(initialDateText);
  });

  test('検索結果が0件 → No results found 表示', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 存在しないキーワードで検索
    const searchInput = window.locator('input[aria-label="検索"]');
    await searchInput.click();
    await window.keyboard.type(`ZZZNOTEXIST${Date.now()}`);

    // No results found が表示される
    await expect(window.locator('text=No results found')).toBeVisible({ timeout: 10_000 });
  });
});

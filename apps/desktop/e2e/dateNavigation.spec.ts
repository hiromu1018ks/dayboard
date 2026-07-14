/**
 * 日付移動 E2E テスト（[roadmap.md T-8-01]）
 *
 * AC-10: 任意の日付のノートを表示しているとき、前日・翌日・今日へ移動すると、
 *   対象日付のノートが表示され、未作成の日付では DayNote が自動生成される。
 *
 * [test_strategy.md §5.2] / [要件 7.1]:
 * - 前日/翌日への移動が動作する
 * - 未作成の日付でも DayNote が自動生成される（AC-01 と連動）
 * - 「今日」ボタンで当日に戻る
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない、[test_strategy.md §5.3]）。
 * - 実行前に PostgreSQL（dayborad_e2e）起動済み・マイグレーション済み・ビルド済みであること。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  launchApp,
  resetE2eDatabase,
  waitForSaved,
  waitForSavedSteady,
} from './helpers.js';

/** ヘッダーに表示される日付（YYYY-MM-DD 形式、フォント属性付き） */
const DATE_DISPLAY = 'h1[data-testid="date-display"]';
/** テーマ入力欄（仕事整理モードの識別子） */
const THEME_INPUT = '#theme-input';
/** 各移動ボタン */
const PREV_BUTTON = 'button[aria-label="前日へ"]';
const NEXT_BUTTON = 'button[aria-label="翌日へ"]';
/** 「今日」ボタン（Header、英語ラベル "Today"、commit 50b0d57 で英語化） */
const TODAY_BUTTON = 'button:has-text("Today")';

test.describe('日付移動（AC-10）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('翌日へ移動 → 自動生成された空の DayNote が表示される', async () => {
    ({ app, window } = await launchApp());
    // 初期状態: 今日の仕事整理モード
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    const todayDate = (await window.locator(DATE_DISPLAY).textContent())?.trim() ?? '';

    // 翌日へ移動
    await window.locator(NEXT_BUTTON).click();

    // 日付表示が変わり、テーマ入力欄は空（別日付の自動生成された DayNote）
    await expect(window.locator(DATE_DISPLAY)).not.toHaveText(todayDate, { timeout: 10_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });
  });

  test('翌日へ移動 → 前日へ戻る → 元の日付に復元される', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    const initialDate = (await window.locator(DATE_DISPLAY).textContent())?.trim() ?? '';

    // テーマを入力して保存（AC-02 の前提: 元日付にデータが残る）
    await window.fill(THEME_INPUT, '日付移動テスト');
    await waitForSaved(window);

    // 翌日へ
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });
    // 翌日の fetch が完了するまで待つ（保存中表示が消える = saved 収束を待つ）
    await waitForSavedSteady(window);

    // 前日へ戻る（元の日付）
    await window.locator(PREV_BUTTON).click();
    await expect(window.locator(DATE_DISPLAY)).toHaveText(initialDate, { timeout: 10_000 });
    // 元の日付のテーマが保持されている（fetch 完了後に反映）
    await expect(window.locator(THEME_INPUT)).toHaveValue('日付移動テスト', { timeout: 15_000 });
  });

  test('翌日へ移動後、「今日」ボタンで当日に戻る', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    const todayDate = (await window.locator(DATE_DISPLAY).textContent())?.trim() ?? '';

    // 翌日へ移動
    await window.locator(NEXT_BUTTON).click();
    await expect(window.locator(DATE_DISPLAY)).not.toHaveText(todayDate, { timeout: 10_000 });

    // 「今日」ボタンで当日に戻る
    await window.locator(TODAY_BUTTON).click();
    await expect(window.locator(DATE_DISPLAY)).toHaveText(todayDate, { timeout: 10_000 });
  });
});

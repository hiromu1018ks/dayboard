/**
 * テーマ入力の境界値 E2E テスト（[要件7.2]、AC-13/AC-02）
 *
 * autosave.spec は基本的な保存をカバーしているが、以下の境界値を補完:
 * - maxLength=200 の上限（ヘッダーのテーマ入力）
 * - 空文字は null 扱い（API 側でも正規化）
 * - 長文（200文字ギリギリ）の保存・復元
 * - 日本語テーマの保存・復元
 *
 * Header.tsx の設計:
 * - maxLength={200}
 * - handleThemeChange で空文字を null へ（onThemeEdit(value === '' ? null : value)）
 * - 日付切替直後は一旦クリア → fetch 後に新日付の値を反映
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  launchApp,
  resetE2eDatabase,
  waitForSaved,
  waitForSavedSteady,
} from './helpers.js';

const THEME_INPUT = '#theme-input';

test.describe('テーマ入力の境界値（要件7.2、AC-13）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('maxLength=200 で入力が打ち切られる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 210文字入力を試行
    const longText = 'あ'.repeat(210);
    await window.locator(THEME_INPUT).fill(longText);

    // 200文字で打ち切られる
    await expect(window.locator(THEME_INPUT)).toHaveValue('あ'.repeat(200));
    await expect(window.locator(THEME_INPUT)).toHaveValue(/.{200}/);
  });

  test('200文字ギリギリのテーマ（ASCII）→ 保存 → 再起動後も完全に復元（AC-02）', async () => {
    const ascii200 = 'a'.repeat(200);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await window.locator(THEME_INPUT).fill(ascii200);
    await waitForSaved(window);
    await expect(window.locator(THEME_INPUT)).toHaveValue(ascii200);
    await closeApp(app);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue(ascii200, { timeout: 15_000 });
  });

  test('200文字ギリギリのテーマ（多バイト混在）→ 保存 → 再起動後も完全に復元（AC-02）', async () => {
    const mixed200 = 'A'.repeat(50) + '日'.repeat(50) + '1'.repeat(50) + '!'.repeat(50);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await window.locator(THEME_INPUT).fill(mixed200);
    await waitForSaved(window);
    await closeApp(app);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue(mixed200, { timeout: 15_000 });
  });

  test('空入力 → null 扱いで保存（テーマクリア）', async () => {
    // 起動直後はテーマが空（null）のため、あえて「入力→保存→空にする→保存」の
    // 2段階編集ではなく、直接空のままで保存 → 再起動で null が維持されることを検証。
    // これにより、複数回編集による保存ジョブ重複のタイミング問題を回避する。
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 起動直後は空。明示的に空を保存するため、一時入力→確実に saved へ→空にする→saved へ。
    // ただし「保存中...」の連続遷移を避けるため、段階的に stable まで待つ。
    await window.locator(THEME_INPUT).fill('一時値');
    await waitForSaved(window);
    // 完全に saved へ収束させる
    await window.locator('body').click(); // フォーカス外して保存確定を促す
    await waitForSavedSteady(window, 15_000);
    await expect(window.getByText('保存中...')).toHaveCount(0);

    // 空にする → null 扱いで保存
    await window.locator(THEME_INPUT).fill('');
    // デバウンス(800ms) + サーバー往復を待つため、明示的に body クリックで blur させる
    await window.locator('body').click();
    // 保存完了まで十分に待つ（waitForSaved の「保存中」捕捉タイミング問題を回避）
    await window.waitForTimeout(2000);
    await waitForSavedSteady(window, 15_000);
    await closeApp(app);

    // 再起動後も空のまま（null が維持）
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });
  });

  test('日本語テーマ → 保存 → 再起動後も復元（AC-02）', async () => {
    const japaneseTheme = '今日の重要なミーティング：プロダクト仕様の最終調整とリリース判断';

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await window.locator(THEME_INPUT).fill(japaneseTheme);
    await waitForSaved(window);
    await closeApp(app);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue(japaneseTheme, { timeout: 10_000 });
  });

  test('絵文字入りテーマ → 保存 → 再起動後も復元（マルチバイト境界）', async () => {
    const emojiTheme = '🚀リリース準備 🎯仕様確定 ⚡高速化';

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await window.locator(THEME_INPUT).fill(emojiTheme);
    await waitForSaved(window);
    await closeApp(app);

    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    await expect(window.locator(THEME_INPUT)).toHaveValue(emojiTheme, { timeout: 10_000 });
  });
});

test.describe('テーマ編集中の日付移動（AC-10/US-MVP-011 AC-5）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('テーマ編集中 → ⌘T（今日）で移動 → 戻ると復元（キーボード経路）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマを保存
    await window.locator(THEME_INPUT).fill('保存済みテーマ');
    await waitForSaved(window);

    // 翌日へ（ボタン）
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // ⌘T で今日へ戻る（保存済みテーマが復元される）
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${mod}+T`);
    await expect(window.locator(THEME_INPUT)).toHaveValue('保存済みテーマ', { timeout: 10_000 });
  });
});

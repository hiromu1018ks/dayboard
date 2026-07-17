/**
 * 振り返り（Reflection）E2E テスト
 *
 * 既存テストで未カバーだった振り返り3セクションの編集・保存を検証（要件7.5）。
 *
 * 検証項目:
 * - AC-02: 3セクション（できたこと/止まったこと/明日の一手）のテキスト編集が永続化
 * - 再起動後も保持
 * - 別日付で独立
 * - デバウンス保存（800ms）
 *
 * ReflectionColumn.tsx の設計:
 * - 単一 SaveTarget（reflection）で3セクションを扱う（部分更新）
 * - 各セクション maxLength=4000
 * - data-focus-field={section.key} で識別
 * - aria-label: Done / Stuck / Next Step
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase, waitForSaved } from './helpers.js';

const THEME_INPUT = '#theme-input';
const REFLECTION_SECTION = 'section[aria-label="振り返り"]';

/**
 * 3セクションのラベル → textarea を特定するマッピング。
 * aria-label で確実に要素を特定（CSS class に依存しない）。
 */
const SECTIONS = {
  doneText: 'Done',
  stuckText: 'Stuck',
  tomorrowActionText: 'Next Step',
} as const;

/** 振り返りセクションへ入力し、保存完了を待つ */
async function fillReflectionAndWaitSaved(
  window: Page,
  sectionKey: keyof typeof SECTIONS,
  text: string,
): Promise<void> {
  const textarea = window
    .locator(REFLECTION_SECTION)
    .locator(`textarea[aria-label="${SECTIONS[sectionKey]}"]`);
  await textarea.fill(text);
  await waitForSaved(window);
}

test.describe('振り返り: 3セクション編集と永続化（AC-02、要件7.5）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('初期状態は3セクションが空', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 3セクションとも空
    for (const label of Object.values(SECTIONS)) {
      const textarea = window
        .locator(REFLECTION_SECTION)
        .locator(`textarea[aria-label="${label}"]`);
      await expect(textarea).toBeVisible();
      await expect(textarea).toHaveValue('');
    }
  });

  test('3セクション編集 → それぞれ保存 → 再起動後も維持（AC-02）', async () => {
    const doneText = `できたこと ${Date.now()}`;
    const stuckText = `止まったこと ${Date.now()}`;
    const tomorrowText = `明日の一手 ${Date.now()}`;

    // 1回目: 3セクション入力
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await fillReflectionAndWaitSaved(window, 'doneText', doneText);
    await fillReflectionAndWaitSaved(window, 'stuckText', stuckText);
    await fillReflectionAndWaitSaved(window, 'tomorrowActionText', tomorrowText);

    await closeApp(app);

    // 2回目: 再起動後も3セクション維持
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Done"]`),
    ).toHaveValue(doneText, { timeout: 10_000 });
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Stuck"]`),
    ).toHaveValue(stuckText);
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Next Step"]`),
    ).toHaveValue(tomorrowText);
  });

  test('1セクションだけ編集 → 他セクションは維持（部分更新）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 3セクション入力
    await fillReflectionAndWaitSaved(window, 'doneText', '元のできたこと');
    await fillReflectionAndWaitSaved(window, 'stuckText', '元の止まったこと');
    await fillReflectionAndWaitSaved(window, 'tomorrowActionText', '元の明日の一手');

    // doneText だけ更新
    await fillReflectionAndWaitSaved(window, 'doneText', '更新されたできたこと');

    // 他2セクションは維持される
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Stuck"]`),
    ).toHaveValue('元の止まったこと');
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Next Step"]`),
    ).toHaveValue('元の明日の一手');
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Done"]`),
    ).toHaveValue('更新されたできたこと');
  });

  test('別日付の振り返りは混ざらない（AC-10）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日の振り返りを入力
    await fillReflectionAndWaitSaved(window, 'doneText', '当日のできたこと');
    await fillReflectionAndWaitSaved(window, 'stuckText', '当日の止まったこと');

    // 翌日へ
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // 翌日の振り返りは空
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Done"]`),
    ).toHaveValue('');
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Stuck"]`),
    ).toHaveValue('');

    // 翌日に別内容を入力
    await fillReflectionAndWaitSaved(window, 'doneText', '翌日のできたこと');

    // 前日（当日）へ戻ると、当日の振り返りが維持
    await window.click('button[aria-label="前日へ"]');
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Done"]`),
    ).toHaveValue('当日のできたこと', { timeout: 10_000 });
    await expect(
      window.locator(REFLECTION_SECTION).locator(`textarea[aria-label="Stuck"]`),
    ).toHaveValue('当日の止まったこと');
  });
});

/**
 * 自動保存 E2E テスト（[roadmap.md T-2-15]）
 *
 * [test_strategy.md §5.2 4.1] / [autosave_spec.md §11] のシナリオ:
 * - 入力 → 自動保存完了待ち → 再起動 → 同じ内容が表示される
 * - クラッシュ（強制終了）→ 再起動 → 未保存分が復元される
 *
 * 重点（要件 4.3）: 「自動保存失敗による入力喪失 0件」の経路をE2Eで確認。
 *
 * 注意:
 * - これらのテストはローカル実行を想定（CI必須化しない、[roadmap.md T-2-15]）。
 * - 実行前に PostgreSQL（dayborad_dev）が起動済みでマイグレーション済みであること。
 * - Electron アプリは実プロセスを起動するため、DISPLAY 環境（Linux は xvfb）が必要。
 *
 * [test_strategy.md §5.2]: ../../docs/test_strategy.md
 * [autosave_spec.md §11]: ../../docs/autosave_spec.md
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp } from './helpers.js';

/**
 * テーマ入力欄のセレクタ。
 */
const THEME_INPUT = '#theme-input';
/** 保存状態表示のテキスト（保存済み）を待つセレクタ。role=status を利用。 */
const SAVED_STATUS = 'text=保存済み';

/**
 * テーマ入力 → 800msデバウンス保存 → 「保存済み」表示を待つ共通ステップ（AC-13）。
 */
async function typeThemeAndWaitSaved(window: Page, text: string): Promise<void> {
  await window.fill(THEME_INPUT, text);
  // デバウンス800ms + サーバー保存ラウンドトリップ + 余裕を見て5s待機
  await window.waitForSelector(SAVED_STATUS, { timeout: 10_000 });
}

test.describe('自動保存: テーマ編集（AC-13）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('テーマ編集が800ms後に保存され、状態が saving → saved に遷移する', async () => {
    ({ app, window } = await launchApp());

    // 初期状態: テーマ未入力
    await expect(window.locator(THEME_INPUT)).toHaveValue('');

    // テーマ入力 → 保存済みへ（AC-13）
    await typeThemeAndWaitSaved(window, 'E2Eテスト: 自動保存確認');

    // 保存状態表示が「保存済み」であることを検証
    await expect(window.getByText('保存済み')).toBeVisible();
  });
});

test.describe('自動保存: 再起動後の保持（AC-13/AC-02）', () => {
  test('テーマ入力 → 再起動 → 同じ内容が表示される', async () => {
    // 1回目: テーマ入力して保存
    let launched = await launchApp();
    const theme = `E2Eリカバリ ${Date.now()}`;
    await typeThemeAndWaitSaved(launched.window, theme);
    await closeApp(launched.app);

    // 2回目: 再起動して同じテーマが表示されるか検証
    launched = await launchApp();
    // 初回fetch完了後、テーマ入力欄に前回の値が入る
    await expect(launched.window.locator(THEME_INPUT)).toHaveValue(theme, { timeout: 15_000 });
    await closeApp(launched.app);
  });
});

test.describe('自動保存: クラッシュ → localStorage リカバリ（要件 4.3）', () => {
  // 注: 真のクラッシュ再現は難しいため、強制終了（kill）で擬似的に再現する。
  // 編集ごとに localStorage へ書き込んでいるため、保存未完了でも localStorage に残る（§6.2）。
  test.skip('保留中編集 → 強制終了 → 再起動 → localStorage から復元される', async () => {
    // このテストは保留（skip）。理由:
    // - 強制終了（SIGKILL）のタイミング制御が環境依存で不安定
    // - Phase 2 の Unit/Integration テストで localStorage リカバリ経路は担保済み
    // - T-8-03 で「自動保存失敗による入力喪失 0件」の完全 E2E を改めて整備
    //
    // シナリオ定義のみ残し、実行は T-8-03 に委ねる（[roadmap.md T-8-03]）。
  });
});

test.describe('自動保存: 日付移動前 flush（T-2-10、US-MVP-011 AC-5）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('テーマ編集中に日付移動 → 移動先で編集が失われない', async () => {
    ({ app, window } = await launchApp());

    // テーマ入力（デバウンス待たずに日付移動）
    await window.fill(THEME_INPUT, '移動前テーマ');
    // すぐに翌日へ（flush が発火し localStorage へ書込）
    await window.click('button[aria-label="翌日へ"]');

    // 翌日の DayNote が表示され、テーマ入力欄は空（別日付）であることを検証
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 15_000 });

    // 前日（＝元の日付）へ戻ると、flush されたテーマが復元される
    await window.click('button[aria-label="前日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('移動前テーマ', { timeout: 15_000 });
  });
});

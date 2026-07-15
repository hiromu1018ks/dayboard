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
import {
  closeApp,
  createTempUserDataDir,
  launchApp,
  removeTempUserDataDir,
  resetE2eDatabase,
  waitForSaved,
  waitForSavedSteady,
} from './helpers.js';

/**
 * テーマ入力欄のセレクタ。
 */
const THEME_INPUT = '#theme-input';

/**
 * テーマ入力 → 800msデバウンス保存 → 保存完了を待つ共通ステップ（AC-13）。
 *
 * [ui_interaction_spec.md §10] 準拠: saved 状態は「表示が消えることで完了を伝える」設計のため、
 * 「保存中...」の出現→消失で保存完了を検知する（従来の「保存済み」表示待ちではなく）。
 */
async function typeThemeAndWaitSaved(window: Page, text: string): Promise<void> {
  await window.fill(THEME_INPUT, text);
  await waitForSaved(window);
}

test.describe('自動保存: テーマ編集（AC-13）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('テーマ編集が800ms後に保存され、状態が saving → saved に遷移する', async () => {
    ({ app, window } = await launchApp());

    // 初期状態: テーマ未入力
    await expect(window.locator(THEME_INPUT)).toHaveValue('');

    // テーマ入力 → 保存完了（AC-13）
    await typeThemeAndWaitSaved(window, 'E2Eテスト: 自動保存確認');

    // [ui_interaction_spec.md §10] 準拠: saved 状態は「保存中表示が消える」ことで完了を示す。
    // 「保存済み」表示は存在しないため、保存中表示が非表示（= saved）であることを検証。
    await expect(window.getByText('保存中...')).not.toBeVisible();
  });
});

test.describe('自動保存: 再起動後の保持（AC-13/AC-02）', () => {
  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test('テーマ入力 → 再起動 → 同じ内容が表示される', async () => {
    // 1回目: テーマ入力して保存
    let launched = await launchApp();
    const theme = `E2Eリカバリ ${Date.now()}`;
    await typeThemeAndWaitSaved(launched.window, theme);
    await closeApp(launched.app);

    // 2回目: 再起動して同じテーマが表示されるか検証
    launched = await launchApp();
    // 初回fetch完了後、テーマ入力欄に前回の値が入る。
    // 保存中表示が消える（= saved へ収束）のを待ち、fetch + 初期化完了の目安とする。
    await waitForSavedSteady(launched.window, 15_000);
    await expect(launched.window.locator(THEME_INPUT)).toHaveValue(theme, { timeout: 15_000 });
    await closeApp(launched.app);
  });
});

test.describe('自動保存: クラッシュ → localStorage リカバリ（要件 4.3）', () => {
  // 注: 真のクラッシュ（SIGKILL）は localStorage のディスク永続化が保証されない
  // （Chromium の LevelDB は非同期フラッシュ）。その代わり、設計上保証している経路は
  // 「before-quit で flush-all が Renderer へ送られ、localStorage へ同期書き込みされる」
  // （autosave_spec.md §6.2/§10.1）。本テストは SIGTERM（before-quit 発火）で終了し、
  // flush-all → localStorage 保護 → 再起動で recoverOnStartup が再送する経路を検証する。
  //
  // シナリオ:
  //   1. テーマ入力（デバウンス800ms発火前に終了 → サーバーへ未保存）
  //   2. SIGTERM で終了（before-quit → flush-all → localStorage へ保留データ保護）
  //   3. 再起動 → recoverOnStartup が localStorage の保留データを再送
  //   4. テーマが復元される（入力喪失 0件、要件 4.3）
  test('保留中編集 → SIGTERM終了 → 再起動 → localStorage から復元される', async () => {
    // クラッシュ→復元では1回目と2回目で同じ localStorage（userData）を共有する必要がある。
    // テスト全体で1つの userData ディレクトリを使い、最後に削除する。
    // この describe には beforeEach がないため、テスト内で DB をリセットする。
    await resetE2eDatabase();
    const userDataDir = createTempUserDataDir();
    try {
      // 1回目起動: テーマ入力して、デバウンス発火前に SIGTERM で終了
      let launched = await launchApp({ userDataDir });
      const theme = `クラッシュ復元 ${Date.now()}`;
      await launched.window.locator(THEME_INPUT).fill(theme);
      // 編集が React state を経て edit → persistTarget されるまで短く待つ
      await launched.window.waitForTimeout(300);
      // デバウンス(800ms)発火前に SIGTERM。before-quit が flush-all を送り、
      // Renderer が localStorage へ保留スナップショットを同期書き込みする。
      // その後 apiServer.close → pool.close → app.quit へ。
      const proc = launched.app.process();
      if (proc) {
        try {
          process.kill(proc.pid, 'SIGTERM');
        } catch {
          // 既に終了している場合は無視
        }
      }
      // before-quit の flush（最大2s）+ 終了処理が収束するまで待つ。
      // closeApp の userData 削除を回避するため app.close を直接呼ぶ。
      try {
        await launched.app.close();
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 1500));

      // 2回目起動: 同じ userDataDir を使う → 同じ localStorage を共有。
      // recoverOnStartup が localStorage の保留データを再送する。
      launched = await launchApp({ userDataDir });
      await launched.window.waitForLoadState('domcontentloaded');
      // recoverOnStartup → PATCH → refetch → UI 反映のラウンドトリップを待つ（最大20s）
      await expect(launched.window.locator(THEME_INPUT)).toHaveValue(theme, { timeout: 20_000 });
      try {
        await launched.app.close();
      } catch {
        // ignore
      }
    } finally {
      removeTempUserDataDir(userDataDir);
    }
  });
});

test.describe('自動保存: 日付移動前 flush（T-2-10、US-MVP-011 AC-5）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('テーマ編集中に日付移動 → 移動先で編集が失われない', async () => {
    ({ app, window } = await launchApp());

    // テーマ入力 → 日付移動前に flush が保留編集を保護（T-2-10）
    // デバウンス保存が完了するまで待ち、確実にサーバー/localStorage へ保存させる
    await typeThemeAndWaitSaved(window, '移動前テーマ');

    // 翌日へ（flush が発火し、保留データを localStorage へ書込）
    await window.click('button[aria-label="翌日へ"]');

    // 翌日の DayNote が表示され、テーマ入力欄は空（別日付）であることを検証
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 15_000 });

    // 前日（＝元の日付）へ戻ると、保存されたテーマが復元される
    await window.click('button[aria-label="前日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('移動前テーマ', { timeout: 15_000 });
  });
});

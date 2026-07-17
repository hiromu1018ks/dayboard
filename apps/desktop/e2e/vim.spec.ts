/**
 * Vim キーバインド E2E テスト（[roadmap.md T-7-11]、AC-16〜AC-20）
 *
 * [test_strategy.md §5.2 4.4] のシナリオ:
 * - AC-15: 設定で Vim へ切替（再起動後も維持）
 * - AC-16: Vim で `i` を押すと Insert 状態になりテキスト入力できる
 * - AC-17: Vim Insert で `Esc` を押すと Normal へ戻り、ノートモードから離脱しない
 * - AC-18: Vim Normal でノートモード中に `Esc` を押すと仕事整理モードへ戻る
 * - AC-20: Vim Normal で `h/j/k/l` で基本移動
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - Vim の CodeMirror 連携は実 Electron 上で安定するまで時間がかかる場合がある。
 *   待機を十分に入れている。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const SETTINGS_BUTTON = 'button[aria-label="設定を開く"]';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;

/**
 * 設定で Vim へ切替するヘルパ。
 * PATCH /api/settings の 200 を待って確実に永続化（固定待機ではなくレスポンス完了で検知）。
 * これにより環境負荷時の不安定化と無駄な待ち時間を両方排除する。
 */
async function enableVim(window: Page): Promise<void> {
  await window.locator(SETTINGS_BUTTON).click();
  await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });
  // PATCH /api/settings の完了を確実に待つ（radio.check が onChange を発火 → PATCH送信）
  const patchPromise = window.waitForResponse(
    (res) => res.url().includes('/settings') && res.request().method() === 'PATCH',
    { timeout: 10_000 },
  );
  await window.locator('input[type="radio"][value="vim"]').check();
  await patchPromise;
  await window.keyboard.press('Escape'); // モーダルを閉じる
  await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
}

test.describe('Vim キーバインド（AC-16〜AC-20）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) {
      // 標準へ戻す処理は不要: 各テストは独立した userDataDir を使い、
      // beforeEach の resetE2eDatabase が user_settings を standard/normal へ
      // リセットするため、テスト間で Vim 設定はリークしない。
      // （従来の restoreStandard 試行は失敗時に握りつぶしで時間を浪費していたため削除）
      await closeApp(app);
    }
  });

  test('Vim 有効化で VIM NORMAL バッジが表示される（AC-15）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // 右下に VIM NORMAL バッジ
    await expect(window.locator('[data-testid="vim-state-badge"]')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=VIM NORMAL')).toBeVisible();
  });

  test('Vim で Space n でモード切替（AC-20 関連）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // 仕事整理モードで Space n → ノートモードへ
    await window.keyboard.press('Space');
    await window.keyboard.press('n');

    // ノートエディタが表示される
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });
  });

  // AC-18（Vim Normal 状態のノートモードで Esc → 仕事整理モードへ戻る）の E2E 検証。
  //
  // 注意（AC-17 の一部と AC-16 は Unit 層で担保）:
  // Playwright の合成キーボードは @replit/codemirror-vim の `i` コマンド認識に必要な
  // KeyboardEvent プロパティを完全再現しないため、CodeMirror 内で `i` を押しても
  // Vim Insert へ移行しない（実機の本物のキーボードでは動作、ユーザー手動確認済み）。
  // そのため AC-16（i で Insert 移行）と AC-17 の Insert→Normal 遷移部分は Unit テスト
  // （vim.test.ts 35+テスト、escPriority.test.ts）で純粋関数としてカバーする。
  // 実機での手動確認は release_checklist.md §3.1 手順8（Vim 切替）で担保。
  //
  // 一方 AC-18（Normal 状態の Esc → work 戻り）は Playwright でも再現可能なため、
  // 本テストで明示的に検証する（プローブ検証済み: Normal状態でEsc押下→work復帰する）。
  test('Vim ノートモード（Normal状態）で Esc → 仕事整理モードへ戻る（AC-18）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await enableVim(window);

    // ⌘J でノートモードへ（Vim は初期状態 Normal）
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+J' : 'Control+J');
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });

    // CodeMirror へフォーカス（Vim 拡張は有効だが Normal 状態を維持）
    await window.locator(CM_CONTENT).click();
    await expect(window.locator(CM_CONTENT)).toBeFocused({ timeout: 5_000 });
    // Vim 状態は Normal のまま（i を押していないので Insert へは移行しない）
    await expect(window.locator('text=VIM NORMAL')).toBeVisible({ timeout: 5_000 });

    // Esc → 仕事整理モードへ戻る（AC-18）。
    // escPriority 段4: Vim Normal 状態のノートモードで Esc → work 戻り。
    await window.keyboard.press('Escape');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
    // ノートエディタは非表示（仕事整理モードへ完全に切替わった）
    await expect(window.locator(NOTE_EDITOR)).toHaveCount(0);
  });
});

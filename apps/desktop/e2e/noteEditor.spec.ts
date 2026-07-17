/**
 * ノートモード 本文編集と永続化 E2E テスト
 *
 * modeSwitch.spec は「モード切替をまたいだ本文保持」を検済だが、以下を補完:
 * - AC-02: ノート本文編集 → 再起動後も復元
 * - 複数行編集の保持
 * - 別日付のノート本文は混ざらない
 * - PATCH /note-entry の送信確認
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchAppReady, resetE2eDatabase, waitForSaved } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;

/** 実行環境が Mac か（⌘J 切替用） */
function isMac(): boolean {
  return process.platform === 'darwin';
}

/** ノートモードへ切替 */
async function switchToNoteMode(window: Page): Promise<void> {
  await window.keyboard.press(isMac() ? 'Meta+J' : 'Control+J');
  await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });
  // CodeMirror の初期化と本文反映を待つため、.cm-content が描画されるまで待つ
  await expect(window.locator(CM_CONTENT)).toBeVisible({ timeout: 5_000 });
  // サーバーからの本文 fetch 完了を待つため、短く待つ
  await window.waitForTimeout(500);
}

/** CodeMirror の本文を行ごとに取得 */
async function getNoteLines(window: Page): Promise<string[]> {
  const lines = window.locator(`${NOTE_EDITOR} .cm-line`);
  const count = await lines.count();
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (await lines.nth(i).textContent()) ?? '';
    if (t.length > 0) result.push(t);
  }
  return result;
}

test.describe('ノート本文: 編集と永続化（AC-02、要件7.6）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('ノート本文入力 → PATCH /note-entry 送信 → 再起動後も復元（AC-02）', async () => {
    const noteText = `ノート永続化テスト ${Date.now()}`;

    // 1回目: ノート入力 → 保存
    ({ app, window } = await launchAppReady());
    await switchToNoteMode(window);

    // CodeMirror へ入力。PATCH /note-entry の送信を待ち受ける。
    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/note-entry') && res.request().method() === 'PATCH',
      { timeout: 15_000 },
    );
    await window.locator(CM_CONTENT).click();
    await window.keyboard.type(noteText);
    await patchPromise;
    // 保存状態が saved へ収束するのを待つ
    await waitForSaved(window);

    await closeApp(app);

    // 2回目: 再起動後、同じ本文が復元される
    ({ app, window } = await launchAppReady());
    await switchToNoteMode(window);

    // CodeMirror に前回の本文が入っている
    const lines = await getNoteLines(window);
    expect(lines.some((l) => l.includes(noteText))).toBeTruthy();
  });

  test('複数行ノート → 行構造を保持して再起動後に復元', async () => {
    // 1回目: 複数行入力
    ({ app, window } = await launchAppReady());
    await switchToNoteMode(window);
    await window.locator(CM_CONTENT).click();

    const patchPromise = window.waitForResponse(
      (res) => res.url().includes('/note-entry') && res.request().method() === 'PATCH',
      { timeout: 15_000 },
    );
    await window.keyboard.type('一行目');
    await window.keyboard.press('Enter');
    await window.keyboard.type('二行目');
    await window.keyboard.press('Enter');
    await window.keyboard.type('三行目');
    await patchPromise;
    await waitForSaved(window);

    await closeApp(app);

    // 2回目: 再起動後、3行が順序維持で復元
    ({ app, window } = await launchAppReady());
    await switchToNoteMode(window);
    const lines = await getNoteLines(window);
    expect(lines).toEqual(['一行目', '二行目', '三行目']);
  });

  test('別日付へ移動 → ノート本文は空（日付分離、AC-10）', async () => {
    // workCrud.spec「別日付のTODO/Blockerは混ざらない」で日付分離自体は検証済み。
    // 本テストはノート本文視点でも空になることを軽量に検証する（往復なしで方向単独）。
    ({ app, window } = await launchAppReady());

    // 当日のノート本文を入力
    await switchToNoteMode(window);
    const patch1 = window.waitForResponse(
      (res) => res.url().includes('/note-entry') && res.request().method() === 'PATCH',
      { timeout: 15_000 },
    );
    await window.locator(CM_CONTENT).click();
    await window.keyboard.type('当日ノート本文');
    await patch1;
    await waitForSaved(window);

    // 仕事整理モードへ戻って翌日へ移動
    await window.keyboard.press(isMac() ? 'Meta+J' : 'Control+J');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // 翌日のノート本文は空
    await switchToNoteMode(window);
    const nextLines = await getNoteLines(window);
    expect(nextLines.length).toBe(0);
    expect(nextLines.some((l) => l.includes('当日ノート本文'))).toBe(false);
  });
});

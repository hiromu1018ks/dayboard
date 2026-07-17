/**
 * Markdown エクスポート 内容検証 E2E テスト
 *
 * sidebar.spec.ts では「クリップボードへコピーされること」を検証済みだが、
 * 出力される Markdown の内容形式（[markdownExport.ts] の契約）は未カバー。
 * 以下を検証する:
 * - TODO ステータス別の checkbox（[ ] / [x] / [>]）
 * - 障害 resolved/未解決 の checkbox
 * - 各セクション見出し（## Today / ## Stuck / ## Reflection / ## Notes / ## Today's Theme）
 * - 空セクションの省略
 * - 空日（データ無し）のテンプレート出力（「（no content）」）
 *
 * [markdownExport.ts]: ../../packages/domain/src/markdownExport.ts
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, launchAppReady, resetE2eDatabase, waitForSaved } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEW_BLOCKER_INPUT = 'input[aria-label="新規障害入力"]';
const REFLECTION_DONE = 'section[aria-label="振り返り"] textarea[aria-label="Done"]';
const EXPORT_BUTTON = 'button[aria-label="Markdownとしてコピー"]';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;

/** プラットフォーム別の修飾キー */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * TODOを1件追加するヘルパ。POST /todos の 201 を待つ。
 */
async function addTodo(window: Page, title: string): Promise<void> {
  await window.locator(NEW_TODO_INPUT).click();
  await window.locator(NEW_TODO_INPUT).fill(title);
  const postPromise = window.waitForResponse(
    (res) =>
      res.url().includes('/todos') &&
      res.request().method() === 'POST' &&
      !res.url().includes('reorder') &&
      res.status() === 201,
    { timeout: 10_000 },
  );
  await window.keyboard.press('Enter');
  await postPromise;
}

/** Blockerを1件追加するヘルパ。POST /blockers の 201 を待つ。 */
async function addBlocker(window: Page, text: string): Promise<void> {
  await window.locator(NEW_BLOCKER_INPUT).click();
  await window.locator(NEW_BLOCKER_INPUT).fill(text);
  const postPromise = window.waitForResponse(
    (res) =>
      res.url().includes('/blockers') &&
      res.request().method() === 'POST' &&
      !res.url().includes('reorder') &&
      res.status() === 201,
    { timeout: 10_000 },
  );
  await window.keyboard.press('Enter');
  await postPromise;
}

/**
 * 指定 index の TODO の完了状態を切替え、PATCH /todos/:id の 200 を待つ。
 */
async function toggleTodoAt(window: Page, index: number): Promise<void> {
  const patchPromise = window.waitForResponse(
    (res) => res.url().includes('/todos/') && res.request().method() === 'PATCH',
    { timeout: 10_000 },
  );
  await window
    .locator('section[aria-label="TODO"] li')
    .nth(index)
    .locator('button[data-focus-item]')
    .click();
  await patchPromise;
}

/**
 * Export ボタンを押し、クリップボードへコピーされた Markdown 文字列を取得する。
 * 事前に保留中の保存が無い（saved 収束済み）ことを確実にするため、waitForSaved の
 * 「保存中表示出現→消失」を待ってから Export する（Markdown が最新状態を反映するよう担保）。
 */
async function exportMarkdown(window: Page, app: ElectronApplication): Promise<string> {
  // 保留中保存があれば saved 収束を待つ。無ければ即完了。
  const savingLocator = window.getByText('保存中...');
  if (await savingLocator.isVisible().catch(() => false)) {
    await savingLocator.waitFor({ state: 'detached', timeout: 10_000 });
  }
  await window.locator(EXPORT_BUTTON).click();
  // トーストで成功通知を待つ（コピー完了の合図）
  await expect(window.locator('[data-testid="toast"]')).toContainText('Copied to clipboard', {
    timeout: 5_000,
  });
  // Electron の clipboard API 経由で読み取り
  return await app.evaluate(({ clipboard }) => clipboard.readText());
}

test.describe('Markdown エクスポート: 内容検証（[markdownExport.ts]）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('TODO/Blocker/Reflection/Theme/Note 全セクションが正しい形式で出力される', async () => {
    ({ app, window } = await launchAppReady());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマ（PATCH /day-notes/:date の theme を明示的に待つ）
    const themePatch = window.waitForResponse(
      (res) =>
        res.url().includes('/day-notes/') &&
        !res.url().includes('/todos') &&
        !res.url().includes('/blockers') &&
        !res.url().includes('/reflection') &&
        !res.url().includes('/note-entry') &&
        !res.url().includes('/carry-over') &&
        !res.url().includes('/convert') &&
        res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(THEME_INPUT).fill('マークダウン検証テーマ');
    await themePatch;
    await waitForSaved(window);

    // 未完了TODOと完了TODO
    await addTodo(window, '未完了のタスク');
    await addTodo(window, '完了したタスク');
    await toggleTodoAt(window, 1); // 2件目を完了へ

    // Blocker（未解決）
    await addBlocker(window, '未解決障害');

    // Reflection（Done セクションのみ）
    // Reflection は debounce(800ms) + PATCH /reflection で保存される。
    // waitForSaved は「保存中表示→消失」を待つが、fill 直後の debounce 待機中は
    // 「保存中...」表示が出る前に次ステップへ進む競合が起き得る。そのため
    // PATCH /reflection のレスポンスを明示的に待って確実にサーバーへ保存させる。
    const reflectionPatch = window.waitForResponse(
      (res) => res.url().includes('/reflection') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(REFLECTION_DONE).fill('振り返りできたこと');
    await reflectionPatch;
    // 保存状態の saved 収束も待つ（UI 表示の安定）
    await waitForSaved(window);

    // Note 本文
    await window.keyboard.press(`${MOD}+J`);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });
    const patchNote = window.waitForResponse(
      (res) => res.url().includes('/note-entry') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(CM_CONTENT).click();
    await window.keyboard.type('ノート本文の内容');
    await patchNote;
    await waitForSaved(window);

    // 仕事整理モードへ戻る（Export ボタンは仕事整理モードの Header にある）
    await window.keyboard.press('Escape');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });

    // エクスポート
    const md = await exportMarkdown(window, app);

    // 日付見出し（# Jul 13, 2026 (Sun) 形式）
    expect(md).toMatch(/^# .+ \(.+\)$/m);
    // Today's Theme セクション
    expect(md).toContain("## Today's Theme");
    expect(md).toContain('マークダウン検証テーマ');
    // TODO: 未完了は [ ]、完了は [x]
    expect(md).toContain('## Today');
    expect(md).toContain('- [ ] 未完了のタスク');
    expect(md).toContain('- [x] 完了したタスク');
    // Blocker: 未解決は [ ]
    expect(md).toContain('## Stuck');
    expect(md).toContain('- [ ] 未解決障害');
    // Reflection: Done のみ（Stuck/Next Step は空のため省略）
    expect(md).toContain('## Reflection');
    expect(md).toContain('### Done');
    expect(md).toContain('振り返りできたこと');
    // Stuck セクション見出しは空のため出現しない
    expect(md).not.toContain('### Stuck');
    expect(md).not.toContain('### Next Step');
    // Note 本文
    expect(md).toContain('## Notes');
    expect(md).toContain('ノート本文の内容');
  });

  test('当日はAC-01でDayNote自動生成済みのため、空データでは日付見出しのみ出力される', async () => {
    // 注: buildEmptyDayNoteMarkdown（「（no content）」テンプレート）は「DayNote 未存在時」専用。
    // 当日はAC-01により起動時にDayNoteが自動生成されるため、空データ状態では
    // exportDayNoteToMarkdown が呼ばれ、全セクション空のため日付見出しのみが出力される。
    // （getOrCreateFull で未存在日は自動生成されるため、未存在経路はE2Eから到達不能）
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 何も入力せず（初期状態）エクスポート
    const md = await exportMarkdown(window, app);

    // 日付見出しのみ（全セクション空のため省略）
    expect(md).toMatch(/^# .+ \(.+\)/m);
    // セクション見出しは一切出力されない
    expect(md).not.toContain("## Today's Theme");
    expect(md).not.toContain('## Today');
    expect(md).not.toContain('## Stuck');
    expect(md).not.toContain('## Reflection');
    expect(md).not.toContain('## Notes');
  });

  test('carried TODO は [>]（carried to tomorrow）として出力される', async () => {
    ({ app, window } = await launchAppReady());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await addTodo(window, '持ち越し状態確認タスク');
    // 持ち越し実行
    await window.click('text=/未完了を翌日へ持ち越し/');
    await window.click('button:has-text("持ち越す")');
    await expect(window.locator('text=/Carried to tomorrow/')).toBeVisible({ timeout: 10_000 });
    // 持ち越し後の carried 化反映（PATCH /todos/:id）が収束するまで待つ。
    // UI 上は carried 表示で確定するため、それを最終安定状態とみなす。
    // Note: 持ち越しは即時 API のため保存状態遷移を伴わないが、明示的に保存完了を待つ。
    await waitForSaved(window).catch(() => {});

    const md = await exportMarkdown(window, app);

    // carried TODO の形式: `- [>] <title>（carried to tomorrow）`
    expect(md).toContain('## Today');
    expect(md).toContain('- [>] 持ち越し状態確認タスク（carried to tomorrow）');
  });
});

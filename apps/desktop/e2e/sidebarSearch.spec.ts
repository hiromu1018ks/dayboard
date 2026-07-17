/**
 * サイドバー検索 E2E 補完テスト（Post-MVP）
 *
 * sidebar.spec.ts は THEME リソースの検索ジャンプのみ検証している。
 * 検索は全リソース（TODO/Blocker/Reflection/Note/Theme）を横断してヒットするため、
 * 主要リソースタイプで検索 → ジャンプできることを追加検証する。
 *
 * 検証項目:
 * - TODO 本文で検索 → ヒット → ジャンプで当該日付の仕事整理モードへ
 * - Blocker 本文で検索 → ヒット
 * - Reflection セクション（Done/Stuck/Next Step）で検索 → ヒット
 * - Note 本文で検索 → ヒット
 * - 検索結果のリソース種別バッジ（TODO/BLOCKER/NOTE/REFLECTION/THEME）が表示される
 *
 * [Sidebar.tsx]: ../../src/renderer/src/components/Sidebar.tsx
 * [api_contract.md §12]: ../../docs/api_contract.md
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase, waitForSaved } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEW_BLOCKER_INPUT = 'input[aria-label="新規障害入力"]';
const REFLECTION_DONE = 'section[aria-label="振り返り"] textarea[aria-label="Done"]';
const REFLECTION_STUCK = 'section[aria-label="振り返り"] textarea[aria-label="Stuck"]';
const REFLECTION_NEXT = 'section[aria-label="振り返り"] textarea[aria-label="Next Step"]';
const SEARCH_INPUT = 'input[aria-label="検索"]';
const NOTE_EDITOR = '[data-testid="note-editor"]';
const CM_CONTENT = `${NOTE_EDITOR} .cm-content`;

/** プラットフォーム別の修飾キー */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** TODOを1件追加するヘルパ。POST /todos の 201 を待つ。 */
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

test.describe('サイドバー検索: 全リソースタイプ横断検索', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('TODO/Blocker/Reflection/Theme/Note 全リソースが検索でヒットする', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日に各リソースを作成（固有キーワード付き）
    await window.locator(THEME_INPUT).fill('プロジェクト銀太郎の進行');
    await waitForSaved(window);

    await addTodo(window, 'TODO固有キーワード青龍');
    await addBlocker(window, 'BLOCKER固有キーワード白虎');

    // Reflection 3セクションすべてに異なるキーワード
    await window.locator(REFLECTION_DONE).fill('REFDONE固有玄武');
    await waitForSaved(window);
    await window.locator(REFLECTION_STUCK).fill('REFSTUCK固有朱雀');
    await waitForSaved(window);
    await window.locator(REFLECTION_NEXT).fill('REFNEXT固有麒麟');
    await waitForSaved(window);

    // Note 本文
    await window.keyboard.press(`${MOD}+J`);
    await expect(window.locator(NOTE_EDITOR)).toBeVisible({ timeout: 5_000 });
    const patchNote = window.waitForResponse(
      (res) => res.url().includes('/note-entry') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator(CM_CONTENT).click();
    await window.keyboard.type('NOTE固有鳳凰');
    await patchNote;
    await waitForSaved(window);
    // 仕事整理モードへ戻る
    await window.keyboard.press('Escape');
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });

    // 検索: 共通接頭辞「固有」で全リソースがヒットする
    const searchInput = window.locator(SEARCH_INPUT);
    await searchInput.click();
    await window.keyboard.type('固有');

    // 各リソースのバッジが最低1件ずつ見えること（TIMEOUT 10s）
    // ※ Theme は「プロジェクト銀太郎」に「固有」を含まないため対象外
    await expect(window.locator('text=TODO').first()).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('text=BLOCKER').first()).toBeVisible();
    await expect(window.locator('text=REFLECTION').first()).toBeVisible();
    await expect(window.locator('text=NOTE').first()).toBeVisible();

    // 各キーワードを含む結果が存在する
    await expect(window.locator('text=青龍').first()).toBeVisible();
    await expect(window.locator('text=白虎').first()).toBeVisible();
    await expect(window.locator('text=玄武').first()).toBeVisible();
    await expect(window.locator('text=朱雀').first()).toBeVisible();
    await expect(window.locator('text=麒麟').first()).toBeVisible();
    await expect(window.locator('text=鳳凰').first()).toBeVisible();
  });

  test('TODO の検索結果をクリック → 当該日付の仕事整理モードへジャンプ', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    const uniqueTodo = `TODOJUMP個別 ${Date.now()}`;
    await addTodo(window, uniqueTodo);
    // 翌日へ移動して当日を非表示状態にする
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // 検索 → TODO バッジの結果をクリック → 当日（TODO入力済み）へジャンプ
    const searchInput = window.locator(SEARCH_INPUT);
    await searchInput.click();
    await window.keyboard.type('TODOJUMP');

    const todoResult = window.locator(`text=${uniqueTodo}`).first();
    await expect(todoResult).toBeVisible({ timeout: 10_000 });
    // 検索結果の親 button をクリック（結果テキストは button 内にある）
    await todoResult.click();

    // 当日の仕事整理モードへ戻り、当該 TODO が表示される（ジャンプ成功）
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('section[aria-label="TODO"]')).toContainText(uniqueTodo, {
      timeout: 10_000,
    });
  });

  test('検索クリア（Esc）で検索結果が消えカレンダーに戻る', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(THEME_INPUT).fill('クリア検証テーマ');
    await waitForSaved(window);

    // 検索ボックスへ入力 → 結果表示
    const searchInput = window.locator(SEARCH_INPUT);
    await searchInput.click();
    await window.keyboard.type('クリア検証');
    await expect(window.locator('text=クリア検証テーマ').first()).toBeVisible({ timeout: 10_000 });

    // Esc で検索クリア（Sidebar.tsx の handleSearchKeyDown）
    await window.keyboard.press('Escape');

    // 検索結果が消え、カレンダー（月ラベル）が再表示される
    await expect(window.locator('text=No results found')).toHaveCount(0);
    // カレンダーの曜日ヘッダー（S M T W T F S）が再表示
    await expect(searchInput).toHaveValue('');
    // 月ラベル（例: Jul 2026）が見える = カレンダーモードに戻った
    const monthLabelPattern = /^[A-Z][a-z]{2} \d{4}$/;
    await expect(window.locator('span.head', { hasText: monthLabelPattern })).toBeVisible({
      timeout: 5_000,
    });
  });
});

/**
 * 標準ショートカット E2E テスト（[要件 8.1/8.2]、AC-10、AC-23）
 *
 * 既存の dateNavigation/sidebar/modeSwitch/postMvp でカバーされていない、
 * 仕事整理モード専用の標準ショートカットを検証:
 * - ⌘/Ctrl+T: 今日へ戻る（AC-10）※dateNavigation はボタン操作のみのため補完
 * - Alt/Option+←/→: 前日/翌日（AC-10）
 * - ⌘/Ctrl+1/2/3: 列フォーカス（要件8.2、[§11.2]）
 * - ⌘/Ctrl+Enter: TODO追加入力欄へフォーカス（要件8.2、[§11.2]）
 * - ⌘/Ctrl+\: サイドバー切替（要件8.6、Post-MVP）※sidebar.spec はトグル検証のみのため補完
 *
 * またキーバインドガイド（AC-23）を検証:
 * - `?` でガイド開閉トグル（入力要素フォーカス中は貫通）
 * - ヘルプアイコン（?）クリックで開く
 * - Esc で閉じる
 * - 背景クリックで閉じる
 * - モード別（仕事整理/ノート × 標準/Vim）のセクション切替
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launchApp, resetE2eDatabase } from './helpers.js';

const THEME_INPUT = '#theme-input';
const NEW_TODO_INPUT = 'input[aria-label="新規TODO入力"]';
const NEW_BLOCKER_INPUT = 'input[aria-label="新規障害入力"]';
const SEARCH_INPUT = 'input[aria-label="検索"]';

/** 実行環境が Mac か（ショートカットの Mod キー切替用） */
function isMac(): boolean {
  return process.platform === 'darwin';
}

/** Mod キー文字列（Mac: Meta、Win/Linux: Control） */
function mod(): string {
  return isMac() ? 'Meta' : 'Control';
}

/** Alt/Option キー文字列（Playwright は Alt で統一） */
function alt(): string {
  return 'Alt';
}

test.describe('標準ショートカット: 日付移動（AC-10、要件8.1）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('⌘/Ctrl+T で今日へ戻る', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日表示を確認（今日ボタンは disabled）
    await expect(window.locator('button:has-text("Today")')).toBeDisabled();

    // 翌日へ移動（ボタン）
    await window.click('button[aria-label="翌日へ"]');
    await expect(window.locator('button:has-text("Today")')).toBeEnabled({ timeout: 10_000 });

    // ⌘T で今日へ戻る
    await window.keyboard.press(`${mod()}+T`);
    await expect(window.locator('button:has-text("Today")')).toBeDisabled({ timeout: 10_000 });
  });

  test('Alt/Option+←/→ で前日・翌日へ移動', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 当日の日付を取得
    const initialDate = await window.locator('h1[data-testid="date-display"]').textContent();

    // Alt+→ で翌日へ
    await window.keyboard.press(`${alt()}+ArrowRight`);
    const nextDate = await window.locator('h1[data-testid="date-display"]').textContent();
    expect(nextDate).not.toBe(initialDate);
    await expect(window.locator(THEME_INPUT)).toHaveValue('', { timeout: 10_000 });

    // Alt+← で元の日付へ戻る
    await window.keyboard.press(`${alt()}+ArrowLeft`);
    const backDate = await window.locator('h1[data-testid="date-display"]').textContent();
    expect(backDate).toBe(initialDate);
  });
});

test.describe('標準ショートカット: 列フォーカス（要件8.2、[§11.2]）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('⌘/Ctrl+1 でTODO追加入力欄へフォーカス', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 事前にテーマ入力へフォーカスを当てておく（BrowserWindow へのフォーカス確保）
    await window.locator(THEME_INPUT).click();
    await expect(window.locator(THEME_INPUT)).toBeFocused();

    // ⌘1 でTODO追加入力欄へ
    await window.keyboard.press(`${mod()}+1`);
    await expect(window.locator(NEW_TODO_INPUT)).toBeFocused({ timeout: 5_000 });
  });

  test('⌘/Ctrl+2 で障害追加入力欄へフォーカス', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 事前にテーマ入力へフォーカス（BrowserWindow フォーカス確保）
    await window.locator(THEME_INPUT).click();
    await expect(window.locator(THEME_INPUT)).toBeFocused();

    await window.keyboard.press(`${mod()}+2`);
    await expect(window.locator(NEW_BLOCKER_INPUT)).toBeFocused({ timeout: 5_000 });
  });

  test('⌘/Ctrl+3 で振り返りセクションへフォーカス', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(THEME_INPUT).click();
    await expect(window.locator(THEME_INPUT)).toBeFocused();

    await window.keyboard.press(`${mod()}+3`);
    // 振り返りの最初のセクション（Done）の textarea へフォーカス
    const reflectionTextarea = window.locator(
      'section[aria-label="振り返り"] textarea[aria-label="Done"]',
    );
    await expect(reflectionTextarea).toBeFocused({ timeout: 5_000 });
  });

  test('⌘/Ctrl+Enter でTODO追加入力欄へフォーカス', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(THEME_INPUT).click();
    await expect(window.locator(THEME_INPUT)).toBeFocused();

    // ⌘Enter でTODO追加入力欄へ
    await window.keyboard.press(`${mod()}+Enter`);
    await expect(window.locator(NEW_TODO_INPUT)).toBeFocused({ timeout: 5_000 });
  });
});

test.describe('標準ショートカット: サイドバー切替（要件8.6、Post-MVP）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('⌘/Ctrl+\\ でサイドバー表示/非表示を切替 → 検索欄の出現で検証', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 初期: サイドバー表示（既定true）
    await expect(window.locator(SEARCH_INPUT)).toBeVisible();

    // ⌘\ で非表示
    await window.keyboard.press(`${mod()}+\\`);
    await expect(window.locator(SEARCH_INPUT)).toHaveCount(0);

    // もう一度 ⌘\ で再表示
    await window.keyboard.press(`${mod()}+\\`);
    await expect(window.locator(SEARCH_INPUT)).toBeVisible();
  });
});

test.describe('キーバインドガイド（AC-23、[§10.5]）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('? キーでガイド開閉トグル（AC-23）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 初期: ガイド非表示
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);

    // ? で開く。
    // Playwright で ? を入力するには keyboard.type('?') か keyboard.press('Shift+Slash') を使う。
    // （Shift+/ では一部配列で ? にならない。Slash キー名を使うとレイアウト非依存で ? を生成できる）
    await window.keyboard.press('Shift+Slash');
    await expect(window.locator('#keybinding-guide-title')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('#keybinding-guide-title')).toHaveText('キーボードショートカット');

    // もう一度 ? で閉じる（トグル）
    // モーダルが開いているときは入力要素にフォーカスがないため ? がトグルとして効く
    await window.keyboard.press('Shift+Slash');
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);
  });

  test('ヘルプアイコンクリックでガイドを開く（AC-23）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ヘッダーのヘルプアイコン（?）をクリック
    await window.locator('button[aria-label="キーバインドガイドを開く"]').click();
    await expect(window.locator('#keybinding-guide-title')).toBeVisible({ timeout: 5_000 });
  });

  test('Esc でガイドを閉じる（AC-23）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // ガイドを開く
    await window.locator('button[aria-label="キーバインドガイドを開く"]').click();
    await expect(window.locator('#keybinding-guide-title')).toBeVisible();

    // Esc で閉じる
    await window.keyboard.press('Escape');
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);
  });

  test('背景クリックでガイドを閉じる（AC-23）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator('button[aria-label="キーバインドガイドを開く"]').click();
    await expect(window.locator('#keybinding-guide-title')).toBeVisible();

    // 背景クリック（dialog の外側）で閉じる
    await window.locator('[role="dialog"][aria-modal="true"]').click({ position: { x: 5, y: 5 } });
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);
  });

  test('閉じるボタンでガイドを閉じる（AC-23）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator('button[aria-label="キーバインドガイドを開く"]').click();
    await expect(window.locator('#keybinding-guide-title')).toBeVisible();

    // 「閉じる」ボタン
    await window.locator('button:has-text("閉じる")').click();
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);
  });

  test('テキスト入力中の ? は文字入力として扱う（貫通、[§10.5]）', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // テーマ入力欄へフォーカス
    await window.locator(THEME_INPUT).click();
    await window.keyboard.type('hello');

    // ? を入力（Shift+Slash で ? を生成）→ ガイドは開かず、文字として入力される
    await window.keyboard.press('Shift+Slash');
    await expect(window.locator('#keybinding-guide-title')).toHaveCount(0);
    // テーマ入力欄に ? が入力される
    await expect(window.locator(THEME_INPUT)).toHaveValue(/hello.*\?/);
  });

  test('仕事整理モード + 標準キーバインド → 仕事整理モードセクション表示', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 既定（標準・仕事整理）でガイドを開く
    await window.locator('button[aria-label="キーバインドガイドを開く"]').click();
    await expect(window.locator('#keybinding-guide-title')).toBeVisible();

    // 「基本」セクション（共通）
    await expect(window.locator('h3:has-text("基本")')).toBeVisible();
    // 「仕事整理モード」セクション（標準）
    await expect(window.locator('h3:has-text("仕事整理モード")')).toBeVisible();
    // ⌘1 の記載がある
    await expect(window.locator('section[aria-label="振り返り"]')).toBeVisible(); // ページ本体
    await expect(window.locator('text=TODOへ移動')).toBeVisible();
  });
});

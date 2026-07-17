/**
 * 設定モーダル・キーバインド切替 E2E テスト（[roadmap.md T-7-02]、AC-15）
 *
 * [test_strategy.md §5.2]、[ui_interaction_spec.md §8]:
 * - 歯車アイコンクリックで設定モーダルが開く
 * - 標準/Vim ラジオで切替、即座に PATCH /api/settings
 * - 再起動後も設定が維持される（AC-15）
 * - Esc または背景クリックで閉じる
 *
 * 注意:
 * - ローカル実行を想定（CI必須化しない）。
 * - 再起動後の設定維持確認には、設定変更後にアプリを閉じて再起動する。
 */

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempUserDataDir,
  launchApp,
  launchAppReady,
  removeTempUserDataDir,
  resetE2eDatabase,
} from './helpers.js';

const THEME_INPUT = '#theme-input';
/** 設定（歯車）ボタン */
const SETTINGS_BUTTON = 'button[aria-label="設定を開く"]';

test.describe('設定モーダル（AC-15）', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('歯車アイコンで設定モーダルが開き、閉じられる', async () => {
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    // 設定ボタン（歯車）をクリック
    await window.locator(SETTINGS_BUTTON).click();
    // モーダルが表示される
    await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });

    // Esc で閉じる（段3: モーダル）
    await window.keyboard.press('Escape');
    await expect(window.locator('text=キーバインド')).toHaveCount(0);
  });

  test('Vim へ切替 → 再起動後も維持（AC-15）', async () => {
    // 1回目の起動: Vim へ切替
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(SETTINGS_BUTTON).click();
    await expect(window.locator('text=キーバインド')).toBeVisible({ timeout: 5_000 });

    // Vim ラジオを選択（PATCH /api/settings の 200 を確実に待つ）
    const vimPatchPromise = window.waitForResponse(
      (res) => res.url().includes('/settings') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator('input[type="radio"][value="vim"]').check();
    await vimPatchPromise;

    // アプリを閉じる
    await closeApp(app);

    // 2回目の起動: Vim バッジが表示される（設定が維持されている）
    ({ app, window } = await launchApp());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
    // Vim バッジが右下に表示される（[要件 9.4]）
    await expect(window.locator('[data-testid="vim-state-badge"]')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=VIM NORMAL')).toBeVisible();

    // 後続テストのために標準へ戻す（PATCH完了を待つ）
    await window.locator(SETTINGS_BUTTON).click();
    const stdPatchPromise = window.waitForResponse(
      (res) => res.url().includes('/settings') && res.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    await window.locator('input[type="radio"][value="standard"]').check();
    await stdPatchPromise;
  });

  test('外観テーマ: 墨（dark）選択 → <html> へ反映 → 再起動後も維持（AC-15）', async () => {
    // 外観テーマは localStorage（userDataDir）へ保存されるため、再起動後の復元を
    // 検証するには同一 userDataDir を使う必要がある。
    const userDataDir = createTempUserDataDir();
    try {
      // 1回目: 墨（dark）へ切替
      ({ app, window } = await launchAppReady({ userDataDir }));
      await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

      await window.locator(SETTINGS_BUTTON).click();
      await expect(window.locator('text=外観')).toBeVisible({ timeout: 5_000 });

      const themeRadios = window.locator(
        '[role="radiogroup"][aria-label="外観テーマ"] [role="radio"]',
      );
      const inkRadio = themeRadios.filter({ hasText: '墨' });
      await expect(inkRadio).toBeVisible({ timeout: 5_000 });
      await inkRadio.click();
      await expect(inkRadio).toHaveAttribute('aria-checked', 'true');

      // <html> に dark クラスが付与される（resolvedMode = 'dark'）。
      await expect
        .poll(
          async () =>
            await window.evaluate(() => document.documentElement.classList.contains('dark')),
          { timeout: 5_000, intervals: [200] },
        )
        .toBe(true);

      // localStorage への永続化を確認
      await expect
        .poll(async () => await window.evaluate(() => localStorage.getItem('dayborad:theme')), {
          timeout: 5_000,
          intervals: [200],
        })
        .toBe('dark');

      await closeApp(app);

      // 2回目: 同一 userDataDir で再起動 → 墨テーマが維持される
      ({ app, window } = await launchAppReady({ userDataDir }));
      await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () =>
            await window.evaluate(() => document.documentElement.classList.contains('dark')),
          { timeout: 10_000, intervals: [300] },
        )
        .toBe(true);
    } finally {
      await closeApp(app).catch(() => {});
      removeTempUserDataDir(userDataDir);
    }
  });

  test('外観テーマ: 和紙（light）選択 → <html> へ反映 → 再起動後も維持（AC-15）', async () => {
    const userDataDir = createTempUserDataDir();
    try {
      ({ app, window } = await launchAppReady({ userDataDir }));
      await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

      await window.locator(SETTINGS_BUTTON).click();
      await expect(window.locator('text=外観')).toBeVisible({ timeout: 5_000 });

      const themeRadios = window.locator(
        '[role="radiogroup"][aria-label="外観テーマ"] [role="radio"]',
      );
      const washiRadio = themeRadios.filter({ hasText: '和紙' });
      await expect(washiRadio).toBeVisible({ timeout: 5_000 });
      await washiRadio.click();
      await expect(washiRadio).toHaveAttribute('aria-checked', 'true');

      await expect
        .poll(
          async () =>
            await window.evaluate(() => document.documentElement.classList.contains('light')),
          { timeout: 5_000, intervals: [200] },
        )
        .toBe(true);

      await expect
        .poll(async () => await window.evaluate(() => localStorage.getItem('dayborad:theme')), {
          timeout: 5_000,
          intervals: [200],
        })
        .toBe('light');

      await closeApp(app);

      ({ app, window } = await launchAppReady({ userDataDir }));
      await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () =>
            await window.evaluate(() => document.documentElement.classList.contains('light')),
          { timeout: 10_000, intervals: [300] },
        )
        .toBe(true);
    } finally {
      await closeApp(app).catch(() => {});
      removeTempUserDataDir(userDataDir);
    }
  });

  test('外観テーマ: 両方（system）選択 → OS設定で解決（AC-15）', async () => {
    ({ app, window } = await launchAppReady());
    await expect(window.locator(THEME_INPUT)).toBeVisible({ timeout: 15_000 });

    await window.locator(SETTINGS_BUTTON).click();
    await expect(window.locator('text=外観')).toBeVisible({ timeout: 5_000 });

    const themeRadios = window.locator(
      '[role="radiogroup"][aria-label="外観テーマ"] [role="radio"]',
    );
    const systemRadio = themeRadios.filter({ hasText: '両方' });
    await expect(systemRadio).toBeVisible({ timeout: 5_000 });
    await systemRadio.click();
    await expect(systemRadio).toHaveAttribute('aria-checked', 'true');

    // 両方（system）選択時は resolvedMode が OS の prefers-color-scheme で決まる。
    // どちらか一方のみが有効（dark XOR light）
    const { isDark, isLight } = await window.evaluate(() => ({
      isDark: document.documentElement.classList.contains('dark'),
      isLight: document.documentElement.classList.contains('light'),
    }));
    expect(isDark !== isLight).toBe(true);
  });
});

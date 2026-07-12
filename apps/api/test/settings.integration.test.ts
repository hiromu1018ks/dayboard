/**
 * UserSettings 系 Integration テスト（[roadmap.md T-7-01]、[api_contract.md §11]、要件 8.5）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 *
 * - GET /api/settings: 常に1行返す。未作成なら初期値で作成して返す
 * - PATCH /api/settings: keybindingMode/vimDefaultState の部分更新
 * - 不正値・未知フィールドは VALIDATION_ERROR
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { UserSettings } from 'shared-types';
import { createApp } from '../src/app.js';
import { getPool, teardownPool } from './helpers.js';

const app = createApp();

/** user_settings を初期値（standard/normal）へリセット */
async function resetUserSettings(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_settings (id, keybinding_mode, vim_default_state)
     VALUES ('default', 'standard', 'normal')
     ON CONFLICT (id) DO UPDATE SET keybinding_mode = 'standard', vim_default_state = 'normal', updated_at = now()`,
  );
}

/** user_settings を空にする（未作成状態を再現） */
async function clearUserSettings(): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM user_settings WHERE id = 'default'`);
}

function expectValidSettings(s: UserSettings, expected: Partial<UserSettings>): void {
  expect(s.id).toBe('default');
  expect(s.keybindingMode).toBe(expected.keybindingMode ?? 'standard');
  expect(s.vimDefaultState).toBe(expected.vimDefaultState ?? 'normal');
  expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(s.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
}

describe('UserSettings API (Integration)', () => {
  beforeAll(() => {
    getPool();
  });

  afterEach(async () => {
    // 各テスト後に初期状態へ戻す（他テストスイートへの影響を防ぐ）
    await resetUserSettings();
  });

  afterAll(async () => {
    await teardownPool();
  });

  describe('GET /api/settings', () => {
    it('存在する場合はその設定を返す', async () => {
      await resetUserSettings();
      const res = await app.request('/api/settings');
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      expectValidSettings(body, { keybindingMode: 'standard', vimDefaultState: 'normal' });
    });

    it('未作成の場合は初期値で作成して返す（[api_contract.md §11]）', async () => {
      // user_settings を空にする
      await clearUserSettings();

      const res = await app.request('/api/settings');
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      // 初期値（standard/normal）で作成される
      expectValidSettings(body, { keybindingMode: 'standard', vimDefaultState: 'normal' });

      // 再度取得すると、作成された行が返る（冪等）
      const res2 = await app.request('/api/settings');
      const body2 = (await res2.json()) as UserSettings;
      expect(body2.id).toBe('default');
      expect(body2.keybindingMode).toBe('standard');
    });
  });

  describe('PATCH /api/settings', () => {
    it('keybindingMode を vim へ部分更新', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keybindingMode: 'vim' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      expect(body.keybindingMode).toBe('vim');
      // vimDefaultState は変更されない
      expect(body.vimDefaultState).toBe('normal');
    });

    it('vimDefaultState を insert へ部分更新', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vimDefaultState: 'insert' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      expect(body.vimDefaultState).toBe('insert');
      expect(body.keybindingMode).toBe('standard');
    });

    it('両方同時に更新', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keybindingMode: 'vim', vimDefaultState: 'insert' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      expect(body.keybindingMode).toBe('vim');
      expect(body.vimDefaultState).toBe('insert');
    });

    it('空ボディは現状維持（200）', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserSettings;
      expectValidSettings(body, { keybindingMode: 'standard', vimDefaultState: 'normal' });
    });

    it('不正な keybindingMode は VALIDATION_ERROR', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keybindingMode: 'dvorak' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('不正な vimDefaultState は VALIDATION_ERROR', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vimDefaultState: 'visual' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('未知フィールドは VALIDATION_ERROR（strict）', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unknownField: 'value' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

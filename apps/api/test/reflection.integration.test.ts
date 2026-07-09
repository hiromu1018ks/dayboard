/**
 * Reflection 系 Integration テスト（[roadmap.md T-3-08]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DayNoteFull, Reflection } from 'shared-types';
import { createApp } from '../src/app.js';
import { getPool, truncateAll, teardownPool } from './helpers.js';

const app = createApp();

async function setupDayNote(date = '2026-07-08'): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

describe('Reflection API (Integration)', () => {
  beforeAll(() => {
    getPool();
  });

  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardownPool();
  });

  describe('PATCH /api/day-notes/:date/reflection', () => {
    it('doneText を更新できる', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneText: '見積は完了' }),
      });
      expect(res.status).toBe(200);
      const reflection = (await res.json()) as Reflection;
      expect(reflection.doneText).toBe('見積は完了');
      expect(reflection.stuckText).toBe('');
      expect(reflection.tomorrowActionText).toBe('');
    });

    it('3セクションを同時に更新できる', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doneText: 'できたこと',
          stuckText: '止まったこと',
          tomorrowActionText: '明日の一手',
        }),
      });
      expect(res.status).toBe(200);
      const reflection = (await res.json()) as Reflection;
      expect(reflection.doneText).toBe('できたこと');
      expect(reflection.stuckText).toBe('止まったこと');
      expect(reflection.tomorrowActionText).toBe('明日の一手');
    });

    it('部分更新（1セクションのみ）で他セクションは維持される', async () => {
      await setupDayNote();
      // 全設定
      await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doneText: 'A',
          stuckText: 'B',
          tomorrowActionText: 'C',
        }),
      });
      // stuckText だけ更新
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stuckText: 'B2' }),
      });
      const reflection = (await res.json()) as Reflection;
      expect(reflection.doneText).toBe('A');
      expect(reflection.stuckText).toBe('B2');
      expect(reflection.tomorrowActionText).toBe('C');
    });

    it('改行を含む自由テキストを保存できる', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneText: '・見積は完了\n・議事録送付' }),
      });
      const reflection = (await res.json()) as Reflection;
      expect(reflection.doneText).toBe('・見積は完了\n・議事録送付');
    });

    it('存在しない date への更新は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneText: 'テスト' }),
      });
      expect(res.status).toBe(404);
    });

    it('空ボディは何も更新せず 200（現状維持）', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const reflection = (await res.json()) as Reflection;
      expect(reflection.doneText).toBe('');
    });

    it('date 形式不正は VALIDATION_ERROR (400)', async () => {
      const res = await app.request('/api/day-notes/not-a-date/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneText: 'テスト' }),
      });
      expect(res.status).toBe(400);
    });

    it('未知フィールドは VALIDATION_ERROR (400、strict)', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unknownField: 'value' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/day-notes/:date/full に Reflection が含まれる', () => {
    it('更新した Reflection が取得できる', async () => {
      await setupDayNote();
      await app.request('/api/day-notes/2026-07-08/reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneText: '達成' }),
      });

      const res = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await res.json()) as DayNoteFull;
      expect(full.reflection.doneText).toBe('達成');
    });
  });
});

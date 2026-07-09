/**
 * DayNote 系 Integration テスト（[roadmap.md T-1-11]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 * [edge_cases.md §10.5]: 自動生成、一意制約、存在しない日付の404、today。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DayNote, DayNoteFull } from 'shared-types';
import { createApp } from '../src/app.js';
import { getPool, truncateAll, teardownPool } from './helpers.js';

const app = createApp();

/** DayNoteFull の基本構造を検証するヘルパー */
function expectValidDayNoteFull(full: DayNoteFull, expectedDate: string): void {
  expect(full.dayNote).toBeDefined();
  expect(full.dayNote.date).toBe(expectedDate);
  expect(full.dayNote.lastOpenedMode).toBe('work');
  expect(full.dayNote.theme).toBeNull();
  expect(full.dayNote.id).toBeTruthy();
  expect(full.dayNote.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(full.dayNote.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // 自動生成直後は Reflection/NoteEntry が空、todos/blockers/noteLineMetas は空配列
  expect(full.reflection).toBeDefined();
  expect(full.reflection.doneText).toBe('');
  expect(full.reflection.stuckText).toBe('');
  expect(full.reflection.tomorrowActionText).toBe('');
  expect(full.reflection.dayNoteId).toBe(full.dayNote.id);

  expect(full.noteEntry).toBeDefined();
  expect(full.noteEntry.body).toBe('');
  expect(full.noteEntry.dayNoteId).toBe(full.dayNote.id);

  expect(full.todos).toEqual([]);
  expect(full.blockers).toEqual([]);
  expect(full.noteLineMetas).toEqual([]);
}

describe('DayNote API (Integration)', () => {
  beforeAll(() => {
    // getPool() を初期化（DATABASE_URL は環境変数で設定済み前提）
    getPool();
  });

  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardownPool();
  });

  describe('GET /api/day-notes/:date/full', () => {
    it('存在しない日付を自動生成して DayNoteFull を返す（AC-01）', async () => {
      const res = await app.request('/api/day-notes/2026-07-08/full');
      expect(res.status).toBe(200);
      const full = (await res.json()) as DayNoteFull;
      expectValidDayNoteFull(full, '2026-07-08');
    });

    it('同じ日付への2回目のアクセスで既存を返す（冪等、重複生成しない）', async () => {
      const res1 = await app.request('/api/day-notes/2026-07-08/full');
      const full1 = (await res1.json()) as DayNoteFull;

      const res2 = await app.request('/api/day-notes/2026-07-08/full');
      const full2 = (await res2.json()) as DayNoteFull;

      expect(res2.status).toBe(200);
      expect(full2.dayNote.id).toBe(full1.dayNote.id);
      // 別インスタンスだが同内容
      expect(full2.reflection.id).toBe(full1.reflection.id);
      expect(full2.noteEntry.id).toBe(full1.noteEntry.id);
    });

    it('異なる日付は別の DayNote を生成する', async () => {
      const res1 = await app.request('/api/day-notes/2026-07-08/full');
      const res2 = await app.request('/api/day-notes/2026-07-09/full');
      const full1 = (await res1.json()) as DayNoteFull;
      const full2 = (await res2.json()) as DayNoteFull;

      expect(full1.dayNote.id).not.toBe(full2.dayNote.id);
      expect(full1.dayNote.date).toBe('2026-07-08');
      expect(full2.dayNote.date).toBe('2026-07-09');
    });

    it('date 形式不正は VALIDATION_ERROR (400)', async () => {
      const res = await app.request('/api/day-notes/2026-7-8/full');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('date');
    });

    it('実在しない日付（2月30日）は VALIDATION_ERROR (400)', async () => {
      const res = await app.request('/api/day-notes/2026-02-30/full');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/day-notes/today/full', () => {
    it('今日の DayNote を返す（サーバー側ローカル日付）', async () => {
      // テスト側とサーバー側で時刻取得タイミングがずれる（深夜0時跨ぎ）可能性があるため、
      // リクエスト直前・直後の両方の日付を許容する（test_strategy.md §3.2 の時刻依存回避）。
      const localDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const before = localDateStr(new Date());

      const res = await app.request('/api/day-notes/today/full');

      const after = localDateStr(new Date());
      expect(res.status).toBe(200);
      const full = (await res.json()) as DayNoteFull;
      // before と after が同じ日ならそれを期待、日付が変わった場合は after を期待
      const acceptable = before === after ? new Set([before]) : new Set([before, after]);
      expect(acceptable.has(full.dayNote.date)).toBe(true);
    });

    it('today への2回目のアクセスで既存を返す（冪等）', async () => {
      const res1 = await app.request('/api/day-notes/today/full');
      const res2 = await app.request('/api/day-notes/today/full');
      const full1 = (await res1.json()) as DayNoteFull;
      const full2 = (await res2.json()) as DayNoteFull;
      expect(full1.dayNote.id).toBe(full2.dayNote.id);
    });
  });

  describe('PATCH /api/day-notes/:date', () => {
    it('theme を更新できる', async () => {
      // 先に自動生成
      await app.request('/api/day-notes/2026-07-08/full');

      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'A社提案を前に進める' }),
      });
      expect(res.status).toBe(200);
      const dayNote = (await res.json()) as DayNote;
      expect(dayNote.theme).toBe('A社提案を前に進める');
    });

    it('theme の空文字列は null に正規化される（[api_contract.md §4]）', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      // 一度 theme を設定
      await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'テーマ' }),
      });
      // 空文字で正規化
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: '' }),
      });
      expect(res.status).toBe(200);
      const dayNote = (await res.json()) as DayNote;
      expect(dayNote.theme).toBeNull();
    });

    it('lastOpenedMode を更新できる（work → note）', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastOpenedMode: 'note' }),
      });
      expect(res.status).toBe(200);
      const dayNote = (await res.json()) as DayNote;
      expect(dayNote.lastOpenedMode).toBe('note');
    });

    it('theme と lastOpenedMode を同時に更新できる', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: '複合更新', lastOpenedMode: 'note' }),
      });
      expect(res.status).toBe(200);
      const dayNote = (await res.json()) as DayNote;
      expect(dayNote.theme).toBe('複合更新');
      expect(dayNote.lastOpenedMode).toBe('note');
    });

    it('存在しない date への PATCH は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'テーマ' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('不正な lastOpenedMode は VALIDATION_ERROR (400)', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastOpenedMode: 'invalid' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('未知フィールドは VALIDATION_ERROR (400、strict モード)', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unknownField: 'value' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('date 形式不正は VALIDATION_ERROR (400)', async () => {
      const res = await app.request('/api/day-notes/not-a-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'テーマ' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('空ボディは何も更新せず 200（現状維持）', async () => {
      await app.request('/api/day-notes/2026-07-08/full');
      const res = await app.request('/api/day-notes/2026-07-08', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const dayNote = (await res.json()) as DayNote;
      expect(dayNote.theme).toBeNull();
      expect(dayNote.lastOpenedMode).toBe('work');
    });
  });

  describe('一意制約（[edge_cases.md §10.5]）', () => {
    it('同じ日付の DayNote が複数作られない（uq_day_notes_date）', async () => {
      // 2回アクセスしても1行しかできない
      await app.request('/api/day-notes/2026-07-08/full');
      await app.request('/api/day-notes/2026-07-08/full');

      const pool = getPool();
      const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM day_notes WHERE date = $1',
        ['2026-07-08'],
      );
      expect(result.rows[0].count).toBe(1);
    });
  });
});

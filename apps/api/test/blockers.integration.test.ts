/**
 * Blocker 系 Integration テスト（[roadmap.md T-3-08]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 * [edge_cases.md §10.2]: linkedTodoId 別日付エラー。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { BlockerItem, DayNoteFull, TodoItem } from 'shared-types';
import { createApp } from '../src/app.js';
import { clearIdempotencyCache } from '../src/middleware/idempotency.js';
import { getPool, truncateAll, teardownPool } from './helpers.js';

const app = createApp();

async function setupDayNote(date = '2026-07-08'): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

async function createBlocker(
  date: string,
  text: string,
  linkedTodoId: string | null = null,
): Promise<BlockerItem> {
  const res = await app.request(`/api/day-notes/${date}/blockers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, linkedTodoId }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as BlockerItem;
}

async function createTodo(date: string, title: string): Promise<TodoItem> {
  const res = await app.request(`/api/day-notes/${date}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as TodoItem;
}

describe('Blocker API (Integration)', () => {
  beforeAll(() => {
    getPool();
  });

  afterEach(async () => {
    await truncateAll();
    clearIdempotencyCache();
  });

  afterAll(async () => {
    await teardownPool();
  });

  describe('POST /api/day-notes/:date/blockers', () => {
    it('障害を追加できる（201、order は末尾採番、linkedTodoId なし）', async () => {
      await setupDayNote();
      const blocker = await createBlocker('2026-07-08', 'A社回答待ち');
      expect(blocker.text).toBe('A社回答待ち');
      expect(blocker.resolved).toBe(false);
      expect(blocker.order).toBe(0);
      expect(blocker.linkedTodoId).toBeNull();
      expect(blocker.sourceNoteLineMetaId).toBeNull();
      expect(blocker.resolvedAt).toBeNull();
    });

    it('linkedTodoId を指定して TODO に紐付けられる（要件 7.4）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const blocker = await createBlocker('2026-07-08', '仕様不明点あり', todo.id);
      expect(blocker.linkedTodoId).toBe(todo.id);
    });

    it('別日付の linkedTodoId は VALIDATION_ERROR（[edge_cases.md §10.2]）', async () => {
      await setupDayNote('2026-07-08');
      await setupDayNote('2026-07-09');
      // 7/9 の TODO
      const todo = await createTodo('2026-07-09', '翌日タスク');

      // 7/8 の障害に 7/9 の TODO を紐付けようとする
      const res = await app.request('/api/day-notes/2026-07-08/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '障害', linkedTodoId: todo.id }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('linkedTodoId');
    });

    it('存在しない linkedTodoId は VALIDATION_ERROR', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '障害', linkedTodoId: 'nonexistent' }),
      });
      expect(res.status).toBe(400);
    });

    it('空白のみの text は VALIDATION_ERROR', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      });
      expect(res.status).toBe(400);
    });

    it('存在しない date への追加は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/day-notes/2026-07-08/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '障害' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/blockers/:id', () => {
    it('text を更新できる', async () => {
      await setupDayNote();
      const blocker = await createBlocker('2026-07-08', 'A社回答待ち');
      const res = await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'A社回答待ち（再）' }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as BlockerItem;
      expect(updated.text).toBe('A社回答待ち（再）');
    });

    it('resolved を true にすると resolvedAt がセットされる', async () => {
      await setupDayNote();
      const blocker = await createBlocker('2026-07-08', 'A社回答待ち');
      const res = await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as BlockerItem;
      expect(updated.resolved).toBe(true);
      expect(updated.resolvedAt).not.toBeNull();
    });

    it('resolved を false に戻すと resolvedAt が null に', async () => {
      await setupDayNote();
      const blocker = await createBlocker('2026-07-08', 'A社回答待ち');
      await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      const res = await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: false }),
      });
      const updated = (await res.json()) as BlockerItem;
      expect(updated.resolved).toBe(false);
      expect(updated.resolvedAt).toBeNull();
    });

    it('linkedTodoId を null で紐付け解除できる', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const blocker = await createBlocker('2026-07-08', '仕様不明', todo.id);
      const res = await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedTodoId: null }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as BlockerItem;
      expect(updated.linkedTodoId).toBeNull();
    });

    it('別日付の linkedTodoId への変更は VALIDATION_ERROR（[edge_cases.md §10.2]）', async () => {
      await setupDayNote('2026-07-08');
      await setupDayNote('2026-07-09');
      const blocker = await createBlocker('2026-07-08', '障害');
      const todo09 = await createTodo('2026-07-09', '翌日タスク');

      const res = await app.request(`/api/blockers/${blocker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedTodoId: todo09.id }),
      });
      expect(res.status).toBe(400);
    });

    it('存在しない id は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/blockers/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'テスト' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/day-notes/:date/blockers/reorder', () => {
    it('order を 0,1,2... に再採番する', async () => {
      await setupDayNote();
      const b0 = await createBlocker('2026-07-08', 'A');
      const b1 = await createBlocker('2026-07-08', 'B');

      const res = await app.request('/api/day-notes/2026-07-08/blockers/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: [b1.id, b0.id] }),
      });
      expect(res.status).toBe(200);
      const reordered = (await res.json()) as BlockerItem[];
      expect(reordered.map((b) => b.id)).toEqual([b1.id, b0.id]);
      expect(reordered.map((b) => b.order)).toEqual([0, 1]);
    });

    it('id の過不足は VALIDATION_ERROR', async () => {
      await setupDayNote();
      const b0 = await createBlocker('2026-07-08', 'A');
      await createBlocker('2026-07-08', 'B');

      const res = await app.request('/api/day-notes/2026-07-08/blockers/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: [b0.id] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/blockers/:id', () => {
    it('障害を削除できる（204）', async () => {
      await setupDayNote();
      const blocker = await createBlocker('2026-07-08', 'A社回答待ち');
      const res = await app.request(`/api/blockers/${blocker.id}`, { method: 'DELETE' });
      expect(res.status).toBe(204);
    });

    it('削除後に残りの order が再採番される', async () => {
      await setupDayNote();
      await createBlocker('2026-07-08', 'A');
      const b1 = await createBlocker('2026-07-08', 'B');
      await createBlocker('2026-07-08', 'C');

      await app.request(`/api/blockers/${b1.id}`, { method: 'DELETE' });

      const fullRes = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await fullRes.json()) as DayNoteFull;
      expect(full.blockers).toHaveLength(2);
      expect(full.blockers.map((b) => b.order)).toEqual([0, 1]);
    });

    it('存在しない id の削除は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/blockers/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('ON DELETE SET NULL（外部キー制約）', () => {
    it('紐付けTODO削除で linkedTodoId が null になる（[database_schema.md §3.4]）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const blocker = await createBlocker('2026-07-08', '仕様不明', todo.id);

      // TODO を削除
      await app.request(`/api/todos/${todo.id}`, { method: 'DELETE' });

      // 障害は残り、linkedTodoId が null に
      const pool = getPool();
      const result = await pool.query('SELECT linked_todo_id FROM blocker_items WHERE id = $1', [
        blocker.id,
      ]);
      expect(result.rows[0].linked_todo_id).toBeNull();
    });
  });
});

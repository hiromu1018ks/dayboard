/**
 * TODO 系 Integration テスト（[roadmap.md T-3-08]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 * [edge_cases.md §1.1/§1.2/§2.2/§2.3/§3.1/§10.4]: CRUD, reorder, INVALID_TRANSITION,
 * VALIDATION_ERROR, ON DELETE SET NULL/cascade。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DayNoteFull, TodoItem } from 'shared-types';
import { createApp } from '../src/app.js';
import { clearIdempotencyCache } from '../src/middleware/idempotency.js';
import { getPool, truncateAll, teardownPool } from './helpers.js';

const app = createApp();

/** テスト用の DayNote を自動生成し、DayNoteFull を返す */
async function setupDayNote(date = '2026-07-08'): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

/** TODO 追加ヘルパー */
async function createTodo(
  date: string,
  title: string,
  options: { idempotencyKey?: string } = {},
): Promise<TodoItem> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const res = await app.request(`/api/day-notes/${date}/todos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as TodoItem;
}

describe('TODO API (Integration)', () => {
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

  describe('POST /api/day-notes/:date/todos', () => {
    it('TODO を追加できる（201、order は末尾採番）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      expect(todo.title).toBe('見積作成');
      expect(todo.status).toBe('todo');
      expect(todo.order).toBe(0);
      expect(todo.completedAt).toBeNull();
      expect(todo.sourceNoteLineMetaId).toBeNull();
      expect(todo.carriedFromTodoId).toBeNull();
      expect(todo.carriedFromDate).toBeNull();
    });

    it('複数追加で order が 0,1,2... に採番される', async () => {
      await setupDayNote();
      const t0 = await createTodo('2026-07-08', 'A');
      const t1 = await createTodo('2026-07-08', 'B');
      const t2 = await createTodo('2026-07-08', 'C');
      expect([t0.order, t1.order, t2.order]).toEqual([0, 1, 2]);
    });

    it('前後空白は trim される', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '  見積作成  ');
      expect(todo.title).toBe('見積作成');
    });

    it('空白のみの title は VALIDATION_ERROR（[edge_cases.md §2.2]）', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('title');
    });

    it('201文字の title は VALIDATION_ERROR（[edge_cases.md §2.3]）', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'あ'.repeat(201) }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('存在しない date への追加は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/day-notes/2026-07-08/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'テスト' }),
      });
      expect(res.status).toBe(404);
    });

    it('Idempotency-Key 付きの同一リクエストは2回目を作成しない（[autosave_spec.md §8.2]）', async () => {
      await setupDayNote();
      const key = 'test-key-123';
      const t1 = await createTodo('2026-07-08', '冪等テスト', { idempotencyKey: key });

      // 同一キーで再送
      const res2 = await app.request('/api/day-notes/2026-07-08/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ title: '冪等テスト' }),
      });
      expect(res2.status).toBe(201);
      const t2 = (await res2.json()) as TodoItem;
      expect(t2.id).toBe(t1.id);

      // DB には1件しか無い
      const pool = getPool();
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM todo_items');
      expect(result.rows[0].count).toBe(1);
    });
  });

  describe('PATCH /api/todos/:id', () => {
    it('title を更新できる', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const res = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '見積作成（修正）' }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as TodoItem;
      expect(updated.title).toBe('見積作成（修正）');
    });

    it('todo → done で completedAt がセットされる（AC-09）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const res = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as TodoItem;
      expect(updated.status).toBe('done');
      expect(updated.completedAt).not.toBeNull();
    });

    it('done → todo で completedAt が null に戻る（AC-09）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      const res = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'todo' }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as TodoItem;
      expect(updated.status).toBe('todo');
      expect(updated.completedAt).toBeNull();
    });

    it('todo → carried の直接指定は INVALID_TRANSITION（持ち越しAPI経由のみ）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const res = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'carried' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_TRANSITION');
    });

    it('存在しない id は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/todos/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'テスト' }),
      });
      expect(res.status).toBe(404);
    });

    it('空白のみの title は VALIDATION_ERROR（[edge_cases.md §2.2]）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const res = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/day-notes/:date/todos/reorder', () => {
    it('order を 0,1,2... に再採番する', async () => {
      await setupDayNote();
      const t0 = await createTodo('2026-07-08', 'A');
      const t1 = await createTodo('2026-07-08', 'B');
      const t2 = await createTodo('2026-07-08', 'C');

      // 逆順に並替
      const res = await app.request('/api/day-notes/2026-07-08/todos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: [t2.id, t1.id, t0.id] }),
      });
      expect(res.status).toBe(200);
      const reordered = (await res.json()) as TodoItem[];
      expect(reordered.map((t) => t.id)).toEqual([t2.id, t1.id, t0.id]);
      expect(reordered.map((t) => t.order)).toEqual([0, 1, 2]);
    });

    it('id の過不足は VALIDATION_ERROR（[edge_cases.md §10.4]）', async () => {
      await setupDayNote();
      const t0 = await createTodo('2026-07-08', 'A');
      await createTodo('2026-07-08', 'B');
      const t2 = await createTodo('2026-07-08', 'C');

      // 中間の id を欠損させる
      const res = await app.request('/api/day-notes/2026-07-08/todos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: [t2.id, t0.id] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('orderedIds');
    });

    it('未知の id が含まれる場合は VALIDATION_ERROR', async () => {
      await setupDayNote();
      const t0 = await createTodo('2026-07-08', 'A');
      const res = await app.request('/api/day-notes/2026-07-08/todos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: [t0.id, 'unknown-id'] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/todos/:id', () => {
    it('TODO を削除できる（204）', async () => {
      await setupDayNote();
      const todo = await createTodo('2026-07-08', '見積作成');
      const res = await app.request(`/api/todos/${todo.id}`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // 削除済み
      const pool = getPool();
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM todo_items WHERE id = $1', [
        todo.id,
      ]);
      expect(result.rows[0].count).toBe(0);
    });

    it('削除後に残りの order が 0,1,2... に再採番される（[edge_cases.md §1.1]）', async () => {
      await setupDayNote();
      await createTodo('2026-07-08', 'A');
      const t1 = await createTodo('2026-07-08', 'B');
      await createTodo('2026-07-08', 'C');

      // t1 を削除
      await app.request(`/api/todos/${t1.id}`, { method: 'DELETE' });

      // /full で確認
      const fullRes = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await fullRes.json()) as DayNoteFull;
      expect(full.todos).toHaveLength(2);
      expect(full.todos.map((t) => t.order)).toEqual([0, 1]);
    });

    it('存在しない id の削除は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/todos/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/day-notes/:date/full に TODO が含まれる', () => {
    it('追加した TODO が order 昇順で取得できる', async () => {
      await setupDayNote();
      await createTodo('2026-07-08', 'A');
      await createTodo('2026-07-08', 'B');

      const res = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await res.json()) as DayNoteFull;
      expect(full.todos).toHaveLength(2);
      expect(full.todos.map((t) => t.title)).toEqual(['A', 'B']);
      expect(full.todos.map((t) => t.order)).toEqual([0, 1]);
    });
  });
});

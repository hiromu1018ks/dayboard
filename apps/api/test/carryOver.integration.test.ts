/**
 * 持ち越し系 Integration テスト（[roadmap.md T-6-04]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 * [api_contract.md §10]、[edge_cases.md §4.3/§4.4]、AC-11/AC-12 を検証する。
 *
 * 主な観点:
 * - 正常持ち越し（翌日に carriedFromTodoId/carriedFromDate 付きTODO作成、元は carried）
 * - 翌日DayNote未生成→自動生成（Reflection/NoteEntry も同時作成）
 * - 重複持ち越しは skipped で 200（部分成功）。翌日に重複TODOは作られない
 * - done のTODOは VALIDATION_ERROR
 * - 別日付の todoId は VALIDATION_ERROR
 * - 不正 date / 空 todoIds は VALIDATION_ERROR
 * - 複数TODO一括（混在: 未完了 + 重複済み）の部分成功
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CarryOverResult, DayNoteFull, TodoItem } from 'shared-types';
import { createApp } from '../src/app.js';
import { clearIdempotencyCache } from '../src/middleware/idempotency.js';
import { getPool, teardownPool, truncateAll } from './helpers.js';

const app = createApp();

/** テスト用の DayNote を自動生成し、DayNoteFull を返す */
async function setupDayNote(date = '2026-07-08'): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

/** TODO を1件追加し、作成された TodoItem を返す */
async function addTodo(date: string, title: string): Promise<TodoItem> {
  const res = await app.request(`/api/day-notes/${date}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as TodoItem;
}

/** 持ち越しリクエストのヘルパー */
async function carryOver(date: string, body: { todoIds: string[] }): Promise<Response> {
  return app.request(`/api/day-notes/${date}/carry-over`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 指定日付の /full を取得し DayNoteFull を返す */
async function fetchFull(date: string): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

describe('持ち越し API (Integration)', () => {
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

  // ========================================================================
  // 正常系（AC-11）
  // ========================================================================

  describe('POST /api/day-notes/:date/carry-over（正常系）', () => {
    it('未完了TODOを翌日に持ち越せる（AC-11）', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      const res = await carryOver('2026-07-08', { todoIds: [todo.id] });
      expect(res.status).toBe(200);
      const body = (await res.json()) as CarryOverResult;

      // carried に1件
      expect(body.carried).toHaveLength(1);
      expect(body.carried[0]!.sourceTodoId).toBe(todo.id);
      expect(body.carried[0]!.newTodoId).not.toBe(todo.id);
      expect(body.carried[0]!.nextDayDate).toBe('2026-07-09');
      expect(body.skipped).toEqual([]);
    });

    it('翌日に新規TODOが carriedFromTodoId/carriedFromDate 付きで作成される', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      const res = await carryOver('2026-07-08', { todoIds: [todo.id] });
      const body = (await res.json()) as CarryOverResult;
      const newTodoId = body.carried[0]!.newTodoId;

      // 翌日の /full で確認
      const nextDay = await fetchFull('2026-07-09');
      const carriedTodo = nextDay.todos.find((t) => t.id === newTodoId);
      expect(carriedTodo).toBeDefined();
      expect(carriedTodo!.title).toBe('田中さん確認');
      expect(carriedTodo!.status).toBe('todo');
      expect(carriedTodo!.carriedFromTodoId).toBe(todo.id);
      expect(carriedTodo!.carriedFromDate).toBe('2026-07-08');
    });

    it('元TODOは status=carried になる', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      await carryOver('2026-07-08', { todoIds: [todo.id] });

      const client = getPool();
      const row = await client.execute({
        sql: 'SELECT status FROM todo_items WHERE id = ?',
        args: [todo.id],
      });
      expect((row.rows[0] as { status: string }).status).toBe('carried');
    });

    it('翌日DayNoteが未生成の場合は自動生成される（AC-2、Reflection/NoteEntry も同時作成）', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      // 翌日（2026-07-09）の DayNote は未生成
      const client = getPool();
      const beforeCount = await client.execute(
        "SELECT COUNT(*) AS count FROM day_notes WHERE date = '2026-07-09'",
      );
      expect(Number((beforeCount.rows[0] as { count: unknown }).count)).toBe(0);

      await carryOver('2026-07-08', { todoIds: [todo.id] });

      // 持ち越し後、翌日の DayNote + Reflection + NoteEntry が生成されている
      const afterCount = await client.execute(
        "SELECT COUNT(*) AS count FROM day_notes WHERE date = '2026-07-09'",
      );
      expect(Number((afterCount.rows[0] as { count: unknown }).count)).toBe(1);

      const nextDay = await fetchFull('2026-07-09');
      expect(nextDay.reflection).toBeDefined();
      expect(nextDay.noteEntry).toBeDefined();
    });

    it('複数の未完了TODOを一括で持ち越せる', async () => {
      await setupDayNote('2026-07-08');
      const t1 = await addTodo('2026-07-08', 'タスク1');
      const t2 = await addTodo('2026-07-08', 'タスク2');
      const t3 = await addTodo('2026-07-08', 'タスク3');

      const res = await carryOver('2026-07-08', { todoIds: [t1.id, t2.id, t3.id] });
      expect(res.status).toBe(200);
      const body = (await res.json()) as CarryOverResult;

      expect(body.carried).toHaveLength(3);
      expect(body.skipped).toEqual([]);

      // 翌日に3件
      const nextDay = await fetchFull('2026-07-09');
      expect(nextDay.todos).toHaveLength(3);
    });

    it('title はスナップショットコピー（元TODO編集後に翌日側に反映されない、[edge_cases.md §3.3]）', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '元のタイトル');

      const res = await carryOver('2026-07-08', { todoIds: [todo.id] });
      const body = (await res.json()) as CarryOverResult;

      // 元TODOのタイトルを編集
      await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '編集後タイトル' }),
      });

      // 翌日側のTODOは元のタイトルのまま
      const nextDay = await fetchFull('2026-07-09');
      const carriedTodo = nextDay.todos.find((t) => t.id === body.carried[0]!.newTodoId);
      expect(carriedTodo!.title).toBe('元のタイトル');
    });
  });

  // ========================================================================
  // 重複スキップ（AC-12、[edge_cases.md §4.3/§4.4]）
  // ========================================================================

  describe('重複スキップ（AC-12）', () => {
    it('同じTODOの2回目持ち越しは skipped になる（HTTP 200）', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      // 1回目: 成功
      const res1 = await carryOver('2026-07-08', { todoIds: [todo.id] });
      expect(res1.status).toBe(200);
      const body1 = (await res1.json()) as CarryOverResult;
      expect(body1.carried).toHaveLength(1);

      // 2回目: 同じ TODO（元は carried）を再度持ち越し → skipped
      const res2 = await carryOver('2026-07-08', { todoIds: [todo.id] });
      expect(res2.status).toBe(200);
      const body2 = (await res2.json()) as CarryOverResult;
      expect(body2.carried).toEqual([]);
      expect(body2.skipped).toHaveLength(1);
      expect(body2.skipped[0]!.sourceTodoId).toBe(todo.id);
      expect(body2.skipped[0]!.reason).toBe('DUPLICATE_CARRYOVER');
    });

    it('重複スキップ時は翌日に重複TODOが作られない', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '田中さん確認');

      await carryOver('2026-07-08', { todoIds: [todo.id] });
      await carryOver('2026-07-08', { todoIds: [todo.id] }); // 2回目

      // 翌日のTODOは1件のみ（重複なし）
      const nextDay = await fetchFull('2026-07-09');
      expect(nextDay.todos).toHaveLength(1);
    });

    it('未完了と重複済みが混在する場合、部分成功する', async () => {
      await setupDayNote('2026-07-08');
      const t1 = await addTodo('2026-07-08', 'タスク1');
      const t2 = await addTodo('2026-07-08', 'タスク2');

      // t1 を先に持ち越し
      await carryOver('2026-07-08', { todoIds: [t1.id] });

      // t1（重複）と t2（未完了）を同時に持ち越し
      const res = await carryOver('2026-07-08', { todoIds: [t1.id, t2.id] });
      expect(res.status).toBe(200);
      const body = (await res.json()) as CarryOverResult;
      expect(body.carried).toHaveLength(1);
      expect(body.carried[0]!.sourceTodoId).toBe(t2.id);
      expect(body.skipped).toHaveLength(1);
      expect(body.skipped[0]!.sourceTodoId).toBe(t1.id);

      // 翌日には t1 由来1件 + t2 由来1件 = 2件
      const nextDay = await fetchFull('2026-07-09');
      expect(nextDay.todos).toHaveLength(2);
    });
  });

  // ========================================================================
  // エラー系（VALIDATION_ERROR / NOT_FOUND）
  // ========================================================================

  describe('バリデーションエラー', () => {
    it('done のTODOは VALIDATION_ERROR（[api_contract.md §10 step3]）', async () => {
      await setupDayNote('2026-07-08');
      const todo = await addTodo('2026-07-08', '完了済みタスク');

      // done へ切替
      const patchRes = await app.request(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(patchRes.status).toBe(200);

      // 持ち越し → VALIDATION_ERROR
      const res = await carryOver('2026-07-08', { todoIds: [todo.id] });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('別日付の todoId は VALIDATION_ERROR', async () => {
      await setupDayNote('2026-07-08');
      await setupDayNote('2026-07-09');
      const todo = await addTodo('2026-07-09', '別日のTODO');

      // 7/8 の持ち越しリクエストで 7/9 のTODOを指定
      const res = await carryOver('2026-07-08', { todoIds: [todo.id] });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('存在しない todoId は VALIDATION_ERROR', async () => {
      await setupDayNote('2026-07-08');
      const res = await carryOver('2026-07-08', { todoIds: ['nonexistent_id'] });
      expect(res.status).toBe(400);
    });

    it('不正な date 形式は VALIDATION_ERROR', async () => {
      const res = await carryOver('invalid-date', { todoIds: ['x'] });
      expect(res.status).toBe(400);
    });

    it('空の todoIds は VALIDATION_ERROR', async () => {
      await setupDayNote('2026-07-08');
      const res = await carryOver('2026-07-08', { todoIds: [] });
      expect(res.status).toBe(400);
    });

    it('存在しない date の DayNote は NOT_FOUND', async () => {
      const res = await carryOver('2026-07-08', { todoIds: ['x'] });
      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // トランザクション原子性（[edge_cases.md §10.3]）
  // ========================================================================

  describe('トランザクション原子性', () => {
    it('持ち越し後の翌日TODO数と carried 件数が一致する', async () => {
      await setupDayNote('2026-07-08');
      const t1 = await addTodo('2026-07-08', 'タスク1');
      const t2 = await addTodo('2026-07-08', 'タスク2');

      const res = await carryOver('2026-07-08', { todoIds: [t1.id, t2.id] });
      expect(res.status).toBe(200);
      const body = (await res.json()) as CarryOverResult;

      // DB の翌日TODO数と carried 数が一致
      const client = getPool();
      const rows = await client.execute(
        'SELECT COUNT(*) AS count FROM todo_items WHERE carried_from_todo_id IS NOT NULL',
      );
      expect(Number((rows.rows[0] as { count: unknown }).count)).toBe(body.carried.length);
    });
  });
});

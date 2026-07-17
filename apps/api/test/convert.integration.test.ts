/**
 * 変換系 Integration テスト（[roadmap.md T-5-08]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 * [edge_cases.md §4.2/§10.3/§1.2/§5.1/§5.2/§5.3/§5.4]: 新規作成、409重複、?force=1、
 * トランザクション原子性、ON DELETE SET NULL、VALIDATION_ERROR。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DayNoteFull } from 'shared-types';
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

/** 変換リクエストのヘルパー */
async function convertTodo(
  date: string,
  body: { noteEntryId: string; lineNumber: number; lineText: string },
  options: { force?: boolean } = {},
) {
  const query = options.force ? '?force=1' : '';
  return app.request(`/api/day-notes/${date}/convert/todo${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function convertBlocker(
  date: string,
  body: { noteEntryId: string; lineNumber: number; lineText: string },
  options: { force?: boolean } = {},
) {
  const query = options.force ? '?force=1' : '';
  return app.request(`/api/day-notes/${date}/convert/blocker${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('変換 API (Integration)', () => {
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
  // POST /api/day-notes/:date/convert/todo
  // ========================================================================

  describe('POST /api/day-notes/:date/convert/todo', () => {
    it('ノート行をTODO化できる（201、[§4.2] ラベル・記号除去）', async () => {
      const full = await setupDayNote();
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '- TODO化：見積作成',
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.todo.title).toBe('見積作成');
      expect(body.todo.status).toBe('todo');
      expect(body.todo.sourceNoteLineMetaId).toBe(body.noteLineMeta.id);
      expect(body.noteLineMeta.convertedToTodoId).toBe(body.todo.id);
      expect(body.noteLineMeta.convertedToBlockerId).toBeNull();
      expect(body.noteLineMeta.lineText).toBe('- TODO化：見積作成');
    });

    it('異なる行頭記号バリエーションを除去する（[edge_cases.md §5.3]）', async () => {
      const full = await setupDayNote();

      const cases = [
        { lineText: '・部長承認待ち', expected: '部長承認待ち' },
        { lineText: '* やること: 確認', expected: '確認' },
        { lineText: '1. 見積作成', expected: '見積作成' },
        { lineText: '2)確認', expected: '確認' },
      ];

      for (const { lineText, expected } of cases) {
        const res = await convertTodo('2026-07-08', {
          noteEntryId: full.noteEntry.id,
          lineNumber: 1,
          lineText,
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.todo.title).toBe(expected);
      }
    });

    it('200文字超は切り詰められる（[§4.5]、[edge_cases.md §5.4]）', async () => {
      const full = await setupDayNote();
      const longText = 'あ'.repeat(201);
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: longText,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.todo.title.length).toBe(200);
      expect(body.todo.title.endsWith('…')).toBe(true);
    });

    it('ラベル/記号のみの行は VALIDATION_ERROR（[§4.4]、[edge_cases.md §5.2]）', async () => {
      const full = await setupDayNote();
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: 'TODO：',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('title');
    });

    it('空行は VALIDATION_ERROR（[edge_cases.md §5.1]）', async () => {
      const full = await setupDayNote();
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '   ',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('存在しない date は NOT_FOUND (404)', async () => {
      const res = await convertTodo('2026-07-08', {
        noteEntryId: 'ne_fake',
        lineNumber: 1,
        lineText: 'テスト',
      });
      expect(res.status).toBe(404);
    });

    it('不正な date 形式は VALIDATION_ERROR', async () => {
      const res = await app.request('/api/day-notes/invalid/convert/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteEntryId: 'ne_1', lineNumber: 1, lineText: 'テスト' }),
      });
      expect(res.status).toBe(400);
    });

    it('別DayNoteのnoteEntryIdは VALIDATION_ERROR', async () => {
      const full1 = await setupDayNote('2026-07-08');
      await setupDayNote('2026-07-09');
      const res = await convertTodo('2026-07-09', {
        noteEntryId: full1.noteEntry.id,
        lineNumber: 1,
        lineText: 'テスト',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields[0].field).toBe('noteEntryId');
    });
  });

  // ========================================================================
  // 重複判定（[§6]）
  // ========================================================================

  describe('重複判定（[§6]）', () => {
    it('同一行の2回目TODO化は 409 DUPLICATE_CONVERSION', async () => {
      const full = await setupDayNote();
      const lineText = '見積作成';

      // 1回目: 成功
      const res1 = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });
      expect(res1.status).toBe(201);

      // 2回目: 重複（正規化で同一になる行）
      const res2 = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '  見積作成  ', // 前後空白違い → 同一と判定
      });
      expect(res2.status).toBe(409);
      const body = await res2.json();
      expect(body.error.code).toBe('DUPLICATE_CONVERSION');
      expect(body.error.details.existing.title).toBe('見積作成');
      expect(body.error.details.existing.sourceNoteLineMetaId).toBeDefined();
    });

    it('行頭記号違いは別行として扱う（[§6.3]）', async () => {
      const full = await setupDayNote();
      // `- 見積作成` と `見積作成` は異なる（行頭記号有無）
      const res1 = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '- 見積作成',
      });
      expect(res1.status).toBe(201);

      const res2 = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '見積作成',
      });
      // 行頭記号違い → lineHash が異なる → 別TODOとして作成される
      expect(res2.status).toBe(201);
    });

    it('?force=1 で重複バイパスして別TODO作成（要件 7.8）', async () => {
      const full = await setupDayNote();
      const lineText = '見積作成';

      // 1回目
      const res1 = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });
      expect(res1.status).toBe(201);
      const todo1 = (await res1.json()).todo;

      // 2回目（force=1 で別TODO作成）
      const res2 = await convertTodo(
        '2026-07-08',
        { noteEntryId: full.noteEntry.id, lineNumber: 1, lineText },
        { force: true },
      );
      expect(res2.status).toBe(201);
      const todo2 = (await res2.json()).todo;
      expect(todo2.id).not.toBe(todo1.id);
      expect(todo2.title).toBe('見積作成');

      // DB に2件
      const client = getPool();
      const result = await client.execute('SELECT COUNT(*) AS count FROM todo_items');
      expect(Number((result.rows[0] as { count: unknown }).count)).toBe(2);
    });

    it('TODO化済みの行を障害化は重複扱いしない（[§10]）', async () => {
      const full = await setupDayNote();
      const lineText = '見積作成';

      // TODO化
      const resTodo = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });
      expect(resTodo.status).toBe(201);

      // 同行を障害化 → 別変換先のため重複扱いしない
      const resBlocker = await convertBlocker('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });
      expect(resBlocker.status).toBe(201);
    });
  });

  // ========================================================================
  // POST /api/day-notes/:date/convert/blocker
  // ========================================================================

  describe('POST /api/day-notes/:date/convert/blocker', () => {
    it('ノート行を障害化できる（201）', async () => {
      const full = await setupDayNote();
      const res = await convertBlocker('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '・部長承認待ち',
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.blocker.text).toBe('部長承認待ち');
      expect(body.blocker.resolved).toBe(false);
      expect(body.blocker.linkedTodoId).toBeNull();
      expect(body.blocker.sourceNoteLineMetaId).toBe(body.noteLineMeta.id);
      expect(body.noteLineMeta.convertedToBlockerId).toBe(body.blocker.id);
      expect(body.noteLineMeta.convertedToTodoId).toBeNull();
    });

    it('同一行の2回目障害化は 409', async () => {
      const full = await setupDayNote();
      const lineText = '部長承認待ち';

      await convertBlocker('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });

      const res2 = await convertBlocker('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText,
      });
      expect(res2.status).toBe(409);
      const body = await res2.json();
      expect(body.error.code).toBe('DUPLICATE_CONVERSION');
      expect(body.error.details.existing.title).toBe('部長承認待ち');
    });
  });

  // ========================================================================
  // トランザクション原子性 + ON DELETE SET NULL（[§10.3]、[§1.2]）
  // ========================================================================

  describe('トランザクション・連鎖（[edge_cases.md §10.3/§1.2]）', () => {
    it('TodoItem + NoteLineMeta が1トランザクションで作成される（[§10.3]）', async () => {
      const full = await setupDayNote();
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '見積作成',
      });
      expect(res.status).toBe(201);
      const body = await res.json();

      // 相互参照が設定されている
      const client = getPool();
      const todoRow = await client.execute({
        sql: 'SELECT source_note_line_meta_id FROM todo_items WHERE id = ?',
        args: [body.todo.id],
      });
      expect(
        (todoRow.rows[0] as { source_note_line_meta_id: string }).source_note_line_meta_id,
      ).toBe(body.noteLineMeta.id);

      const metaRow = await client.execute({
        sql: 'SELECT converted_to_todo_id FROM note_line_metas WHERE id = ?',
        args: [body.noteLineMeta.id],
      });
      expect((metaRow.rows[0] as { converted_to_todo_id: string }).converted_to_todo_id).toBe(
        body.todo.id,
      );
    });

    it('TODO削除で convertedToTodoId が ON DELETE SET NULL になる（[§1.2]、[§8.4]）', async () => {
      const full = await setupDayNote();
      const res = await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '見積作成',
      });
      const { todo, noteLineMeta } = await res.json();

      // TODO削除
      const delRes = await app.request(`/api/todos/${todo.id}`, { method: 'DELETE' });
      expect(delRes.status).toBe(204);

      // NoteLineMeta は残るが convertedToTodoId が NULL（変換済みマーク消失、[§8.4]）
      const client = getPool();
      const metaRow = await client.execute({
        sql: 'SELECT converted_to_todo_id, line_text FROM note_line_metas WHERE id = ?',
        args: [noteLineMeta.id],
      });
      expect(metaRow.rows).toHaveLength(1);
      expect(
        (metaRow.rows[0] as { converted_to_todo_id: string | null }).converted_to_todo_id,
      ).toBeNull();
      // lineText（スナップショット）は保持
      expect((metaRow.rows[0] as { line_text: string }).line_text).toBe('見積作成');
    });

    it('NoteEntry削除で NoteLineMeta が cascade 削除される（[§10.1]）', async () => {
      const full = await setupDayNote();
      await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '見積作成',
      });

      // NoteLineMeta が1件あることを確認
      const client = getPool();
      const before = await client.execute('SELECT COUNT(*) AS count FROM note_line_metas');
      expect(Number((before.rows[0] as { count: unknown }).count)).toBe(1);

      // DayNote削除 → cascade で NoteEntry → NoteLineMeta も削除
      await client.execute({ sql: 'DELETE FROM day_notes WHERE id = ?', args: [full.dayNote.id] });
      const after = await client.execute('SELECT COUNT(*) AS count FROM note_line_metas');
      expect(Number((after.rows[0] as { count: unknown }).count)).toBe(0);
    });
  });

  // ========================================================================
  // /full に NoteLineMeta が含まれる（Phase 5）
  // ========================================================================

  describe('GET /api/day-notes/:date/full に NoteLineMeta が含まれる', () => {
    it('変換後の noteLineMetas が取得できる', async () => {
      const full = await setupDayNote();
      await convertTodo('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 1,
        lineText: '見積作成',
      });
      await convertBlocker('2026-07-08', {
        noteEntryId: full.noteEntry.id,
        lineNumber: 2,
        lineText: '部長承認待ち',
      });

      const res = await app.request('/api/day-notes/2026-07-08/full');
      const body = (await res.json()) as DayNoteFull;
      expect(body.noteLineMetas).toHaveLength(2);
      // 変換済みTODOの sourceNoteLineMetaId が metas に含まれる
      const todoMeta = body.noteLineMetas.find((m) => m.convertedToTodoId !== null);
      expect(todoMeta).toBeDefined();
      expect(todoMeta!.lineText).toBe('見積作成');
      expect(body.todos.find((t) => t.sourceNoteLineMetaId === todoMeta!.id)).toBeDefined();
    });

    it('新規生成時は noteLineMetas が空配列', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/full');
      const body = (await res.json()) as DayNoteFull;
      expect(body.noteLineMetas).toEqual([]);
    });
  });
});

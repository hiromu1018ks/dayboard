/**
 * DayNote 系エンドポイント（[roadmap.md T-1-08/09/10, T-3-04/06/07]）
 *
 * - GET   /api/day-notes/today/full              — 今日の /full（[api_contract.md §3]）
 * - GET   /api/day-notes/:date/full              — 指定日の /full、未生成は自動生成（AC-01）
 * - PATCH /api/day-notes/:date                   — theme/lastOpenedMode 部分更新（[api_contract.md §4]）
 * - POST  /api/day-notes/:date/todos             — TODO 追加（[api_contract.md §5]）
 * - POST  /api/day-notes/:date/todos/reorder     — TODO 並替（[api_contract.md §5]）
 * - POST  /api/day-notes/:date/blockers          — 障害追加（[api_contract.md §6]）
 * - POST  /api/day-notes/:date/blockers/reorder  — 障害並替（[api_contract.md §6]）
 * - PATCH /api/day-notes/:date/reflection        — 振り返り3セクション部分更新（[api_contract.md §7]）
 * - PATCH /api/day-notes/:date/note-entry        — ノート本文の全文更新（[api_contract.md §7]）
 *
 * 日付のローカル計算は `domain/date.ts`（サーバー now() 非依存、[database_schema.md §8]）。
 * エラーは errorHandler（[api_contract.md §1.4]）が統一形式で返す。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createId, isValidDateString, todayLocal } from '@dayboard/domain';
import {
  blockerRepository,
  dayNoteRepository,
  getOrCreateFull,
  noteEntryRepository,
  patchDayNote,
  reflectionRepository,
  todoRepository,
} from 'repository';
import { cacheIdempotentResponse, idempotencyMiddleware } from '../middleware/idempotency.js';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const dayNoteRoutes = new Hono();

// POST 系（TODO/Blocker 追加）に Idempotency-Key 重複排除を適用
// （[autosave_spec.md §8.2]、自動保存リトライの二重作成防止）
dayNoteRoutes.use('/*/todos', idempotencyMiddleware);
dayNoteRoutes.use('/*/blockers', idempotencyMiddleware);

/**
 * GET /api/day-notes/today/full
 *
 * サーバー側ローカル日付で今日を計算し、`/full` を直接応答する
 * （[api_contract.md §3]: 307リダイレクト or 直接応答。ラウンドトリップ削減で直接応答）。
 */
dayNoteRoutes.get('/today/full', async (c) => {
  const date = todayLocal();
  const full = await getOrCreateFull(date);
  return c.json(full);
});

/**
 * GET /api/day-notes/:date/full
 *
 * 存在しない日付は DayNote + Reflection + NoteEntry を自動生成して200（AC-01）。
 * date 形式不正は VALIDATION_ERROR。
 */
dayNoteRoutes.get('/:date/full', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }
  const full = await getOrCreateFull(date);
  return c.json(full);
});

/** PATCH /api/day-notes/:date のボディスキーマ（両方任意、部分更新） */
const patchBodySchema = z
  .object({
    theme: z.string().max(200).nullable().optional(),
    lastOpenedMode: z.enum(['work', 'note']).optional(),
  })
  .strict();

/**
 * PATCH /api/day-notes/:date
 *
 * theme（空文字→null正規化）、lastOpenedMode（'work'|'note'のみ）の部分更新。
 * 存在しない date は 404。不正な lastOpenedMode や未知フィールドは VALIDATION_ERROR。
 */
dayNoteRoutes.patch('/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  // ボディのパース。空ボディも許容（何も更新しない）。
  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    // zod のエラーを VALIDATION_ERROR の fields 形式に変換
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const updated = await patchDayNote(date, parsed.data);
  if (!updated) {
    throw ApiHttpError.notFound('指定された日付のノートが見つかりません。');
  }
  // [api_contract.md §4]: PATCH レスポンスは更新後の DayNote のみを返す
  return c.json(updated.dayNote);
});

// ============================================================================
// Phase 3: TODO / Blocker / Reflection エンドポイント
// ============================================================================

/** 指定日付の DayNote を取得し、存在しない場合は 404。 */
async function requireDayNoteIdByDate(date: string): Promise<string> {
  const dayNote = await dayNoteRepository.findByDate(date);
  if (!dayNote) throw ApiHttpError.notFound('指定された日付のノートが見つかりません。');
  return dayNote.id;
}

/** POST /api/day-notes/:date/todos のボディスキーマ */
const createTodoBodySchema = z
  .object({
    title: z.string().max(200),
  })
  .strict();

/**
 * POST /api/day-notes/:date/todos
 *
 * TODO を追加する（[api_contract.md §5]）。order はサーバーが末尾に採番。
 * title は trim 後1-200文字（[edge_cases.md §2.2/§2.3]）。
 * Idempotency-Key ヘッダで重複排除（自動保存リトライの二重追加防止、[autosave_spec.md §8.2]）。
 */
dayNoteRoutes.post('/:date/todos', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = createTodoBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const trimmed = parsed.data.title.trim();
  if (trimmed.length === 0) {
    throw ApiHttpError.validation([{ field: 'title', message: 'タイトルは必須です。' }]);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);
  const created = await todoRepository.create(createId(), dayNoteId, trimmed);

  // Idempotency-Key があれば成功レスポンスをキャッシュ（二重追加防止）
  const requestId = c.req.header('Idempotency-Key');
  if (requestId) {
    cacheIdempotentResponse(requestId, 201, created);
  }
  return c.json(created, 201);
});

/** POST /api/day-notes/:date/todos/reorder のボディスキーマ */
const reorderTodosBodySchema = z
  .object({
    orderedIds: z.array(z.string()).min(0),
  })
  .strict();

/**
 * POST /api/day-notes/:date/todos/reorder
 *
 * TODO の order を 0,1,2,... に再採番する（[api_contract.md §5]）。
 * orderedIds は当該日付の全 TODO id を過不足なく含む必要がある
 * （過不足は VALIDATION_ERROR、[edge_cases.md §10.4]）。
 */
dayNoteRoutes.post('/:date/todos/reorder', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = reorderTodosBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);
  const currentTodos = await todoRepository.listByDayNote(dayNoteId);
  const currentIds = new Set(currentTodos.map((t) => t.id));
  const orderedIds = parsed.data.orderedIds;

  // 過不足チェック（[edge_cases.md §10.4]）
  const receivedSet = new Set(orderedIds);
  if (orderedIds.length !== currentIds.size || [...currentIds].some((id) => !receivedSet.has(id))) {
    throw ApiHttpError.validation([{ field: 'orderedIds', message: 'TODOの過不足があります。' }]);
  }

  const reordered = await todoRepository.reorder(dayNoteId, orderedIds);
  return c.json(reordered);
});

/** POST /api/day-notes/:date/blockers のボディスキーマ */
const createBlockerBodySchema = z
  .object({
    text: z.string().max(200),
    linkedTodoId: z.string().nullable().optional(),
  })
  .strict();

/**
 * POST /api/day-notes/:date/blockers
 *
 * 障害を追加する（[api_contract.md §6]）。order はサーバーが末尾に採番。
 * text は trim 後1-200文字。linkedTodoId は任意で、指定時は当該日付のTODOであることを検証
 * （[edge_cases.md §10.2]）。Idempotency-Key で重複排除。
 */
dayNoteRoutes.post('/:date/blockers', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = createBlockerBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const trimmed = parsed.data.text.trim();
  if (trimmed.length === 0) {
    throw ApiHttpError.validation([{ field: 'text', message: '本文は必須です。' }]);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);

  // linkedTodoId の別日付チェック（[edge_cases.md §10.2]）
  let linkedTodoId: string | null = null;
  if (parsed.data.linkedTodoId !== undefined && parsed.data.linkedTodoId !== null) {
    const linkedTodo = await todoRepository.findById(parsed.data.linkedTodoId);
    if (!linkedTodo || linkedTodo.dayNoteId !== dayNoteId) {
      throw ApiHttpError.validation([
        { field: 'linkedTodoId', message: '同じ日付のTODOを指定してください。' },
      ]);
    }
    linkedTodoId = parsed.data.linkedTodoId;
  }

  const created = await blockerRepository.create(createId(), dayNoteId, trimmed, linkedTodoId);

  const requestId = c.req.header('Idempotency-Key');
  if (requestId) {
    cacheIdempotentResponse(requestId, 201, created);
  }
  return c.json(created, 201);
});

/** POST /api/day-notes/:date/blockers/reorder のボディスキーマ */
const reorderBlockersBodySchema = z
  .object({
    orderedIds: z.array(z.string()).min(0),
  })
  .strict();

/**
 * POST /api/day-notes/:date/blockers/reorder
 *
 * 障害の order を 0,1,2,... に再採番する（[api_contract.md §6]）。過不足は VALIDATION_ERROR。
 */
dayNoteRoutes.post('/:date/blockers/reorder', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = reorderBlockersBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);
  const currentBlockers = await blockerRepository.listByDayNote(dayNoteId);
  const currentIds = new Set(currentBlockers.map((b) => b.id));
  const orderedIds = parsed.data.orderedIds;

  const receivedSet = new Set(orderedIds);
  if (orderedIds.length !== currentIds.size || [...currentIds].some((id) => !receivedSet.has(id))) {
    throw ApiHttpError.validation([{ field: 'orderedIds', message: '障害の過不足があります。' }]);
  }

  const reordered = await blockerRepository.reorder(dayNoteId, orderedIds);
  return c.json(reordered);
});

/** PATCH /api/day-notes/:date/reflection のボディスキーマ（3セクション全て任意） */
const patchReflectionBodySchema = z
  .object({
    doneText: z.string().max(4000).optional(),
    stuckText: z.string().max(4000).optional(),
    tomorrowActionText: z.string().max(4000).optional(),
  })
  .strict();

/**
 * PATCH /api/day-notes/:date/reflection
 *
 * 振り返り3セクションの部分更新（[api_contract.md §7]）。
 * 3フィールドとも任意。存在しない date は 404。
 */
dayNoteRoutes.patch('/:date/reflection', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchReflectionBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);
  const updated = await reflectionRepository.update(dayNoteId, parsed.data);
  if (!updated) throw ApiHttpError.notFound('指定された日付の振り返りが見つかりません。');
  return c.json(updated);
});

/** PATCH /api/day-notes/:date/note-entry のボディスキーマ（body 任意、上限50000文字、[api_contract.md §7]）。省略時は現状維持 */
const patchNoteEntryBodySchema = z.object({ body: z.string().max(50000).optional() }).strict();

/**
 * PATCH /api/day-notes/:date/note-entry
 *
 * ノート本文（NoteEntry.body）の全文一括更新（[api_contract.md §7]）。
 * CodeMirror の全文を送る（部分 diff は MVP では扱わない）。存在しない date は 404。
 */
dayNoteRoutes.patch('/:date/note-entry', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchNoteEntryBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const dayNoteId = await requireDayNoteIdByDate(date);
  const updated = await noteEntryRepository.update(dayNoteId, parsed.data);
  if (!updated) throw ApiHttpError.notFound('指定された日付のノート本文が見つかりません。');
  return c.json(updated);
});

/**
 * Blocker 個別操作エンドポイント（[roadmap.md T-3-06]）
 *
 * - PATCH   /api/blockers/:id  — text/resolved/linkedTodoId 更新（[api_contract.md §6]）
 * - DELETE  /api/blockers/:id  — 削除（204、[api_contract.md §6]）
 *
 * 追加（POST）と並替（reorder）は日付スコープのため dayNotes.ts 側に実装:
 * - POST  /api/day-notes/:date/blockers
 * - POST  /api/day-notes/:date/blockers/reorder
 *
 * エラーは errorHandler（[api_contract.md §1.4]）が統一形式で返す。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { blockerRepository, todoRepository } from 'repository';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const blockerRoutes = new Hono();

/** PATCH /api/blockers/:id のボディスキーマ（全て任意、部分更新） */
const patchBlockerBodySchema = z
  .object({
    text: z.string().max(200).optional(),
    resolved: z.boolean().optional(),
    linkedTodoId: z.string().nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/blockers/:id
 *
 * text（trim 後1-200文字）、resolved、linkedTodoId の部分更新。
 *
 * 制約（[api_contract.md §6]）:
 * - text: 空白のみ（trim 後空）は VALIDATION_ERROR。最大200文字
 * - linkedTodoId: 指定時は「同一 DayNote の TODO」であることを検証（[edge_cases.md §10.2]）
 *   別日付のTODOなら VALIDATION_ERROR。null で紐付け解除
 * - 存在しない id は 404
 */
blockerRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');

  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchBlockerBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  // text の trim 検証
  const patch: {
    text?: string;
    resolved?: boolean;
    linkedTodoId?: string | null;
  } = {};
  if (parsed.data.text !== undefined) {
    const trimmed = parsed.data.text.trim();
    if (trimmed.length === 0) {
      throw ApiHttpError.validation([{ field: 'text', message: '本文は必須です。' }]);
    }
    if (trimmed.length > 200) {
      throw ApiHttpError.validation([
        { field: 'text', message: '200文字以内で入力してください。' },
      ]);
    }
    patch.text = trimmed;
  }
  if (parsed.data.resolved !== undefined) {
    patch.resolved = parsed.data.resolved;
  }
  if (parsed.data.linkedTodoId !== undefined) {
    patch.linkedTodoId = parsed.data.linkedTodoId;
  }

  if (Object.keys(patch).length === 0) {
    const current = await blockerRepository.findById(id);
    if (!current) throw ApiHttpError.notFound('指定された障害が見つかりません。');
    return c.json(current);
  }

  // linkedTodoId の別日付チェック（[edge_cases.md §10.2]）
  const current = await blockerRepository.findById(id);
  if (!current) throw ApiHttpError.notFound('指定された障害が見つかりません。');

  if (patch.linkedTodoId !== undefined && patch.linkedTodoId !== null) {
    const linkedTodo = await todoRepository.findById(patch.linkedTodoId);
    if (!linkedTodo || linkedTodo.dayNoteId !== current.dayNoteId) {
      throw ApiHttpError.validation([
        { field: 'linkedTodoId', message: '同じ日付のTODOを指定してください。' },
      ]);
    }
  }

  const updated = await blockerRepository.update(id, patch);
  if (!updated) throw ApiHttpError.notFound('指定された障害が見つかりません。');
  return c.json(updated);
});

/**
 * DELETE /api/blockers/:id
 *
 * 障害を削除する。残りの order を 0,1,2,... に再採番。
 * 存在しない id は 404。
 */
blockerRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await blockerRepository.deleteBlocker(id);
  if (!deleted) throw ApiHttpError.notFound('指定された障害が見つかりません。');
  return c.body(null, 204);
});

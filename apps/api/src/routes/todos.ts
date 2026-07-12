/**
 * TODO 個別操作エンドポイント（[roadmap.md T-3-04]）
 *
 * - PATCH   /api/todos/:id    — title/status 更新（[api_contract.md §5]）
 * - DELETE  /api/todos/:id    — 削除（204、[api_contract.md §5]）
 *
 * 追加（POST）と並替（reorder）は日付スコープのため dayNotes.ts 側に実装:
 * - POST  /api/day-notes/:date/todos
 * - POST  /api/day-notes/:date/todos/reorder
 *
 * status 遷移は [database_schema.md §3.3] 準拠。違反は INVALID_TRANSITION (400)。
 * エラーは errorHandler（[api_contract.md §1.4]）が統一形式で返す。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { canTransition } from '@dayboard/domain';
import { todoRepository } from 'repository';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const todoRoutes = new Hono();

/** PATCH /api/todos/:id のボディスキーマ（両方任意、部分更新） */
const patchTodoBodySchema = z
  .object({
    title: z.string().max(200).optional(),
    status: z.enum(['todo', 'done', 'carried']).optional(),
  })
  .strict();

/**
 * PATCH /api/todos/:id
 *
 * title（trim 後1-200文字）、status（[database_schema.md §3.3] 準拠）の部分更新。
 *
 * 制約（[api_contract.md §5]）:
 * - title: 空白のみ（trim 後空）は VALIDATION_ERROR。最大200文字
 * - status: `carried → *` と `done → carried` は INVALID_TRANSITION
 * - `todo → carried` の直接API指定は禁止（持ち越しは carry-over API 経由）
 * - 存在しない id は 404
 */
todoRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');

  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchTodoBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  // title の trim 検証（trim 後空は VALIDATION_ERROR、[edge_cases.md §2.2]）
  const patch: { title?: string; status?: 'todo' | 'done' | 'carried' } = {};
  if (parsed.data.title !== undefined) {
    const trimmed = parsed.data.title.trim();
    if (trimmed.length === 0) {
      throw ApiHttpError.validation([{ field: 'title', message: 'タイトルは必須です。' }]);
    }
    if (trimmed.length > 200) {
      throw ApiHttpError.validation([
        { field: 'title', message: '200文字以内で入力してください。' },
      ]);
    }
    patch.title = trimmed;
  }
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
  }

  if (Object.keys(patch).length === 0) {
    // 更新内容が空でも存在確認は行い、存在すれば現状維持の TodoItem を返す
    const current = await todoRepository.findById(id);
    if (!current) throw ApiHttpError.notFound('指定されたTODOが見つかりません。');
    return c.json(current);
  }

  // status 遷移の可否判定（[database_schema.md §3.3]）
  if (patch.status !== undefined) {
    const current = await todoRepository.findById(id);
    if (!current) throw ApiHttpError.notFound('指定されたTODOが見つかりません。');

    // `todo → carried` の直接API指定は禁止（持ち越しAPI経由のみ、[api_contract.md §5]）
    if (current.status === 'todo' && patch.status === 'carried') {
      throw ApiHttpError.invalidTransition('持ち越しは専用の操作から行ってください。');
    }
    if (!canTransition(current.status, patch.status)) {
      throw ApiHttpError.invalidTransition('このTODOは現在の状態ではこの操作を実行できません。');
    }
  }

  const updated = await todoRepository.update(id, patch);
  if (!updated) throw ApiHttpError.notFound('指定されたTODOが見つかりません。');
  return c.json(updated);
});

/**
 * DELETE /api/todos/:id
 *
 * TODO を削除する（[edge_cases.md §1.1/§1.2]）。
 * - `source_note_line_meta_id` 経由の参照は ON DELETE SET NULL（DB 制約任せ）
 * - 持ち越し元TODO（carried）削除時、翌日側の carriedFromTodoId は残す（FK なし）
 * - 残りの order を 0,1,2,... に再採番
 * - 存在しない id は 404
 */
todoRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await todoRepository.deleteTodo(id);
  if (!deleted) throw ApiHttpError.notFound('指定されたTODOが見つかりません。');
  // 204 No Content（[api_contract.md §1.5]）
  return c.body(null, 204);
});

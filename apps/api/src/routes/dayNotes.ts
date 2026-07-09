/**
 * DayNote 系エンドポイント（[roadmap.md T-1-08/09/10]）
 *
 * - GET  /api/day-notes/today/full  — 今日の /full（[api_contract.md §3]）
 * - GET  /api/day-notes/:date/full  — 指定日の /full、未生成は自動生成（AC-01）
 * - PATCH /api/day-notes/:date      — theme/lastOpenedMode 部分更新（[api_contract.md §4]）
 *
 * 日付のローカル計算は `domain/date.ts`（サーバー now() 非依存、[database_schema.md §8]）。
 * エラーは errorHandler（[api_contract.md §1.4]）が統一形式で返す。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { isValidDateString, todayLocal } from '@dayboard/domain';
import { getOrCreateFull, patchDayNote } from 'repository';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const dayNoteRoutes = new Hono();

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

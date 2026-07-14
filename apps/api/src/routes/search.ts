/**
 * 全文検索エンドポイント（Post-MVP: サイドバー全文検索）
 *
 * - GET /api/search?q=<query>&limit=<n> — 全テーブル横断 ILIKE 検索、ヒットスニペット付き
 *
 * 検索対象: todo_items.title / blocker_items.text / note_entries.body /
 *           reflections.{done_text, stuck_text, tomorrow_action_text} / day_notes.theme
 *
 * クエリ `q` は必須（1文字以上200文字以下）。`%`/`_`/`\` はリテラルとして扱う
 * （`escapeForIlike` でエスケープ）。スニペットは前後30文字 + `…` 装飾。
 */

import { Hono } from 'hono';
import { decorateSnippet, escapeForIlike } from '@dayboard/domain';
import { searchRepository } from 'repository';
import type { SearchHit } from 'shared-types';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const searchRoutes = new Hono();

/** クエリの最大長（200文字） */
const MAX_QUERY_LENGTH = 200;
/** デフォルトの LIMIT */
const DEFAULT_LIMIT = 50;
/** LIMIT の上限 */
const MAX_LIMIT = 200;

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * 全文検索を実行し、ヒットした日付・種別・スニペットを返す。
 * レスポンスは date 降順、type 昇順。
 */
searchRoutes.get('/', async (c) => {
  const rawQuery = c.req.query('q');
  if (rawQuery === undefined || rawQuery === null || rawQuery.length === 0) {
    throw ApiHttpError.validation([{ field: 'q', message: '検索クエリは必須です。' }]);
  }
  if (rawQuery.length > MAX_QUERY_LENGTH) {
    throw ApiHttpError.validation([
      { field: 'q', message: `検索クエリは${MAX_QUERY_LENGTH}文字以下で指定してください。` },
    ]);
  }

  // limit は任意（1-200、既定50）
  const limitParam = c.req.query('limit');
  let limit = DEFAULT_LIMIT;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw ApiHttpError.validation([
        { field: 'limit', message: 'limit は1〜200の整数で指定してください。' },
      ]);
    }
    limit = parsed;
  }

  const escapedQuery = escapeForIlike(rawQuery);
  const [rows, total] = await Promise.all([
    searchRepository.searchAll(escapedQuery, rawQuery, limit),
    searchRepository.countSearchHits(escapedQuery),
  ]);

  // SearchRow → SearchHit 変換。スニペットに `…` 装飾を付与。
  const hits: SearchHit[] = rows.map((row) => {
    const hit: SearchHit = {
      date: row.date,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      snippet: decorateSnippet(row.snippet, row.truncatedStart, row.truncatedEnd),
    };
    if (row.section) {
      hit.section = row.section;
    }
    return hit;
  });

  return c.json({ hits, total });
});

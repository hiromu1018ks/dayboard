/**
 * 検索リポジトリ（Post-MVP: 全文検索）
 *
 * 全テーブル（todo_items / blocker_items / note_entries / reflections / day_notes）を
 * 横断的に ILIKE 検索し、ヒット箇所のスニペットを返す。
 *
 * 実装方針:
 * - 生SQL（`getPool().query`）を使用。UNION ALL + SUBSTRING が複雑なため Drizzle ビルダは不向き。
 * - 各テーブルを `day_notes` に JOIN して date を取得する。
 * - スニペットはヒット位置の前後30文字（文字単位で日本語安全）。
 * - `POSITION(lower($1) IN lower(col))` で大小区別しない位置特定（ILIKE と整合）。
 * - エスケープは API 層で `escapeForIlike` 済みの文字列を受け取る前提。
 *
 * [architecture.md §4]: ピュア関数（クエリ文字列生成・スニペット装飾）は domain 層。
 * 本モジュールは副作用（DB アクセス）のみを担う。
 */

import type { SearchResourceType, ReflectionSection } from 'shared-types';
import { getPool } from './db.js';

/**
 * 検索結果の内部行型（`SearchHit` + 切詰フラグ）。
 * API 層で `decorateSnippet` に切詰フラグを渡し、`…` 装飾を付与して `SearchHit` に変換する。
 */
export type SearchRow = {
  date: string;
  resourceType: SearchResourceType;
  resourceId: string;
  snippet: string;
  section?: ReflectionSection;
  /** スニペットが元テキストの先頭から始まっていない場合 true */
  truncatedStart: boolean;
  /** スニペットが元テキストの末尾で終わっていない場合 true */
  truncatedEnd: boolean;
};

/**
 * 全文検索を実行する。
 *
 * @param escapedQuery `escapeForIlike` 済みの検索クエリ
 * @param rawQuery     エスケープ前の元クエリ（スニペット長計算用）
 * @param limit        最大ヒット数（既定50）
 * @returns SearchRow の配列（date 降順、type 昇順）。`…` 装飾は未適用。
 */
export async function searchAll(
  escapedQuery: string,
  rawQuery: string,
  limit: number = 50,
): Promise<SearchRow[]> {
  const pool = getPool();
  // rawQuery の文字長をスニペット幅に加える（クエリ全体を含むように）
  const queryLen = rawQuery.length;
  const snippetBefore = 30;
  const snippetAfter = 30 + queryLen;

  // 各テーブルごとの SELECT を UNION ALL で統合。
  // snippet = SUBSTRING(col FROM GREATEST(POSITION(lower(q) IN lower(col)) - 30, 1) FOR 60 + char_length(q))
  // truncatedStart = POSITION > 31（先頭から始まっていない）
  // truncatedEnd = POSITION + snippetAfter > char_length(col)（末尾で終わっていない）
  //
  // ILIKE のエスケープ文字として '\' を使用（PostgreSQL 既定）。escapedQuery は既にエスケープ済み。
  const sql = `
    SELECT date, type, resource_id, snippet, section, truncated_start, truncated_end FROM (
      SELECT d.date, 'todo' AS type, t.id AS resource_id,
        SUBSTRING(t.title FROM GREATEST(POSITION(lower($1) IN lower(t.title)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        NULL::text AS section,
        (POSITION(lower($1) IN lower(t.title)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(t.title)) + ${snippetAfter} < char_length(t.title)) AS truncated_end
      FROM todo_items t JOIN day_notes d ON t.day_note_id = d.id
      WHERE t.title ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'blocker' AS type, b.id AS resource_id,
        SUBSTRING(b.text FROM GREATEST(POSITION(lower($1) IN lower(b.text)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        NULL::text AS section,
        (POSITION(lower($1) IN lower(b.text)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(b.text)) + ${snippetAfter} < char_length(b.text)) AS truncated_end
      FROM blocker_items b JOIN day_notes d ON b.day_note_id = d.id
      WHERE b.text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'note' AS type, n.id AS resource_id,
        SUBSTRING(n.body FROM GREATEST(POSITION(lower($1) IN lower(n.body)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        NULL::text AS section,
        (POSITION(lower($1) IN lower(n.body)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(n.body)) + ${snippetAfter} < char_length(n.body)) AS truncated_end
      FROM note_entries n JOIN day_notes d ON n.day_note_id = d.id
      WHERE n.body ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        SUBSTRING(r.done_text FROM GREATEST(POSITION(lower($1) IN lower(r.done_text)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        'done' AS section,
        (POSITION(lower($1) IN lower(r.done_text)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(r.done_text)) + ${snippetAfter} < char_length(r.done_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.done_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        SUBSTRING(r.stuck_text FROM GREATEST(POSITION(lower($1) IN lower(r.stuck_text)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        'stuck' AS section,
        (POSITION(lower($1) IN lower(r.stuck_text)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(r.stuck_text)) + ${snippetAfter} < char_length(r.stuck_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.stuck_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        SUBSTRING(r.tomorrow_action_text FROM GREATEST(POSITION(lower($1) IN lower(r.tomorrow_action_text)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        'tomorrow' AS section,
        (POSITION(lower($1) IN lower(r.tomorrow_action_text)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(r.tomorrow_action_text)) + ${snippetAfter} < char_length(r.tomorrow_action_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.tomorrow_action_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'theme' AS type, d.id AS resource_id,
        SUBSTRING(d.theme FROM GREATEST(POSITION(lower($1) IN lower(d.theme)) - ${snippetBefore}, 1)
                 FOR ${snippetBefore + snippetAfter}) AS snippet,
        NULL::text AS section,
        (POSITION(lower($1) IN lower(d.theme)) > ${snippetBefore + 1}) AS truncated_start,
        (POSITION(lower($1) IN lower(d.theme)) + ${snippetAfter} < char_length(d.theme)) AS truncated_end
      FROM day_notes d
      WHERE d.theme IS NOT NULL AND d.theme ILIKE '%' || $1 || '%' ESCAPE '\\'
    ) AS hits
    ORDER BY date DESC, type ASC
    LIMIT $2
  `;

  const result = await pool.query(sql, [escapedQuery, limit]);

  return result.rows.map((row) => {
    const searchRow: SearchRow = {
      date: row.date,
      resourceType: row.type as SearchResourceType,
      resourceId: row.resource_id,
      snippet: row.snippet ?? '',
      truncatedStart: Boolean(row.truncated_start),
      truncatedEnd: Boolean(row.truncated_end),
    };
    if (row.section) {
      searchRow.section = row.section as ReflectionSection;
    }
    return searchRow;
  });
}

/** 検索ヒット総数を取得する（LIMIT 適用前）。UI の「N件中 M件表示」等で用いる。 */
export async function countSearchHits(escapedQuery: string): Promise<number> {
  const pool = getPool();
  const sql = `
    SELECT COUNT(*) AS total FROM (
      SELECT 1 FROM todo_items t WHERE t.title ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM blocker_items b WHERE b.text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM note_entries n WHERE n.body ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.done_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.stuck_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.tomorrow_action_text ILIKE '%' || $1 || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM day_notes d WHERE d.theme IS NOT NULL AND d.theme ILIKE '%' || $1 || '%' ESCAPE '\\'
    ) AS all_hits
  `;
  const result = await pool.query(sql, [escapedQuery]);
  return Number(result.rows[0]?.total ?? 0);
}

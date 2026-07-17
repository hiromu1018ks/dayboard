/**
 * 検索リポジトリ（Post-MVP: 全文検索）
 *
 * 全テーブル（todo_items / blocker_items / note_entries / reflections / day_notes）を
 * 横断的に LIKE 検索し、ヒット箇所のスニペットを返す。
 *
 * 実装方針:
 * - 生SQL（`getPool().execute`）を使用。UNION ALL + substr が複雑なため Drizzle ビルダは不向き。
 * - 各テーブルを `day_notes` に JOIN して date を取得する。
 * - スニペットはヒット位置の前後30文字（文字単位で日本語安全）。
 * - `instr(lower(col), lower(q))` で位置特定し、`substr` で前後を切り出す。
 *   ※ SQLite の `LIKE` はデフォルトで大小区別しない（ASCII 範囲）。instr による位置特定も
 *      lower 同期で整合させる。
 * - エスケープは API 層で `escapeForIlike` 済みの文字列を受け取る前提。
 *   PostgreSQL の ILIKE 用エスケープ（`\`）は SQLite LIKE でも ESCAPE '\\' として有効。
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
  const client = getPool();
  // rawQuery の文字長をスニペット幅に加える（クエリ全体を含むように）
  // ※ rawQuery のバイト長でなく文字長を扱うが、substr/instr は UTF-8 文字単位で動作する。
  const queryLen = rawQuery.length;
  const snippetBefore = 30;
  const snippetAfter = 30 + queryLen;

  // 各テーブルごとの SELECT を UNION ALL で統合。
  // - instr(lower(col), lower(?)) で 1 始まりのヒット位置を取得。0 = 非ヒット。
  // - snippet = substr(col, max(instr - 30, 1), 30 + (30 + queryLen))
  // - truncatedStart = instr > 31（先頭から始まっていない）
  // - truncatedEnd = instr + snippetAfter - 1 < length(col)（末尾で終わっていない）
  //   ※ instr はヒット開始位置、snippet は (snippetBefore + snippetAfter) 文字分。
  //
  // ILIKE/LIKE のエスケープ文字として '\' を使用（PostgreSQL 既定・SQLite も ESCAPE 句で指定可）。
  const sqlText = `
    SELECT date, type, resource_id, snippet, section, truncated_start, truncated_end FROM (
      SELECT d.date, 'todo' AS type, t.id AS resource_id,
        substr(t.title, max(instr(lower(t.title), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        NULL AS section,
        (instr(lower(t.title), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(t.title), lower(?)) + ${snippetAfter} - 1 < length(t.title)) AS truncated_end
      FROM todo_items t JOIN day_notes d ON t.day_note_id = d.id
      WHERE t.title LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'blocker' AS type, b.id AS resource_id,
        substr(b.text, max(instr(lower(b.text), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        NULL AS section,
        (instr(lower(b.text), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(b.text), lower(?)) + ${snippetAfter} - 1 < length(b.text)) AS truncated_end
      FROM blocker_items b JOIN day_notes d ON b.day_note_id = d.id
      WHERE b.text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'note' AS type, n.id AS resource_id,
        substr(n.body, max(instr(lower(n.body), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        NULL AS section,
        (instr(lower(n.body), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(n.body), lower(?)) + ${snippetAfter} - 1 < length(n.body)) AS truncated_end
      FROM note_entries n JOIN day_notes d ON n.day_note_id = d.id
      WHERE n.body LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        substr(r.done_text, max(instr(lower(r.done_text), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        'done' AS section,
        (instr(lower(r.done_text), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(r.done_text), lower(?)) + ${snippetAfter} - 1 < length(r.done_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.done_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        substr(r.stuck_text, max(instr(lower(r.stuck_text), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        'stuck' AS section,
        (instr(lower(r.stuck_text), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(r.stuck_text), lower(?)) + ${snippetAfter} - 1 < length(r.stuck_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.stuck_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'reflection' AS type, r.id AS resource_id,
        substr(r.tomorrow_action_text, max(instr(lower(r.tomorrow_action_text), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        'tomorrow' AS section,
        (instr(lower(r.tomorrow_action_text), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(r.tomorrow_action_text), lower(?)) + ${snippetAfter} - 1 < length(r.tomorrow_action_text)) AS truncated_end
      FROM reflections r JOIN day_notes d ON r.day_note_id = d.id
      WHERE r.tomorrow_action_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT d.date, 'theme' AS type, d.id AS resource_id,
        substr(d.theme, max(instr(lower(d.theme), lower(?)) - ${snippetBefore}, 1), ${snippetBefore + snippetAfter}) AS snippet,
        NULL AS section,
        (instr(lower(d.theme), lower(?)) > ${snippetBefore + 1}) AS truncated_start,
        (instr(lower(d.theme), lower(?)) + ${snippetAfter} - 1 < length(d.theme)) AS truncated_end
      FROM day_notes d
      WHERE d.theme IS NOT NULL AND d.theme LIKE '%' || ? || '%' ESCAPE '\\'
    ) AS hits
    ORDER BY date DESC, type ASC
    LIMIT ?
  `;

  // プレースホルダ順序: 各ブロック4個（snippet用 lower(?) + truncStart用 lower(?)
  //                   + truncEnd用 lower(?) + WHERE 句 LIKE 用 ?）× 7ブロック + LIMIT(1) = 29
  const args: (string | number)[] = [];
  for (let block = 0; block < 7; block++) {
    for (let i = 0; i < 4; i++) args.push(escapedQuery);
  }
  args.push(limit);

  const result = await client.execute({ sql: sqlText, args });

  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const searchRow: SearchRow = {
      date: String(r.date ?? ''),
      resourceType: r.type as SearchResourceType,
      resourceId: String(r.resource_id ?? ''),
      snippet: r.snippet == null ? '' : String(r.snippet),
      // SQLite の boolean は 0/1。libSQL は number として返すので真偽値へ明示変換。
      truncatedStart: Number(r.truncated_start) === 1,
      truncatedEnd: Number(r.truncated_end) === 1,
    };
    if (r.section != null) {
      searchRow.section = r.section as ReflectionSection;
    }
    return searchRow;
  });
}

/** 検索ヒット総数を取得する（LIMIT 適用前）。UI の「N件中 M件表示」等で用いる。 */
export async function countSearchHits(escapedQuery: string): Promise<number> {
  const client = getPool();
  const sqlText = `
    SELECT COUNT(*) AS total FROM (
      SELECT 1 FROM todo_items t WHERE t.title LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM blocker_items b WHERE b.text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM note_entries n WHERE n.body LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.done_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.stuck_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM reflections r WHERE r.tomorrow_action_text LIKE '%' || ? || '%' ESCAPE '\\'
      UNION ALL
      SELECT 1 FROM day_notes d WHERE d.theme IS NOT NULL AND d.theme LIKE '%' || ? || '%' ESCAPE '\\'
    ) AS all_hits
  `;
  const result = await client.execute({
    sql: sqlText,
    args: [
      escapedQuery,
      escapedQuery,
      escapedQuery,
      escapedQuery,
      escapedQuery,
      escapedQuery,
      escapedQuery,
    ],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return Number(row?.total ?? 0);
}

/**
 * NoteLineMetaRepository 実装（[database_schema.md §3.7/§11]、[roadmap.md T-5-05]）
 *
 * `NoteLineMetaRepository` IF（[types.ts]）に準拠する。
 * snake_case（DB）↔ camelCase（ドメイン型）の変換は `mapNoteLineMeta` が担う。
 *
 * 重複判定インデックス（[database_schema.md §3.7]）:
 * - `idx_note_line_metas_todo_duplicate_lookup ON (note_entry_id, line_hash)`
 * - `idx_note_line_metas_blocker_duplicate_lookup ON (note_entry_id, line_hash)`
 * これらが重複候補検索（[note_conversion_spec.md §6]）を高速化する。
 *
 * トランザクション内の並行クエリは pg@9 で非推奨のため、順次実行する。
 */

import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapNoteLineMeta } from './mappers.js';
import { noteLineMetas } from './schema/index.js';
import type {
  NoteLineMetaCreateInput,
  NoteLineMetaRepository as INoteLineMetaRepository,
  Tx,
} from './types.js';

/**
 * 指定 NoteEntry の全メタを取得（/full 応答・変換済みマーク表示用）。
 * convertedAt 昇順で返す（変換順）。
 */
export const listByNoteEntry: INoteLineMetaRepository['listByNoteEntry'] = async (noteEntryId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(noteLineMetas)
    .where(eq(noteLineMetas.noteEntryId, noteEntryId))
    .orderBy(asc(noteLineMetas.convertedAt));
  return rows.map(mapNoteLineMeta);
};

/**
 * 重複候補検索（[note_conversion_spec.md §6.1]）。
 *
 * 同じ `(noteEntryId, lineHash)` を持ち、指定した変換先が既に存在する（NOT NULLの）
 * NoteLineMeta を返す。
 *
 * - target='todo': `convertedToTodoId IS NOT NULL` のメタ
 * - target='blocker': `convertedToBlockerId IS NOT NULL` のメタ
 *
 * @returns 重複候補の配列（通常0件 or 1件だが、force=1 で複数件あり得る）
 */
export const findByNoteEntryAndLineHash: INoteLineMetaRepository['findByNoteEntryAndLineHash'] =
  async (noteEntryId, lineHash, target) => {
    const db = getDb();
    const filterConverted =
      target === 'todo'
        ? isNotNull(noteLineMetas.convertedToTodoId)
        : isNotNull(noteLineMetas.convertedToBlockerId);
    const rows = await db
      .select()
      .from(noteLineMetas)
      .where(
        and(
          eq(noteLineMetas.noteEntryId, noteEntryId),
          eq(noteLineMetas.lineHash, lineHash),
          filterConverted,
        ),
      )
      .orderBy(asc(noteLineMetas.convertedAt));
    return rows.map(mapNoteLineMeta);
  };

/**
 * NoteLineMeta を新規作成する（[note_conversion_spec.md §9.1]）。
 *
 * 変換エンドポイント（TODO化/障害化）の1トランザクション内で呼ばれる。
 * TodoItem/BlockerItem と1トランザクションで作成されるため、原子性を保証する。
 *
 * @param id    NoteLineMeta ID
 * @param input 作成内容
 * @param tx    任意。トランザクション内で実行する場合に指定。
 */
export const create: INoteLineMetaRepository['create'] = async (id, input, tx?) => {
  const conn = tx ?? getDb();
  const rows = await conn
    .insert(noteLineMetas)
    .values({
      id,
      noteEntryId: input.noteEntryId,
      lineNumberAtConversion: input.lineNumberAtConversion,
      normalizedLineText: input.normalizedLineText,
      lineHash: input.lineHash,
      lineText: input.lineText,
      convertedToTodoId: input.convertedToTodoId,
      convertedToBlockerId: input.convertedToBlockerId,
      convertedToReflection: false, // MVPでは常にfalse（Post-MVP予約フィールド）
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error(`noteLineMetaRepository.create: insert returned no row for ${id}`);
  }
  return mapNoteLineMeta(row);
};

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: INoteLineMetaRepository = {
  listByNoteEntry,
  findByNoteEntryAndLineHash,
  create,
};
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { NoteLineMetaCreateInput, Tx };

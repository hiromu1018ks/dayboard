/**
 * ReflectionRepository 実装（[database_schema.md §3.5/§11]）
 *
 * `ReflectionRepository` IF（[types.ts]）に準拠する。
 * DayNote と 1:1。新規作成時は空文字3セクション。
 * update は3セクションの部分更新（[api_contract.md §7]）。
 */

import { eq } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapReflection } from './mappers.js';
import { reflections } from './schema/index.js';
import type {
  ReflectionRepository as IReflectionRepository,
  ReflectionUpdateInput,
  Tx,
} from './types.js';

/** dayNoteId で Reflection を検索。存在しない場合は null。 */
export const findByDayNote: IReflectionRepository['findByDayNote'] = async (dayNoteId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(reflections)
    .where(eq(reflections.dayNoteId, dayNoteId))
    .limit(1);
  return rows.length > 0 ? mapReflection(rows[0]!) : null;
};

/**
 * 空の Reflection（doneText/stuckText/tomorrowActionText = ''）を新規作成する。
 *
 * @param id Reflection ID
 * @param dayNoteId 紐づく DayNote ID
 * @param tx 任意。トランザクション内で実行する場合（aggregator から利用）。
 */
export const create: IReflectionRepository['create'] = async (id, dayNoteId, tx?) => {
  const conn = tx ?? getDb();
  const rows = await conn
    .insert(reflections)
    .values({
      id,
      dayNoteId,
      doneText: '',
      stuckText: '',
      tomorrowActionText: '',
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error(`reflectionRepository.create: insert returned no row for ${dayNoteId}`);
  }
  return mapReflection(row);
};

/**
 * Reflection を部分更新する（[api_contract.md §7]）。
 *
 * doneText/stuckText/tomorrowActionText の任意組合せを UPDATE する。
 * DayNote と 1:1（dayNoteId は UNIQUE）で、DayNote 生成時に空行が作成済みのため、
 * 厳密には UPSERT ではなく部分 UPDATE。
 *
 * @param dayNoteId 紐づく DayNote ID（識別子）
 * @param input     更新内容。3セクションの任意組合せ。
 * @param tx        任意。トランザクション内で実行する場合に指定。
 * @returns 更新後の Reflection。存在しない dayNoteId の場合は null。
 */
export const update: IReflectionRepository['update'] = async (dayNoteId, input, tx?) => {
  const conn = tx ?? getDb();

  const patch: Partial<typeof reflections.$inferInsert> = {};
  if (input.doneText !== undefined) patch.doneText = input.doneText;
  if (input.stuckText !== undefined) patch.stuckText = input.stuckText;
  if (input.tomorrowActionText !== undefined) patch.tomorrowActionText = input.tomorrowActionText;

  if (Object.keys(patch).length === 0) {
    return findByDayNote(dayNoteId);
  }

  const rows = await conn
    .update(reflections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(reflections.dayNoteId, dayNoteId))
    .returning();

  if (rows.length === 0) return null;
  return mapReflection(rows[0]!);
};

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: IReflectionRepository = { findByDayNote, create, update };
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { ReflectionUpdateInput, Tx };

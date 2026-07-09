/**
 * ReflectionRepository 実装（[database_schema.md §3.5/§11]）
 *
 * `ReflectionRepository` IF（[types.ts]）に準拠する。
 * DayNote と 1:1。新規作成時は空文字3セクション。
 */

import { eq } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapReflection } from './mappers.js';
import { reflections } from './schema/index.js';
import type { ReflectionRepository as IReflectionRepository } from './types.js';

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

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: IReflectionRepository = { findByDayNote, create };
void _implements;

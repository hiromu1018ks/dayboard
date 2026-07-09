/**
 * NoteEntryRepository 実装（[database_schema.md §3.6/§11]）
 *
 * `NoteEntryRepository` IF（[types.ts]）に準拠する。
 * DayNote と 1:1。新規作成時は body 空文字。
 */

import { eq } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapNoteEntry } from './mappers.js';
import { noteEntries } from './schema/index.js';
import type { NoteEntryRepository as INoteEntryRepository } from './types.js';

/** dayNoteId で NoteEntry を検索。存在しない場合は null。 */
export const findByDayNote: INoteEntryRepository['findByDayNote'] = async (dayNoteId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(noteEntries)
    .where(eq(noteEntries.dayNoteId, dayNoteId))
    .limit(1);
  return rows.length > 0 ? mapNoteEntry(rows[0]!) : null;
};

/**
 * 空の NoteEntry（body = ''）を新規作成する。
 *
 * @param id NoteEntry ID
 * @param dayNoteId 紐づく DayNote ID
 * @param tx 任意。トランザクション内で実行する場合（aggregator から利用）。
 */
export const create: INoteEntryRepository['create'] = async (id, dayNoteId, tx?) => {
  const conn = tx ?? getDb();
  const rows = await conn.insert(noteEntries).values({ id, dayNoteId, body: '' }).returning();
  const row = rows[0];
  if (!row) {
    throw new Error(`noteEntryRepository.create: insert returned no row for ${dayNoteId}`);
  }
  return mapNoteEntry(row);
};

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: INoteEntryRepository = { findByDayNote, create };
void _implements;

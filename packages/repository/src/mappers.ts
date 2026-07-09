/**
 * Drizzle row ↔ ドメイン型 変換ヘルパー
 *
 * [database_schema.md §11]: リポジトリ層で snake_case ↔ camelCase 変換を吸収する。
 * Drizzle は `select().from(table)` で schema 定義の camelCase キーを返すため、
 * 列名の変換は不要。ただし timestamp（`mode:'date'`）は `Date` オブジェクトを
 * 返すため、ドメイン型（ISO 8601 文字列）へ変換する。
 */

import type { DayNote, NoteEntry, Reflection } from 'shared-types';
import type { dayNotes, noteEntries, reflections } from './schema/index.js';

/** Drizzle の timestamp `Date` を ISO 8601 文字列へ。NULL はそのまま。 */
function toIso(date: Date | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  return date.toISOString();
}

/** day_notes row → DayNote ドメイン型 */
export function mapDayNote(row: typeof dayNotes.$inferSelect): DayNote {
  return {
    id: row.id,
    date: row.date,
    theme: row.theme,
    lastOpenedMode: row.lastOpenedMode as DayNote['lastOpenedMode'],
    createdAt: toIso(row.createdAt) as string,
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/** reflections row → Reflection ドメイン型 */
export function mapReflection(row: typeof reflections.$inferSelect): Reflection {
  return {
    id: row.id,
    dayNoteId: row.dayNoteId,
    doneText: row.doneText,
    stuckText: row.stuckText,
    tomorrowActionText: row.tomorrowActionText,
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/** note_entries row → NoteEntry ドメイン型 */
export function mapNoteEntry(row: typeof noteEntries.$inferSelect): NoteEntry {
  return {
    id: row.id,
    dayNoteId: row.dayNoteId,
    body: row.body,
    createdAt: toIso(row.createdAt) as string,
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/**
 * Drizzle row ↔ ドメイン型 変換ヘルパー
 *
 * [database_schema.md §11]: リポジトリ層で snake_case ↔ camelCase 変換を吸収する。
 * Drizzle は `select().from(table)` で schema 定義の camelCase キーを返すため、
 * 列名の変換は不要。ただし timestamp（`mode:'date'`）は `Date` オブジェクトを
 * 返すため、ドメイン型（ISO 8601 文字列）へ変換する。
 */

import type {
  BlockerItem,
  DayNote,
  NoteEntry,
  NoteLineMeta,
  Reflection,
  TodoItem,
} from 'shared-types';
import type {
  blockerItems,
  dayNotes,
  noteEntries,
  noteLineMetas,
  reflections,
  todoItems,
} from './schema/index.js';

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

/** todo_items row → TodoItem ドメイン型 */
export function mapTodoItem(row: typeof todoItems.$inferSelect): TodoItem {
  return {
    id: row.id,
    dayNoteId: row.dayNoteId,
    title: row.title,
    status: row.status as TodoItem['status'],
    order: row.order,
    sourceNoteLineMetaId: row.sourceNoteLineMetaId,
    carriedFromTodoId: row.carriedFromTodoId,
    carriedFromDate: row.carriedFromDate,
    createdAt: toIso(row.createdAt) as string,
    completedAt: toIso(row.completedAt),
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/** blocker_items row → BlockerItem ドメイン型 */
export function mapBlockerItem(row: typeof blockerItems.$inferSelect): BlockerItem {
  return {
    id: row.id,
    dayNoteId: row.dayNoteId,
    text: row.text,
    linkedTodoId: row.linkedTodoId,
    sourceNoteLineMetaId: row.sourceNoteLineMetaId,
    resolved: row.resolved,
    order: row.order,
    createdAt: toIso(row.createdAt) as string,
    resolvedAt: toIso(row.resolvedAt),
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/** note_line_metas row → NoteLineMeta ドメイン型 */
export function mapNoteLineMeta(row: typeof noteLineMetas.$inferSelect): NoteLineMeta {
  return {
    id: row.id,
    noteEntryId: row.noteEntryId,
    lineNumberAtConversion: row.lineNumberAtConversion,
    normalizedLineText: row.normalizedLineText,
    lineHash: row.lineHash,
    lineText: row.lineText,
    convertedToTodoId: row.convertedToTodoId,
    convertedToBlockerId: row.convertedToBlockerId,
    convertedToReflection: row.convertedToReflection,
    convertedAt: toIso(row.convertedAt) as string,
    createdAt: toIso(row.createdAt) as string,
    updatedAt: toIso(row.updatedAt) as string,
  };
}

/**
 * Drizzle ORM スキーマ定義
 *
 * [database_schema.md §3] の全7テーブルを忠実に表現する。
 * この定義から `drizzle-kit generate` でSQLマイグレーションを生成する（[§7.1]）。
 *
 * データストアは SQLite（libSQL）。
 * - timestamp 相当は `integer({ mode: 'timestamp' })`（unixepoch 秒）で表現する。
 * - boolean 相当は `integer({ mode: 'boolean' })`（0/1）で表現する。
 * - date（YYYY-MM-DD）は `text` で保持する（`mode: 'string'` 相当）。
 *
 * 循環FK（[§7.3]）に関する取り扱い:
 *   todo_items.source_note_line_meta_id → note_line_metas.id
 *   blocker_items.linked_todo_id → todo_items.id
 *   blocker_items.source_note_line_meta_id → note_line_metas.id
 *   note_line_metas.converted_to_todo_id → todo_items.id
 *   note_line_metas.converted_to_blocker_id → blocker_items.id
 * PostgreSQL 版ではマイグレーションSQLの `ALTER TABLE ADD CONSTRAINT` で後付していたが、
 * SQLite は `ALTER TABLE ADD CONSTRAINT` をサポートしないため、スキーマ定義で
 * `.references(() => X, { onDelete: 'set null' })` として宣言する。
 * drizzle-kit の SQLite generator が FK を CREATE TABLE（必要に応じてテーブル再構成）に
 * 取り込む。外部キー制約の強制には接続時の `PRAGMA foreign_keys = ON` が必要（[db.ts]）。
 */

import { check, integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** DayNote — [database_schema.md §3.1] */
export const dayNotes = sqliteTable(
  'day_notes',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    theme: text('theme'),
    lastOpenedMode: text('last_opened_mode').notNull().default('work'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** 1日1ノートの不変条件（AC-01 重複生成防止） */
    dateUnique: uniqueIndex('uq_day_notes_date').on(table.date),
    lastOpenedModeCheck: check(
      'day_notes_last_opened_mode_check',
      sql`"last_opened_mode" IN ('work', 'note')`,
    ),
  }),
);

/** UserSettings — [database_schema.md §3.2]。MVPは単一ユーザーのため常に1行 */
export const userSettings = sqliteTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    keybindingMode: text('keybinding_mode').notNull().default('standard'),
    vimDefaultState: text('vim_default_state').notNull().default('normal'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  () => ({
    keybindingModeCheck: check(
      'user_settings_keybinding_mode_check',
      sql`"keybinding_mode" IN ('standard', 'vim')`,
    ),
    vimDefaultStateCheck: check(
      'user_settings_vim_default_state_check',
      sql`"vim_default_state" IN ('normal', 'insert')`,
    ),
  }),
);

/** TodoItem — [database_schema.md §3.3] */
export const todoItems = sqliteTable(
  'todo_items',
  {
    id: text('id').primaryKey(),
    dayNoteId: text('day_note_id')
      .notNull()
      .references(() => dayNotes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('todo'),
    order: integer('order').notNull(),
    /** ノート→TODO変換時のみ設定。ON DELETE SET NULL。
     * 循環FK（note_line_metas ↔ todo_items）。Drizzle の `.references()` で循環参照を宣言すると
     * TS の型推論が解決しないため、スキーマ定義からは外し、マイグレーションSQL の
     * CREATE TABLE で直接 FK を宣言する（[database_schema.md §7.3]、PostgreSQL 版と同構成）。 */
    sourceNoteLineMetaId: text('source_note_line_meta_id'),
    /** 自己参照。別テーブル参照なし（参照整合性より履歴保持を優先） */
    carriedFromTodoId: text('carried_from_todo_id'),
    /** 持ち越し元DayNote.dateのスナップショット */
    carriedFromDate: text('carried_from_date'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    statusCheck: check('todo_items_status_check', sql`"status" IN ('todo', 'done', 'carried')`),
    /** carriedFromTodoId と carriedFromDate は両方NULLまたは両方非NULL */
    carriedFromPairCheck: check(
      'todo_items_carried_from_pair_check',
      sql`("carried_from_todo_id" IS NULL AND "carried_from_date" IS NULL) OR ("carried_from_todo_id" IS NOT NULL AND "carried_from_date" IS NOT NULL)`,
    ),
    /** 1日のTODO一覧取得（順序付き） */
    dayNoteOrderIdx: index('idx_todo_items_day_note_id_order').on(table.dayNoteId, table.order),
    /** 持ち越しTODOの逆引き（要件 7.10）。部分インデックス（NULL 除外）で効率化 */
    carriedFromTodoIdx: index('idx_todo_items_carried_from_todo_id')
      .on(table.carriedFromTodoId)
      .where(sql`"carried_from_todo_id" IS NOT NULL`),
  }),
);

/** BlockerItem — [database_schema.md §3.4] */
export const blockerItems = sqliteTable(
  'blocker_items',
  {
    id: text('id').primaryKey(),
    dayNoteId: text('day_note_id')
      .notNull()
      .references(() => dayNotes.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** 任意（要件 7.4）。ON DELETE SET NULL。todo_items へのFK（循環FK、[§7.3]）。
     * スキーマ定義からは外し、マイグレーションSQL の CREATE TABLE で直接 FK 宣言する
     * （Drizzle の `.references()` 循環参照は TS 型推論が解決しないため）。 */
    linkedTodoId: text('linked_todo_id'),
    /** ノート→障害変換時のみ設定。ON DELETE SET NULL。
     * 循環FK（note_line_metas ↔ blocker_items）。マイグレーションSQL で FK 宣言（[§7.3]）。 */
    sourceNoteLineMetaId: text('source_note_line_meta_id'),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    order: integer('order').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** 1日の障害一覧取得（順序付き） */
    dayNoteOrderIdx: index('idx_blocker_items_day_note_id_order').on(table.dayNoteId, table.order),
  }),
);

/** Reflection — [database_schema.md §3.5]。DayNoteと1:1 */
export const reflections = sqliteTable('reflections', {
  id: text('id').primaryKey(),
  dayNoteId: text('day_note_id')
    .notNull()
    .unique()
    .references(() => dayNotes.id, { onDelete: 'cascade' }),
  doneText: text('done_text').notNull().default(''),
  stuckText: text('stuck_text').notNull().default(''),
  tomorrowActionText: text('tomorrow_action_text').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** NoteEntry — [database_schema.md §3.6]。DayNoteと1:1 */
export const noteEntries = sqliteTable(
  'note_entries',
  {
    id: text('id').primaryKey(),
    dayNoteId: text('day_note_id')
      .notNull()
      .references(() => dayNotes.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** 1:1 強制 */
    dayNoteUnique: uniqueIndex('uq_note_entries_day_note_id').on(table.dayNoteId),
  }),
);

/** NoteLineMeta — [database_schema.md §3.7] */
export const noteLineMetas = sqliteTable(
  'note_line_metas',
  {
    id: text('id').primaryKey(),
    noteEntryId: text('note_entry_id')
      .notNull()
      .references(() => noteEntries.id, { onDelete: 'cascade' }),
    /** 変換時点の行番号。参考値（編集後に正確な位置を保証しない） */
    lineNumberAtConversion: integer('line_number_at_conversion').notNull(),
    normalizedLineText: text('normalized_line_text').notNull(),
    /** FNV-1a 64bit hex 16文字（noteEntryId + "\n" + normalizedLineText） */
    lineHash: text('line_hash').notNull(),
    /** 変換時点の原文スナップショット */
    lineText: text('line_text').notNull(),
    /** 循環FK（todo_items へ）。ON DELETE SET NULL。マイグレーションSQL で FK 宣言（[§7.3]）。 */
    convertedToTodoId: text('converted_to_todo_id'),
    /** 循環FK（blocker_items へ）。ON DELETE SET NULL。マイグレーションSQL で FK 宣言（[§7.3]）。 */
    convertedToBlockerId: text('converted_to_blocker_id'),
    /** Post-MVP用予約。MVPでは常に false */
    convertedToReflection: integer('converted_to_reflection', { mode: 'boolean' })
      .notNull()
      .default(false),
    convertedAt: integer('converted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    noteEntryIdx: index('idx_note_line_metas_note_entry_id').on(table.noteEntryId),
    /** TODO化の重複候補検索用（非一意・部分インデックス） */
    todoDuplicateLookupIdx: index('idx_note_line_metas_todo_duplicate_lookup')
      .on(table.noteEntryId, table.lineHash)
      .where(sql`"converted_to_todo_id" IS NOT NULL`),
    /** 障害化の重複候補検索用（非一意・部分インデックス） */
    blockerDuplicateLookupIdx: index('idx_note_line_metas_blocker_duplicate_lookup')
      .on(table.noteEntryId, table.lineHash)
      .where(sql`"converted_to_blocker_id" IS NOT NULL`),
    /** 1つの変換先TODOに複数メタ行が紐づく事故を防ぐ（部分一意インデックス） */
    convertedToTodoUnique: uniqueIndex('uq_note_line_metas_converted_to_todo_id')
      .on(table.convertedToTodoId)
      .where(sql`"converted_to_todo_id" IS NOT NULL`),
    /** 1つの変換先障害に複数メタ行が紐づく事故を防ぐ（部分一意インデックス） */
    convertedToBlockerUnique: uniqueIndex('uq_note_line_metas_converted_to_blocker_id')
      .on(table.convertedToBlockerId)
      .where(sql`"converted_to_blocker_id" IS NOT NULL`),
  }),
);

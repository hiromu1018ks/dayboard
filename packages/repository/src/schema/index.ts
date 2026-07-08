/**
 * Drizzle ORM スキーマ定義
 *
 * [database_schema.md §3] の全7テーブルを忠実に表現する。
 * この定義から `drizzle-kit generate` でSQLマイグレーションを生成する（[§7.1]）。
 *
 * 循環FK（[§7.3]）に関する取り扱い:
 *   todo_items.source_note_line_meta_id → note_line_metas.id
 *   note_line_metas.converted_to_todo_id → todo_items.id
 *   note_line_metas.converted_to_blocker_id → blocker_items.id
 * これらは循環するため、生成されたマイグレーションSQLが作成順序（§7.3）に従い、
 * 循環FKは後段の ALTER TABLE で付与されることを想定する。
 * drizzle-kit は FK をテーブル作成後の ALTER として出力するため、
 * ここでは通常どおり参照を宣言する。
 */

import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** DayNote — [database_schema.md §3.1] */
export const dayNotes = pgTable(
  'day_notes',
  {
    id: text('id').primaryKey(),
    date: date('date', { mode: 'string' }).notNull(),
    theme: text('theme'),
    lastOpenedMode: text('last_opened_mode').notNull().default('work'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
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
export const userSettings = pgTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    keybindingMode: text('keybinding_mode').notNull().default('standard'),
    vimDefaultState: text('vim_default_state').notNull().default('normal'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
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
export const todoItems = pgTable(
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
     * 循環FK（note_line_metas ↔ todo_items）のため .references() は付けず、
     * マイグレーションSQLの ALTER TABLE で後から付与する（[database_schema.md §7.3]）。 */
    sourceNoteLineMetaId: text('source_note_line_meta_id'),
    /** 自己参照。別テーブル参照なし（参照整合性より履歴保持を優先） */
    carriedFromTodoId: text('carried_from_todo_id'),
    /** 持ち越し元DayNote.dateのスナップショット */
    carriedFromDate: date('carried_from_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
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
    /** 持ち越しTODOの逆引き（要件 7.10） */
    carriedFromTodoIdx: index('idx_todo_items_carried_from_todo_id').on(table.carriedFromTodoId),
  }),
);

/** BlockerItem — [database_schema.md §3.4] */
export const blockerItems = pgTable(
  'blocker_items',
  {
    id: text('id').primaryKey(),
    dayNoteId: text('day_note_id')
      .notNull()
      .references(() => dayNotes.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** 任意（要件 7.4）。ON DELETE SET NULL。todo_items へのFKはここでは宣言せず、
     * マイグレーションSQLで ALTER TABLE により付与する（循環FK回避、[§7.3]）。 */
    linkedTodoId: text('linked_todo_id'),
    /** ノート→障害変換時のみ設定。ON DELETE SET NULL。
     * 循環FKのため .references() は付けず、マイグレーションSQLの ALTER で付与（[§7.3]）。 */
    sourceNoteLineMetaId: text('source_note_line_meta_id'),
    resolved: boolean('resolved').notNull().default(false),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    /** 1日の障害一覧取得（順序付き） */
    dayNoteOrderIdx: index('idx_blocker_items_day_note_id_order').on(table.dayNoteId, table.order),
  }),
);

/** Reflection — [database_schema.md §3.5]。DayNoteと1:1 */
export const reflections = pgTable('reflections', {
  id: text('id').primaryKey(),
  dayNoteId: text('day_note_id')
    .notNull()
    .unique()
    .references(() => dayNotes.id, { onDelete: 'cascade' }),
  doneText: text('done_text').notNull().default(''),
  stuckText: text('stuck_text').notNull().default(''),
  tomorrowActionText: text('tomorrow_action_text').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** NoteEntry — [database_schema.md §3.6]。DayNoteと1:1 */
export const noteEntries = pgTable(
  'note_entries',
  {
    id: text('id').primaryKey(),
    dayNoteId: text('day_note_id')
      .notNull()
      .references(() => dayNotes.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    /** 1:1 強制 */
    dayNoteUnique: uniqueIndex('uq_note_entries_day_note_id').on(table.dayNoteId),
  }),
);

/** NoteLineMeta — [database_schema.md §3.7] */
export const noteLineMetas = pgTable(
  'note_line_metas',
  {
    id: text('id').primaryKey(),
    noteEntryId: text('note_entry_id')
      .notNull()
      .references(() => noteEntries.id, { onDelete: 'cascade' }),
    /** 変換時点の行番号。参考値（編集後に正確な位置を保証しない） */
    lineNumberAtConversion: integer('line_number_at_conversion').notNull(),
    normalizedLineText: text('normalized_line_text').notNull(),
    /** sha256(noteEntryId + "\n" + normalizedLineText).slice(0,16) */
    lineHash: text('line_hash').notNull(),
    /** 変換時点の原文スナップショット */
    lineText: text('line_text').notNull(),
    convertedToTodoId: text('converted_to_todo_id'),
    convertedToBlockerId: text('converted_to_blocker_id'),
    /** Post-MVP用予約。MVPでは常に false */
    convertedToReflection: boolean('converted_to_reflection').notNull().default(false),
    convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    noteEntryIdx: index('idx_note_line_metas_note_entry_id').on(table.noteEntryId),
    /** TODO化の重複候補検索用（非一意） */
    todoDuplicateLookupIdx: index('idx_note_line_metas_todo_duplicate_lookup').on(
      table.noteEntryId,
      table.lineHash,
    ),
    /** 障害化の重複候補検索用（非一意） */
    blockerDuplicateLookupIdx: index('idx_note_line_metas_blocker_duplicate_lookup').on(
      table.noteEntryId,
      table.lineHash,
    ),
    /** 1つの変換先TODOに複数メタ行が紐づく事故を防ぐ */
    convertedToTodoUnique: uniqueIndex('uq_note_line_metas_converted_to_todo_id').on(
      table.convertedToTodoId,
    ),
    /** 1つの変換先障害に複数メタ行が紐づく事故を防ぐ */
    convertedToBlockerUnique: uniqueIndex('uq_note_line_metas_converted_to_blocker_id').on(
      table.convertedToBlockerId,
    ),
  }),
);

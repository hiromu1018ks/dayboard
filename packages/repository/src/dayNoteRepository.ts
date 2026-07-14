/**
 * DayNoteRepository 実装（[database_schema.md §3.1/§11]）
 *
 * `DayNoteRepository` IF（[types.ts]）に準拠する。
 * snake_case（DB）↔ camelCase（ドメイン型）の変換を内部で吸収する。
 * クエリ実装には drizzle クエリビルダ（[db.ts getDb]）を用いる。
 *
 * theme 正規化（空文字→null）は `@dayboard/domain` の `normalizeTheme` で
 * 単一化する（[api_contract.md §4]）。
 */

import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { normalizeTheme } from '@dayboard/domain';
import { getDb } from './db.js';
import { mapDayNote } from './mappers.js';
import { dayNotes } from './schema/index.js';
import type { DayNoteUpdateInput, DayNoteRepository as IDayNoteRepository, Tx } from './types.js';

/** date（YYYY-MM-DD）で DayNote を検索。存在しない場合は null。 */
export const findByDate: IDayNoteRepository['findByDate'] = async (date) => {
  const db = getDb();
  const rows = await db.select().from(dayNotes).where(eq(dayNotes.date, date)).limit(1);
  return rows.length > 0 ? mapDayNote(rows[0]!) : null;
};

/** id で DayNote を検索。存在しない場合は null。 */
export const findById: IDayNoteRepository['findById'] = async (id) => {
  const db = getDb();
  const rows = await db.select().from(dayNotes).where(eq(dayNotes.id, id)).limit(1);
  return rows.length > 0 ? mapDayNote(rows[0]!) : null;
};

/** date が重複する DayNote が存在するか（一意制約の事前判定用）。 */
export const existsByDate: IDayNoteRepository['existsByDate'] = async (date) => {
  const db = getDb();
  const rows = await db
    .select({ id: dayNotes.id })
    .from(dayNotes)
    .where(eq(dayNotes.date, date))
    .limit(1);
  return rows.length > 0;
};

/**
 * 日付範囲（from〜to）の DayNote サマリを取得する（サイドバーの月別カレンダー用）。
 *
 * @param from YYYY-MM-DD（含む）
 * @param to   YYYY-MM-DD（含む）
 * @returns DayNoteSummary の配列（date 降順）。存在しない場合は空配列。
 */
export const listByDateRange: IDayNoteRepository['listByDateRange'] = async (from, to) => {
  const db = getDb();
  const rows = await db
    .select({
      date: dayNotes.date,
      theme: dayNotes.theme,
      lastOpenedMode: dayNotes.lastOpenedMode,
    })
    .from(dayNotes)
    .where(and(gte(dayNotes.date, from), lte(dayNotes.date, to)))
    .orderBy(desc(dayNotes.date));
  return rows.map((row) => ({
    date: row.date,
    theme: row.theme,
    lastOpenedMode: row.lastOpenedMode as 'work' | 'note',
  }));
};

/**
 * 新規 DayNote を作成する。
 *
 * @param id DayNote ID
 * @param date YYYY-MM-DD
 * @param tx 任意。トランザクション内で実行する場合に指定（aggregator から利用）。
 */
export const create: IDayNoteRepository['create'] = async (id, date, tx?) => {
  const conn = tx ?? getDb();
  const rows = await conn
    .insert(dayNotes)
    .values({ id, date, theme: null, lastOpenedMode: 'work' })
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`dayNoteRepository.create: insert returned no row for ${date}`);
  return mapDayNote(row);
};

/**
 * DayNote を部分更新する。
 *
 * theme は `normalizeTheme`（空文字→null）で正規化する（[api_contract.md §4]）。
 *
 * @param id DayNote ID
 * @param input 更新内容。theme/lastOpenedMode のいずれか（または両方）。
 * @param tx 任意。トランザクション内で実行する場合に指定。
 */
export const update: IDayNoteRepository['update'] = async (id, input, tx?) => {
  const conn = tx ?? getDb();
  const patch: Partial<typeof dayNotes.$inferInsert> = {};
  if (input.theme !== undefined) {
    patch.theme = normalizeTheme(input.theme);
  }
  if (input.lastOpenedMode !== undefined) {
    patch.lastOpenedMode = input.lastOpenedMode;
  }

  if (Object.keys(patch).length === 0) {
    // 更新内容が空なら現状維持（updatedAt も更新しない）
    return findById(id);
  }

  const rows = await conn
    .update(dayNotes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dayNotes.id, id))
    .returning();

  if (rows.length === 0) return null;
  return mapDayNote(rows[0]!);
};

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: IDayNoteRepository = {
  findByDate,
  findById,
  existsByDate,
  listByDateRange,
  create,
  update,
};
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { DayNoteUpdateInput, Tx };

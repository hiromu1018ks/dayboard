/**
 * BlockerRepository 実装（[database_schema.md §3.4/§11]）
 *
 * `BlockerRepository` IF（[types.ts]）に準拠する。
 * TodoRepository と同構造。linkedTodoId は任意（null 許可、要件 7.4）。
 *
 * order 運用は todoItems と同じ（0,1,2,... の連番）。
 */

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapBlockerItem } from './mappers.js';
import { blockerItems } from './schema/index.js';
import type { BlockerRepository as IBlockerRepository, BlockerUpdateInput, Tx } from './types.js';

/** 指定 DayNote の障害を order 昇順で取得。 */
export const listByDayNote: IBlockerRepository['listByDayNote'] = async (dayNoteId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(blockerItems)
    .where(eq(blockerItems.dayNoteId, dayNoteId))
    .orderBy(asc(blockerItems.order));
  return rows.map(mapBlockerItem);
};

/** id で検索。存在しない場合は null。 */
export const findById: IBlockerRepository['findById'] = async (id) => {
  const db = getDb();
  const rows = await db.select().from(blockerItems).where(eq(blockerItems.id, id)).limit(1);
  return rows.length > 0 ? mapBlockerItem(rows[0]!) : null;
};

/**
 * 新規障害を作成する。order はサーバーが末尾に採番する（[api_contract.md §6]）。
 *
 * @param id           BlockerItem ID
 * @param dayNoteId    紐づく DayNote ID
 * @param text         本文（trim 済み・1-200文字、呼び出し元で検証済みの前提）
 * @param linkedTodoId 任意。紐づく TODO の id（null で紐付けなし）。当該日付のTODOであることは
 *                     呼び出し元で検証済みの前提（[edge_cases.md §10.2]）。
 * @param tx           任意。トランザクション内で実行する場合に指定。
 */
export const create: IBlockerRepository['create'] = async (id, dayNoteId, text, linkedTodoId, tx?) => {
  const conn = tx ?? getDb();
  const nextOrder = await nextOrderForDayNote(dayNoteId, conn);
  const rows = await conn
    .insert(blockerItems)
    .values({
      id,
      dayNoteId,
      text,
      linkedTodoId: linkedTodoId,
      sourceNoteLineMetaId: null,
      resolved: false,
      order: nextOrder,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`blockerRepository.create: insert returned no row for ${id}`);
  return mapBlockerItem(row);
};

/**
 * 障害を部分更新する（[api_contract.md §6]）。
 *
 * resolved: false→true で resolvedAt を now()、true→false で null に設定。
 *
 * @returns 更新後の BlockerItem。存在しない id の場合は null。
 */
export const update: IBlockerRepository['update'] = async (id, input, tx?) => {
  const conn = tx ?? getDb();

  const patch: Partial<typeof blockerItems.$inferInsert> = {};
  let needResolvedAtNow = false;
  let needResolvedAtNull = false;

  if (input.text !== undefined) {
    patch.text = input.text;
  }
  if (input.resolved !== undefined) {
    // resolvedAt の判定のため現在 resolved を取得
    const current = await findById(id);
    if (!current) return null;
    if (input.resolved && !current.resolved) {
      needResolvedAtNow = true;
    } else if (!input.resolved && current.resolved) {
      needResolvedAtNull = true;
    }
    patch.resolved = input.resolved;
  }
  if (input.linkedTodoId !== undefined) {
    patch.linkedTodoId = input.linkedTodoId;
  }

  if (needResolvedAtNow) patch.resolvedAt = new Date();
  if (needResolvedAtNull) patch.resolvedAt = null;

  if (Object.keys(patch).length === 0) {
    return findById(id);
  }

  const rows = await conn
    .update(blockerItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(blockerItems.id, id))
    .returning();

  if (rows.length === 0) return null;
  return mapBlockerItem(rows[0]!);
};

/**
 * order を 0,1,2,... に再採番する（[api_contract.md §6]）。
 *
 * orderedIds は当該 DayNote の全障害 id を過不足なく含むことを前提とする。
 *
 * @returns 再採番後の全障害（order 昇順）
 */
export const reorder: IBlockerRepository['reorder'] = async (dayNoteId, orderedIds, tx?) => {
  const conn = tx ?? getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await conn
      .update(blockerItems)
      .set({ order: i, updatedAt: new Date() })
      .where(and(eq(blockerItems.id, orderedIds[i]!), eq(blockerItems.dayNoteId, dayNoteId)));
  }
  const rows = await conn
    .select()
    .from(blockerItems)
    .where(eq(blockerItems.dayNoteId, dayNoteId))
    .orderBy(asc(blockerItems.order));
  return rows.map(mapBlockerItem);
};

/**
 * 障害を削除し、残りの order を 0,1,2,... に再採番する（todoItems の削除と同様）。
 *
 * @returns 削除できた場合は true。存在しない id の場合は false。
 */
export const delete_: IBlockerRepository['delete'] = async (id, tx?) => {
  const conn = tx ?? getDb();
  const target = await findById(id);
  if (!target) return false;

  await conn.delete(blockerItems).where(eq(blockerItems.id, id));

  const remaining = await conn
    .select({ id: blockerItems.id })
    .from(blockerItems)
    .where(eq(blockerItems.dayNoteId, target.dayNoteId))
    .orderBy(asc(blockerItems.order));
  for (let i = 0; i < remaining.length; i++) {
    await conn
      .update(blockerItems)
      .set({ order: i, updatedAt: new Date() })
      .where(eq(blockerItems.id, remaining[i]!.id));
  }
  return true;
};

// `delete` は予約語のためエクスポート名を変更。IF 準拠検証で紐付け。
export const deleteBlocker = delete_;

// ---- 内部ヘルパー ----

/** 指定 DayNote の次の order（末尾）を取得。空の場合は 0。 */
async function nextOrderForDayNote(
  dayNoteId: string,
  conn: Tx | ReturnType<typeof getDb>,
): Promise<number> {
  const rows = await conn
    .select({ order: blockerItems.order })
    .from(blockerItems)
    .where(eq(blockerItems.dayNoteId, dayNoteId))
    .orderBy(asc(blockerItems.order));
  if (rows.length === 0) return 0;
  return rows.length;
}

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: IBlockerRepository = {
  listByDayNote,
  findById,
  create,
  update,
  reorder,
  delete: delete_,
};
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { BlockerUpdateInput, Tx };

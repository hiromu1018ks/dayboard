/**
 * TodoRepository 実装（[database_schema.md §3.3/§11]）
 *
 * `TodoRepository` IF（[types.ts]）に準拠する。
 * snake_case（DB）↔ camelCase（ドメイン型）の変換は `mapTodoItem` が担う。
 * クエリ実装には drizzle クエリビルダ（[db.ts getDb]）を用いる。
 *
 * order 運用（[database_schema.md §3.3] / [api_contract.md §5]）:
 * - ギャップを持たせず、0,1,2,... の連番
 * - create は末尾に採番
 * - delete は残りを再採番（[edge_cases.md §1.1]）
 * - reorder は全 id を受け取り 0,1,2,... へ再採番
 *
 * トランザクション内の並行クエリは pg@9 で非推奨のため、順次実行する。
 */

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db.js';
import { mapTodoItem } from './mappers.js';
import { todoItems } from './schema/index.js';
import type { TodoRepository as ITodoRepository, TodoUpdateInput, Tx } from './types.js';
import { shouldSetCompletedAt } from '@dayboard/domain';

/** 指定 DayNote の TODO を order 昇順で取得。 */
export const listByDayNote: ITodoRepository['listByDayNote'] = async (dayNoteId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(todoItems)
    .where(eq(todoItems.dayNoteId, dayNoteId))
    .orderBy(asc(todoItems.order));
  return rows.map(mapTodoItem);
};

/** id で検索。存在しない場合は null。 */
export const findById: ITodoRepository['findById'] = async (id) => {
  const db = getDb();
  const rows = await db.select().from(todoItems).where(eq(todoItems.id, id)).limit(1);
  return rows.length > 0 ? mapTodoItem(rows[0]!) : null;
};

/**
 * 新規 TODO を作成する。order はサーバーが末尾に採番する（[api_contract.md §5]）。
 *
 * @param id        TodoItem ID
 * @param dayNoteId 紐づく DayNote ID
 * @param title     タイトル（trim 済み・1-200文字、呼び出し元で検証済みの前提）
 * @param tx        任意。トランザクション内で実行する場合に指定。
 */
export const create: ITodoRepository['create'] = async (id, dayNoteId, title, tx?) => {
  const conn = tx ?? getDb();
  const nextOrder = await nextOrderForDayNote(dayNoteId, conn);
  const rows = await conn
    .insert(todoItems)
    .values({
      id,
      dayNoteId,
      title,
      status: 'todo',
      order: nextOrder,
      sourceNoteLineMetaId: null,
      carriedFromTodoId: null,
      carriedFromDate: null,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`todoRepository.create: insert returned no row for ${id}`);
  return mapTodoItem(row);
};

/**
 * TODO を部分更新する（[api_contract.md §5]）。
 *
 * status 遷移の可否は呼び出し元で canTransition 判定済みの前提。
 * completedAt は todo→done で now() に、done→todo で null に設定する。
 *
 * @param id    TodoItem ID
 * @param input 更新内容。title/status のいずれか（または両方）。
 * @param tx    任意。トランザクション内で実行する場合に指定。
 * @returns 更新後の TodoItem。存在しない id の場合は null。
 */
export const update: ITodoRepository['update'] = async (id, input, tx?) => {
  const conn = tx ?? getDb();

  const patch: Partial<typeof todoItems.$inferInsert> = {};
  let fromStatus: string | undefined;

  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.status !== undefined) {
    // completedAt の設定判定のため現在 status を取得
    const current = await findById(id);
    if (!current) return null;
    fromStatus = current.status;
    patch.status = input.status;
    if (shouldSetCompletedAt(current.status, input.status)) {
      patch.completedAt = new Date();
    } else if (fromStatus === 'done' && input.status === 'todo') {
      patch.completedAt = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return findById(id);
  }

  const rows = await conn
    .update(todoItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(todoItems.id, id))
    .returning();

  if (rows.length === 0) return null;
  return mapTodoItem(rows[0]!);
};

/**
 * order を 0,1,2,... に再採番する（[api_contract.md §5]）。
 *
 * orderedIds は当該 DayNote の全 TODO id を過不足なく含むことを前提とする
 * （呼び出し元で検証済み）。トランザクション内で順次 UPDATE する。
 *
 * @returns 再採番後の全 TODO（order 昇順）
 */
export const reorder: ITodoRepository['reorder'] = async (dayNoteId, orderedIds, tx?) => {
  const conn = tx ?? getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await conn
      .update(todoItems)
      .set({ order: i, updatedAt: new Date() })
      .where(and(eq(todoItems.id, orderedIds[i]!), eq(todoItems.dayNoteId, dayNoteId)));
  }
  // 再採番後の全リストを返す（tx 内でも getDb 経由で参照すると別クライアントになる
  // 可能性があるため、tx がある場合は tx から取得する）
  const rows = await conn
    .select()
    .from(todoItems)
    .where(eq(todoItems.dayNoteId, dayNoteId))
    .orderBy(asc(todoItems.order));
  return rows.map(mapTodoItem);
};

/**
 * TODO を削除し、残りの TODO の order を 0,1,2,... に再採番する（[edge_cases.md §1.1]）。
 *
 * @returns 削除できた場合は true。存在しない id の場合は false。
 */
export const delete_: ITodoRepository['delete'] = async (id, tx?) => {
  const conn = tx ?? getDb();
  const target = await findById(id);
  if (!target) return false;

  await conn.delete(todoItems).where(eq(todoItems.id, id));

  // 残りを再採番（0,1,2,...）。同一トランザクション内で順次実行。
  const remaining = await conn
    .select({ id: todoItems.id })
    .from(todoItems)
    .where(eq(todoItems.dayNoteId, target.dayNoteId))
    .orderBy(asc(todoItems.order));
  for (let i = 0; i < remaining.length; i++) {
    await conn
      .update(todoItems)
      .set({ order: i, updatedAt: new Date() })
      .where(eq(todoItems.id, remaining[i]!.id));
  }
  return true;
};

// `delete` は予約語のためエクスポート名を変更。IF 準拠検証で紐付け。
export const deleteTodo = delete_;

/**
 * 持ち越し元TODO（carriedFromTodoId）を指定して作成された翌日側TODOを逆引きする
 * （要件 7.10 / 持ち越し重複判定、[database_schema.md §3.3]）。
 */
export const findByCarriedFrom: ITodoRepository['findByCarriedFrom'] = async (todoId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(todoItems)
    .where(eq(todoItems.carriedFromTodoId, todoId))
    .orderBy(asc(todoItems.createdAt));
  return rows.map(mapTodoItem);
};

// ---- 内部ヘルパー ----

/** 指定 DayNote の次の order（末尾）を取得。空の場合は 0。 */
async function nextOrderForDayNote(dayNoteId: string, conn: Tx | ReturnType<typeof getDb>): Promise<number> {
  const rows = await conn
    .select({ order: todoItems.order })
    .from(todoItems)
    .where(eq(todoItems.dayNoteId, dayNoteId))
    .orderBy(asc(todoItems.order));
  if (rows.length === 0) return 0;
  return rows.length; // 連番前提のため、件数 = 次の order
}

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: ITodoRepository = {
  listByDayNote,
  findById,
  create,
  update,
  reorder,
  delete: delete_,
  findByCarriedFrom,
};
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { TodoUpdateInput, Tx };

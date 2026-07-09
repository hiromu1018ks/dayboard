/**
 * リポジトリインターフェース（IF）定義
 *
 * [database_schema.md §11] のリポジトリIF指針と [test_strategy.md §1.2] の
 * 「IFベースで差し替え可能」「Unit ではインメモリモックを使う」を実現する。
 * [architecture.md §2.2]「リポジトリ実装を SQLite 等に差し替え可能な構造」を保つ。
 *
 * 各リポジトリ関数（dayNoteRepository 等）はこれらの IF に **構造的に準拠** する
 * （duck typing）。トランザクション受け渡し用の `tx` はIF上は省略可能とし、
 * 実装側でオプション引数として受け取る。
 */

import type { DayNote, NoteEntry, Reflection, ViewMode } from 'shared-types';

/** DayNote の部分更新入力（[api_contract.md §4]） */
export type DayNoteUpdateInput = {
  /** 空文字列は null に正規化される（normalizeTheme 経由） */
  theme?: string | null;
  lastOpenedMode?: ViewMode;
};

/** Drizzle トランザクション接続の型（db.transaction(callback) の第一引数）。 */
export type Tx = Parameters<Parameters<import('./db.js').Db['transaction']>[0]>[0];

/** DayNoteRepository IF（[database_schema.md §3.1/§11]） */
export interface DayNoteRepository {
  findByDate(date: string): Promise<DayNote | null>;
  findById(id: string): Promise<DayNote | null>;
  existsByDate(date: string): Promise<boolean>;
  create(id: string, date: string, tx?: Tx): Promise<DayNote>;
  update(id: string, input: DayNoteUpdateInput, tx?: Tx): Promise<DayNote | null>;
}

/** ReflectionRepository IF（[database_schema.md §3.5/§11]） */
export interface ReflectionRepository {
  findByDayNote(dayNoteId: string): Promise<Reflection | null>;
  create(id: string, dayNoteId: string, tx?: Tx): Promise<Reflection>;
}

/** NoteEntryRepository IF（[database_schema.md §3.6/§11]） */
export interface NoteEntryRepository {
  findByDayNote(dayNoteId: string): Promise<NoteEntry | null>;
  create(id: string, dayNoteId: string, tx?: Tx): Promise<NoteEntry>;
}

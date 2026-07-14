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

import type {
  BlockerItem,
  DayNote,
  DayNoteSummary,
  KeybindingMode,
  NoteEntry,
  NoteLineMeta,
  Reflection,
  TodoItem,
  TodoStatus,
  UserSettings,
  ViewMode,
  VimDefaultState,
} from 'shared-types';

/** DayNote の部分更新入力（[api_contract.md §4]） */
export type DayNoteUpdateInput = {
  /** 空文字列は null に正規化される（normalizeTheme 経由） */
  theme?: string | null;
  lastOpenedMode?: ViewMode;
};

/** TodoItem の部分更新入力（[api_contract.md §5]） */
export type TodoUpdateInput = {
  /** trim 後1-200文字。空は呼び出し元で VALIDATION_ERROR 判定済みの前提 */
  title?: string;
  /** status 遷移は [database_schema.md §3.3] 準拠。呼び出し元で canTransition 判定済みの前提 */
  status?: TodoStatus;
  /** ノート行変換時のみ設定（Phase 5）。通常のAPI更新では触らない */
  sourceNoteLineMetaId?: string | null;
};

/** BlockerItem の部分更新入力（[api_contract.md §6]） */
export type BlockerUpdateInput = {
  /** trim 後1-200文字。空は呼び出し元で VALIDATION_ERROR 判定済みの前提 */
  text?: string;
  /** false→true で resolvedAt を now()、true→false で null */
  resolved?: boolean;
  /** null で紐付け解除。当該日付のTODOであることは呼び出し元で検証済みの前提 */
  linkedTodoId?: string | null;
  /** ノート行変換時のみ設定（Phase 5）。通常のAPI更新では触らない */
  sourceNoteLineMetaId?: string | null;
};

/** Reflection の部分更新入力（[api_contract.md §7]） */
export type ReflectionUpdateInput = {
  doneText?: string;
  stuckText?: string;
  tomorrowActionText?: string;
};

/** Drizzle トランザクション接続の型（db.transaction(callback) の第一引数）。 */
export type Tx = Parameters<Parameters<import('./db.js').Db['transaction']>[0]>[0];

/** DayNoteRepository IF（[database_schema.md §3.1/§11]） */
export interface DayNoteRepository {
  findByDate(date: string): Promise<DayNote | null>;
  findById(id: string): Promise<DayNote | null>;
  existsByDate(date: string): Promise<boolean>;
  /** 日付範囲の DayNote サマリを取得（サイドバー用、date 降順） */
  listByDateRange(from: string, to: string): Promise<DayNoteSummary[]>;
  create(id: string, date: string, tx?: Tx): Promise<DayNote>;
  update(id: string, input: DayNoteUpdateInput, tx?: Tx): Promise<DayNote | null>;
}

/** TodoRepository IF（[database_schema.md §3.3/§11]） */
export interface TodoRepository {
  /** 指定 DayNote の TODO を order 昇順で取得 */
  listByDayNote(dayNoteId: string): Promise<TodoItem[]>;
  /**
   * id で検索。存在しない場合は null。
   * `tx` を渡すと同一トランザクション内で検索する（update/delete の内部利用や
   * 持ち越しAPI等、トランザクション分離を保証したい場合に指定）。
   */
  findById(id: string, tx?: Tx): Promise<TodoItem | null>;
  /** 新規作成。order はサーバーが末尾に採番する（[api_contract.md §5]） */
  create(id: string, dayNoteId: string, title: string, tx?: Tx): Promise<TodoItem>;
  /**
   * 持ち越し先TODOを新規作成する（[api_contract.md §10]、要件 7.10）。
   *
   * 通常の create と異なり、`carriedFromTodoId` / `carriedFromDate` を設定する。
   * 2つのフィールドは [database_schema.md §3.3] の CHECK 制約により必ずセットで指定する。
   * order はサーバーが末尾に採番する。
   */
  createCarriedOver(
    id: string,
    dayNoteId: string,
    title: string,
    carriedFromTodoId: string,
    carriedFromDate: string,
    tx?: Tx,
  ): Promise<TodoItem>;
  /** 部分更新。空なら現状維持 */
  update(id: string, input: TodoUpdateInput, tx?: Tx): Promise<TodoItem | null>;
  /** order を 0,1,2,... に再採番（[api_contract.md §5]） */
  reorder(dayNoteId: string, orderedIds: string[], tx?: Tx): Promise<TodoItem[]>;
  /** 削除。残りを再採番（[edge_cases.md §1.1]） */
  delete(id: string, tx?: Tx): Promise<boolean>;
  /** 持ち越し元TODOを指定して作成された翌日側TODOを逆引き（持ち越し重複判定） */
  findByCarriedFrom(todoId: string): Promise<TodoItem[]>;
}

/** BlockerRepository IF（[database_schema.md §3.4/§11]） */
export interface BlockerRepository {
  /** 指定 DayNote の障害を order 昇順で取得 */
  listByDayNote(dayNoteId: string): Promise<BlockerItem[]>;
  /**
   * id で検索。存在しない場合は null。
   * `tx` を渡すと同一トランザクション内で検索する（update/delete の内部利用等、
   * トランザクション分離を保証したい場合に指定）。
   */
  findById(id: string, tx?: Tx): Promise<BlockerItem | null>;
  /** 新規作成。order はサーバーが末尾に採番する。linkedTodoId は任意 */
  create(
    id: string,
    dayNoteId: string,
    text: string,
    linkedTodoId: string | null,
    tx?: Tx,
  ): Promise<BlockerItem>;
  /** 部分更新。空なら現状維持 */
  update(id: string, input: BlockerUpdateInput, tx?: Tx): Promise<BlockerItem | null>;
  /** order を 0,1,2,... に再採番（[api_contract.md §6]） */
  reorder(dayNoteId: string, orderedIds: string[], tx?: Tx): Promise<BlockerItem[]>;
  /** 削除。残りを再採番 */
  delete(id: string, tx?: Tx): Promise<boolean>;
}

/** ReflectionRepository IF（[database_schema.md §3.5/§11]） */
export interface ReflectionRepository {
  findByDayNote(dayNoteId: string): Promise<Reflection | null>;
  create(id: string, dayNoteId: string, tx?: Tx): Promise<Reflection>;
  /** 部分更新（3セクション任意、[api_contract.md §7]）。空なら現状維持 */
  update(dayNoteId: string, input: ReflectionUpdateInput, tx?: Tx): Promise<Reflection | null>;
}

/** NoteEntry 本文の部分更新入力（[api_contract.md §7]） */
export type NoteEntryUpdateInput = {
  /** ノート本文全文。上限50000文字（呼出元で VALIDATION_ERROR 判定済みの前提） */
  body?: string;
};

/** NoteEntryRepository IF（[database_schema.md §3.6/§11]） */
export interface NoteEntryRepository {
  findByDayNote(dayNoteId: string): Promise<NoteEntry | null>;
  create(id: string, dayNoteId: string, tx?: Tx): Promise<NoteEntry>;
  /** 本文の部分更新（[api_contract.md §7]）。空 input は現状維持 */
  update(dayNoteId: string, input: NoteEntryUpdateInput, tx?: Tx): Promise<NoteEntry | null>;
}

/** NoteLineMeta 作成入力（[note_conversion_spec.md §9.1]、[database_schema.md §3.7]） */
export type NoteLineMetaCreateInput = {
  noteEntryId: string;
  /** 変換時点の行番号（1始まり、参考値） */
  lineNumberAtConversion: number;
  /** 正規化後テキスト（normalizeLineText の出力） */
  normalizedLineText: string;
  /** sha256(noteEntryId + "\n" + normalizedLineText).slice(0,16) */
  lineHash: string;
  /** 変換時点の原文スナップショット */
  lineText: string;
  /** 変換先TODOのid（TODO化時）。null = 未変換 or 障害化のみ */
  convertedToTodoId: string | null;
  /** 変換先障害のid（障害化時）。null = 未変換 or TODO化のみ */
  convertedToBlockerId: string | null;
};

/** NoteLineMetaRepository IF（[database_schema.md §3.7/§11]、[note_conversion_spec.md §6]） */
export interface NoteLineMetaRepository {
  /** 指定 NoteEntry の全メタを取得（/full 応答・変換済みマーク表示用） */
  listByNoteEntry(noteEntryId: string): Promise<NoteLineMeta[]>;
  /**
   * 重複候補検索（[note_conversion_spec.md §6.1]）。
   * 同じ `(noteEntryId, lineHash)` を持ち、指定した変換先が既に存在するメタを返す。
   */
  findByNoteEntryAndLineHash(
    noteEntryId: string,
    lineHash: string,
    target: 'todo' | 'blocker',
  ): Promise<NoteLineMeta[]>;
  /** 新規作成（変換時の1トランザクション内で呼ばれる） */
  create(id: string, input: NoteLineMetaCreateInput, tx?: Tx): Promise<NoteLineMeta>;
}

/** UserSettings の部分更新入力（[api_contract.md §11]）。両方任意 */
export type UserSettingsUpdateInput = {
  keybindingMode?: KeybindingMode;
  vimDefaultState?: VimDefaultState;
};

/** UserSettingsRepository IF（[database_schema.md §3.2/§11]）。MVPは単一ユーザーのため常に1行 */
export interface UserSettingsRepository {
  /** 常に1行返す。未作成の場合は初期値（standard/normal）で作成して返す（[api_contract.md §11]） */
  get(): Promise<UserSettings>;
  /** 部分更新。空 input は現状維持 */
  update(input: UserSettingsUpdateInput): Promise<UserSettings>;
}

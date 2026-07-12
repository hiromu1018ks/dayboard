/**
 * dayborad 共通型定義
 *
 * APIリクエスト/レスポンスのリソース形状（[api_contract.md §2] 参照）。
 * UI層・API層双方から参照される、単一の真実源とする。
 *
 * 命名規則:
 * - フィールドは camelCase
 * - 日付（date）は YYYY-MM-DD 文字列
 * - タイムスタンプ（createdAt 等）は ISO 8601 UTC 文字列
 * - 未入力は null（undefined でなく明示的に null）
 *
 * [api_contract.md §2]: ../../docs/api_contract.md
 */

/** 表示モード（要件 6.1） */
export type ViewMode = 'work' | 'note';

/** キーバインドモード（要件 8.5） */
export type KeybindingMode = 'standard' | 'vim';

/** Vim の既定状態（要件 10.2 補足） */
export type VimDefaultState = 'normal' | 'insert';

/** TODO のステータス（[database_schema.md §3.3]） */
export type TodoStatus = 'todo' | 'done' | 'carried';

/**
 * DayNote — 1日の仕事ノート（[database_schema.md §3.1]）
 */
export type DayNote = {
  id: string;
  /** YYYY-MM-DD（ローカル日付） */
  date: string;
  /** 未入力は null（空文字は使わない） */
  theme: string | null;
  lastOpenedMode: ViewMode;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

/**
 * TodoItem — 仕事整理モードのTODO（[database_schema.md §3.3]）
 */
export type TodoItem = {
  id: string;
  dayNoteId: string;
  title: string;
  status: TodoStatus;
  order: number;
  /** ノート行TODO変換時のみ設定。変換元メタが削除されても TODO は残る（ON DELETE SET NULL） */
  sourceNoteLineMetaId: string | null;
  /** 持ち越し元TODOのid（自己参照・履歴保持のためFK制約なし） */
  carriedFromTodoId: string | null;
  /** 持ち越し元DayNoteの日付スナップショット（YYYY-MM-DD） */
  carriedFromDate: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** status='done' のときのみ非null */
  completedAt: string | null;
  updatedAt: string;
};

/**
 * BlockerItem — 障害・詰まり（[database_schema.md §3.4]）
 */
export type BlockerItem = {
  id: string;
  dayNoteId: string;
  text: string;
  /** 任意（要件 7.4「TODOに紐づかない障害も登録できる」）。ON DELETE SET NULL */
  linkedTodoId: string | null;
  /** ノート行障害化時のみ設定。ON DELETE SET NULL */
  sourceNoteLineMetaId: string | null;
  resolved: boolean;
  order: number;
  /** ISO 8601 */
  createdAt: string;
  /** resolved=true のときのみ非null */
  resolvedAt: string | null;
  updatedAt: string;
};

/**
 * Reflection — 振り返り3セクション（[database_schema.md §3.5]）
 * DayNoteと1:1。各セクションは空文字列 DEFAULT。
 */
export type Reflection = {
  id: string;
  dayNoteId: string;
  doneText: string;
  stuckText: string;
  tomorrowActionText: string;
  /** ISO 8601 */
  updatedAt: string;
};

/**
 * NoteEntry — ノート本文（[database_schema.md §3.6]）
 * DayNoteと1:1。MVPでは1つの大きなテキストとして保持（要件 10.6）。
 */
export type NoteEntry = {
  id: string;
  dayNoteId: string;
  body: string;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

/**
 * NoteLineMeta — ノート行変換メタ（[database_schema.md §3.7]）
 * 変換時点の行スナップショットと重複判定用ハッシュを保持。
 */
export type NoteLineMeta = {
  id: string;
  noteEntryId: string;
  /** 変換時点の行番号。参考値であり編集後に正確な位置を保証しない */
  lineNumberAtConversion: number;
  normalizedLineText: string;
  /** sha256(noteEntryId + "\n" + normalizedLineText).slice(0,16) */
  lineHash: string;
  /** 変換時点の原文スナップショット */
  lineText: string;
  convertedToTodoId: string | null;
  convertedToBlockerId: string | null;
  /** Post-MVP用予約。MVPでは常に false */
  convertedToReflection: boolean;
  /** ISO 8601 */
  convertedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * UserSettings — ユーザー設定（[database_schema.md §3.2]）
 * MVPは単一ユーザーのため常に1行。
 */
export type UserSettings = {
  id: string;
  keybindingMode: KeybindingMode;
  vimDefaultState: VimDefaultState;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

/**
 * GET /api/day-notes/:date/full のレスポンス（[api_contract.md §3]）
 * 1日のノート全体。仕事整理・ノート両モードの描画に必要な全データ。
 */
export type DayNoteFull = {
  dayNote: DayNote;
  /** order 昇順 */
  todos: TodoItem[];
  /** order 昇順 */
  blockers: BlockerItem[];
  reflection: Reflection;
  noteEntry: NoteEntry;
  /** 当該ノートエントリの全メタ（変換済みマーク表示用） */
  noteLineMetas: NoteLineMeta[];
};

// ----- 持ち越しAPI（[api_contract.md §10]） -----

/** 持ち越し成功行（[api_contract.md §10]） */
export type CarryOverCarriedItem = {
  /** 持ち越し元TODOのid */
  sourceTodoId: string;
  /** 翌日に新規作成されたTODOのid */
  newTodoId: string;
  /** 翌日の日付（YYYY-MM-DD） */
  nextDayDate: string;
};

/** 持ち越しスキップ行（[api_contract.md §10]）。重複持ち越し時 */
export type CarryOverSkippedItem = {
  /** スキップされた元TODOのid */
  sourceTodoId: string;
  reason: 'DUPLICATE_CARRYOVER';
  /** ユーザー表示用メッセージ */
  message: string;
};

/**
 * POST /api/day-notes/:date/carry-over のレスポンス（[api_contract.md §10]）。
 * 常に HTTP 200（部分成功）。`skipped` は通知表示に使う。
 */
export type CarryOverResult = {
  carried: CarryOverCarriedItem[];
  skipped: CarryOverSkippedItem[];
};

// ----- APIエラー形式（[api_contract.md §1.4/§8]） -----

/** マシン可読エラーコード（SCREAMING_SNAKE_CASE） */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_CONVERSION'
  | 'DUPLICATE_CARRYOVER'
  | 'INTERNAL_ERROR';

/** バリデーションエラーのフィールド単位情報 */
export type ValidationFieldError = {
  field: string;
  message: string;
};

/** 統一エラー応答本体（[api_contract.md §1.4]） */
export type ApiError = {
  error: {
    code: ErrorCode;
    /** ユーザー表示可能な日本語メッセージ */
    message: string;
    /** コードごとの追加情報。VALIDATION_ERROR は fields 配列を置く */
    details?:
      | { fields: ValidationFieldError[] }
      | { existing: { id: string; title?: string; sourceNoteLineMetaId?: string | null } }
      | Record<string, unknown>;
  };
};

/**
 * dayborad ドメイン層
 *
 * ピュアTypeScript。Hono/React に依存しない（[architecture.md §4]）。
 * エンティティ型・ユースケース・変換・持ち越し等の純粋関数を置く。
 *
 * 現状は shared-types のエンティティ型を再エクスポートするスケルトン。
 * 各ドメインロジックは Phase 1 以降で追加する。
 */

export type {
  DayNote,
  TodoItem,
  BlockerItem,
  Reflection,
  NoteEntry,
  NoteLineMeta,
  UserSettings,
  DayNoteFull,
  ViewMode,
  KeybindingMode,
  VimDefaultState,
  TodoStatus,
} from 'shared-types';

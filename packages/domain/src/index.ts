/**
 * dayborad ドメイン層
 *
 * ピュアTypeScript。Hono/React に依存しない（[architecture.md §4]）。
 * エンティティ型・ユースケース・変換・持ち越し等の純粋関数を置く。
 *
 * エンティティ型は shared-types の定義を再エクスポートし、
 * ドメインロジック（純粋関数）を各 Phase で追加する。
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

// ユーティリティ（ピュア関数）
export {
  toLocalDateString,
  addDays,
  todayLocal,
  isValidDateString,
  getWeekdayLabel,
  WEEKDAY_LABELS_JA,
} from './date.js';
export { createId } from './id.js';

// ユースケース（ピュア関数）
export {
  buildNewDayNoteInput,
  buildNewReflectionInput,
  buildNewNoteEntryInput,
  normalizeTheme,
} from './usecases/dayNoteFactory.js';

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

// 自動保存（ピュア関数、[roadmap.md Phase 2]）
export {
  type SaveStatus,
  type SaveEvent,
  transition,
  aggregateStatus,
} from './autosave/saveStateMachine.js';
export { DEBOUNCE_MS, isTimerActive, isSameTarget, shouldFire } from './autosave/debounce.js';
export {
  MAX_RETRIES,
  RETRY_DELAYS_MS,
  RETRIABLE_STATUS,
  type SaveErrorKind,
  isRetriable,
  shouldRetry,
  nextDelayMs,
  isRetryExhausted,
} from './autosave/retry.js';
export {
  type SaveTarget,
  type PendingTarget,
  type PendingSnapshot,
  type TargetPayload,
  type PayloadFor,
  targetKey,
  createEmptySnapshot,
  isSnapshotEmpty,
  upsertTarget,
  removeTarget,
  removeTargets,
  listTargetKeys,
  getTarget,
  pendingKey,
  parsePendingKey,
} from './autosave/pendingSnapshot.js';

// TODO状態遷移（ピュア関数、[roadmap.md Phase 3]）
export { canTransition, toggleDone, shouldSetCompletedAt } from './todo/transitions.js';

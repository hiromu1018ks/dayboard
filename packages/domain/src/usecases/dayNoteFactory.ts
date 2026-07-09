/**
 * DayNote 新規生成・更新の純粋関数（[roadmap.md T-1-07]）
 *
 * [architecture.md §4] の制約「ドメイン層はピュアTS（副作用なし）」に従い、
 * ここでは「生成・更新すべきリソースの入力値（ID・日付・初期値・正規化値）を決定する」
 * 純粋関数のみを置く。実際の DB 書き込み（トランザクション編成）は
 * `packages/repository/src/dayNoteAggregator.ts` が担う。
 *
 * ID 生成関数（`createId`）は外部から注入し、テストで固定化可能にする
 * （[test_strategy.md §7]）。
 */

import type { ViewMode } from 'shared-types';

/**
 * DayNote 新規行の入力値。
 * DB のデフォルト（theme=NULL, lastOpenedMode='work'）をピュア関数で表現する。
 */
export type NewDayNoteInput = {
  id: string;
  date: string; // YYYY-MM-DD
  theme: null;
  lastOpenedMode: ViewMode;
};

/**
 * Reflection 新規行の入力値。空文字3セクション（[database_schema.md §3.5]）。
 */
export type NewReflectionInput = {
  id: string;
  dayNoteId: string;
  doneText: '';
  stuckText: '';
  tomorrowActionText: '';
};

/**
 * NoteEntry 新規行の入力値。body 空文字（[database_schema.md §3.6]）。
 */
export type NewNoteEntryInput = {
  id: string;
  dayNoteId: string;
  body: '';
};

/**
 * 新規 DayNote の入力値を構築する（ピュア）。
 *
 * @param date YYYY-MM-DD
 * @param idGenerator ID 生成関数（デフォルト `createId`）
 */
export function buildNewDayNoteInput(date: string, idGenerator: () => string): NewDayNoteInput {
  return {
    id: idGenerator(),
    date,
    theme: null,
    lastOpenedMode: 'work',
  };
}

/**
 * DayNote に紐づく新規 Reflection の入力値を構築する（ピュア）。
 */
export function buildNewReflectionInput(
  dayNoteId: string,
  idGenerator: () => string,
): NewReflectionInput {
  return {
    id: idGenerator(),
    dayNoteId,
    doneText: '',
    stuckText: '',
    tomorrowActionText: '',
  };
}

/**
 * DayNote に紐づく新規 NoteEntry の入力値を構築する（ピュア）。
 */
export function buildNewNoteEntryInput(
  dayNoteId: string,
  idGenerator: () => string,
): NewNoteEntryInput {
  return {
    id: idGenerator(),
    dayNoteId,
    body: '',
  };
}

/**
 * theme を DB 格納値へ正規化する（[api_contract.md §4]）。
 *
 * 空文字列は未入力扱いで `null` に正規化する。`null`・undefined は `null` のまま。
 * この関数が theme 正規化の **単一の真実源** であり、リポジトリ・API 層は
 * これを呼び出してDB値を決定する（重複実装を避ける）。
 */
export function normalizeTheme(theme: string | null | undefined): string | null {
  if (theme === null || theme === undefined) return null;
  return theme === '' ? null : theme;
}

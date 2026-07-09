/**
 * 対象別 Saver 実装（[roadmap.md T-2-09]）
 *
 * 各保存対象のサーバーAPI呼び出しを SaverResult 形式へ変換する。
 * useAutosave は Saver の実装詳細（どのAPIを叩くか）に依存しない。
 *
 * Phase 2: テーマ（dayNote:theme）
 * Phase 3: TODO/Blocker（既存 id の PATCH）、Reflection、並替（todoOrder/blockerOrder）
 * Phase 4: NoteEntry 本文（追加予定）
 */

import type { Saver, SaverError } from './types.js';
import {
  ApiClientError,
  patchBlocker,
  patchDayNote,
  patchReflection,
  patchTodo,
  reorderBlockers,
  reorderTodos,
} from '../api/client.js';

/**
 * テーマ保存の Saver（[roadmap.md T-2-09]）。
 *
 * PATCH /api/day-notes/:date の theme のみ送信（[api_contract.md §4]）。
 * theme は空文字→null 正規化が API 側で行われるため、そのまま送信する。
 *
 * @param date  YYYY-MM-DD
 */
export function createThemeSaver(date: string): Saver {
  return async (payload) => {
    const theme = payload as string | null;
    try {
      await patchDayNote(date, { theme });
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * ApiClientError / その他のエラーを SaverError へ変換する共通ヘルパ。
 */
export function saverError(err: unknown): SaverError {
  if (err instanceof ApiClientError) {
    return { ok: false, status: err.status, code: err.code, message: err.message };
  }
  // ネットワークエラー（fetch そのものの失敗）は status 未定義
  if (err instanceof TypeError) {
    // fetch が接続失敗で TypeError を投げる
    return { ok: false, status: undefined, code: 'NETWORK_ERROR', message: err.message };
  }
  return {
    ok: false,
    status: undefined,
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
  };
}

// ============================================================================
// Phase 3: TODO / Blocker / Reflection / Order
// ============================================================================

/**
 * TODO 本文・状態保存の Saver（[roadmap.md T-3-10]）。
 *
 * 対象別 payload（[pendingSnapshot.ts TargetPayload['todo']]）:
 *   { title: string; status?: TodoStatus }
 * PATCH /api/todos/:id（[api_contract.md §5]）。
 *
 * @param id TodoItem ID
 */
export function createTodoSaver(id: string): Saver {
  return async (payload) => {
    const data = payload as { title?: string; status?: 'todo' | 'done' | 'carried' };
    try {
      await patchTodo(id, data);
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * Blocker 本文・解消・紐付け保存の Saver（[roadmap.md T-3-12]）。
 *
 * 対象別 payload:
 *   { text?: string; resolved?: boolean; linkedTodoId?: string | null }
 * PATCH /api/blockers/:id（[api_contract.md §6]）。
 *
 * @param id BlockerItem ID
 */
export function createBlockerSaver(id: string): Saver {
  return async (payload) => {
    const data = payload as {
      text?: string;
      resolved?: boolean;
      linkedTodoId?: string | null;
    };
    try {
      await patchBlocker(id, data);
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * 振り返り3セクション保存の Saver（[roadmap.md T-3-13]）。
 *
 * 対象別 payload:
 *   { doneText?: string; stuckText?: string; tomorrowActionText?: string }
 * PATCH /api/day-notes/:date/reflection（[api_contract.md §7]）。
 *
 * @param date YYYY-MM-DD
 */
export function createReflectionSaver(date: string): Saver {
  return async (payload) => {
    const data = payload as {
      doneText?: string;
      stuckText?: string;
      tomorrowActionText?: string;
    };
    try {
      await patchReflection(date, data);
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * TODO 並替保存の Saver（[roadmap.md T-3-10]）。
 *
 * 対象別 payload: string[]（orderedIds）
 * POST /api/day-notes/:date/todos/reorder（[api_contract.md §5]）。
 *
 * @param date YYYY-MM-DD
 */
export function createTodoOrderSaver(date: string): Saver {
  return async (payload) => {
    const orderedIds = payload as string[];
    try {
      await reorderTodos(date, orderedIds);
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * Blocker 並替保存の Saver（[roadmap.md T-3-12]）。
 *
 * 対象別 payload: string[]（orderedIds）
 * POST /api/day-notes/:date/blockers/reorder（[api_contract.md §6]）。
 *
 * @param date YYYY-MM-DD
 */
export function createBlockerOrderSaver(date: string): Saver {
  return async (payload) => {
    const orderedIds = payload as string[];
    try {
      await reorderBlockers(date, orderedIds);
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

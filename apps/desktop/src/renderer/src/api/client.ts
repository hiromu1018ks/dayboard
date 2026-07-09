/**
 * API クライアント（[roadmap.md T-1-12]）
 *
 * Electron main が preload 経由で注入した `window.__API_BASE_URL__` を取得し、
 * DayNote 系エンドポイントへの fetch ラッパーを提供する
 * （[architecture.md §6.1]）。
 *
 * 開発時の分離起動（ブラウザ表示）では `window.__API_BASE_URL__` が未注入のため、
 * `import.meta.env.VITE_API_BASE_URL` にフォールバックする。
 */

import type { DayNote, DayNoteFull, ViewMode } from 'shared-types';

/**
 * API ベースURLを取得する。
 * App.tsx から抽出・共通化（[roadmap.md T-1-12]）。
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__;
  }
  const fallback = import.meta.env.VITE_API_BASE_URL;
  if (fallback) return fallback;
  // 最終フォールバック（開発時の electron-vite dev）
  return 'http://127.0.0.1:8787/api';
}

/**
 * fetch の共通エラーハンドリング。
 * API の統一エラー形式（[api_contract.md §1.4]）をパースして投げる。
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** レスポンスがエラー形式の場合、ApiClientError を投げる。 */
async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiClientError('INTERNAL_ERROR', res.status, `HTTP ${res.status}`);
  }
  // { error: { code, message, details? } } 形式を想定
  const err = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
  if (err && typeof err.code === 'string' && typeof err.message === 'string') {
    throw new ApiClientError(err.code, res.status, err.message, err.details);
  }
  throw new ApiClientError('INTERNAL_ERROR', res.status, `HTTP ${res.status}`);
}

/**
 * GET /api/day-notes/:date/full — 指定日の DayNoteFull（存在しない場合は自動生成、AC-01）。
 */
export async function fetchDayNoteFull(date: string): Promise<DayNoteFull> {
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/full`);
  await assertOk(res);
  return (await res.json()) as DayNoteFull;
}

/**
 * GET /api/day-notes/today/full — 今日の DayNoteFull。
 */
export async function fetchTodayDayNoteFull(): Promise<DayNoteFull> {
  const res = await fetch(`${getApiBaseUrl()}/day-notes/today/full`);
  await assertOk(res);
  return (await res.json()) as DayNoteFull;
}

/**
 * PATCH /api/day-notes/:date — theme/lastOpenedMode の部分更新。
 * theme が空文字列の場合は null に正規化される（[api_contract.md §4]）。
 * レスポンスは更新後の DayNote のみ（[api_contract.md §4]）。
 *
 * 注意: テーマの自動保存接続は Phase 2（T-2-09）。Phase 1 では client 関数のみ提供。
 */
export async function patchDayNote(
  date: string,
  patch: { theme?: string | null; lastOpenedMode?: ViewMode },
): Promise<DayNote> {
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return (await res.json()) as DayNote;
}

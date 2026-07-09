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

import type {
  BlockerItem,
  DayNote,
  DayNoteFull,
  NoteEntry,
  Reflection,
  TodoItem,
  ViewMode,
} from 'shared-types';

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

// ============================================================================
// Phase 3: TODO / Blocker / Reflection
// ============================================================================

/** UUID を生成（POST 系の Idempotency-Key 用、[autosave_spec.md §8.2]）。 */
function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // フォールバック（Math.random ベース、実用上の一意性）
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** POST 用のヘッダーを構築（Idempotency-Key 含む）。 */
function postHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return headers;
}

/** TODO のステータス（'todo' | 'done' | 'carried'）。shared-types から推論。 */
type TodoStatus = TodoItem['status'];

/** POST /api/day-notes/:date/todos — TODO 追加（[api_contract.md §5]）。 */
export async function postTodo(date: string, title: string): Promise<TodoItem> {
  const key = createIdempotencyKey();
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/todos`, {
    method: 'POST',
    headers: postHeaders(key),
    body: JSON.stringify({ title }),
  });
  await assertOk(res);
  return (await res.json()) as TodoItem;
}

/** PATCH /api/todos/:id — TODO の title/status 更新（[api_contract.md §5]）。 */
export async function patchTodo(
  id: string,
  patch: { title?: string; status?: TodoStatus },
): Promise<TodoItem> {
  const res = await fetch(`${getApiBaseUrl()}/todos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return (await res.json()) as TodoItem;
}

/** POST /api/day-notes/:date/todos/reorder — TODO 並替（[api_contract.md §5]）。 */
export async function reorderTodos(date: string, orderedIds: string[]): Promise<TodoItem[]> {
  const res = await fetch(
    `${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/todos/reorder`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    },
  );
  await assertOk(res);
  return (await res.json()) as TodoItem[];
}

/** DELETE /api/todos/:id — TODO 削除（[api_contract.md §5]、204）。 */
export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/todos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await assertOk(res);
}

/** POST /api/day-notes/:date/blockers — 障害追加（[api_contract.md §6]）。 */
export async function postBlocker(
  date: string,
  text: string,
  linkedTodoId: string | null = null,
): Promise<BlockerItem> {
  const key = createIdempotencyKey();
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/blockers`, {
    method: 'POST',
    headers: postHeaders(key),
    body: JSON.stringify({ text, linkedTodoId }),
  });
  await assertOk(res);
  return (await res.json()) as BlockerItem;
}

/** PATCH /api/blockers/:id — 障害の text/resolved/linkedTodoId 更新（[api_contract.md §6]）。 */
export async function patchBlocker(
  id: string,
  patch: { text?: string; resolved?: boolean; linkedTodoId?: string | null },
): Promise<BlockerItem> {
  const res = await fetch(`${getApiBaseUrl()}/blockers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return (await res.json()) as BlockerItem;
}

/** POST /api/day-notes/:date/blockers/reorder — 障害並替（[api_contract.md §6]）。 */
export async function reorderBlockers(date: string, orderedIds: string[]): Promise<BlockerItem[]> {
  const res = await fetch(
    `${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/blockers/reorder`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    },
  );
  await assertOk(res);
  return (await res.json()) as BlockerItem[];
}

/** DELETE /api/blockers/:id — 障害削除（[api_contract.md §6]、204）。 */
export async function deleteBlocker(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/blockers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await assertOk(res);
}

/** PATCH /api/day-notes/:date/reflection — 振り返り3セクション部分更新（[api_contract.md §7]）。 */
export async function patchReflection(
  date: string,
  patch: { doneText?: string; stuckText?: string; tomorrowActionText?: string },
): Promise<Reflection> {
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/reflection`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return (await res.json()) as Reflection;
}

/** PATCH /api/day-notes/:date/note-entry — ノート本文の全文一括更新（[api_contract.md §7]）。 */
export async function patchNoteEntry(date: string, patch: { body?: string }): Promise<NoteEntry> {
  const res = await fetch(`${getApiBaseUrl()}/day-notes/${encodeURIComponent(date)}/note-entry`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await assertOk(res);
  return (await res.json()) as NoteEntry;
}

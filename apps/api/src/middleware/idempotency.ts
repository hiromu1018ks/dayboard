/**
 * POST 重複排除ミドルウェア（[roadmap.md T-2-14]）
 *
 * [autosave_spec.md §8.2] のリクエストID ベース60秒重複排除。
 * 自動保存のリトライで POST（TODO追加等）が2回届いた場合、2回目を作成しない。
 *
 * 設計:
 * - リクエストID は `Idempotency-Key` ヘッダ（推奨、HTTP標準慣行）で受け取る
 * - 同じリクエストID を60秒以内に受信した場合、2回目は前回と同じレスポンスを返す
 * - インメモリ（Map）で管理。MVP は単一ユーザー・単一プロセス（[architecture.md C7]）のため永続化不要
 * - GET/PATCH/DELETE 等の冪等メソッドには適用しない（POST のみ）
 *
 * 注意: Phase 2 ではミドルウェアと記憶域のみ実装。実際の POST エンドポイント
 * （TODO追加等）とリクエストID 付与は Phase 3 で行う。ここでは基盤を用意する。
 *
 * [autosave_spec.md §8.2]: ../../../../docs/autosave_spec.md
 */

import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { MiddlewareHandler } from 'hono';

/**
 * 重複排除の有効期間（ミリ秒）。[autosave_spec.md §8.2] の60秒。
 */
const IDEMPOTENCY_WINDOW_MS = 60_000;

/**
 * キャッシュされたレスポンス。
 * 同じリクエストID の2回目には、この status + body + contentType を返す。
 */
type CachedResponse = {
  status: ContentfulStatusCode;
  body: unknown;
  contentType: string;
  expiresAt: number;
};

/**
 * リクエストID → キャッシュ済みレスポンス のマップ。
 * 単一プロセス前提（[architecture.md C7]）。プロセス再起動でクリアされるが、
 * 60秒窓のため実用上問題ない。
 */
const cache = new Map<string, CachedResponse>();

/**
 * 期限切れエントリを定期的に掃除（メモリリーク防止）。
 * ミドルウェア呼び出しのたびに呼ぶと重いため、簡易な間引く実装。
 */
let lastCleanup = 0;
function cleanupIfNeeded(now: number): void {
  // 5分に1回程度
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

/**
 * モジュール読み込み時に定期クリーンアップタイマーを起動（メモリリーク防止）。
 *
 * cleanupIfNeeded はリクエスト受信時しか発火しないため、POST リクエストが疎な
 * 長期間運用でもエントリが蓄積しないよう、10分ごとに強制クリーンアップする。
 * タイマーはプロセス終了時に自動的に破棄される（Node の UnrefTimer 相当）。
 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }, 10 * 60_000);
  // プロセス終了をブロックしないよう unref（Node 環境のみ）
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}
ensureCleanupTimer();

/**
 * レスポンスをキャッシュし、次回以降の重複リクエストへ再利用する。
 * エンドポイント側で成功レスポンスを返す際に呼ぶ。
 */
export function cacheIdempotentResponse(
  requestId: string,
  status: ContentfulStatusCode,
  body: unknown,
  contentType = 'application/json',
): void {
  cache.set(requestId, {
    status,
    body,
    contentType,
    expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS,
  });
  cleanupIfNeeded(Date.now());
}

/**
 * POST 重複排除ミドルウェア。
 *
 * `Idempotency-Key` ヘッダを持つ POST リクエストについて:
 * - 過去60秒以内に同じキーを受けていれば、キャッシュ済みレスポンスを返す（2回目の作成を防止）
 * - 初回は次へ処理を委譲。エンドポイント側で cacheIdempotentResponse を呼んで結果を記憶する
 *
 * ヘッダがない POST、または非POSTメソッドは素通し（重複排除しない）。
 *
 * 使用例:
 *   app.use('/api/day-notes/:date/todos', idempotencyMiddleware)
 *   // エンドポイント内で成功時: cacheIdempotentResponse(requestId, 201, created)
 */
export const idempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  // POST のみ対象（PATCH/DELETE は冪等、GET は副作用なし）
  if (c.req.method !== 'POST') {
    await next();
    return;
  }

  const requestId = c.req.header('Idempotency-Key');
  if (!requestId) {
    // ヘッダなしは重複排除しない（後方互換）
    await next();
    return;
  }

  cleanupIfNeeded(Date.now());

  const cached = cache.get(requestId);
  if (cached && cached.expiresAt > Date.now()) {
    // 重複リクエスト: キャッシュ済みレスポンスを返す（2回目を作成しない）
    return c.body(
      typeof cached.body === 'string' ? cached.body : JSON.stringify(cached.body),
      cached.status,
      { 'Content-Type': cached.contentType },
    );
  }

  // 初回（または期限切れ）: 処理を委譲
  await next();
};

/**
 * テスト用: キャッシュをクリア。
 */
export function clearIdempotencyCache(): void {
  cache.clear();
}

/**
 * テスト用: キャッシュのエントリ数を取得。
 */
export function idempotencyCacheSize(): number {
  return cache.size;
}

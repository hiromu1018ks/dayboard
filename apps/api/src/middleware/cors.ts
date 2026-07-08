/**
 * CORS 設定
 *
 * [architecture.md §7] の CORS 契約に基づく。
 *
 * - 開発時: Vite dev server の Origin（localhost:5173 / 127.0.0.1:5173）を許可
 * - パッケージ版: カスタムプロトコル `app://dayborad` の固定 Origin のみ許可
 * - `Origin: null`（file://, data:, サンドボックスiframe）は許可しない
 * - PATCH/POST はプリフライトを伴うため、許可メソッド・ヘッダを明示
 */

import { cors } from 'hono/cors';

/** 許可するOriginの固定リスト */
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'app://dayborad'];

/**
 * Origin が許可リストに含まれるか判定する。
 * `null` や未知の Origin は許可しない。
 */
function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * CORS ミドルウェア。
 * リクエストの Origin が許可リストにあれば `Access-Control-Allow-Origin` に反映し、
 * それ以外は許可しない（Origin を返さない）。
 */
export const corsMiddleware = cors({
  origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 600,
});

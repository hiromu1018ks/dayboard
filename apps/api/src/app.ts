/**
 * Hono アプリ本体
 *
 * 全ルートを `/api` プレフィックスでマウントする。
 * CORS（[architecture.md §7]）と統一エラーハンドラ（[api_contract.md §1.4]）を適用。
 *
 * Electron main プロセスからも、単独起動（`pnpm dev:api`）からも利用する。
 */

import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';

export function createApp(): Hono {
  const app = new Hono();

  // ミドルウェア
  app.use('*', corsMiddleware);
  app.onError(errorHandler);

  // ルートマウント（`/api` プレフィックス）
  app.route('/api', healthRoutes);

  return app;
}

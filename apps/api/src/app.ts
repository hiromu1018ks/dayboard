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
import { blockerRoutes } from './routes/blockers.js';
import { carryOverRoutes } from './routes/carryOver.js';
import { convertRoutes } from './routes/convert.js';
import { dayNoteRoutes } from './routes/dayNotes.js';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { todoRoutes } from './routes/todos.js';

export function createApp(): Hono {
  const app = new Hono();

  // ミドルウェア
  app.use('*', corsMiddleware);
  app.onError(errorHandler);

  // ルートマウント（`/api` プレフィックス）
  app.route('/api', healthRoutes);
  // dayNoteRoutes / convertRoutes / carryOverRoutes は同じ /api/day-notes プレフィックスを共有。
  // 各 :date/convert/*, :date/carry-over は dayNoteRoutes と衝突しないため併存可能。
  app.route('/api/day-notes', dayNoteRoutes);
  app.route('/api/day-notes', convertRoutes);
  app.route('/api/day-notes', carryOverRoutes);
  app.route('/api/todos', todoRoutes);
  app.route('/api/blockers', blockerRoutes);
  app.route('/api/settings', settingsRoutes);

  return app;
}

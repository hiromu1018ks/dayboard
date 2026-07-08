/**
 * ヘルスチェックエンドポイント
 *
 * `GET /api/health` → `200 { "status": "ok" }`
 * 起動確認・死活監視用（[roadmap.md T-0-07]）。
 */

import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

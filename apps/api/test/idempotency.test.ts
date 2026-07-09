/**
 * POST 重複排除ミドルウェアの Unit テスト（[roadmap.md T-2-14]）
 *
 * [autosave_spec.md §8.2] のリクエストID ベース60秒重複排除を検証する。
 * DB 不要。Hono app を直接構築してミドルウェアの挙動を確認。
 *
 * 検証観点:
 * - 同じ Idempotency-Key の2回目 POST はキャッシュ済みレスポンスを返す（作成されない）
 * - 異なるキーは独立して処理される
 * - ヘッダなしは素通し（重複排除しない）
 * - GET/PATCH/DELETE は重複排除対象外
 *
 * [autosave_spec.md §8.2]: ../../docs/autosave_spec.md
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheIdempotentResponse,
  clearIdempotencyCache,
  idempotencyCacheSize,
  idempotencyMiddleware,
} from '../src/middleware/idempotency.js';

/**
 * テスト用 app と作成カウントの組。
 * createCount は POST ハンドラが実際に実行された回数（重複排除で抑制されたか判定）。
 */
function createApp(): { app: Hono; getCreateCount: () => number } {
  let createCount = 0;
  const app = new Hono();
  app.use('/items', idempotencyMiddleware);
  app.post('/items', async (c) => {
    const requestId = c.req.header('Idempotency-Key') ?? 'none';
    cacheIdempotentResponse(requestId, 201, { id: requestId, created: true });
    // 実際の「作成」相当としてカウント（副作用）
    createCount += 1;
    return c.json({ id: requestId, created: true }, 201);
  });
  return { app, getCreateCount: () => createCount };
}

beforeEach(() => {
  clearIdempotencyCache();
});

describe('idempotencyMiddleware: 同じキーの重複排除', () => {
  it('同じ Idempotency-Key の2回目 POST は作成されない', async () => {
    const { app, getCreateCount } = createApp();
    const headers = { 'Idempotency-Key': 'req-001', 'Content-Type': 'application/json' };

    const res1 = await app.request('/items', { method: 'POST', headers });
    expect(res1.status).toBe(201);
    expect(getCreateCount()).toBe(1);

    const res2 = await app.request('/items', { method: 'POST', headers });
    expect(res2.status).toBe(201);
    // 2回目はキャッシュから返るため作成カウント増加なし
    expect(getCreateCount()).toBe(1);
  });

  it('2回目のレスポンスボディは1回目と同じ', async () => {
    const { app } = createApp();
    const headers = { 'Idempotency-Key': 'req-002', 'Content-Type': 'application/json' };

    const res1 = await app.request('/items', { method: 'POST', headers });
    const body1 = await res1.json();

    const res2 = await app.request('/items', { method: 'POST', headers });
    const body2 = await res2.json();

    expect(body2).toEqual(body1);
  });
});

describe('idempotencyMiddleware: 異なるキー', () => {
  it('異なる Idempotency-Key は独立して作成される', async () => {
    const { app, getCreateCount } = createApp();

    await app.request('/items', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'req-a' },
    });
    await app.request('/items', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'req-b' },
    });

    expect(getCreateCount()).toBe(2);
  });
});

describe('idempotencyMiddleware: ヘッダなし・非POST', () => {
  it('Idempotency-Key ヘッダなしは重複排除しない（毎回作成）', async () => {
    const { app, getCreateCount } = createApp();

    await app.request('/items', { method: 'POST' });
    await app.request('/items', { method: 'POST' });

    expect(getCreateCount()).toBe(2);
  });

  it('GET は重複排除対象外（ミドルウェアが処理しない）', async () => {
    const app = new Hono();
    app.use('/items', idempotencyMiddleware);
    app.get('/items', (c) => c.json({ ok: true }));
    app.post('/items', (c) => c.json({ created: true }, 201));

    // GET は POST ハンドラを叩かない（この app ではカウントを持たない）
    const getRes = await app.request('/items', { method: 'GET' });
    expect(getRes.status).toBe(200);

    // POST はヘッダなしで毎回応答
    const postRes1 = await app.request('/items', { method: 'POST' });
    const postRes2 = await app.request('/items', { method: 'POST' });
    expect(postRes1.status).toBe(201);
    expect(postRes2.status).toBe(201);
  });
});

describe('idempotencyMiddleware: キャッシュ管理', () => {
  it('cacheIdempotentResponse でエントリが増える', () => {
    expect(idempotencyCacheSize()).toBe(0);
    cacheIdempotentResponse('manual-1', 201, { id: 'manual-1' });
    expect(idempotencyCacheSize()).toBe(1);
    cacheIdempotentResponse('manual-2', 201, { id: 'manual-2' });
    expect(idempotencyCacheSize()).toBe(2);
  });

  it('clearIdempotencyCache で全削除', () => {
    cacheIdempotentResponse('x', 201, {});
    cacheIdempotentResponse('y', 201, {});
    expect(idempotencyCacheSize()).toBe(2);
    clearIdempotencyCache();
    expect(idempotencyCacheSize()).toBe(0);
  });
});

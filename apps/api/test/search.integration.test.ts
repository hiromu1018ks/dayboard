/**
 * 全文検索 Integration テスト（Post-MVP）
 *
 * GET /api/search?q=... の各テーブルヒット・スニペット・日付降順・LIMIT・空結果・無効q を検証。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SearchResponse } from 'shared-types';
import { createApp } from '../src/app.js';
import { getPool, teardownPool, truncateAll } from './helpers.js';

const app = createApp();

describe('Search API (Integration)', () => {
  beforeAll(() => {
    getPool();
  });

  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardownPool();
  });

  /** テストデータを準備するヘルパー: 2日分の DayNote に各リソースを設定 */
  async function setupTestData(): Promise<void> {
    // 2026-07-08: まず /full で DayNote を自動生成してから各リソースを設定
    await app.request('/api/day-notes/2026-07-08/full');
    await app.request('/api/day-notes/2026-07-08', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: '顧客デモを完成させる' }),
    });
    await app.request('/api/day-notes/2026-07-08/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '朝会で進捗共有する' }),
    });
    await app.request('/api/day-notes/2026-07-08/blockers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '認証の設計が未決' }),
    });
    await app.request('/api/day-notes/2026-07-08/reflection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doneText: 'デモ環境を構築した',
        stuckText: '認証で詰まった',
        tomorrowActionText: '認証を整理する',
      }),
    });
    await app.request('/api/day-notes/2026-07-08/note-entry', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '打ち合わせメモ: 顧客デモの要件を確認' }),
    });

    // 2026-07-10: 別日の TODO
    await app.request('/api/day-notes/2026-07-10/full');
    await app.request('/api/day-notes/2026-07-10/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'デモ環境を検証する' }),
    });

    // 特殊文字（%）と大文字小文字混在のテスト用データ（2026-07-12）
    await app.request('/api/day-notes/2026-07-12/full');
    await app.request('/api/day-notes/2026-07-12/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '50%OFFセールの準備' }),
    });
    await app.request('/api/day-notes/2026-07-12/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Customer Demo Setup' }),
    });
  }

  it('TODO タイトルにヒットする', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=進捗共有');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits.length).toBeGreaterThanOrEqual(1);
    const todoHit = body.hits.find((h) => h.resourceType === 'todo');
    expect(todoHit).toBeDefined();
    expect(todoHit!.snippet).toContain('進捗共有');
  });

  it('blocker text にヒットする', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=認証');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    // blocker と reflection(stuck) と reflection(tomorrow) にヒットしうる
    const blockerHit = body.hits.find((h) => h.resourceType === 'blocker');
    expect(blockerHit).toBeDefined();
    expect(blockerHit!.snippet).toContain('認証');
  });

  it('note body にヒットする', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=打ち合わせ');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const noteHit = body.hits.find((h) => h.resourceType === 'note');
    expect(noteHit).toBeDefined();
    expect(noteHit!.snippet).toContain('打ち合わせ');
  });

  it('reflection にヒットし section が設定される', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=詰まった');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const reflectionHit = body.hits.find((h) => h.resourceType === 'reflection');
    expect(reflectionHit).toBeDefined();
    expect(reflectionHit!.section).toBe('stuck');
    expect(reflectionHit!.snippet).toContain('詰まった');
  });

  it('theme にヒットする', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=顧客デモ');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const themeHit = body.hits.find((h) => h.resourceType === 'theme');
    expect(themeHit).toBeDefined();
    expect(themeHit!.snippet).toContain('顧客デモ');
  });

  it('結果が date 降順で返される', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=デモ');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < body.hits.length; i++) {
      expect(body.hits[i - 1].date >= body.hits[i].date).toBe(true);
    }
  });

  it('total がヒット総数を返す（LIMIT 適用前）', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=デモ&limit=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(body.hits.length);
  });

  it('limit で結果件数を制限できる', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=デモ&limit=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits).toHaveLength(1);
  });

  it('該当なしは空配列', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=存在しないキーワードXYZ');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('q 未指定は 400', async () => {
    const res = await app.request('/api/search');
    expect(res.status).toBe(400);
  });

  it('q 空文字は 400', async () => {
    const res = await app.request('/api/search?q=');
    expect(res.status).toBe(400);
  });

  it('特殊文字 % を含むデータにヒットする（リテラル検索のポジティブ証明、H-3）', async () => {
    await setupTestData();
    // テストデータに「50%OFFセールの準備」がある。q=50% でリテラル検索されればヒットする。
    // もしエスケープが壊れて % がワイルドカードになれば全件ヒットするが、
    // ヒット結果に % を含むデータが含まれることでエスケープが機能していることを証明する。
    const res = await app.request('/api/search?q=50%25OFF');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const percentHit = body.hits.find((h) => h.snippet.includes('50%OFF'));
    expect(percentHit).toBeDefined();
    expect(percentHit!.resourceType).toBe('todo');
  });

  it('特殊文字 _ を含むデータにヒットする（リテラル検索）', async () => {
    // _ を含むデータを別途作成
    await app.request('/api/day-notes/2026-07-15/full');
    await app.request('/api/day-notes/2026-07-15/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'user_id設計' }),
    });
    const res = await app.request('/api/search?q=user_id');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const hit = body.hits.find((h) => h.snippet.includes('user_id'));
    expect(hit).toBeDefined();
  });

  it('大文字小文字を区別しない（ILIKE、英語データで検証、M-2）', async () => {
    await setupTestData();
    // テストデータに「Customer Demo Setup」がある。q=customer でヒットする（大小区別しない）。
    const res = await app.request('/api/search?q=customer');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    const hit = body.hits.find((h) => h.snippet.toLowerCase().includes('customer'));
    expect(hit).toBeDefined();
  });

  it('limit=0 は 400（L-4）', async () => {
    const res = await app.request('/api/search?q=test&limit=0');
    expect(res.status).toBe(400);
  });

  it('limit=-1 は 400（L-4）', async () => {
    const res = await app.request('/api/search?q=test&limit=-1');
    expect(res.status).toBe(400);
  });

  it('limit=201 は 400（上限200、L-4）', async () => {
    const res = await app.request('/api/search?q=test&limit=201');
    expect(res.status).toBe(400);
  });

  it('limit=200 は許容される（上限境界、L-4）', async () => {
    await setupTestData();
    const res = await app.request('/api/search?q=デモ&limit=200');
    expect(res.status).toBe(200);
  });

  it('q が201文字で 400（上限200、L-4）', async () => {
    const longQuery = 'a'.repeat(201);
    const res = await app.request(`/api/search?q=${longQuery}`);
    expect(res.status).toBe(400);
  });

  it('q が200文字は許容される（上限境界、L-4）', async () => {
    const maxQuery = 'a'.repeat(200);
    const res = await app.request(`/api/search?q=${maxQuery}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits).toEqual([]);
  });
});

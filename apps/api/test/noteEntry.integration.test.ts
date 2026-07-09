/**
 * NoteEntry 系 Integration テスト（[roadmap.md T-4-02]）
 *
 * [test_strategy.md §4.2]: Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ。
 *
 * 前提: DATABASE_URL=postgres://...@localhost:5432/dayborad_test、マイグレーション済み。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DayNoteFull, NoteEntry } from 'shared-types';
import { createApp } from '../src/app.js';
import { getPool, truncateAll, teardownPool } from './helpers.js';

const app = createApp();

async function setupDayNote(date = '2026-07-08'): Promise<DayNoteFull> {
  const res = await app.request(`/api/day-notes/${date}/full`);
  expect(res.status).toBe(200);
  return (await res.json()) as DayNoteFull;
}

describe('NoteEntry API (Integration)', () => {
  beforeAll(() => {
    getPool();
  });

  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardownPool();
  });

  describe('PATCH /api/day-notes/:date/note-entry', () => {
    it('本文を更新できる（全文一括）', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '10:00 A社定例\n- 宿題：単価表を確認' }),
      });
      expect(res.status).toBe(200);
      const noteEntry = (await res.json()) as NoteEntry;
      expect(noteEntry.body).toBe('10:00 A社定例\n- 宿題：単価表を確認');
    });

    it('空文字で本文をクリアできる', async () => {
      await setupDayNote();
      // 一度本文を設定
      await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '何か書いた' }),
      });
      // 空文字でクリア
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '' }),
      });
      expect(res.status).toBe(200);
      const noteEntry = (await res.json()) as NoteEntry;
      expect(noteEntry.body).toBe('');
    });

    it('改行を含む自由テキストを保存できる', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: '10:00 A社定例\n\n- 決定事項：来週までに見積提出\n- 宿題：単価表を確認\n',
        }),
      });
      const noteEntry = (await res.json()) as NoteEntry;
      expect(noteEntry.body).toBe(
        '10:00 A社定例\n\n- 決定事項：来週までに見積提出\n- 宿題：単価表を確認\n',
      );
    });

    it('存在しない date への更新は NOT_FOUND (404)', async () => {
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'テスト' }),
      });
      expect(res.status).toBe(404);
    });

    it('空ボディは何も更新せず 200（現状維持）', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const noteEntry = (await res.json()) as NoteEntry;
      expect(noteEntry.body).toBe('');
    });

    it('date 形式不正は VALIDATION_ERROR (400)', async () => {
      const res = await app.request('/api/day-notes/not-a-date/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'テスト' }),
      });
      expect(res.status).toBe(400);
    });

    it('未知フィールドは VALIDATION_ERROR (400、strict)', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unknownField: 'value' }),
      });
      expect(res.status).toBe(400);
    });

    it('50000文字超は VALIDATION_ERROR (400、上限超過)', async () => {
      await setupDayNote();
      const over = 'あ'.repeat(50001);
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: over }),
      });
      expect(res.status).toBe(400);
    });

    it('50000文字ちょうどは受理される', async () => {
      await setupDayNote();
      const exact = 'あ'.repeat(50000);
      const res = await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: exact }),
      });
      expect(res.status).toBe(200);
      const noteEntry = (await res.json()) as NoteEntry;
      expect(noteEntry.body.length).toBe(50000);
    });
  });

  describe('GET /api/day-notes/:date/full に NoteEntry が含まれる', () => {
    it('更新した本文が取得できる', async () => {
      await setupDayNote();
      await app.request('/api/day-notes/2026-07-08/note-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '13:30 田中さんと会話' }),
      });

      const res = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await res.json()) as DayNoteFull;
      expect(full.noteEntry.body).toBe('13:30 田中さんと会話');
    });

    it('自動生成時の NoteEntry は空文字', async () => {
      await setupDayNote();
      const res = await app.request('/api/day-notes/2026-07-08/full');
      const full = (await res.json()) as DayNoteFull;
      expect(full.noteEntry.body).toBe('');
    });
  });
});

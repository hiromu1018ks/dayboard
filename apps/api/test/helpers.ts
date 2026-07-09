/**
 * Integration テスト用ヘルパー
 *
 * 各テストの前にテーブルを TRUNCATE して隔離する（[test_strategy.md §4.1]）。
 * 前提: DATABASE_URL にテスト用DB（dayborad_test）、マイグレーション済み。
 */

import { getPool as repoGetPool, closePool } from 'repository';

/** 接続プールを取得（テストから直接使えるよう再エクスポート）。 */
export const getPool = repoGetPool;

/**
 * 全データテーブルを TRUNCATE CASCADE で空にする。
 * マイグレーション状態・スキーマは保持。各テストの beforeEach で呼ぶ。
 *
 * user_settings はテストで必要ないため含めない（シード行があっても影響しない）。
 */
export async function truncateAll(): Promise<void> {
  const pool = repoGetPool();
  await pool.query(
    `TRUNCATE TABLE
       note_line_metas,
       note_entries,
       reflections,
       blocker_items,
       todo_items,
       day_notes
     RESTART IDENTITY CASCADE`,
  );
}

/** テストスイート終了時に接続プールを閉じる。afterAll で呼ぶ。 */
export async function teardownPool(): Promise<void> {
  await closePool();
}

/**
 * Integration テスト用ヘルパー
 *
 * 各テストの前にテーブルを空にして隔離する（[test_strategy.md §4.1]）。
 * 前提: DATABASE_URL が SQLite ファイルを指し、マイグレーション済みであること。
 *       （CI では一時ファイル、ローカルでは dayborad_test.db 等）
 *
 * SQLite は TRUNCATE を持たないため DELETE で代用する。また ON DELETE CASCADE が
 * 有効（PRAGMA foreign_keys = ON）なので、親（day_notes）から消せば子も伝播するが、
 * 確実を期すため子テーブルから順に消す。autoincrement を使っていないため
 * sqlite_sequence のリセットは不要。
 */

import { getPool as repoGetPool, closePool } from 'repository';

/** 接続クライアントを取得（テストから直接使えるよう再エクスポート）。 */
export const getPool = repoGetPool;

/**
 * 全データテーブルを空にする。
 * マイグレーション状態・スキーマは保持。各テストの beforeEach で呼ぶ。
 *
 * user_settings はテストで必要ないため含めない（シード行があっても影響しない）。
 */
export async function truncateAll(): Promise<void> {
  const client = repoGetPool();
  for (const table of [
    'note_line_metas',
    'note_entries',
    'reflections',
    'blocker_items',
    'todo_items',
    'day_notes',
  ]) {
    await client.execute(`DELETE FROM ${table}`);
  }
}

/** テストスイート終了時に接続クライアントを閉じる。afterAll で呼ぶ。 */
export async function teardownPool(): Promise<void> {
  await closePool();
}

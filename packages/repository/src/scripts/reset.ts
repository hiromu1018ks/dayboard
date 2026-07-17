/**
 * DBリセット（開発用）
 *
 * [dev_setup.md §4.3] の `pnpm db:reset` 相当。
 * 全テーブルをTRUNCATEし、マイグレーション再適用・シード再実行を行う。
 *
 * 警告: 本番（ローカル実運用）データは消える。開発用DBでのみ使うこと。
 */

import { getPool, closePool, runMigrations } from '../index.js';
import { seedUserSettings } from '../seedRunner.js';

async function reset(): Promise<void> {
  const client = getPool();

  // 全テーブルを DELETE（外部キー依存順を考慮）。SQLite は TRUNCATE を持たないため
  // DELETE で代用。また autoincrement は使っていないので sqlite_sequence のリセットも不要。
  // ON DELETE CASCADE が効いているため、親（day_notes / user_settings）から消せば
  // 子も伝播するが、FK 強制（PRAGMA foreign_keys = ON）前提で確実を期すため子から順に消す。
  for (const table of [
    'note_line_metas',
    'note_entries',
    'reflections',
    'blocker_items',
    'todo_items',
    'day_notes',
    'user_settings',
  ]) {
    await client.execute(`DELETE FROM ${table}`);
  }
  console.log('[reset] deleted all rows from all tables');

  // マイグレーション再適用（冪等）。リポジトリパッケージルート基準で ./migrations を指定。
  await runMigrations('./migrations');
  console.log('[reset] migrations reapplied');

  // シード再実行
  await seedUserSettings();
  console.log('[reset] seed reapplied');
}

reset()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error('[reset] failed:', err);
    await closePool();
    process.exit(1);
  });

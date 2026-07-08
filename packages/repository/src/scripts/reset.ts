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
  const pool = getPool();

  // 全テーブルTRUNCATE（外部キー依存順を考慮し CASCADE）
  await pool.query(
    `TRUNCATE TABLE
       note_line_metas,
       note_entries,
       reflections,
       blocker_items,
       todo_items,
       day_notes,
       user_settings
     CASCADE`,
  );
  console.log('[reset] truncated all tables');

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

/**
 * user_settings デフォルト行のシード（CLIエントリポイント）
 *
 * [database_schema.md §6] に基づく。
 * 実行: `pnpm db:seed` （ルートから）
 */

import { closePool } from './db.js';
import { seedUserSettings, DEFAULT_SETTINGS_ID } from './seedRunner.js';

seedUserSettings()
  .then(async () => {
    console.log(`[seed] user_settings: ensured default row (id='${DEFAULT_SETTINGS_ID}')`);
    await closePool();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error('[seed] failed:', err);
    await closePool();
    process.exit(1);
  });

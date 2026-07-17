/**
 * user_settings シード処理本体
 *
 * CLI実行（seed.ts）とリセット（scripts/reset.ts）の双方から呼ばれる。
 * [database_schema.md §6] のデフォルト行をUPSERTで冪等に保証する。
 */

import { getPool } from './db.js';

export const DEFAULT_SETTINGS_ID = 'default';

/**
 * user_settings にデフォルト行が無ければ挿入する（冪等）。
 */
export async function seedUserSettings(): Promise<void> {
  const client = getPool();
  await client.execute({
    sql: `INSERT INTO user_settings (id, keybinding_mode, vim_default_state)
     VALUES (?, 'standard', 'normal')
     ON CONFLICT (id) DO NOTHING`,
    args: [DEFAULT_SETTINGS_ID],
  });
}

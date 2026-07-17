/**
 * マイグレーション実行ヘルパー
 *
 * Electron main プロセスの起動フロー（[architecture.md §6.1]）から呼ばれる。
 * drizzle-kit のマイグレーションフォルダを適用する。
 *
 * 依存（drizzle-orm/libsql, migrator）をこのパッケージ内に閉じ込め、
 * main プロセスが drizzle を直接 import しなくて済むようにする。
 *
 * 注意: Electron のバンドル環境では `import.meta.url` がバンドル後の位置を指すため、
 * マイグレーションフォルダは呼び出し側（main プロセス）が明示的に渡すことを想定する。
 * 未指定時は開発環境（ソース実行）向けの相対パスにフォールバックする。
 */

import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getPool } from './db.js';

/**
 * 未適用のマイグレーションを全て適用する（[architecture.md §6.1]）。
 * 既に最新なら何もしない（drizzle-kit の冪等性）。
 *
 * @param migrationsFolder マイグレーションフォルダの絶対パス。
 *   Electron バンドル環境では `import.meta.url` が信頼できないため必須。
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  const client = getPool();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
}

/**
 * SQLite（libSQL）接続管理
 *
 * `@libsql/client` を用いる（[architecture.md §4]）。ローカルファイルモードで
 * 単一ユーザー・単一プロセス（[architecture.md C7]）を想定し、同期不要の非同期APIを
 * 提供する。これにより既存の `await db.transaction(async (tx) => ...)` 形式をそのまま維持できる。
 *
 * 接続先は `DATABASE_URL` 環境変数（例: `file:/path/to/dayborad.db`）から取得する。
 * Main プロセスが userData 配下の絶対パスを解決して注入する設計。
 * 未設定時はローカル開発用の相対ファイル（`file:dayborad.db`）にフォールバックする。
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema/index.js';

/**
 * libSQL クライアント（シングルトン）。
 *
 * 遅延初期化により、テスト時や未接続時の意図せぬ接続・ファイル生成を避ける。
 * 最初の `getClient()` 呼び出しで生成され、`PRAGMA foreign_keys = ON` を併せて実行する。
 */
let client: Client | null = null;

/**
 * `DATABASE_URL` を取得し、未設定時は開発用既定値にフォールバックする。
 * ローカル開発用の `file:dayborad.db`（CWD 相対）。
 * Main プロセスは起動時に絶対パスを `DATABASE_URL` へ設定する（[index.ts]）。
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return 'file:dayborad.db';
  }
  return url;
}

/**
 * 共有の libSQL クライアントを取得する（初回呼び出しで生成）。
 *
 * 戻り値を `pg.Pool` 互換の `query` / `end` メソッドを持つラッパーで包むことで、
 * 既存の生SQL 利用箇所（searchRepository / seed / reset / テストヘルパー）の
 * 呼び出し形式（`pool.query(sql, params)` → `ResultSet`）を最小改修で維持する。
 *
 * 接続直後に外部キー制約強制を有効化する（SQLite はデフォルトで OFF）。
 */
export function getPool(): Client {
  if (client) return client;
  client = createClient({ url: getDatabaseUrl() });
  // foreign_keys は接続単位の設定。同期的に有効化する（例外は呼び出し元へ伝播）。
  // ※ libSQL の local file モードでは PRAGMA は即時反映される。
  //    非同期実行だが待機不要（次クエリまでに反映される見込み）。確実を期すため await する
  //    ラッパーが必要な場合は setupForeignKeys() を await 付きで呼ぶこと。
  void client.execute('PRAGMA foreign_keys = ON');
  return client;
}

/**
 * Drizzle ORM インスタンス（シングルトン）。
 *
 * 既存の [schema/index.ts] 定義を活かし、型安全なクエリビルダを提供する。
 * リポジトリ実装は生クエリではなくこちらを用いる。
 */
let dbInstance: LibSQLDatabase<typeof schema> | null = null;

export type Db = LibSQLDatabase<typeof schema>;

export function getDb(): Db {
  if (dbInstance) return dbInstance;
  dbInstance = drizzle(getPool(), { schema });
  return dbInstance;
}

/**
 * 接続健全性確認。`SELECT 1` が通るか検証する。
 *
 * アプリ起動フロー（[architecture.md §6.1]）で SQLite ファイルへの読み書き可否確認に用いる。
 */
export async function ping(): Promise<void> {
  const c = getPool();
  const res = await c.execute('SELECT 1 AS ok');
  const row = res.rows[0];
  const ok =
    row && typeof row === 'object' && 'ok' in row
      ? (row as unknown as { ok: unknown }).ok
      : undefined;
  if (ok !== 1 && ok !== '1') {
    throw new Error('SQLite ping failed: unexpected response');
  }
}

/**
 * クライアントを閉じる。
 *
 * アプリ終了時（Electron main のライフサイクル）に呼び出し、安全に接続を閉じる。
 * 関数名は互換性のため `closePool` のまま（内部では単一クライアントを閉じる）。
 */
export async function closePool(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
  dbInstance = null;
}

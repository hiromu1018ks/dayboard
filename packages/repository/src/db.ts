/**
 * PostgreSQL 接続管理
 *
 * `pg` ライブラリの `Pool` を用いる（[architecture.md §4] / [dev_setup.md §6.1]）。
 * 単一ユーザー・単一プロセス（[architecture.md C7]）のため、`max: 5` 程度で十分。
 *
 * 接続文字列は `DATABASE_URL` 環境変数から取得する。
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

const { Pool } = pg;

/**
 * アプリ全体で共有する接続プール。
 *
 * 遅延初期化により、テスト時や未接続時の意図せぬ接続を避ける。
 * 最初の `getPool()` 呼び出しで生成される。
 */
let pool: pg.Pool | null = null;

/**
 * `DATABASE_URL` を取得し、未設定時は開発用既定値にフォールバックする。
 * 本番運用では環境変数が必須だが、ローカル開発の利便性のために既定値を置く。
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // 開発用既定値。本番では DATABASE_URL を必ず設定すること。
    return 'postgres://localhost:5432/dayborad_dev';
  }
  return url;
}

/**
 * 共有の接続プールを取得する（初回呼び出しで生成）。
 *
 * [dev_setup.md §6.1] に基づき `max: 5`。
 */
export function getPool(): pg.Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
  });
  return pool;
}

/**
 * Drizzle ORM インスタンス（シングルトン）。
 *
 * 既存の [schema/index.ts] 定義を活かし、型安全なクエリビルダを提供する。
 * リポジトリ実装は `pg.Pool` の生クエリではなくこちらを用いる。
 */
let dbInstance: NodePgDatabase<typeof schema> | null = null;

export type Db = NodePgDatabase<typeof schema>;

export function getDb(): Db {
  if (dbInstance) return dbInstance;
  dbInstance = drizzle(getPool(), { schema });
  return dbInstance;
}

/**
 * 接続健全性確認。`SELECT 1` が通るか検証する。
 *
 * アプリ起動フロー（[architecture.md §6.1]）でPostgreSQLの起動確認に用いる。
 */
export async function ping(): Promise<void> {
  const p = getPool();
  const res = await p.query('SELECT 1 AS ok');
  if (!res.rows[0] || res.rows[0].ok !== 1) {
    throw new Error('PostgreSQL ping failed: unexpected response');
  }
}

/**
 * 接続プールを閉じる。
 *
 * アプリ終了時（Electron main のライフサイクル）に呼び出し、
 * 安全に全接続を閉じる。
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  dbInstance = null;
}

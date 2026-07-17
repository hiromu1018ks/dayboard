import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit 設定
 *
 * [database_schema.md §7.1] に基づき、TypeScriptスキーマ定義から
 * バージョン管理可能なSQLマイグレーションを生成する。
 *
 * データストアは SQLite（libSQL）を用いる。ローカル開発用の DB ファイルは
 * `DATABASE_URL`（例: `file:./dayborad.db`）で指定する。未設定時は
 * `file:./dayborad.db` を仮定（drizzle-kit CLI 実行用）。
 * アプリ実行時は Main プロセスが userData 配下の絶対パスを注入する。
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./dayborad.db',
  },
  verbose: true,
  strict: true,
});

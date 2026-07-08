import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit 設定
 *
 * [database_schema.md §7.1] に基づき、TypeScriptスキーマ定義から
 * バージョン管理可能なSQLマイグレーションを生成する。
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/dayborad_dev',
  },
  verbose: true,
  strict: true,
});

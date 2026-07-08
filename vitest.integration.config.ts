import { defineConfig } from 'vitest/config';

/**
 * Integration テスト用 Vitest 設定
 *
 * Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ（[test_strategy.md §4]）。
 * 実行: `pnpm test:integration`
 *
 * 前提: `DATABASE_URL` にテスト用DB（dayborad_test）を指定し、
 * マイグレーション済みであること。CI では .github/workflows/ci.yml で設定。
 */
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: [
      'apps/api/test/**/*.integration.test.ts',
      'packages/repository/test/**/*.integration.test.ts',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});

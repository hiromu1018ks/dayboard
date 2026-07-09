import { defineWorkspace } from 'vitest/config';

/**
 * Integration テスト用 Vitest 設定
 *
 * Hono + リポジトリ + テスト用PostgreSQL を実環境で繋ぐ（[test_strategy.md §4]）。
 * 実行: `pnpm test:integration`（内部で --no-file-parallelism を付与し直列実行）
 *
 * 前提: `DATABASE_URL` にテスト用DB（dayborad_test）を指定し、
 * マイグレーション済みであること。CI では .github/workflows/ci.yml で設定。
 *
 * 注意: テストファイル間で同じ物理DBを共有するため、package.json の
 * test:integration スクリプトで `--no-file-parallelism` を指定し直列実行する。
 * 並列実行すると TRUNCATE や一意制約で競合する。
 * 各テストは afterEach で truncateAll() を呼びDBを空にする。
 */
export default defineWorkspace([
  {
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
  },
]);

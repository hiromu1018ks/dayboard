import { configDefaults, defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace 設定
 *
 * パッケージ別にテスト環境を分離する（[test_strategy.md §1.1]）。
 * - Unit: packages/* （PostgreSQL不要、ピュアTS）
 * - Integration: apps/api, packages/repository（PostgreSQL必要、別config）
 */
export default defineWorkspace([
  {
    // Unit テスト: ピュアTS層（domain, shared-types）
    test: {
      name: 'unit',
      environment: 'node',
      include: ['packages/*/test/**/*.test.ts'],
      exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['packages/*/src/**/*.ts'],
        // [test_strategy.md §8.1] のカバレッジ目安
        thresholds: {
          lines: 80,
        },
      },
    },
  },
  {
    // Renderer のテスト（jsdom環境）
    test: {
      name: 'renderer',
      environment: 'jsdom',
      include: ['apps/desktop/src/renderer/src/**/*.test.{ts,tsx}'],
    },
  },
]);

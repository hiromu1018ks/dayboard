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
    // Unit テスト: ピュアTS層（domain, shared-types）+ API ミドルウェア等の DB 不要テスト
    test: {
      name: 'unit',
      environment: 'node',
      include: ['packages/*/test/**/*.test.ts', 'apps/api/test/**/*.test.ts'],
      exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        // [test_strategy.md §8.1] のカバレッジ目安。ピュアTS層（domain）は高カバレッジが現実的。
        // repository/shared-types は Integration 層で検証するため Unit の coverage 対象外。
        include: ['packages/domain/src/**/*.ts'],
        thresholds: {
          lines: 90,
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
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        // [test_strategy.md §8.1]: renderer 60%。UI は E2E 中心、Unit はロジック抽出部分。
        include: ['apps/desktop/src/renderer/src/keybindings/**/*.ts'],
        thresholds: {
          lines: 60,
        },
      },
    },
  },
]);

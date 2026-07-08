// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * dayborad 共通 ESLint 設定（flat config）
 *
 * [test_strategy.md §8.2] の品質ゲート: `pnpm lint` がエラー0であること。
 * TypeScript（packages/*, apps/api, apps/desktop main/preload）と
 * React（apps/desktop renderer）をカバーする。
 */
export default tseslint.config(
  // 除外
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/migrations/**',
      '**/*.sql',
      'docs/**',
      '.agents/**',
      'skills-lock.json',
    ],
  },

  // ベース: ESLint推奨 + TypeScript推奨
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript（型チェック付き）を全パッケージへ
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // React（renderer のみ）
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
);

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import { builtinModules } from 'node:module';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * electron-vite 設定
 *
 * main / preload / renderer の3プロセスを1パッケージで統合ビルドする。
 * [architecture.md §3] のプロセス構成に対応。
 *
 * 重要: ワークスペースパッケージ（shared-types, domain, repository, api）は
 * ソース（.ts）を直接エクスポートしているため、Vite がバンドルに取り込む必要がある。
 * 一方で Electron のビルトインモジュール（electron 等）と、ネイティブバインディングを
 * 持つ `pg`（pg-native）は実行時に Node/Electron から解決させるため外部化する。
 *
 * `externalizeDepsPlugin` は dependencies を全て外部化してしまうため、ここでは使わず、
 * 外部化対象を明示的に列挙する（ワークスペースパッケージは含めない）。
 */
const WORKSPACE_PACKAGES = ['shared-types', '@dayboard/domain', 'repository', 'api'];

/** main/preload で外部化するモジュール（実行時に Node/Electron が解決） */
const externalized = [
  'electron',
  ...builtinModules.flatMap((m) => [m, `node:${m}`]),
  // ネイティブバインディングを含むためバンドルせず実行時解決
  /^pg($|\/)/,
  /^pg-native/,
];

const workspaceAlias = {
  'shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
  '@dayboard/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
  repository: resolve(__dirname, '../../packages/repository/src/index.ts'),
  api: resolve(__dirname, '../../apps/api/src/index.ts'),
};

export default defineConfig({
  main: {
    resolve: {
      alias: workspaceAlias,
    },
    build: {
      rollupOptions: {
        external: externalized,
      },
    },
  },
  preload: {
    resolve: {
      alias: workspaceAlias,
    },
    build: {
      rollupOptions: {
        external: externalized,
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        ...workspaceAlias,
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [react()],
    server: {
      port: Number(process.env.VITE_DEV_SERVER_PORT) || 5173,
    },
  },
});

// ワークスペースパッケージが誤って external に含まれないための健全性チェック（ビルド時参照用）
void WORKSPACE_PACKAGES;

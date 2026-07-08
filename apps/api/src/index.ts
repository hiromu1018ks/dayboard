/**
 * Hono API サーバー起動
 *
 * 2つの起動形態をサポート:
 *
 * 1. 単独起動（`pnpm dev:api`）: `API_HOST`/`API_PORT` 環境変数でリッスン。
 *    開発時のデバッグ用途（[dev_setup.md §3.4.2]）。
 *
 * 2. Electron main からの埋め込み起動: `startServer({ host, port })` を呼び出し、
 *    動的ポートでリッスンさせる（[architecture.md §6.1/§7]）。
 *
 * バインドは常に `127.0.0.1`（localhostのみ、[architecture.md §7]）。
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

export interface StartServerOptions {
  /** リッスンホスト。既定 `127.0.0.1`（localhostのみ） */
  host?: string;
  /** リッスンポート。未指定時は `API_PORT` 環境変数、更に未指定なら 8787 */
  port?: number;
}

export interface StartedServer {
  /** 実際にリッスンしているポート（動的割当て反映済み） */
  port: number;
  /** API ベースURL（`http://127.0.0.1:{port}/api`） */
  baseUrl: string;
  /** サーバーを閉じる */
  close: () => Promise<void>;
}

/**
 * Hono API サーバーを起動する。
 * Electron main の起動フロー（[architecture.md §6.1]）から呼ばれる。
 *
 * `port: 0` を渡した場合は OS が空きポートを動的に割り当てる。
 * リッスン開始を待ってから実際のポートを取得するため、`listening` イベントを待機する。
 */
export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const host = options.host ?? process.env.API_HOST ?? '127.0.0.1';
  const envPort = process.env.API_PORT ? Number(process.env.API_PORT) : undefined;
  const port = options.port ?? envPort ?? 8787;

  const app = createApp();
  const server = serve({ fetch: app.fetch, hostname: host, port });

  // リッスン開始を待って実際のポートを取得する。
  // port=0 の動的割当てでも、これで正しいポートが得られる。
  const actualPort = await new Promise<number>((resolve, reject) => {
    server.once('listening', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve(address.port);
      } else {
        reject(new Error('server.address() did not return AddressInfo'));
      }
    });
    server.once('error', reject);
  });
  const baseUrl = `http://${host}:${actualPort}/api`;

  return {
    port: actualPort,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// 単独起動（`pnpm dev:api`）の場合のみサーバーを開始する。
// Electron main からの import 時は起動しない。
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  startServer()
    .then(({ baseUrl, port }) => {
      console.log(`[api] listening on ${baseUrl} (port ${port})`);
    })
    .catch((err: unknown) => {
      console.error('[api] failed to start:', err);
      process.exit(1);
    });
}

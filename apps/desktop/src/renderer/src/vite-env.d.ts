/// <reference types="vite/client" />

/**
 * Renderer プロセスのグローバル型定義
 *
 * Electron main が preload 経由で注入する `window.__API_BASE_URL__`（[architecture.md §6.1]）。
 * 開発時の分離起動では未注入のため、`import.meta.env.VITE_API_BASE_URL` にフォールバックする。
 */
interface Window {
  /**
   * Electron main が起動時に決定したAPIベースURL（`http://127.0.0.1:{port}/api`）。
   * パッケージ版では常に注入される。開発時のブラウザ表示では未定義。
   */
  __API_BASE_URL__?: string;
}

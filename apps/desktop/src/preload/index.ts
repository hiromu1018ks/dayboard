/**
 * Electron preload スクリプト
 *
 * main プロセスが決定したAPIベースURLを Renderer の `window.__API_BASE_URL__` に注入する
 * （[architecture.md §6.1/§7]）。
 *
 * また、終了時の flush（[autosave_spec.md §10]）のためのIPCブリッジを提供する:
 * - main → renderer: `flush-all` 要求（before-quit 時）
 * - renderer → main: flush 完了通知
 *
 * contextIsolation: true のため、`contextBridge` 経由で安全に公開する。
 * Renderer は Node API に直接触れない（nodeIntegration: false）。
 */

import { contextBridge, ipcRenderer } from 'electron';

const apiBaseUrl = process.env['INJECTED_API_BASE_URL'];

if (!apiBaseUrl) {
  console.error('[preload] INJECTED_API_BASE_URL is not set. API通信ができません。');
}

contextBridge.exposeInMainWorld('__API_BASE_URL__', apiBaseUrl);

/**
 * 自動保存 flush 用のIPCブリッジ（[roadmap.md T-2-13]）。
 *
 * Renderer は:
 * - `onFlushAll(cb)` で main からの flush 要求を待ち受け
 * - `notifyFlushDone()` で flush 完了を main へ通知
 *
 * main は before-quit 時に `flush-all` を送信し、`flush-done` を待つ。
 */
contextBridge.exposeInMainWorld('dayboradAutosave', {
  /** main からの flush-all 要求を待ち受ける。cb は flush 完了後に呼ぶ Promise を返す */
  onFlushAll: (cb: () => Promise<void> | void): void => {
    ipcRenderer.on('flush-all', async () => {
      try {
        await cb();
      } finally {
        ipcRenderer.send('flush-done');
      }
    });
  },
});

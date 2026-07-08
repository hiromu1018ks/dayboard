/**
 * Electron preload スクリプト
 *
 * main プロセスが決定したAPIベースURLを Renderer の `window.__API_BASE_URL__` に注入する
 * （[architecture.md §6.1/§7]）。
 *
 * contextIsolation: true のため、`contextBridge` 経由で安全に公開する。
 * Renderer は Node API に直接触れない（nodeIntegration: false）。
 */

import { contextBridge } from 'electron';

const apiBaseUrl = process.env['INJECTED_API_BASE_URL'];

if (!apiBaseUrl) {
  console.error('[preload] INJECTED_API_BASE_URL is not set. API通信ができません。');
}

contextBridge.exposeInMainWorld('__API_BASE_URL__', apiBaseUrl);

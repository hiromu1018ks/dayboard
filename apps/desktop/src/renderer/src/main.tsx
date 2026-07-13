import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';
import { applyThemeClass, readStoredTheme, resolveMode } from './hooks/useTheme.js';

// FOUC 対策: CSP が script-src 'self' のため index.html にインラインスクリプトを置けない。
// その代わり React 初回描画の直前（モジュール top-level）で localStorage を読んで
// <html> へ dark/light クラスを付与する。これにより初回描画からテーマが適用済みになる。
applyThemeClass(resolveMode(readStoredTheme()));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

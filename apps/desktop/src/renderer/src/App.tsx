import { useEffect, useState } from 'react';

/**
 * APIベースURLを取得する。
 *
 * パッケージ版では Electron main が preload 経由で `window.__API_BASE_URL__` を注入する
 * （[architecture.md §6.1]）。
 * 開発時の分離起動（ブラウザ表示）では未注入のため、`import.meta.env.VITE_API_BASE_URL` にフォールバックする。
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__;
  }
  const fallback = import.meta.env.VITE_API_BASE_URL;
  if (fallback) return fallback;
  // 最終フォールバック（開発時の electron-vite dev）
  return 'http://127.0.0.1:8787/api';
}

type HealthState = { status: 'loading' } | { status: 'ok' } | { status: 'error'; message: string };

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });
  const [apiBaseUrl] = useState(() => getApiBaseUrl());

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { status?: string };
        if (!cancelled) {
          setHealth(
            data.status === 'ok'
              ? { status: 'ok' }
              : { status: 'error', message: 'unexpected response' },
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="mx-auto max-w-3xl px-8 py-16">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">dayborad</h1>
          <p className="mt-2 text-sm text-stone-500">その日の仕事ノート1枚</p>
        </header>

        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-stone-600">API 接続確認</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-stone-500">エンドポイント:</dt>
              <dd className="font-mono text-stone-700">{apiBaseUrl}/health</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-stone-500">状態:</dt>
              <dd>
                {health.status === 'loading' && <span className="text-stone-500">確認中…</span>}
                {health.status === 'ok' && (
                  <span className="font-semibold text-emerald-600">ok</span>
                )}
                {health.status === 'error' && (
                  <span className="font-semibold text-red-600">エラー: {health.message}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

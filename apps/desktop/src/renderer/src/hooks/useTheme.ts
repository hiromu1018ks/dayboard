/**
 * テーマフック（[roadmap.md: 墨と波テーマ]）
 *
 * 「墨と波」テーマのモード（墨ダーク／和紙ライト／System=OS追従）を管理する。
 * 永続化は localStorage（サーバー拡張なし・renderer ローカル）。
 *
 * 設計:
 * - `theme`: ユーザー選択。設定モーダルから 'light'|'dark'|'system' を選ぶ。
 * - `resolvedMode`: 実際に適用される 'light'|'dark'。`system` の場合は OS の
 *   `prefers-color-scheme` で解決する。
 * - `<html>` の classList に `dark`/`light` を付与し、Tailwind の darkMode:'class' と
 *   index.css の CSS 変数切替を駆動する。
 * - 季節アクセントは現在表示中の日付の月から自動判定し `data-season` 属性へ設定
 *   （春=桜 / 夏=波青 / 秋=山吹 / 冬=藍）。
 *
 * FOUC 対策: `main.tsx` が起動直後（React 初回描画前）に `applyThemeClass` を呼んで
 * `<html>` へクラスを付与する。本フックの effect はそれ以降の動的変化を追従する。
 */

import { useCallback, useEffect, useState } from 'react';
import { getSeason, type Season } from '@dayboard/domain';

/** ユーザーが選択するテーマ（設定モーダルの3択） */
export type Theme = 'light' | 'dark' | 'system';

/** 実際に適用されるモード（system は解決済み） */
export type ResolvedMode = 'light' | 'dark';

const STORAGE_KEY = 'dayborad:theme';

const VALID_THEMES: readonly Theme[] = ['light', 'dark', 'system'];

/** localStorage からテーマを読む。不正値・未設定時は 'system'。 */
export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID_THEMES as readonly string[]).includes(raw)) {
      return raw as Theme;
    }
  } catch {
    // localStorage アクセス不可（プライベートモード等）は既定へ。
  }
  return 'system';
}

/** OS のカラースキーマ設定から resolvedMode を解決する。SSR/無効環境は 'light'。 */
function resolveSystemMode(): ResolvedMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** theme → resolvedMode。`system` は OS 設定で解決する。 */
export function resolveMode(theme: Theme): ResolvedMode {
  if (theme === 'system') return resolveSystemMode();
  return theme;
}

/**
 * `<html>` の classList と data-season を更新する。
 * `main.tsx` の起動直後（React 描画前）にも呼ばれ、FOUC を最小化する。
 * `currentDate` は季節判定用。省略時は data-season を更新しない。
 */
export function applyThemeClass(mode: ResolvedMode, currentDate?: string): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  if (currentDate) {
    let season: Season;
    try {
      season = getSeason(currentDate);
    } catch {
      season = 'summer'; // 不正日付のフォールバック（既定の波青）
    }
    root.setAttribute('data-season', season);
  }
}

export type UseThemeResult = {
  /** ユーザー選択のテーマ（設定モーダルで選ぶ値） */
  theme: Theme;
  /** 実際に適用中のモード（system は解決済み） */
  resolvedMode: ResolvedMode;
  /** テーマを変更し localStorage へ永続化する */
  setTheme: (theme: Theme) => void;
};

/**
 * テーマ状態を管理するフック。
 *
 * @param currentDate 現在表示中の日付（YYYY-MM-DD）。季節アクセントの判定に用いる。
 */
export function useTheme(currentDate: string): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(() =>
    resolveMode(readStoredTheme()),
  );

  // ユーザー選択の変更: localStorage へ保存し resolvedMode を再計算。
  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 書き込み失敗（プライベートモード等）は無視。UI 上はそのまま切り替わる。
    }
    setThemeState(next);
    setResolvedMode(resolveMode(next));
  }, []);

  // resolvedMode / 日付の変化を <html> へ反映。
  useEffect(() => {
    applyThemeClass(resolvedMode, currentDate);
  }, [resolvedMode, currentDate]);

  // system 選択時は OS 設定変更をリアルタイム追従する。
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setResolvedMode(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, resolvedMode, setTheme };
}

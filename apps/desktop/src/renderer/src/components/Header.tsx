/**
 * ヘッダーコンポーネント（[roadmap.md T-1-13, T-2-09]）
 *
 * [要件 6.2]: 日付・曜日・今日のテーマ入力欄・日付移動ボタン（‹ / › / 今日）。
 * [ui_interaction_spec.md §7]: ボタンから前日/翌日/今日へ移動。
 *
 * Phase 1: 日付・曜日表示、テーマ入力欄配置、日付移動ボタン
 * Phase 2（T-2-09）: テーマ入力を useAutosave のデバウンス保存へ接続。
 *   入力変更ごとに onThemeEdit を呼び、800ms後に PATCH /api/day-notes/:date の theme 送信。
 */

import { useEffect, useRef, useState } from 'react';
import { getWeekdayLabel } from '@dayboard/domain';

/** YYYY-MM-DD を「2026/07/08」形式に整形（表示用。曜日は getWeekdayLabel で別途取得） */
function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

export type HeaderProps = {
  /** 表示中の日付（YYYY-MM-DD） */
  currentDate: string;
  /** DayNote のテーマ（null は未入力）。読み込み中は null。 */
  theme: string | null;
  /** 前日へ移動 */
  onPrevDay: () => void;
  /** 翌日へ移動 */
  onNextDay: () => void;
  /** 今日へ移動 */
  onToday: () => void;
  /** 今日の日付と一致するか（「今日」ボタンの無効化用） */
  isToday: boolean;
  /** テーマ編集時に呼ばれる（Phase 2: useAutosave の edit へ接続） */
  onThemeEdit: (theme: string | null) => void;
  /** 設定モーダルを開く（Phase 7、[ui_interaction_spec.md §8.1]） */
  onOpenSettings: () => void;
};

export function Header({
  currentDate,
  theme,
  onPrevDay,
  onNextDay,
  onToday,
  isToday,
  onThemeEdit,
  onOpenSettings,
}: HeaderProps) {
  const displayDate = formatDisplayDate(currentDate);
  const weekday = getWeekdayLabel(currentDate);

  // テーマ入力のローカルstate（楽観的更新、[autosave_spec.md §8.1]）。
  // 日付（currentDate）が変わったら新たな DayNote のテーマで初期化する。
  // 同一日付内の theme prop 変化（サーバー正規化の反映等）では上書きしない
  // （ユーザー入力がサーバー保存結果で巻き戻るのを避けるため）。
  const [themeInput, setThemeInput] = useState(theme ?? '');
  const prevDateRef = useRef(currentDate);

  // 日付切替時は新 DayNote のテーマで初期化
  useEffect(() => {
    if (prevDateRef.current !== currentDate) {
      setThemeInput(theme ?? '');
      prevDateRef.current = currentDate;
    }
  }, [currentDate, theme]);

  /**
   * テーマ入力変更ハンドラ（T-2-09）。
   * 入力ごとにローカルstateを更新（楽観的）し、useAutosave.edit へ通知。
   * 800ms後に PATCH /api/day-notes/:date の theme が送信される。
   */
  const handleThemeChange = (value: string) => {
    setThemeInput(value);
    // 空文字は null として扱う（API 側でも正規化されるが、クライアント側でも明示）
    onThemeEdit(value === '' ? null : value);
  };

  return (
    <header className="border-b border-stone-200 bg-white px-8 py-4">
      <div className="flex items-center justify-between">
        {/* 日付・曜日 */}
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-800">
            <span className="font-mono">{displayDate}</span>
            <span className="ml-2 text-stone-500">{weekday}</span>
          </h1>
          <span className="text-sm text-stone-400">今日の仕事ノート</span>
        </div>

        {/* 日付移動ボタン（[要件 6.2]） */}
        <nav className="flex items-center gap-2" aria-label="日付移動">
          <button
            type="button"
            onClick={onPrevDay}
            className="rounded px-3 py-1 text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
            aria-label="前日へ"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onToday}
            disabled={isToday}
            className="rounded border border-stone-300 px-3 py-1 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          >
            今日
          </button>
          <button
            type="button"
            onClick={onNextDay}
            className="rounded px-3 py-1 text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
            aria-label="翌日へ"
          >
            ›
          </button>
        </nav>
      </div>

      {/* テーマ入力欄（[要件 7.2]: 未入力可。Phase 2 で自動保存接続、T-2-09）
          Phase 7: data-focus-section="theme" で列フォーカス（Vim h/l）対応。
          コンテナ（この div）へ section、入力へ input を付与。 */}
      <div className="mt-3 flex items-center gap-2" data-focus-section="theme">
        <label htmlFor="theme-input" className="text-sm text-stone-500">
          今日のテーマ：
        </label>
        <input
          id="theme-input"
          type="text"
          value={themeInput}
          onChange={(e) => handleThemeChange(e.target.value)}
          placeholder="今日のテーマを入力"
          maxLength={200}
          data-focus-input
          className="flex-1 border-b border-stone-200 bg-transparent px-1 py-0.5 text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-400"
        />
        {/* 設定（歯車）アイコン（[ui_interaction_spec.md §8.1]、Phase 7 T-7-02） */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="設定を開く"
          className="ml-2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
        >
          {/* 歯車アイコン（SVG） */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default Header;

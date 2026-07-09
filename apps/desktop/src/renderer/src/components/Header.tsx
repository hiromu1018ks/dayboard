/**
 * ヘッダーコンポーネント（[roadmap.md T-1-13]）
 *
 * [要件 6.2]: 日付・曜日・今日のテーマ入力欄・日付移動ボタン（‹ / › / 今日）。
 * [ui_interaction_spec.md §7]: ボタンから前日/翌日/今日へ移動。
 *
 * Phase 1 のスコープ:
 * - ヘッダーに日付・曜日を表示（曜日計算は `@dayboard/domain` の `getWeekdayLabel`）
 * - テーマ入力欄を配置（ローカルstateのみ。自動保存接続は Phase 2 の T-2-09）
 * - 日付移動ボタン（Phase 1 では currentDate 更新のみ。flush は Phase 2 の T-2-10）
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
};

export function Header({
  currentDate,
  theme,
  onPrevDay,
  onNextDay,
  onToday,
  isToday,
}: HeaderProps) {
  const displayDate = formatDisplayDate(currentDate);
  const weekday = getWeekdayLabel(currentDate);

  // テーマ入力のローカルstate。
  // - 日付（currentDate）が変わったら新たな DayNote のテーマで初期化
  // - 同一日付内で theme prop が変わった場合（Phase 2 の自動保存反映）は更新しない
  //   （ユーザー入力をサーバー保存結果で上書きしないため）。
  // 前回日付を追跡し、日付切替時のみリセットすることで両者を実現する。
  const [themeInput, setThemeInput] = useState(theme ?? '');
  const prevDateRef = useRef(currentDate);
  useEffect(() => {
    if (prevDateRef.current !== currentDate) {
      // 日付が変わった: 新 DayNote のテーマで初期化
      setThemeInput(theme ?? '');
      prevDateRef.current = currentDate;
    }
  }, [currentDate, theme]);

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

      {/* テーマ入力欄（[要件 7.2]: 未入力可。自動保存は Phase 2） */}
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="theme-input" className="text-sm text-stone-500">
          今日のテーマ：
        </label>
        <input
          id="theme-input"
          type="text"
          value={themeInput}
          onChange={(e) => setThemeInput(e.target.value)}
          placeholder="今日のテーマを入力"
          maxLength={200}
          className="flex-1 border-b border-stone-200 bg-transparent px-1 py-0.5 text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-400"
        />
      </div>
    </header>
  );
}

export default Header;

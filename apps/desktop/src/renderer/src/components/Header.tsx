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
import { getWeekdayLabelEn } from '@dayboard/domain';

/** 英語月名短縮形（1=Jan ... 12=Dec）。表示用フォーマットに用いる。 */
const MONTH_LABELS_EN = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** YYYY-MM-DD を「Jul 13, 2026」形式に整形（表示用。曜日は getWeekdayLabelEn で別途取得） */
function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${MONTH_LABELS_EN[Number(m)] ?? ''} ${Number(d)}, ${y}`;
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
  const weekday = getWeekdayLabelEn(currentDate);

  // テーマ入力のローカルstate（楽観的更新、[autosave_spec.md §8.1]）。
  //
  // 同一日内の theme prop 変化（サーバー保存結果の反映・正規化）はユーザー入力を
  // 巻き戻さないよう無視する。ただし以下の2ケースでは新値で上書きする:
  //   (a) 初回マウント後に fetch 結果が到着した時（再起動後の復元）
  //   (b) 日付切替後、新 DayNote の fetch が完了し theme が新日付の値に置き換わった時
  //
  // 「新日付の theme に置き換わった」の検知は、theme を data と一緒に見ている
  // 呼び出し元（App.tsx）に依存する。App は data.date と currentDate が一致した
  // 状態の data.dayNote.theme を本コンポーネントへ渡すため、theme 変化は
  // 「新日付の fetch 完結」を意味する。そのため theme の変化だけを手掛かりにする。
  //
  // ただし「日付は変わったが fetch 未完（theme は前日値のまま）」の過渡期に
  // 入力欄が前日値を表示し続けるのを避けるため、currentDate 変更直後は
  // 一旦クリアして待機する。
  const [themeInput, setThemeInput] = useState(theme ?? '');
  const prevDateRef = useRef(currentDate);
  const initializedRef = useRef(theme !== null && theme !== undefined);

  useEffect(() => {
    if (prevDateRef.current !== currentDate) {
      // 日付切替直後: fetch 完結前に一旦空にする（前日値の残留を防ぐ）。
      // 直後の theme 到着で新日付の値が反映される。
      setThemeInput('');
      prevDateRef.current = currentDate;
      initializedRef.current = false;
      return;
    }
    // 同一日内で theme が到着・変化したとき、未初期化なら反映する。
    if (!initializedRef.current && theme !== null && theme !== undefined) {
      setThemeInput(theme);
      initializedRef.current = true;
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
    <header className="border-b border-line bg-panel/50 px-10 py-5">
      <div className="flex items-end justify-between">
        {/* 日付・曜日 */}
        <div className="flex items-baseline gap-4">
          <h1 className="head text-3xl tracking-tight text-ink" data-testid="date-display">
            <span className="mono">{displayDate}</span>
            <span className="ml-3 text-xl text-sub">{weekday}</span>
          </h1>
          <span className="text-sm text-faint">Daily Work Note</span>
        </div>

        {/* 日付移動ボタン（[要件 6.2]） */}
        <nav className="flex items-center gap-2" aria-label="日付移動">
          <button
            type="button"
            onClick={onPrevDay}
            className="rounded px-3 py-1 text-sub hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            aria-label="前日へ"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onToday}
            disabled={isToday}
            className="rounded border border-line px-3 py-1 text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onNextDay}
            className="rounded px-3 py-1 text-sub hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            aria-label="翌日へ"
          >
            ›
          </button>
        </nav>
      </div>

      {/* テーマ入力欄（[要件 7.2]: 未入力可。Phase 2 で自動保存接続、T-2-09）
          Phase 7: data-focus-section="theme" で列フォーカス（Vim h/l）対応。
          コンテナ（この div）へ section、入力へ input を付与。
          Day One 風: 左に小さな accent 縦バーで「見出し」感を出す。 */}
      <div className="mt-4 flex items-center gap-2" data-focus-section="theme">
        <div className="theme-input-wrap flex-1">
          <label htmlFor="theme-input" className="mb-1 block text-xs tracking-wider text-faint">
            Today&rsquo;s Theme
          </label>
          <input
            id="theme-input"
            type="text"
            value={themeInput}
            onChange={(e) => handleThemeChange(e.target.value)}
            placeholder="What's your focus today?"
            maxLength={200}
            data-focus-input
            className="head w-full border-none bg-transparent px-0 py-1 text-lg text-ink outline-none placeholder:text-faint/60 placeholder:italic"
          />
        </div>
        {/* 設定（歯車）アイコン（[ui_interaction_spec.md §8.1]、Phase 7 T-7-02） */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="設定を開く"
          className="ml-2 self-end rounded p-1 text-faint hover:bg-raised hover:text-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
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

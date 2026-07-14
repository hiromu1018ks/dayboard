/**
 * サイドバー（Post-MVP: 月別カレンダー + 全文検索）
 *
 * 左側に固定配置（`w-64 shrink-0`）。2つの機能を統合:
 * - 上部: SearchBox（全文検索。入力 → 300msデバウンス → 結果リスト）
 * - 下部: 月別カレンダー（ノート存在日のドット表示、当日・選択日のハイライト）
 *
 * 日付クリック → `onSelectDate` 経由で `navigateWithFlush` へ接続（flush保護付きジャンプ）。
 * 検索結果クリックも同様。
 *
 * 月の1日・月末の計算は `getMonthRange`（domain層）。表示月の `from`/`to` で
 * `GET /api/day-notes?from&to` をfetch（月移動ごとに再fetch）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMonthRange, highlightSnippet, MONTH_LABELS_EN, todayLocal } from '@dayboard/domain';
import type { DayNoteSummary, SearchHit } from 'shared-types';
import { fetchDayNoteSummaries, searchAll } from '../api/client.js';

export type SidebarProps = {
  /** 表示中の日付（YYYY-MM-DD） */
  currentDate: string;
  /** 日付選択時のハンドラ（flush保護付きジャンプへ接続） */
  onSelectDate: (date: string) => void;
};

/** 曜日ヘッダー（日始まり） */
const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 検索結果の種別バッジラベル */
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  todo: 'TODO',
  blocker: 'BLOCKER',
  note: 'NOTE',
  reflection: 'REFLECTION',
  theme: 'THEME',
};

export function Sidebar({ currentDate, onSelectDate }: SidebarProps) {
  // --- カレンダー状態 ---
  // 表示月（YYYY-MM）。初期値は currentDate の月。
  const [viewYearMonth, setViewYearMonth] = useState(() => currentDate.slice(0, 7));
  const [summaries, setSummaries] = useState<DayNoteSummary[]>([]);
  const today = todayLocal();

  // currentDate の月が変わったら viewYearMonth も追従
  useEffect(() => {
    setViewYearMonth(currentDate.slice(0, 7));
  }, [currentDate]);

  // 表示月の DayNote サマリを fetch
  useEffect(() => {
    const { from, to } = getMonthRange(viewYearMonth);
    let cancelled = false;
    void fetchDayNoteSummaries(from, to).then((result) => {
      if (!cancelled) setSummaries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [viewYearMonth]);

  // --- 検索状態 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 検索デバウンス（300ms）。cancelled フラグで連続入力時の古いレスポンスを破棄し、
  // エラー時は空結果として UI がスタックしないようにする（H-1/M-1）。
  const trimmedQuery = searchQuery.trim();
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmedQuery.length === 0) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    debounceRef.current = setTimeout(() => {
      void searchAll(trimmedQuery)
        .then((result) => {
          if (!cancelled) setSearchResults(result.hits);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery]);

  // 検索結果のスニペットハイライトを事前計算（レンダリングごとの再計算を回避、L-3）
  const decoratedResults = useMemo(() => {
    if (!searchResults) return null;
    return searchResults.map((hit) => ({
      hit,
      segments: highlightSnippet(hit.snippet, trimmedQuery),
    }));
  }, [searchResults, trimmedQuery]);

  // --- カレンダー描画データ ---
  // 空セル（前月の余白）と日付セルを分けて保持。日付セルは date が非null確定（L-2）。
  const { emptyCells, dayCells } = useMemo(() => {
    const [year, month] = viewYearMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const firstWeekday = firstDay.getDay(); // 0=Sun
    const { to: lastDateStr } = getMonthRange(viewYearMonth);
    const lastDay = Number(lastDateStr.slice(8, 10));

    const empty: number[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      empty.push(i);
    }
    const days: Array<{ date: string; day: number }> = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${viewYearMonth}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d });
    }
    return { emptyCells: empty, dayCells: days };
  }, [viewYearMonth]);

  // サマリを date → theme の Map に変換
  const summaryMap = useMemo(() => {
    const map = new Map<string, DayNoteSummary>();
    for (const s of summaries) {
      map.set(s.date, s);
    }
    return map;
  }, [summaries]);

  // 月移動
  const goToPrevMonth = useCallback(() => {
    const [y, m] = viewYearMonth.split('-').map(Number);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    setViewYearMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
  }, [viewYearMonth]);

  const goToNextMonth = useCallback(() => {
    const [y, m] = viewYearMonth.split('-').map(Number);
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    setViewYearMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  }, [viewYearMonth]);

  // 月ラベル（例: Jul 2026）
  const [labelYear, labelMonth] = viewYearMonth.split('-').map(Number);
  const monthLabel = `${MONTH_LABELS_EN[labelMonth] ?? ''} ${labelYear}`;

  // Esc で検索クリア。検索ボックスフォーカス中の Esc はグローバルハンドラへ伝播させず
  // 検索クリアで消費する（L-1: escPriority との干渉を防止）。
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      e.stopPropagation();
      setSearchQuery('');
      setSearchResults(null);
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-linesoft bg-panel/50">
      {/* 検索ボックス */}
      <div className="border-b border-linesoft p-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search…"
          aria-label="検索"
          className="w-full rounded border border-line bg-bg/50 px-2 py-1 text-sm text-ink outline-none placeholder:text-faint/60 focus:border-accent focus-visible:ring-1 focus-visible:ring-accent"
        />
      </div>

      {/* 検索結果リスト（検索中は表示、未検索時はカレンダー） */}
      {decoratedResults !== null ? (
        <div className="flex-1 overflow-y-auto">
          {decoratedResults.length === 0 ? (
            <p className="p-3 text-xs text-faint">No results found.</p>
          ) : (
            <ul className="py-1">
              {decoratedResults.map(({ hit, segments }) => {
                const [, m, d] = hit.date.split('-').map(Number);
                return (
                  <li key={`${hit.date}-${hit.resourceType}-${hit.resourceId}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDate(hit.date);
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className="block w-full px-3 py-2 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs text-sub">
                          {MONTH_LABELS_EN[m] ?? ''} {d}
                        </span>
                        <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">
                          {RESOURCE_TYPE_LABELS[hit.resourceType] ?? hit.resourceType}
                        </span>
                        {hit.section && (
                          <span className="text-[10px] text-faint">{hit.section}</span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-sub">
                        {segments.map((seg, j) =>
                          seg.isHit ? (
                            <mark key={j} className="rounded bg-accent/30 text-ink">
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={j}>{seg.text}</span>
                          ),
                        )}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* 月ヘッダー */}
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={goToPrevMonth}
              aria-label="前月へ"
              className="rounded px-2 py-0.5 text-sub hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              ‹
            </button>
            <span className="head text-sm text-ink">{monthLabel}</span>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="翌月へ"
              className="rounded px-2 py-0.5 text-sub hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              ›
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 px-2">
            {WEEKDAY_HEADERS.map((wd, i) => (
              <div key={i} className="py-1 text-center text-[10px] text-faint">
                {wd}
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="grid grid-cols-7 gap-0.5">
              {emptyCells.map((i) => (
                <div key={`empty-${i}`} />
              ))}
              {dayCells.map((cell) => {
                const summary = summaryMap.get(cell.date);
                const isToday = cell.date === today;
                const isSelected = cell.date === currentDate;
                const hasNote = summary !== undefined;
                const hasTheme = summary?.theme !== null && summary?.theme !== undefined;
                const [, , dayNum] = cell.date.split('-').map(Number);
                const ariaParts = [
                  `${MONTH_LABELS_EN[labelMonth] ?? ''} ${dayNum}`,
                  isToday ? '今日' : '',
                  isSelected ? '選択中' : '',
                  hasNote ? (hasTheme ? 'ノートあり' : 'ノートあり') : '',
                ].filter(Boolean);

                return (
                  <button
                    key={cell.date}
                    type="button"
                    data-date={cell.date}
                    onClick={() => onSelectDate(cell.date)}
                    className={`relative aspect-square rounded text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                      isSelected
                        ? 'bg-accent/30 text-accent'
                        : isToday
                          ? 'bg-accent/15 text-ink'
                          : 'text-sub hover:bg-raised'
                    }`}
                    aria-label={ariaParts.join(' ')}
                  >
                    <span className="mono">{cell.day}</span>
                    {hasNote && (
                      <span
                        className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                          hasTheme ? 'bg-accent' : 'bg-faint'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export default Sidebar;

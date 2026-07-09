/**
 * useDayNote フック（[roadmap.md T-1-12]）
 *
 * 指定日付の DayNoteFull を取得・保持する。日付が変わると再フェッチする。
 * Phase 1 では「取得して state へ反映」のみ。自動保存（flush）は Phase 2。
 *
 * レース条件対策: 日付を高速で切り替えた際、複数の fetch が並走する。
 * リクエスト世代番号（reqIdRef）で最新のリクエストのみ state に反映し、
 * 古いレスポンスが巻き戻るのを防ぐ。refetch（手動再取得）も同一仕組みで保護される。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayNoteFull } from 'shared-types';
import { ApiClientError, fetchDayNoteFull } from '../api/client.js';

export type UseDayNoteState = {
  data: DayNoteFull | null;
  loading: boolean;
  error: ApiClientError | Error | null;
};

/**
 * @param date YYYY-MM-DD。この値が変わると再フェッチする。
 */
export function useDayNote(date: string): UseDayNoteState & {
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<UseDayNoteState>({
    data: null,
    loading: true,
    error: null,
  });

  // フェッチリクエストの世代番号。最新リクエストのみ state に反映する。
  const reqIdRef = useRef(0);

  const fetchForDate = useCallback(async (targetDate: string) => {
    const reqId = ++reqIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const full = await fetchDayNoteFull(targetDate);
      // より新しいリクエストが開始されていれば破棄
      if (reqIdRef.current !== reqId) return;
      setState({ data: full, loading: false, error: null });
    } catch (err) {
      if (reqIdRef.current !== reqId) return;
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  useEffect(() => {
    void fetchForDate(date);
  }, [date, fetchForDate]);

  const refetch = useCallback(() => fetchForDate(date), [date, fetchForDate]);

  return { ...state, refetch };
}

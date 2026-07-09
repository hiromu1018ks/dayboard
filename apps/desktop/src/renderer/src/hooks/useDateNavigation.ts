/**
 * useDateNavigation フック（[roadmap.md T-1-14]）
 *
 * 現在表示中の日付（currentDate）を管理し、前日/翌日/今日への移動を提供する
 * （[ui_interaction_spec.md §7]）。
 *
 * Phase 1 では currentDate の更新のみ。未保存flush の接続は Phase 2（T-2-10）。
 * ショートカット（Alt/Option+←/→, ⌘/Ctrl+T）からの呼び出しは Phase 7。
 */

import { useCallback, useState } from 'react';
import { addDays, todayLocal } from '@dayboard/domain';

/**
 * @param initialDate 初期表示日付（YYYY-MM-DD）。通常は起動時に todayLocal() で算出。
 */
export function useDateNavigation(initialDate: string = todayLocal()) {
  const [currentDate, setCurrentDate] = useState(initialDate);

  /** 前日へ移動 */
  const goPrevDay = useCallback(() => {
    setCurrentDate((d) => addDays(d, -1));
  }, []);

  /** 翌日へ移動 */
  const goNextDay = useCallback(() => {
    setCurrentDate((d) => addDays(d, 1));
  }, []);

  /** 今日へ移動 */
  const goToday = useCallback(() => {
    setCurrentDate(todayLocal());
  }, []);

  /** 任意の日付へ直接移動（YYYY-MM-DD） */
  const goTo = useCallback((date: string) => {
    setCurrentDate(date);
  }, []);

  /** 今日の日付と一致するか（「今日」ボタンの強調表示用） */
  const isToday = currentDate === todayLocal();

  return {
    currentDate,
    goPrevDay,
    goNextDay,
    goToday,
    goTo,
    isToday,
  };
}

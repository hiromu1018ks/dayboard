/**
 * 表示モード（viewMode）状態（[roadmap.md T-4-05]、[ui_interaction_spec.md §2.1]）
 *
 * dayborad は2つの表示モードを持つ（[要件 7.7]）:
 * - `work`: 仕事整理モード（TODO / 障害 / 振り返り）
 * - `note`: ノートモード（会議・打ち合わせ・会話メモ）
 *
 * 起動直後は常に `work` で開く（[要件 7.7]、[ui_interaction_spec.md §2.1]）。
 * `DayNote.lastOpenedMode` は参考記録だが、起動時の強制上書きは行わない。
 */

import { useCallback, useState } from 'react';

/** 表示モード */
export type ViewMode = 'work' | 'note';

/**
 * viewMode を管理するフック。
 *
 * @returns viewMode と操作群
 */
export function useViewMode(): {
  viewMode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
} {
  // 起動直後は常に work（[要件 7.7]）
  const [viewMode, setViewMode] = useState<ViewMode>('work');

  const setMode = useCallback((mode: ViewMode) => setViewMode(mode), []);

  const toggleMode = useCallback(() => {
    setViewMode((prev) => (prev === 'work' ? 'note' : 'work'));
  }, []);

  return { viewMode, setMode, toggleMode };
}

/**
 * Vim操作状態表示バッジ（[roadmap.md T-7-08]、[要件 9.4]、[ui_interaction_spec.md §1]）
 *
 * Vimキーバインド利用時に、現在の Vim操作状態（Normal / Insert）を右下に控えめに表示する。
 *
 * [要件 9.4]:
 * - 標準キーバインドとVimキーバインドの現在状態を明確に表示
 * - Vim利用中は `NORMAL` / `INSERT` として分かるようにする
 * - 操作状態表示は控えめにし、入力の邪魔にならない位置（右下）に置く
 *
 * 標準キーバインド時は何も表示しない（状態概念がないため）。
 * 表示例（[要件 9.4]）: `右下表示：VIM NORMAL` / `右下表示：VIM INSERT`
 */

import type { KeybindingMode } from 'shared-types';

/** Vim操作状態（[ui_interaction_spec.md §1]、[要件 8.6]） */
export type VimState = 'normal' | 'insert';

export type VimStateBadgeProps = {
  /** 現在のキーバインドモード。`standard` の時は非表示 */
  keybindingMode: KeybindingMode;
  /** 現在の Vim操作状態（keybindingMode='vim' のときのみ有意） */
  vimState: VimState;
};

/**
 * Vim操作状態バッジ。
 *
 * - 標準キーバインド時は null を返し何も表示しない
 * - Vim時は右下に固定で `VIM NORMAL` / `VIM INSERT` を表示
 * - Insert のほうが目立つ色（入力中であることが分かるように）
 */
export function VimStateBadge({ keybindingMode, vimState }: VimStateBadgeProps) {
  // 標準キーバインド時は状態概念がないため非表示（[要件 9.4]）
  if (keybindingMode !== 'vim') return null;

  const isInsert = vimState === 'insert';
  const label = isInsert ? 'VIM INSERT' : 'VIM NORMAL';

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-4 z-30 select-none"
      aria-live="polite"
      data-testid="vim-state-badge"
    >
      <span
        className={`rounded px-2 py-0.5 font-mono text-xs tracking-wide ${
          isInsert ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default VimStateBadge;

/**
 * Esc キーの優先順位処理（[roadmap.md T-4-07/T-7-09/T-7-G-02]、[ui_interaction_spec.md §9.2]）
 *
 * Esc は以下の4段の固定優先順位で処理される。上位が消費したら下位へは渡さない。
 *
 *   1. IME 変換中        → 変換キャンセル/確定のみ（本モジュール到達前にガード済み）
 *   2. Vim Insert 状態    → Normal 状態へ戻るのみ（AC-17）
 *   3. モーダル open（設定 / キーバインドガイド） → 開いているモーダルを閉じるのみ（AC-23）
 *   4. ノートモード時     → 仕事整理モードへ戻る（AC-04、AC-18）
 *
 * Phase 4 で実装したのは段4。Phase 7 で段2・段3 を差し込む。
 */

import type { ViewMode } from '../state/viewMode.js';
import type { VimState } from '../components/VimStateBadge.js';

/** Esc 処理に必要な文脈 */
export type EscContext = {
  /** 現在の表示モード */
  viewMode: ViewMode;
  /** 現在の Vim操作状態（keybindingMode='vim' 時のみ有意。標準時は常に 'normal' 扱い） */
  vimState: VimState;
  /** 設定モーダルが開いているか */
  settingsOpen: boolean;
  /** キーバインドガイドが開いているか（[§10.5]、AC-23） */
  helpOpen: boolean;
  /** Vim操作状態を変更する（Insert→Normal）。undefined の場合は変更不要 */
  setVimState?: (state: VimState) => void;
  /**
   * Insert → Normal 復帰時に、選択要素（section/button）へフォーカスを戻す。
   * 入力欄からフォーカスを外さないと hjkl がスルー判定で効かないため必須。
   * 仕事整理モード（viewMode='work'）でのみ有意。
   */
  refocusSelection?: () => void;
  /** 設定モーダルを閉じる */
  closeSettings?: () => void;
  /** キーバインドガイドを閉じる（[§10.5]、AC-23） */
  closeHelp?: () => void;
  /** 表示モードを work へ戻す */
  goToWork: () => void;
};

/**
 * Esc キーを処理する。
 *
 * [ui_interaction_spec.md §9.2] の優先順位に従い、最初に該当した段だけ実行する。
 * いずれの段にも該当しない場合は何もしない。
 *
 * @returns 何らかの処理を実行した場合 true（親ハンドラで preventDefault 判断に使用）
 */
export function handleEsc(ctx: EscContext): boolean {
  // 段1: IME 変換中は本関数呼出前にガード済み（guardIme.isComposing）。

  // 段2: Vim Insert → Normal（AC-17）。
  //   Vimキーバインドの Insert 状態で Esc を押した場合は Normal へ戻る。
  //   仕事整理モードでは入力欄からフォーカスを外し、選択要素（section/button）へ戻す。
  //   （入力欄にフォーカスが残ると hjkl がスルー判定で効かなくなるため）
  //   ノートモードでは CodeMirror 側へ Esc を渡す（離脱しない、[要件 8.6]、AC-17）。
  if (ctx.vimState === 'insert') {
    ctx.setVimState?.('normal');
    ctx.refocusSelection?.();
    return true;
  }

  // 段3: モーダル open（設定 / キーバインドガイド）→ 開いているモーダルを閉じる（[§9.2]、AC-23）。
  //   両方が同時に開くことはないが、念のため開いている方を閉じる。
  if (ctx.settingsOpen) {
    ctx.closeSettings?.();
    return true;
  }
  if (ctx.helpOpen) {
    ctx.closeHelp?.();
    return true;
  }

  // 段4: ノートモード時 → 仕事整理モードへ戻る（AC-04、AC-18 相当）。
  //   Vim Normal 状態でノートモード中に Esc を押した場合は仕事整理モードへ戻る（AC-18）。
  if (ctx.viewMode === 'note') {
    ctx.goToWork();
    return true;
  }

  return false;
}

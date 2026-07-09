/**
 * Esc キーの優先順位処理（[roadmap.md T-4-07]、[ui_interaction_spec.md §9.2]）
 *
 * Esc は以下の4段の固定優先順位で処理される。上位が消費したら下位へは渡さない。
 *
 *   1. IME 変換中        → 変換キャンセル/確定のみ（本モジュール到達前にガード済み）
 *   2. Vim Insert 状態    → Normal 状態へ戻るのみ（Phase 7 で差し込み）
 *   3. 設定モーダル open  → モーダルを閉じるのみ（Phase 7 で設定モーダル実装時）
 *   4. ノートモード時     → 仕事整理モードへ戻る
 *
 * Phase 4 で実装するのは段4（モード戻り）のみ。
 * 段2（Vim Insert→Normal）・段3（モーダル）は Phase 7 で追加するため、
 * コメントで予約枠を明示しておく。
 */

import type { ViewMode } from '../state/viewMode.js';

/** Esc 処理に必要な文脈 */
export type EscContext = {
  /** 現在の表示モード */
  viewMode: ViewMode;
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

  // 段2: Vim Insert → Normal（Phase 7 T-7-09 で差し込み）。
  // if (vimState === 'insert') { setVimState('normal'); return true; }

  // 段3: 設定モーダル open → モーダル閉じる（Phase 7 T-7-02 実装時）。
  // if (settingsModalOpen) { closeSettingsModal(); return true; }

  // 段4: ノートモード時 → 仕事整理モードへ戻る（AC-04、AC-18 相当の標準キーバインド挙動）。
  if (ctx.viewMode === 'note') {
    ctx.goToWork();
    return true;
  }

  return false;
}

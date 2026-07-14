/**
 * 標準キーバインド判定ヘルパ（[roadmap.md T-7-03/04]、[ui_interaction_spec.md §11.1/§11.2]）
 *
 * グローバルキーハンドラ（App.tsx）から呼ばれる、標準キーバインド専用の判定関数群。
 * Vimキーバインド利用時（keybindingMode='vim'）は、これら標準系の列フォーカス等は
 * Vimの Space 系コマンド（Space 1/2/3 等）へ置き換わるため、本モジュールの判定は
 * 実行されない（App 側で keybindingMode により分岐）。
 *
 * ただし一部（`⌘J` モード切替、`⌘T` 今日、`Option←/→` 前日翌日、Post-MVP無効化）は
 * 標準/Vim両方で共通して動く（[要件 8.6]: Vim利用時も主要アプリ内ショートカットは利用可能）。
 * これら共通系は standard.ts / vim.ts 双方から参照されるよう、共通系として個別関数化している。
 */

import type { WorkSection } from './focus.js';

/**
 * `⌘/Ctrl` 修飾キーが押されているか（Mac: metaKey、Win/Linux: ctrlKey）。
 * dayborad のショートカットは Mac は ⌘、それ以外は Ctrl で統一（[要件 8.1/8.2]）。
 */
export function isCmdOrCtrl(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

/**
 * Alt/Option 修飾キーが押されているか（[要件 8.1]: 前日/翌日）。
 */
export function isAlt(e: KeyboardEvent): boolean {
  return e.altKey;
}

/** キー名を小文字化して比較するためのヘルパ（CapsLock/Shift 吸収） */
function keyOf(e: KeyboardEvent): string {
  return e.key.toLowerCase();
}

// ============================================================================
// 共通ショートカット（標準 / Vim 両方で有効、[要件 8.6]）
// ============================================================================

/**
 * モード切替（`⌘/Ctrl+J`）のキー一致判定（[要件 8.1]、AC-03/04）。
 * 仕事整理 ⇄ ノート を切替。Vimキーバインドでも有効（[要件 8.6]）。
 */
export function isToggleModeShortcut(e: KeyboardEvent): boolean {
  return isCmdOrCtrl(e) && !e.shiftKey && !e.altKey && keyOf(e) === 'j';
}

/**
 * 今日へ戻る（`⌘/Ctrl+T`）のキー一致判定（[要件 8.1]、AC-10）。
 */
export function isGoTodayShortcut(e: KeyboardEvent): boolean {
  return isCmdOrCtrl(e) && !e.shiftKey && !e.altKey && keyOf(e) === 't';
}

/**
 * 前日へ（`Alt/Option+←`）のキー一致判定（[要件 8.1]、AC-10）。
 */
export function isGoPrevDayShortcut(e: KeyboardEvent): boolean {
  return isAlt(e) && !isCmdOrCtrl(e) && e.key === 'ArrowLeft';
}

/**
 * 翌日へ（`Alt/Option+→`）のキー一致判定（[要件 8.1]、AC-10）。
 */
export function isGoNextDayShortcut(e: KeyboardEvent): boolean {
  return isAlt(e) && !isCmdOrCtrl(e) && e.key === 'ArrowRight';
}

/**
 * サイドバー表示切替（`⌘/Ctrl+\`）のキー一致判定（Post-MVP: サイドバー機能）。
 * サイドバーの表示/非表示をトグルする。標準/Vim両方で有効。
 */
export function isToggleSidebarShortcut(e: KeyboardEvent): boolean {
  return isCmdOrCtrl(e) && !e.shiftKey && !e.altKey && keyOf(e) === '\\';
}

/**
 * Post-MVP ショートカット（`⌘/Ctrl+K`, `⌘/Ctrl+Shift+R`）の一致判定
 * （[要件 8.6]、[ui_interaction_spec.md §11.5]、AC-22）。
 *
 * これらは実装しない（不発）が、入力内容を破壊しないよう preventDefault で握り潰す。
 * 詳細は postMvp.ts の handlePostMvpShortcut を参照。
 *
 * 注意: `⌘/Ctrl+Shift+M`（時刻見出し）は Post-MVP から実装済み機能へ昇格したため、
 * 本判定からは除外されている。NoteEditor の CodeMirror keymap で消費される。
 */
export function isPostMvpShortcut(e: KeyboardEvent): boolean {
  if (!isCmdOrCtrl(e)) return false;
  const k = keyOf(e);
  // ⌘K（コマンドパレット、Shift 無し）
  if (!e.shiftKey && k === 'k') return true;
  // ⌘Shift+R（振り返り送信）
  if (e.shiftKey && k === 'r') return true;
  return false;
}

// ============================================================================
// 仕事整理モード専用ショートカット（標準キーバインドのみ、[要件 8.2]）
// ============================================================================

/**
 * 列フォーカス（`⌘/Ctrl+1`, `⌘/Ctrl+2`, `⌘/Ctrl+3`）の判定と対象セクションの取得
 * （[要件 8.2]、[ui_interaction_spec.md §11.2]、AC-02）。
 *
 * @returns 対応するセクション（todo/blocker/reflection）。該当しない場合は null
 */
export function matchColumnFocusShortcut(e: KeyboardEvent): WorkSection | null {
  if (!isCmdOrCtrl(e) || e.shiftKey || e.altKey) return null;
  if (e.key === '1') return 'todo';
  if (e.key === '2') return 'blocker';
  if (e.key === '3') return 'reflection';
  return null;
}

/**
 * TODO追加（`⌘/Ctrl+Enter`）のキー一致判定（仕事整理モード、[要件 8.2]、[§11.2]）。
 * Shift 無し。ノートモードでは TODO化（別処理）として扱われるため、本判定は
 * 呼び出し元で viewMode='work' の場合のみ用いること。
 */
export function isAddTodoShortcut(e: KeyboardEvent): boolean {
  return isCmdOrCtrl(e) && !e.shiftKey && !e.altKey && e.key === 'Enter';
}

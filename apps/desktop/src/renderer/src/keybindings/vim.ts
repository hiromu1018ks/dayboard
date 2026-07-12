/**
 * Vimキーバインド（[roadmap.md T-7-05/06/07]、[要件 8.6]、[ui_interaction_spec.md §3.4/§3.5]）
 *
 * CodeMirror の Vim 拡張（`@replit/codemirror-vim`）の有効化と、仕事整理モードでの
 * Vim 操作（h/j/k/l, i, x, Space 系）を提供する。
 *
 * 2つの領域がある（[ui_interaction_spec.md §3.4]）:
 * 1. **ノートモード**: CodeMirror の Vim 拡張に完全に委譲。h/j/k/l, i, Esc 等は
 *    CodeMirror 内で処理される。アプリ層は `Space n`（モード切替）のみ処理。
 * 2. **仕事整理モード**: 通常の `<input>` / `<textarea>` 要素が対象。CodeMirror は関与
 *    しないため、アプリ層で Normal/Insert を管理し、h/j/k/l, i, x, Space 系を処理する。
 *
 * Normal/Insert の意味（[要件 8.6]）:
 * - Normal: 移動・選択・TODO化・モード切替等の操作を行う状態（文字入力しない）
 * - Insert: テキスト入力を行う状態。`i` で入り、`Esc` で Normal へ戻る
 *
 * Insert 状態では h/j/k/l はテキストカーソル移動（input/textarea 標準挙動）として扱い、
 * アプリ層では何もしない（[§3.4]: Insert状態では CodeMirror/入力欄のテキストカーソル移動）。
 */

import { vim, getCM } from '@replit/codemirror-vim';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ViewMode } from '../state/viewMode.js';
import type { VimState } from '../components/VimStateBadge.js';
import { focusAdjacentSection, focusItemInCurrentSection, focusSection } from './focus.js';

// ============================================================================
// T-7-05: CodeMirror Vim 拡張の有効化
// ============================================================================

/**
 * CodeMirror 用 Vim 拡張を生成する（[roadmap.md T-7-05]）。
 *
 * keybindingMode='vim' のときのみ NoteEditor の extensions へ追加する。
 * 'standard' の場合は呼び出さず、CodeMirror は通常エディタとして動く。
 *
 * @replit/codemirror-vim の `vim()` は Extension を返し、CodeMirror を Vim モードへ切替。
 * CodeMirror 内部で Normal/Insert が管理される。
 */
export function createVimExtension(): Extension {
  return vim();
}

/**
 * CodeMirror の Vim 操作状態（Normal/Insert）を取得する（[roadmap.md T-7-05]）。
 *
 * `@replit/codemirror-vim` の `getCM(view)` で CodeMirror インスタンスを取得し、
 * `vim.mode` プロパティから現在状態を読む。取得失敗時は null。
 *
 * アプリ層の `vimState` と CodeMirror 内部状態の同期に使用する。
 */
export function getCodeMirrorVimMode(view: EditorView | null): VimState | null {
  if (!view) return null;
  const cm = getCM(view);
  if (!cm) return null;
  // @replit/codemirror-vim は CodeMirror インスタンスへ vim プロパティを生やす
  const cmAny = cm as unknown as { vim?: () => { mode?: string } | undefined };
  const state = cmAny.vim?.();
  if (!state || typeof state.mode !== 'string') return null;
  if (state.mode === 'insert') return 'insert';
  return 'normal';
}

// ============================================================================
// T-7-06/07: 仕事整理モードの Vim 操作（アプリ層）
// ============================================================================

/**
 * Vim キーイベントを仕事整理モードで処理するか判定するための文脈。
 * - `vimState`: Normal/Insert。Normal のみ h/j/k/l/x/Space を処理
 * - `goToWork` / `toggleMode`: Space n でモード切替
 */
export type VimWorkContext = {
  vimState: VimState;
  viewMode: ViewMode;
  /** TODO完了切替（AC-09、Vim x） */
  toggleCurrentTodo: () => void;
};

/**
 * Vim のキーイベント処理結果。
 * - `'handled'`: アプリ層で処理した（preventDefault 推奨）
 * - `'leader-pending'`: Space リーダー待ち状態に入った（後続キーを待つ）
 * - `'none'`: 該当なし（親ハンドラで他処理へ流す）
 */
export type VimHandleResult = 'handled' | 'none';

/**
 * Space リーダーキーのタイムアウト（[ui_interaction_spec.md §3.5]: 200ms）。
 * 200ms以内に次キーが来なければキャンセル（[edge_cases.md §9.4]）。
 */
export const SPACE_LEADER_TIMEOUT_MS = 200;

/**
 * 仕事整理モード（viewMode='work'）での Vim キーイベントを処理する。
 *
 * [ui_interaction_spec.md §3.4/§3.5]、[要件 8.6]:
 * - Normal状態:
 *   - `h/l`: 列移動（theme↔todo↔blocker↔reflection）
 *   - `j/k`: 同列の項目移動（下/上）
 *   - `i`: Insert 状態へ移行（フォーカス要素のまま入力可能に）
 *   - `x`: TODO完了切替（現在フォーカスのTODO）
 *   - `Space n`: モード切替
 *   - `Space 1/2/3`: 列フォーカス
 *   - `Space t/b`: ノートモードの選択行TODO化/障害化（仕事整理モードでは無意味、何もしない）
 * - Insert状態:
 *   - h/j/k/l は入力欄のテキストカーソル移動（標準挙動に任せ、アプリ層は処理しない）
 *   - `Esc`: Normal へ戻る（escPriority.ts 段2で処理）
 *
 * @returns 'handled' の場合、呼び出し元で preventDefault を呼ぶこと
 */
export function handleVimWorkKey(e: KeyboardEvent, ctx: VimWorkContext): VimHandleResult {
  // Insert状態では h/j/k/l/i/x/Space 等の Vim コマンドを処理しない（テキスト入力に専念）
  if (ctx.vimState === 'insert') return 'none';

  const key = e.key;

  // ----- 通常キー（Space リーダー不要） -----

  // h: 左の列へ（[§3.4]）
  if (key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (focusAdjacentSection('left')) return 'handled';
    return 'none';
  }
  // l: 右の列へ
  if (key === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (focusAdjacentSection('right')) return 'handled';
    return 'none';
  }
  // j: 同列の次項目（下）
  if (key === 'j' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (focusItemInCurrentSection('down')) return 'handled';
    return 'none';
  }
  // k: 同列の前項目（上）
  if (key === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (focusItemInCurrentSection('up')) return 'handled';
    return 'none';
  }
  // i: Insert へ（AC-16）。実状態の切替は親（setVimState）で行う。
  //    ここでは「i が押された」という合図として 'handled' を返す（親で setVimState('insert')）。
  if (key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'handled';
  }
  // x: TODO完了切替（AC-09）
  if (key === 'x' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    ctx.toggleCurrentTodo();
    return 'handled';
  }

  // ----- Space リーダーキー -----
  // Space の後のキーは親の handleSpaceLeader で処理する（リーダー状態管理が必要なため）

  return 'none';
}

/**
 * Space リーダー後のコマンドキーを処理する。
 *
 * [ui_interaction_spec.md §3.5]:
 * - `Space n`: モード切替（work ⇄ note）
 * - `Space 1/2/3`: 列フォーカス（todo/blocker/reflection）
 * - `Space t`: 選択行TODO化（ノートモード用。仕事整理モードでは無意味）
 * - `Space b`: 選択行障害化（ノートモード用）
 *
 * @param commandKey Space に続く1キー（小文字化済み）
 * @returns 処理結果と、コールバックが必要な場合はその種別
 */
export type SpaceLeaderResult = {
  /** 'handled' = 処理した、'none' = 該当なし（キャンセル） */
  status: 'handled' | 'none';
  /** モード切替要求（Space n）。親で setModeWithFlush を呼ぶ */
  requestToggleMode?: boolean;
};

export function handleSpaceLeader(commandKey: string): SpaceLeaderResult {
  switch (commandKey) {
    case 'n':
      // モード切替（親で flush 付き切替を実行）
      return { status: 'handled', requestToggleMode: true };
    case '1':
      focusSection('todo');
      return { status: 'handled' };
    case '2':
      focusSection('blocker');
      return { status: 'handled' };
    case '3':
      focusSection('reflection');
      return { status: 'handled' };
    // Space t / Space b はノートモード専用。仕事整理モードでは無意味（何もしないで終了）
    case 't':
    case 'b':
      return { status: 'handled' };
    default:
      // 未定義の Space 系。Post-MVP（Space r, Space k）もここで握り潰す（AC-22）
      return { status: 'handled' };
  }
}

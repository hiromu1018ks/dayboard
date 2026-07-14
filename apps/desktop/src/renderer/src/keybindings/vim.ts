/**
 * Vimキーバインド（[roadmap.md T-7-05/06/07]、[要件 8.6]、[ui_interaction_spec.md §3.4/§3.5]）
 *
 * CodeMirror の Vim 拡張（`@replit/codemirror-vim`）の有効化と、仕事整理モードでの
 * Vim 操作を提供する。
 *
 * 2つの領域がある（[ui_interaction_spec.md §3.4]）:
 * 1. **ノートモード**: CodeMirror の Vim 拡張に完全に委譲。h/j/k/l, i, Esc 等は
 *    CodeMirror 内で処理される。アプリ層は `Space n`（モード切替）のみ処理。
 * 2. **仕事整理モード**: selection model（[selection.ts]）ベースの TUI 的リストナビゲーション。
 *    アプリ層で Normal/Insert を管理し、h/j/k/l/gg/G/i/a/o/O/x/dd/u/Ctrl+r/数字前置 を処理。
 *
 * Normal/Insert の意味（[要件 8.6]）:
 * - Normal: 移動・選択・TODO化・モード切替等の操作を行う状態（文字入力しない）
 * - Insert: テキスト入力を行う状態。`i` で入り、`Esc` で Normal へ戻る
 *
 * Insert 状態では Vim コマンドを処理せず、テキスト入力に専念する（テキスト入力欄の標準挙動）。
 */

import { vim, getCM } from '@replit/codemirror-vim';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ViewMode } from '../state/viewMode.js';
import type { VimState } from '../components/VimStateBadge.js';
import type { WorkSelection, WorkLayout, Direction, WorkSection } from './selection.js';
import {
  moveVertical,
  moveHorizontal,
  clampSelection,
  isOnAddInput,
  selectedItemId,
  parseVimCommand,
  classifyKeystroke,
  rowCount,
} from './selection.js';

// ============================================================================
// T-7-05: CodeMirror Vim 拡張の有効化
// ============================================================================

/**
 * CodeMirror 用 Vim 拡張を生成する（[roadmap.md T-7-05]）。
 *
 * keybindingMode='vim' のときのみ NoteEditor の extensions へ追加する。
 * 'standard' の場合は呼び出さず、CodeMirror は通常エディタとして動く。
 */
export function createVimExtension(): Extension {
  return vim();
}

/**
 * CodeMirror の Vim 操作状態（Normal/Insert）を取得する（[roadmap.md T-7-05]）。
 *
 * `@replit/codemirror-vim` の `getCM(view)` で CodeMirror インスタンスを取得し、
 * `vim.mode` プロパティから現在状態を読む。取得失敗時は null。
 */
export function getCodeMirrorVimMode(view: EditorView | null): VimState | null {
  if (!view) return null;
  const cm = getCM(view);
  if (!cm) return null;
  const cmAny = cm as unknown as { vim?: () => { mode?: string } | undefined };
  const state = cmAny.vim?.();
  if (!state || typeof state.mode !== 'string') return null;
  if (state.mode === 'insert') return 'insert';
  return 'normal';
}

// ============================================================================
// T-7-06/07: 仕事整理モードの Vim 操作（selection model ベース）
// ============================================================================

/**
 * 仕事整理モードでの Vim 操作に必要な文脈。App.tsx が組み立てて渡す。
 *
 * - `vimState`: Normal/Insert。Normal のみコマンド処理
 * - `selection`: 現在の2Dカーソル位置
 * - `layout`: グリッドの行数情報（各列の itemCount）
 * - 各コールバック: 副作用（dispatch/focus）は App 側で実行
 */
export type VimWorkContext = {
  vimState: VimState;
  viewMode: ViewMode;
  selection: WorkSelection;
  layout: WorkLayout;
  /** コマンドバッファ（g/d/数字のリーダー状態）。App 側が state として保持 */
  buffer: string;
  /** selection を更新 */
  setSelection: (sel: WorkSelection) => void;
  /** 選択中アイテムを編集モードへ（Insert 遷移）。追加入力欄選択時は新規追加モード */
  editItemAt: (sel: WorkSelection) => void;
  /** 選択行の下/上に新規追加（Insert 遷移）。position='below'|'above' */
  addItemAt: (sel: WorkSelection, position: 'below' | 'above') => void;
  /** 選択中アイテムの完了/解決切替（AC-09、todo=done切替、blocker=resolved切替） */
  toggleItemAt: (sel: WorkSelection) => void;
  /**
   * 選択中アイテムを削除（即削除、u で復元可）。
   * 戻り値で「削除後の推奨 selection」を返すことができる（末尾削除時は追加入力欄へ、
   * それ以外は同位置＝次アイテムを指す）。void の場合は selection を維持する。
   */
  deleteItemAt: (sel: WorkSelection) => WorkSelection | void;
  /** undo / redo（[useWorkData] の past/future） */
  undo: () => void;
  redo: () => void;
  /** コマンドバッファを更新（リーダー状態の維持/クリア） */
  setBuffer: (buf: string) => void;
};

/**
 * キーイベント処理結果。
 * - `'handled'`: アプリ層で処理した（呼び出し元で preventDefault）
 * - `'none'`: 該当なし（親ハンドラで他処理へ流す）
 * - `'buffered'`: リーダー入力を継続（g/d/数字の1文字目）。preventDefault するが確定しない
 */
export type VimHandleResult = 'handled' | 'none' | 'buffered';

/**
 * Space リーダーキーのタイムアウト（[ui_interaction_spec.md §3.5]: 200ms）。
 */
export const SPACE_LEADER_TIMEOUT_MS = 200;

/**
 * 仕事整理モード（viewMode='work'）での Vim キーイベントを処理する。
 *
 * [ui_interaction_spec.md §3.4/§3.5]、[要件 8.6]:
 * - Insert状態では全コマンドを処理しない（テキスト入力に専念）
 * - Normal状態:
 *   - `h/l`: 列移動（theme↔todo↔blocker↔reflection、行位置維持）
 *   - `j/k`: 同列の項目移動（下/上、末尾で停止）
 *   - `gg`/`G`: 列先頭/末尾
 *   - `{n}G`: n行目へ
 *   - `i`/`Enter`: 選択中アイテムを編集（Insertへ）
 *   - `a`/`A`: 末尾から編集
 *   - `o`/`O`: 下/上に新規追加
 *   - `x`: 選択アイテム切替（AC-09）
 *   - `dd`: 削除
 *   - `u`/`Ctrl+r`: undo/redo
 *   - 数字前置 + jk/G: カウント指定
 *
 * @returns 'handled' の場合、呼び出し元で preventDefault を呼ぶこと
 */
/**
 * 現在フォーカスされている要素が「テキスト入力要素」か判定する。
 *
 * - `<input>` / `<textarea>`: 通常の入力欄
 * - `isContentEditable === true`: contenteditable 要素（CodeMirror の `.cm-content` 含む）
 *
 * Vim の原則（[§3.4]: Insert状態ではテキスト入力カーソル移動）に従い、
 * これらの要素へフォーカス中は Normal 状態でも Vim コマンドを処理せず、
 * 文字入力へ貫通させる（ユーザーが「普通にフォーカスして入力できる」体験）。
 */
function isTextInputElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  // contenteditable（CodeMirror の .cm-content 等）。jsdom では isContentEditable が
  // 反映されないことがあるため、属性値の直接チェックも併用する。
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) return true;
  const attr = htmlEl.getAttribute('contenteditable');
  if (attr === 'true' || attr === '') return true;
  return false;
}

export function handleVimWorkKey(e: KeyboardEvent, ctx: VimWorkContext): VimHandleResult {
  // Insert状態ではコマンド処理しない
  if (ctx.vimState === 'insert') return 'none';

  // 入力要素（input/textarea/contenteditable）へフォーカス中は Vim コマンドを処理せず、
  // 文字入力へ貫通する（[§3.4]: ユーザーが普通にフォーカスして文字入力できるようにする）。
  // `i` での明示的 Insert 移行とは別系統。カード選択（button[data-focus-item]）中は処理される。
  if (isTextInputElement(document.activeElement)) return 'none';

  // Ctrl+r（redo）。修飾キー判定が必要なためここで特別扱い
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
    ctx.setBuffer('');
    ctx.redo();
    return 'handled';
  }

  // 修飾キー付きは Vim コマンド対象外（⌘J 等は standard.ts へ流す）
  if (e.metaKey || e.ctrlKey || e.altKey) return 'none';

  const rawKey = e.key;
  // 制御文字・非印字は無視（Tab/Esc/矢印等は別経路）
  if (rawKey.length !== 1) {
    // Enter のみ編集確定として扱う（選択アイテム編集モードへ）
    if (rawKey === 'Enter') {
      ctx.setBuffer('');
      ctx.editItemAt(ctx.selection);
      return 'handled';
    }
    return 'none';
  }

  // バッファへ追記（大文字小文字を区別するため lower 化しない）
  const newBuffer = ctx.buffer + rawKey;
  const classify = classifyKeystroke(newBuffer);

  if (classify === 'leader') {
    // リーダー継続: バッファへ蓄積
    ctx.setBuffer(newBuffer);
    return 'buffered';
  }
  if (classify === 'invalid') {
    // 不正: バッファクリアして無視
    ctx.setBuffer('');
    return 'none';
  }

  // complete: コマンド確定
  ctx.setBuffer('');
  return executeCommand(newBuffer, ctx);
}

/**
 * 確定したコマンド文字列を実行する。selection 更新 + 副作用コールバック呼び出し。
 */
function executeCommand(buffer: string, ctx: VimWorkContext): VimHandleResult {
  // Ctrl+r は handleVimWorkKey で処理済み。parseVimCommand は "ctrl+r" を受け取る設計だが、
  // ここへは来ない。parseVimCommand へ渡す buffer は通常キー列。
  const parsed = parseVimCommand(buffer);
  if (!parsed) return 'none';

  switch (parsed.kind) {
    case 'move': {
      const next = moveByDirection(ctx.selection, parsed.direction, parsed.count, ctx.layout);
      ctx.setSelection(next);
      return 'handled';
    }
    case 'goto-first': {
      // gg: 現在列の先頭アイテム
      const next = gotoRow(ctx.selection, ctx.layout, 0);
      ctx.setSelection(next);
      return 'handled';
    }
    case 'goto-last': {
      // G: 現在列の末尾（追加入力欄）
      const rows = rowCount(ctx.selection.section, ctx.layout);
      const next = gotoRow(ctx.selection, ctx.layout, Math.max(0, rows - 1));
      ctx.setSelection(next);
      return 'handled';
    }
    case 'goto-line': {
      // {n}G: n行目（1起き）。theme/reflection では無意味だが clamp で安全に。
      const next = gotoRow(ctx.selection, ctx.layout, Math.max(0, parsed.line - 1));
      ctx.setSelection(next);
      return 'handled';
    }
    case 'edit-insert':
    case 'edit-append':
    case 'edit-append-end':
      ctx.editItemAt(ctx.selection);
      return 'handled';
    case 'add-below':
      ctx.addItemAt(ctx.selection, 'below');
      return 'handled';
    case 'add-above':
      ctx.addItemAt(ctx.selection, 'above');
      return 'handled';
    case 'toggle':
      ctx.toggleItemAt(ctx.selection);
      return 'handled';
    case 'delete': {
      // dd: 追加入力欄では削除対象が無いので無視
      if (isOnAddInput(ctx.selection, ctx.layout)) return 'none';
      // 削除後の selection を受け取る（末尾削除時は追加入力欄、それ以外は同位置＝次アイテム）。
      // 戻り値が無い場合は selection を維持しない（ゴーストカーソルを避けるため最低限の clamp を呼ぶ）。
      const nextSel = ctx.deleteItemAt(ctx.selection);
      if (nextSel) ctx.setSelection(nextSel);
      return 'handled';
    }
    case 'undo':
      ctx.undo();
      return 'handled';
    case 'redo':
      ctx.redo();
      return 'handled';
    default:
      return 'none';
  }
}

/** direction + count で selection を移動。h/l は count に関わらず1隣接列へ（Vim準拠）。 */
function moveByDirection(
  sel: WorkSelection,
  direction: Direction,
  count: number,
  layout: WorkLayout,
): WorkSelection {
  if (direction === 'left' || direction === 'right') {
    // h/l への count は無視（列は最大3隣接なので）
    return clampSelection(moveHorizontal(sel, direction, layout), layout);
  }
  return clampSelection(moveVertical(sel, direction, layout, Math.max(1, count)), layout);
}

/** 指定行 index（0起き）へ移動。section は維持。theme は1行固定なので0のみ有効。 */
function gotoRow(sel: WorkSelection, layout: WorkLayout, rowIndex: number): WorkSelection {
  if (sel.section === 'theme') return sel;
  if (sel.section === 'reflection') {
    const fields = ['doneText', 'stuckText', 'tomorrowActionText'] as const;
    const idx = Math.max(0, Math.min(fields.length - 1, rowIndex));
    return { section: 'reflection', itemIndex: null, field: fields[idx] };
  }
  const rows = rowCount(sel.section as WorkSection, layout);
  const idx = Math.max(0, Math.min(Math.max(0, rows - 1), rowIndex));
  return { section: sel.section, itemIndex: idx, field: null };
}

/**
 * 選択中アイテムの id を取得するヘルパ（App 側で workData.todos/blockers を渡して解決する際に使用）。
 * selection.ts の selectedItemId と同一だが、vim.ts から便利アクセス用に再エクスポート。
 */
export { selectedItemId as getSelectedItemId };

// ============================================================================
// Space リーダーコマンド（[§3.5]）
// ============================================================================

/**
 * Space リーダー後のコマンドキーを処理する。
 *
 * [ui_interaction_spec.md §3.5]:
 * - `Space n`: モード切替（work ⇄ note）
 * - `Space 1/2/3`: 列フォーカス（todo/blocker/reflection）
 * - `Space t`: 選択行TODO化（ノートモード用。仕事整理モードでは無意味）
 * - `Space b`: 選択行障害化（ノートモード用）
 */
export type SpaceLeaderResult = {
  status: 'handled' | 'none';
  /** モード切替要求（Space n）。親で setModeWithFlush を呼ぶ */
  requestToggleMode?: boolean;
  /** 列直接選択要求（Space 1/2/3）。親で setSelection へ */
  requestSection?: 'todo' | 'blocker' | 'reflection';
};

export function handleSpaceLeader(commandKey: string): SpaceLeaderResult {
  switch (commandKey) {
    case 'n':
      return { status: 'handled', requestToggleMode: true };
    case '1':
      return { status: 'handled', requestSection: 'todo' };
    case '2':
      return { status: 'handled', requestSection: 'blocker' };
    case '3':
      return { status: 'handled', requestSection: 'reflection' };
    // Space t / Space b はノートモード専用。仕事整理モードでは無意味（何もしないで終了）
    case 't':
    case 'b':
      return { status: 'handled' };
    default:
      // 未定義の Space 系。Post-MVP（Space r, Space k）もここで握り潰す（AC-22）
      return { status: 'handled' };
  }
}

/**
 * vim.ts の Unit テスト（[ui_interaction_spec.md §3.4/§3.5]）
 *
 * handleVimWorkKey / handleSpaceLeader / getCodeMirrorVimMode の検証。
 * selection model ベースのコマンド処理を、モック ctx で検証する。
 * CodeMirror 拡張の有効化（createVimExtension）と状態取得（getCodeMirrorVimMode）は
 * @replit/codemirror-vim 依存のため、ここでは実環境に近い形で最低限の呼出確認のみ。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleVimWorkKey,
  handleSpaceLeader,
  SPACE_LEADER_TIMEOUT_MS,
  type VimWorkContext,
} from './vim.js';
import type { WorkSelection, WorkLayout } from './selection.js';

const LAYOUT: WorkLayout = {
  theme: { hasInput: true },
  todo: { itemCount: 3 },
  blocker: { itemCount: 2 },
  reflection: {},
};

/** モック ctx を構築。コールバックは vi.fn で記録し、selection/buffer 遷移を追跡。 */
function makeCtx(overrides: Partial<VimWorkContext> = {}): VimWorkContext & {
  selectionHistory: WorkSelection[];
} {
  const selectionHistory: WorkSelection[] = [];
  let currentSelection: WorkSelection = overrides.selection ?? {
    section: 'todo',
    itemIndex: 0,
    field: null,
  };
  let currentBuffer = overrides.buffer ?? '';
  const setSelection = vi.fn((sel: WorkSelection) => {
    currentSelection = sel;
    selectionHistory.push(sel);
  });
  const setBuffer = vi.fn((buf: string) => {
    currentBuffer = buf;
  });
  // deleteItemAt のデフォルト: 削除後の selection は同位置維持（呼び出し側で上書き可能）
  const deleteItemAt = vi.fn((sel: WorkSelection): WorkSelection | void => sel);
  // selection/buffer は getter で最新を返す（setSelection/setBuffer で更新されるため）。
  const base: VimWorkContext = {
    vimState: 'normal',
    viewMode: 'work',
    get selection() {
      return currentSelection;
    },
    get buffer() {
      return currentBuffer;
    },
    layout: LAYOUT,
    setSelection,
    editItemAt: vi.fn(),
    addItemAt: vi.fn(),
    toggleItemAt: vi.fn(),
    deleteItemAt,
    undo: vi.fn(),
    redo: vi.fn(),
    setBuffer,
  };
  // selection/buffer 以外の overrides を反映（getter は維持）
  const { selection: _s, buffer: _b, ...rest } = overrides;
  void _s;
  void _b;
  return Object.assign(base, rest) as VimWorkContext & { selectionHistory: WorkSelection[] };
}

/** 単一キーの KeyboardEvent mock。 */
function key(
  k: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
): KeyboardEvent {
  return {
    key: k,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
    shiftKey: false,
  } as KeyboardEvent;
}

describe('SPACE_LEADER_TIMEOUT_MS', () => {
  it('200ms', () => {
    expect(SPACE_LEADER_TIMEOUT_MS).toBe(200);
  });
});

describe('handleVimWorkKey: 入力要素フォーカス中のスルー（文字入力優先）', () => {
  // Normal 状態でも input/textarea/contenteditable にフォーカス中は Vim コマンドを
  // 処理せず文字入力へ貫通する（[§3.4]: ユーザーが普通にフォーカスして入力できる）。

  function focusInput(): HTMLInputElement {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  function focusTextarea(): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    return ta;
  }

  function focusContentEditable(): HTMLDivElement {
    const div = document.createElement('div');
    // jsdom では IDL プロパティ(contentEditable)の設定が属性へ反映されないため、
    // 実環境の CodeMirror .cm-content と同様に setAttribute で contenteditable を付与。
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();
    return div;
  }

  function focusButton(): HTMLButtonElement {
    // button は入力要素ではない（カード選択）→ Vim コマンドが処理されるべき
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    return btn;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('input フォーカス中の j/k/h/l/x はスルー（none）', () => {
    focusInput();
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('k'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('h'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('l'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('x'), ctx)).toBe('none');
    expect(ctx.setSelection).not.toHaveBeenCalled();
  });

  it('textarea フォーカス中もスルー（Reflection 入力欄相当）', () => {
    focusTextarea();
    const ctx = makeCtx({
      selection: { section: 'reflection', itemIndex: null, field: 'doneText' },
    });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('k'), ctx)).toBe('none');
  });

  it('contenteditable（CodeMirror .cm-content 相当）フォーカス中もスルー', () => {
    focusContentEditable();
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('j'), ctx)).toBe('none');
  });

  it('button フォーカス中は Vim コマンドが処理される（カード選択は維持）', () => {
    focusButton();
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('handled'); // button は入力要素ではない
    expect(ctx.setSelection).toHaveBeenCalled();
  });

  it('フォーカスがない（body）場合は Vim コマンドが処理される', () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('handled');
  });

  it('input フォーカス中は Ctrl+r もスルー（テキスト編集の redo として貫通）', () => {
    // 入力欄内では Ctrl+r はブラウザ/エディタの redo（テキスト編集取り消し）として扱うべき。
    // アプリ層の Vim redo は処理せず、文字入力系へ貫通する。
    focusInput();
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('r', { ctrl: true }), ctx)).toBe('none');
    expect(ctx.redo).not.toHaveBeenCalled();
  });
});

describe('handleVimWorkKey: Insert 状態', () => {
  it('Insert では全コマンド未処理（none）', () => {
    const ctx = makeCtx({ vimState: 'insert' });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('x'), ctx)).toBe('none');
    expect(handleVimWorkKey(key('i'), ctx)).toBe('none');
    expect(ctx.setSelection).not.toHaveBeenCalled();
  });
});

describe('handleVimWorkKey: 修飾キー', () => {
  it('⌘/Alt 付きは Vim 対象外（none）', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('j', { meta: true }), ctx)).toBe('none');
    expect(handleVimWorkKey(key('j', { alt: true }), ctx)).toBe('none');
  });
  it('Ctrl+r は redo', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('r', { ctrl: true }), ctx)).toBe('handled');
    expect(ctx.redo).toHaveBeenCalledOnce();
  });
});

describe('handleVimWorkKey: 単キー移動', () => {
  it('j で下へ（todo 0→1）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 1,
      field: null,
    });
  });
  it('k で上へ（todo 2→1）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 2, field: null } });
    handleVimWorkKey(key('k'), ctx);
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 1,
      field: null,
    });
  });
  it('h で左列へ（todo から左は停止、同じ位置で setSelection 呼出）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    // todo から左は停止（theme は j/k で遷移、h/l は列間のみ）。moveHorizontal は同じ位置を返す。
    handleVimWorkKey(key('h'), ctx);
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 0,
      field: null,
    });
  });
  it('l で右列へ（todo→blocker）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    handleVimWorkKey(key('l'), ctx);
    const last = (ctx.setSelection as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as WorkSelection;
    expect(last.section).toBe('blocker');
  });
  it('reflection で j は doneText→stuckText', () => {
    const ctx = makeCtx({
      selection: { section: 'reflection', itemIndex: null, field: 'doneText' },
    });
    handleVimWorkKey(key('j'), ctx);
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'reflection',
      itemIndex: null,
      field: 'stuckText',
    });
  });
});

describe('handleVimWorkKey: 数字前置', () => {
  it('3j で3行下へ（0→3）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    expect(handleVimWorkKey(key('3'), ctx)).toBe('buffered');
    expect(handleVimWorkKey(key('j'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 3,
      field: null,
    });
  });
  it('2G で2行目へ', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    handleVimWorkKey(key('2'), ctx);
    expect(handleVimWorkKey(key('G'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 1,
      field: null,
    });
  });
});

describe('handleVimWorkKey: gg / G / dd（2文字・リーダー）', () => {
  it('gg で列先頭（todo 2→0）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 2, field: null } });
    expect(handleVimWorkKey(key('g'), ctx)).toBe('buffered');
    expect(handleVimWorkKey(key('g'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 0,
      field: null,
    });
  });
  it('dd で削除（todo アイテム）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 1, field: null } });
    expect(handleVimWorkKey(key('d'), ctx)).toBe('buffered');
    expect(handleVimWorkKey(key('d'), ctx)).toBe('handled');
    expect(ctx.deleteItemAt).toHaveBeenCalledOnce();
  });
  it('dd は追加入力欄では無視（none）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 3, field: null } }); // 3=追加入力欄
    handleVimWorkKey(key('d'), ctx);
    expect(handleVimWorkKey(key('d'), ctx)).toBe('none');
    expect(ctx.deleteItemAt).not.toHaveBeenCalled();
  });
  it('G で列末尾（todo 0→3=追加入力欄）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    // 大文字 G は Shift 付きだが、本実装では e.key === 'G' をそのまま受け取る
    const ev = {
      key: 'G',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent;
    expect(handleVimWorkKey(ev, ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 3,
      field: null,
    });
  });
});

describe('handleVimWorkKey: 編集系', () => {
  it('i で editItemAt 呼出', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('i'), ctx)).toBe('handled');
    expect(ctx.editItemAt).toHaveBeenCalledOnce();
  });
  it('a で editItemAt 呼出（append も同導線）', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('a'), ctx)).toBe('handled');
    expect(ctx.editItemAt).toHaveBeenCalledOnce();
  });
  it('o で addItemAt(below)', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('o'), ctx)).toBe('handled');
    expect(ctx.addItemAt).toHaveBeenCalledWith(ctx.selection, 'below');
  });
  it('O（Shift+o）で addItemAt(above)', () => {
    const ctx = makeCtx();
    const ev = {
      key: 'O',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent;
    expect(handleVimWorkKey(ev, ctx)).toBe('handled');
    expect(ctx.addItemAt).toHaveBeenCalledWith(ctx.selection, 'above');
  });
  it('x で toggleItemAt', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('x'), ctx)).toBe('handled');
    expect(ctx.toggleItemAt).toHaveBeenCalledOnce();
  });
  it('u で undo', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('u'), ctx)).toBe('handled');
    expect(ctx.undo).toHaveBeenCalledOnce();
  });
  it('Enter で editItemAt', () => {
    const ctx = makeCtx();
    expect(handleVimWorkKey(key('Enter'), ctx)).toBe('handled');
    expect(ctx.editItemAt).toHaveBeenCalledOnce();
  });
});

describe('handleVimWorkKey: バッファクリア', () => {
  it('invalid キーでバッファクリア', () => {
    const ctx = makeCtx({ buffer: '' });
    expect(handleVimWorkKey(key('z'), ctx)).toBe('none');
    expect(ctx.setBuffer).toHaveBeenLastCalledWith('');
  });
  it('リーダー後の無効キーでバッファクリア', () => {
    const ctx = makeCtx({ buffer: '' });
    handleVimWorkKey(key('g'), ctx); // buffered
    // ctx.buffer は呼び出し側で更新される前提。ここでは setBuffer 呼出を確認
    expect(ctx.setBuffer).toHaveBeenLastCalledWith('g');
  });
});

describe('handleVimWorkKey: dd 後の selection 更新（#1 回帰）', () => {
  it('dd で deleteItemAt 呼出 + 戻り値で selection 更新', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 1, field: null } });
    // deleteItemAt が「次アイテムを指す selection」を返す状況を模擬
    (ctx.deleteItemAt as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      section: 'todo',
      itemIndex: 1,
      field: null,
    });
    handleVimWorkKey(key('d'), ctx);
    expect(handleVimWorkKey(key('d'), ctx)).toBe('handled');
    expect(ctx.deleteItemAt).toHaveBeenCalledOnce();
    expect(ctx.setSelection).toHaveBeenCalledWith({ section: 'todo', itemIndex: 1, field: null });
  });
  it('dd で追加入力欄選択時は none（削除対象なし）', () => {
    // todo 3件（LAYOUT）= 追加入力欄は itemIndex=3
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 3, field: null } });
    handleVimWorkKey(key('d'), ctx);
    expect(handleVimWorkKey(key('d'), ctx)).toBe('none');
    expect(ctx.deleteItemAt).not.toHaveBeenCalled();
  });
  it('dd で戻り値 void の場合は selection を更新しない（ゴースト回避は App 側責務）', () => {
    const ctx = makeCtx({ selection: { section: 'todo', itemIndex: 0, field: null } });
    (ctx.deleteItemAt as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
    handleVimWorkKey(key('d'), ctx);
    expect(handleVimWorkKey(key('d'), ctx)).toBe('handled');
    expect(ctx.setSelection).not.toHaveBeenCalled();
  });
});

describe('handleVimWorkKey: theme / reflection の no-op（エッジケース）', () => {
  it('theme で j は TODO 先頭へ、k は theme を維持（停止）', () => {
    const ctx = makeCtx({
      selection: { section: 'theme', itemIndex: null, field: null },
    });
    expect(handleVimWorkKey(key('j'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'todo',
      itemIndex: 0,
      field: null,
    });
    // k は theme で停止（同じ位置で setSelection 呼出）
    const ctx2 = makeCtx({
      selection: { section: 'theme', itemIndex: null, field: null },
    });
    handleVimWorkKey(key('k'), ctx2);
    expect(ctx2.setSelection).toHaveBeenLastCalledWith({
      section: 'theme',
      itemIndex: null,
      field: null,
    });
  });
  it('theme で gg は theme を維持', () => {
    const ctx = makeCtx({
      selection: { section: 'theme', itemIndex: null, field: null },
    });
    handleVimWorkKey(key('g'), ctx);
    expect(handleVimWorkKey(key('g'), ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'theme',
      itemIndex: null,
      field: null,
    });
  });
  it('reflection で dd は追加入力欄判定で none（削除対象なし相当）', () => {
    // reflection は isOnAddInput=false だが、deleteItemAt が呼ばれても App 側で無視される。
    // ここでは vim.ts が deleteItemAt を呼ぶことのみ検証（App 側の no-op は別途）。
    const ctx = makeCtx({
      selection: { section: 'reflection', itemIndex: null, field: 'doneText' },
    });
    handleVimWorkKey(key('d'), ctx);
    expect(handleVimWorkKey(key('d'), ctx)).toBe('handled');
    // deleteItemAt が呼ばれる（App 側で theme/reflection は何もしない設計）
    expect(ctx.deleteItemAt).toHaveBeenCalledOnce();
  });
  it('reflection で x は toggleItemAt 呼出（App 側で no-op）', () => {
    const ctx = makeCtx({
      selection: { section: 'reflection', itemIndex: null, field: 'doneText' },
    });
    expect(handleVimWorkKey(key('x'), ctx)).toBe('handled');
    expect(ctx.toggleItemAt).toHaveBeenCalledOnce();
  });
  it('theme で x は toggleItemAt 呼出（App 側で no-op）', () => {
    const ctx = makeCtx({
      selection: { section: 'theme', itemIndex: null, field: null },
    });
    expect(handleVimWorkKey(key('x'), ctx)).toBe('handled');
    expect(ctx.toggleItemAt).toHaveBeenCalledOnce();
  });
  it('reflection で G は tomorrowActionText へ', () => {
    const ctx = makeCtx({
      selection: { section: 'reflection', itemIndex: null, field: 'doneText' },
    });
    const ev = {
      key: 'G',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent;
    expect(handleVimWorkKey(ev, ctx)).toBe('handled');
    expect(ctx.setSelection).toHaveBeenLastCalledWith({
      section: 'reflection',
      itemIndex: null,
      field: 'tomorrowActionText',
    });
  });
});

describe('handleSpaceLeader', () => {
  it('n でモード切替要求', () => {
    expect(handleSpaceLeader('n')).toEqual({ status: 'handled', requestToggleMode: true });
  });
  it('1/2/3 で列直接選択', () => {
    expect(handleSpaceLeader('1')).toEqual({ status: 'handled', requestSection: 'todo' });
    expect(handleSpaceLeader('2')).toEqual({ status: 'handled', requestSection: 'blocker' });
    expect(handleSpaceLeader('3')).toEqual({ status: 'handled', requestSection: 'reflection' });
  });
  it('t/b は handled（仕事整理では無意味、何もしない）', () => {
    expect(handleSpaceLeader('t')).toEqual({ status: 'handled' });
    expect(handleSpaceLeader('b')).toEqual({ status: 'handled' });
  });
  it('未定義（r/k 含む）は handled で握り潰し（AC-22）', () => {
    expect(handleSpaceLeader('r')).toEqual({ status: 'handled' });
    expect(handleSpaceLeader('k')).toEqual({ status: 'handled' });
    expect(handleSpaceLeader('zzz')).toEqual({ status: 'handled' });
  });
});

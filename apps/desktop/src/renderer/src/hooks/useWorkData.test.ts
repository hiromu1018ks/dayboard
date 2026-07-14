/**
 * useWorkData reducer の Unit テスト（undo/redo・テキスト編集履歴結合）
 *
 * [ui_interaction_spec.md §3.4] の Vim `u`/`Ctrl+r`（全文編集含むフル undo/redo）の
 * 履歴圧縮ロジックを reducer 純粋関数レベルで検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reducer, type WorkState, type WorkAction } from './useWorkData.js';
import type { Reflection, TodoItem, BlockerItem } from 'shared-types';

// テスト用の最小 WorkState を生成
function state(data: {
  todos?: TodoItem[];
  blockers?: BlockerItem[];
  reflection?: Partial<Reflection>;
}): WorkState {
  const reflection: Reflection = {
    id: 'r1',
    dayNoteId: 'dn1',
    doneText: '',
    stuckText: '',
    tomorrowActionText: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...data.reflection,
  };
  return {
    data: {
      todos: data.todos ?? [],
      blockers: data.blockers ?? [],
      reflection,
    },
    past: [],
    future: [],
    lastEdit: null,
  };
}

function todo(id: string, title: string, order = 0): TodoItem {
  return {
    id,
    dayNoteId: 'dn1',
    title,
    status: 'todo',
    order,
    sourceNoteLineMetaId: null,
    carriedFromTodoId: null,
    carriedFromDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const updateTodo = (id: string, patch: Partial<TodoItem>): WorkAction => ({
  type: 'UPDATE_TODO',
  id,
  patch,
});
const updateReflection = (patch: Partial<Reflection>): WorkAction => ({
  type: 'UPDATE_REFLECTION',
  patch,
});

describe('reducer: 履歴の基本（非テキスト編集）', () => {
  it('ADD_TODO は past へ退避して future クリア', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const next = reducer(s, { type: 'ADD_TODO', todo: todo('t2', 'B', 1) });
    expect(next.data?.todos).toHaveLength(2);
    expect(next.past).toHaveLength(1); // 旧状態が past へ
    expect(next.future).toEqual([]);
  });

  it('DELETE_TODO は past へ退避', () => {
    const s = state({ todos: [todo('t1', 'A'), todo('t2', 'B', 1)] });
    const next = reducer(s, { type: 'DELETE_TODO', id: 't1' });
    expect(next.data?.todos).toHaveLength(1);
    expect(next.past).toHaveLength(1);
  });

  it('REPLACE_ALL は履歴クリア（日付移動等）', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const afterAdd = reducer(s, { type: 'ADD_TODO', todo: todo('t2', 'B', 1) });
    expect(afterAdd.past).toHaveLength(1);
    const afterReplace = reducer(afterAdd, {
      type: 'REPLACE_ALL',
      data: { todos: [], blockers: [], reflection: afterAdd.data!.reflection },
    });
    expect(afterReplace.past).toEqual([]);
    expect(afterReplace.future).toEqual([]);
  });
});

describe('reducer: undo/redo', () => {
  it('UNDO で past 末尾へ戻り、current は future へ', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const afterAdd = reducer(s, { type: 'ADD_TODO', todo: todo('t2', 'B', 1) });
    const afterUndo = reducer(afterAdd, { type: 'UNDO' });
    expect(afterUndo.data?.todos).toHaveLength(1); // t1 のみ
    expect(afterUndo.past).toEqual([]);
    expect(afterUndo.future).toHaveLength(1);
  });

  it('REDO で future 先頭へ進み、current は past へ', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const afterAdd = reducer(s, { type: 'ADD_TODO', todo: todo('t2', 'B', 1) });
    const afterUndo = reducer(afterAdd, { type: 'UNDO' });
    const afterRedo = reducer(afterUndo, { type: 'REDO' });
    expect(afterRedo.data?.todos).toHaveLength(2); // t1, t2
    expect(afterRedo.past).toHaveLength(1);
    expect(afterRedo.future).toEqual([]);
  });

  it('UNDO/REDO で lastEdit は null へ（結合窓リセット）', () => {
    // テキスト編集で lastEdit 設定 → UNDO で null へ
    const s = state({ todos: [todo('t1', 'A')] });
    const afterEdit = reducer(s, updateTodo('t1', { title: 'A2' }));
    expect(afterEdit.lastEdit).not.toBeNull();
    const afterUndo = reducer(afterEdit, { type: 'UNDO' });
    expect(afterUndo.lastEdit).toBeNull();
  });

  it('past 空の UNDO は無変化', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const next = reducer(s, { type: 'UNDO' });
    expect(next).toBe(s);
  });

  it('future 空の REDO は無変化', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    const next = reducer(s, { type: 'REDO' });
    expect(next).toBe(s);
  });
});

describe('reducer: テキスト編集の履歴結合（debounce autosave 対策）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('同対象への連続 UPDATE は時間窓内で結合（past 1エントリ）', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    // 1回目: 履歴追加
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const e1 = reducer(s, updateTodo('t1', { title: 'A1' }));
    expect(e1.past).toHaveLength(1);
    // 2回目: 100ms 後（窓内）→ 結合して past 増えない
    vi.setSystemTime(new Date('2026-01-01T00:00:00.100Z'));
    const e2 = reducer(e1, updateTodo('t1', { title: 'A2' }));
    expect(e2.past).toHaveLength(1); // 結合で増えない
    expect(e2.data?.todos[0]?.title).toBe('A2');
  });

  it('時間窓（800ms）超過後は別エントリ', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const e1 = reducer(s, updateTodo('t1', { title: 'A1' }));
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z')); // 1秒後（窓外）
    const e2 = reducer(e1, updateTodo('t1', { title: 'A2' }));
    expect(e2.past).toHaveLength(2); // 別エントリ
  });

  it('異なる id への UPDATE は結合しない', () => {
    const s = state({ todos: [todo('t1', 'A'), todo('t2', 'B', 1)] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const e1 = reducer(s, updateTodo('t1', { title: 'A1' }));
    vi.setSystemTime(new Date('2026-01-01T00:00:00.100Z'));
    const e2 = reducer(e1, updateTodo('t2', { title: 'B1' }));
    expect(e2.past).toHaveLength(2); // 異対象は結合しない
  });

  it('UPDATE_REFLECTION も同フィールドなら結合', () => {
    const s = state({});
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const e1 = reducer(s, updateReflection({ doneText: 'a' }));
    vi.setSystemTime(new Date('2026-01-01T00:00:00.100Z'));
    const e2 = reducer(e1, updateReflection({ doneText: 'ab' }));
    expect(e2.past).toHaveLength(1); // 同フィールドなら結合
    expect(e2.data?.reflection.doneText).toBe('ab');
  });

  it('テキスト編集 → UNDO で前状態へ戻る（結合された1エントリが戻る）', () => {
    const s = state({ todos: [todo('t1', 'A')] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const e1 = reducer(s, updateTodo('t1', { title: 'A1' }));
    vi.setSystemTime(new Date('2026-01-01T00:00:00.100Z'));
    const e2 = reducer(e1, updateTodo('t1', { title: 'A2' }));
    expect(e2.data?.todos[0]?.title).toBe('A2');
    // UNDO で 'A'（編集開始前）へ戻る（結合エントリが1つなので1回で戻る）
    const afterUndo = reducer(e2, { type: 'UNDO' });
    expect(afterUndo.data?.todos[0]?.title).toBe('A');
  });
});

describe('reducer: 初期状態（data===null）', () => {
  it('null からは REPLACE_ALL のみ許可', () => {
    const initial: WorkState = { data: null, past: [], future: [], lastEdit: null };
    const next = reducer(initial, {
      type: 'REPLACE_ALL',
      data: { todos: [], blockers: [], reflection: {} as Reflection },
    });
    expect(next.data).not.toBeNull();
  });
  it('null への ADD_TODO は無視', () => {
    const initial: WorkState = { data: null, past: [], future: [], lastEdit: null };
    const next = reducer(initial, { type: 'ADD_TODO', todo: todo('t1', 'A') });
    expect(next.data).toBeNull();
  });
});

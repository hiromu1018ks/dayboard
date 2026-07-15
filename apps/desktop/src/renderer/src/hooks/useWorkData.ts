/**
 * useWorkData フック（[roadmap.md T-3-09]）
 *
 * DayNoteFull のうち仕事整理モードが扱う部分（todos/blockers/reflection）を
 * ローカル state として保持し、楽観的更新（[autosave_spec.md §8.1]）を行う。
 *
 * 設計:
 * - useDayNote が取得した DayNoteFull をソースとして取り込む
 * - 日付が変わったら新たな DayNoteFull で state を初期化
 * - 同一日付内の data 変化（サーバー応答のマージ）では、ユーザー入力が
 *   サーバー保存結果で巻き戻るのを避けるため、未編集の場合のみ更新を取り込む
 *
 * 操作（追加/更新/削除/並替）はコンポーネントから呼ばれ、ローカル state を即時更新
 * （楽観的）。サーバー保存は各操作の呼び出し元（useAutosave 経由 or 直接 client）で行う。
 *
 * ## undo/redo（Vim `u` / `Ctrl+r`、全文編集含むフル対応）
 *
 * - 全 WorkData スナップショットを past/future スタックで保持する。
 * - 「全文編集含むフル undo」を実現するため、テキスト編集（UPDATE_TODO/UPDATE_BLOCKER/
 *   UPDATE_REFLECTION）も履歴対象。ただし debounce autosave による毎キーストロークの
 *   dispatch で履歴が細分化されるのを防ぐため、**同対象への連続 UPDATE を時刻窓で結合**する。
 *   結合条件: 同一 action.type & 同一 id/フィールド群 & 前回エントリから TIME_WINDOW_MS 以内。
 * - past スタックは上限 MAX_HISTORY 件（超過時は古い順に破棄）。
 * - REPLACE_ALL（日付移動・初回ロード・refetch）は別日のデータになりうるため、
 *   **履歴をクリア** する（別日の undo は無意味なため）。
 * - UNDO/REDO 自体は state を切替えるのみ。サーバー反映は呼び出し側（App.tsx）が
 *   autosave 経由で行う（差分に相当する保存操作を再送 = autosave と同じ経路）。
 */

import { type Dispatch, useEffect, useReducer, useRef } from 'react';
import type { BlockerItem, DayNoteFull, Reflection, TodoItem } from 'shared-types';

/** 仕事整理モードが扱うローカル状態。 */
export type WorkData = {
  todos: TodoItem[];
  blockers: BlockerItem[];
  reflection: Reflection;
};

/**
 * Reducer の内部状態。`past`/`future` で undo/redo 履歴を管理する。
 * 外部へは `data` のみ公開し、履歴は隠す（外部は `canUndo`/`canRedo` で状態参照のみ）。
 *
 * `WorkState` / `reducer` はテスト（[useWorkData.test.ts]）のために export する。
 * アプリ層からは直接触らないこと。
 */
export type WorkState = {
  data: WorkData | null;
  /** undo 用履歴（古い順）。各エントリは「その時点の data」のスナップショット。 */
  past: WorkData[];
  /** redo 用履歴。UNDO で押し出され、REDO で戻す。 */
  future: WorkData[];
  /**
   * 直近の編集情報（テキスト編集の履歴結合判定用）。
   * 同対象への連続 UPDATE を TIME_WINDOW_MS 以内にまとめて1履歴エントリへ圧縮する。
   * reducer は純粋関数であるべきだが、結合判定に時刻が必要なため `Date.now()` を参照する。
   * （同一 dispatch 内で呼ばれるため、再現性の問題は実用上無視できる）
   */
  lastEdit: { action: WorkAction; ts: number } | null;
};

/** undo/redo の履歴結合（連続テキスト編集のまとめ上げ）時間窓（ms）。 */
const TIME_WINDOW_MS = 800;
/** past スタックの上限。超過時は古い順に破棄（メモリ保護）。 */
const MAX_HISTORY = 100;

/** Reducer アクション。 */
export type WorkAction =
  | { type: 'REPLACE_ALL'; data: WorkData }
  | { type: 'ADD_TODO'; todo: TodoItem }
  | { type: 'UPDATE_TODO'; id: string; patch: Partial<TodoItem> }
  | { type: 'DELETE_TODO'; id: string }
  | { type: 'REORDER_TODOS'; orderedIds: string[] }
  | { type: 'ADD_BLOCKER'; blocker: BlockerItem }
  | { type: 'UPDATE_BLOCKER'; id: string; patch: Partial<BlockerItem> }
  | { type: 'DELETE_BLOCKER'; id: string }
  | { type: 'REORDER_BLOCKERS'; orderedIds: string[] }
  | { type: 'UPDATE_REFLECTION'; patch: Partial<Reflection> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

/**
 * アクションが「テキスト編集系（履歴結合対象）」か。連続する同一対象の編集を1エントリにまとめる。
 * 結合対象: UPDATE_TODO/UPDATE_BLOCKER/UPDATE_REFLECTION（debounce autosave で毎キー飛ぶため）。
 */
function isTextEditAction(action: WorkAction): boolean {
  return (
    action.type === 'UPDATE_TODO' ||
    action.type === 'UPDATE_BLOCKER' ||
    action.type === 'UPDATE_REFLECTION'
  );
}

/**
 * 2つの action が履歴結合可能か（同対象への連続テキスト編集）。
 * @param prev 直前の action（履歴の最後に適用されたもの）
 * @param next 今回の action
 * @param elapsedMs 前回適用からの経過 ms
 */
function shouldMergeHistory(prev: WorkAction | null, next: WorkAction, elapsedMs: number): boolean {
  if (elapsedMs > TIME_WINDOW_MS) return false;
  if (!prev || !isTextEditAction(prev) || !isTextEditAction(next)) return false;
  if (prev.type !== next.type) return false;
  // 同一対象（id または reflection=全体）の同一フィールド群への連続編集のみ結合
  if (prev.type === 'UPDATE_TODO' && next.type === 'UPDATE_TODO') {
    return prev.id === next.id && sameKeys(prev.patch, next.patch);
  }
  if (prev.type === 'UPDATE_BLOCKER' && next.type === 'UPDATE_BLOCKER') {
    return prev.id === next.id && sameKeys(prev.patch, next.patch);
  }
  // UPDATE_REFLECTION: 同一フィールドキーへの連続編集なら結合
  if (prev.type === 'UPDATE_REFLECTION' && next.type === 'UPDATE_REFLECTION') {
    return sameKeys(prev.patch, next.patch);
  }
  return false;
}

/** patch のキー集合が同じか（順不同）。 */
function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/** data 適用の純粋関数（履歴に触れない）。 */
function applyData(data: WorkData, action: WorkAction): WorkData {
  switch (action.type) {
    case 'REPLACE_ALL':
      return action.data;

    case 'ADD_TODO':
      return { ...data, todos: [...data.todos, action.todo] };

    case 'UPDATE_TODO':
      return {
        ...data,
        todos: data.todos.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };

    case 'DELETE_TODO':
      return {
        ...data,
        todos: data.todos.filter((t) => t.id !== action.id),
      };

    case 'REORDER_TODOS': {
      const map = new Map(data.todos.map((t) => [t.id, t]));
      const reordered: TodoItem[] = [];
      action.orderedIds.forEach((id, i) => {
        const todo = map.get(id);
        if (todo) reordered.push({ ...todo, order: i });
      });
      return { ...data, todos: reordered };
    }

    case 'ADD_BLOCKER':
      return { ...data, blockers: [...data.blockers, action.blocker] };

    case 'UPDATE_BLOCKER':
      return {
        ...data,
        blockers: data.blockers.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
      };

    case 'DELETE_BLOCKER':
      return {
        ...data,
        blockers: data.blockers.filter((b) => b.id !== action.id),
      };

    case 'REORDER_BLOCKERS': {
      const map = new Map(data.blockers.map((b) => [b.id, b]));
      const reordered: BlockerItem[] = [];
      action.orderedIds.forEach((id, i) => {
        const blocker = map.get(id);
        if (blocker) reordered.push({ ...blocker, order: i });
      });
      return { ...data, blockers: reordered };
    }

    case 'UPDATE_REFLECTION':
      return { ...data, reflection: { ...data.reflection, ...action.patch } };

    default:
      return data;
  }
}

/**
 * 履歴付き reducer。過去状態（current を past へ退避）→ 新状態適用 → future クリア。
 * テキスト編集の連続は結合して過去状態を上書き（1エントリに圧縮）。
 */
export function reducer(state: WorkState, action: WorkAction): WorkState {
  // 初期状態（data===null）からの遷移は REPLACE_ALL のみ許可。
  if (state.data === null) {
    if (action.type === 'REPLACE_ALL') {
      return { data: action.data, past: [], future: [], lastEdit: null };
    }
    return state;
  }

  // UNDO: past の末尾を取り出し、current を future へ
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1]!;
    return {
      data: previous,
      past: state.past.slice(0, -1),
      future: [state.data, ...state.future].slice(0, MAX_HISTORY),
      lastEdit: null, // undo/redo で結合窓はリセット
    };
  }
  // REDO: future の先頭を取り出し、current を past へ
  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0]!;
    return {
      data: next,
      past: [...state.past, state.data].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      lastEdit: null,
    };
  }

  // REPLACE_ALL は別日データになりうるため履歴クリア（日付移動・初回ロード・refetch）
  if (action.type === 'REPLACE_ALL') {
    return { data: action.data, past: [], future: [], lastEdit: null };
  }

  // 通常の編集: 履歴へ現在状態を退避してから新状態を適用。
  // テキスト編集の連続（同対象・時刻窓内）は結合して past の末尾1エントリへ圧縮。
  const newData = applyData(state.data, action);
  if (newData === state.data) return state; // 変化なし

  const now = Date.now();
  const merge =
    isTextEditAction(action) &&
    state.lastEdit !== null &&
    shouldMergeHistory(state.lastEdit.action, action, now - state.lastEdit.ts);

  if (merge) {
    // 結合: past の末尾（結合前のスナップショット）は保持したまま data のみ更新。
    // 連続テキスト編集の開始時点のスナップショットが1エントリとして残る。
    return {
      data: newData,
      past: state.past, // 末尾を追加せず維持（結合）
      future: [],
      lastEdit: { action, ts: now },
    };
  }

  return {
    data: newData,
    past: [...state.past, state.data].slice(-MAX_HISTORY),
    future: [], // 新規編集で redo 履歴は破棄
    lastEdit: isTextEditAction(action) ? { action, ts: now } : null,
  };
}

/**
 * DayNoteFull から WorkData へ変換。
 */
function toWorkData(full: DayNoteFull): WorkData {
  return {
    todos: full.todos,
    blockers: full.blockers,
    reflection: full.reflection,
  };
}

/**
 * @param data useDayNote が取得した DayNoteFull（null 时は何もしない）
 * @param date 現在日付（YYYY-MM-DD）。日付変更検知に用いる。
 */
export function useWorkData(
  data: DayNoteFull | null,
  date: string,
): {
  workData: WorkData | null;
  dispatch: Dispatch<WorkAction>;
  /** undo 可能か（past が空でない）。Vim `u` の有効/無効表示等に使用。 */
  canUndo: boolean;
  /** redo 可能か（future が空でない）。Vim `Ctrl+r` の有効/無効表示に使用。 */
  canRedo: boolean;
} {
  const [state, dispatch] = useReducer(reducer, {
    data: null,
    past: [],
    future: [],
    lastEdit: null,
  } as WorkState);

  // dispatch は useReducer 由来で安定（同一参照）。結合判定は reducer 内部で行うため、
  // ここではラップしない。これにより App.tsx の useCallback 依存配列が安定し、
  // 不要な再生成・keydown 再登録を防ぐ。

  // 前回取り込んだ data を参照し、以下のいずれかを満たすとき REPLACE_ALL する:
  //   (a) workData === null（初回ロード時）
  //   (b) 日付が変わった（prevDate !== date）。ただし data が新しい日付に切り替わった後。
  //   (c) 同一日付内の data 変化（refetch 等）。
  const prevDataRef = useRef<DayNoteFull | null>(null);
  const prevDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const isFirstLoad = prevDataRef.current === null;
    const isDateChanged = prevDateRef.current !== date;
    const isDataChanged = prevDataRef.current !== data;

    if (isFirstLoad) {
      dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
      prevDataRef.current = data;
      prevDateRef.current = date;
      return;
    }

    if (isDateChanged) {
      if (data.dayNote.date === date) {
        dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
        prevDataRef.current = data;
        prevDateRef.current = date;
      }
      return;
    }

    if (isDataChanged) {
      dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
      prevDataRef.current = data;
    }
  }, [data, date]);

  return {
    workData: state.data,
    dispatch,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

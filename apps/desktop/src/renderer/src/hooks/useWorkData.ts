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
 */

import { type Dispatch, useEffect, useReducer, useRef } from 'react';
import type { BlockerItem, DayNoteFull, Reflection, TodoItem } from 'shared-types';

/** 仕事整理モードが扱うローカル状態。 */
export type WorkData = {
  todos: TodoItem[];
  blockers: BlockerItem[];
  reflection: Reflection;
};

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
  | { type: 'UPDATE_REFLECTION'; patch: Partial<Reflection> };

function reducer(state: WorkData | null, action: WorkAction): WorkData | null {
  // 初期状態（null）からの遷移は REPLACE_ALL のみ許可。それ以外は null のまま。
  if (state === null) {
    return action.type === 'REPLACE_ALL' ? action.data : null;
  }
  switch (action.type) {
    case 'REPLACE_ALL':
      return action.data;

    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.todo] };

    case 'UPDATE_TODO':
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };

    case 'DELETE_TODO':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
      };

    case 'REORDER_TODOS': {
      // orderedIds の順に並び替え、order を 0,1,2... に振り直す
      const map = new Map(state.todos.map((t) => [t.id, t]));
      const reordered: TodoItem[] = [];
      action.orderedIds.forEach((id, i) => {
        const todo = map.get(id);
        if (todo) reordered.push({ ...todo, order: i });
      });
      return { ...state, todos: reordered };
    }

    case 'ADD_BLOCKER':
      return { ...state, blockers: [...state.blockers, action.blocker] };

    case 'UPDATE_BLOCKER':
      return {
        ...state,
        blockers: state.blockers.map((b) =>
          b.id === action.id ? { ...b, ...action.patch } : b,
        ),
      };

    case 'DELETE_BLOCKER':
      return {
        ...state,
        blockers: state.blockers.filter((b) => b.id !== action.id),
      };

    case 'REORDER_BLOCKERS': {
      const map = new Map(state.blockers.map((b) => [b.id, b]));
      const reordered: BlockerItem[] = [];
      action.orderedIds.forEach((id, i) => {
        const blocker = map.get(id);
        if (blocker) reordered.push({ ...blocker, order: i });
      });
      return { ...state, blockers: reordered };
    }

    case 'UPDATE_REFLECTION':
      return { ...state, reflection: { ...state.reflection, ...action.patch } };

    default:
      return state;
  }
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
export function useWorkData(data: DayNoteFull | null, date: string): {
  workData: WorkData | null;
  dispatch: Dispatch<WorkAction>;
} {
  const [workData, dispatch] = useReducer(reducer, null as WorkData | null);

  // 前回の日付を追跡し、日付が変わったら新データで置換（ユーザー入力を巻き戻さない）
  const prevDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    // 日付が変わった、または初回ロード時は全置換
    if (prevDateRef.current !== date || workData === null) {
      dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
      prevDateRef.current = date;
    }
    // 同一日付内の data 変化（サーバー応答の再フェッチ等）では
    // ユーザー編集を保持するため何もしない（楽観的更新の整合性、[autosave_spec.md §8.1]）
  }, [data, date, workData, prevDateRef]);

  return { workData, dispatch };
}

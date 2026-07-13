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
        blockers: state.blockers.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
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
export function useWorkData(
  data: DayNoteFull | null,
  date: string,
): {
  workData: WorkData | null;
  dispatch: Dispatch<WorkAction>;
} {
  const [workData, dispatch] = useReducer(reducer, null as WorkData | null);

  // 前回取り込んだ data を参照し、以下のいずれかを満たすとき REPLACE_ALL する:
  //   (a) workData === null（初回ロード時）
  //   (b) 日付が変わった（prevDate !== date）。ただし data が新しい日付に切り替わった後。
  //       日付変更直後は data がまだ前日値のことがあるため、data.dayNote.date === date
  //       になるまで待つ（前日データで上書きしてしまうのを防ぐ）。
  //   (c) 同一日付内の data 変化（refetch 等）。ただし前回取り込んだ data と異なる場合。
  //       convert/addTodo 等の楽観的更新後の refetch でサーバー値を取り込むため。
  //       ただし「ユーザー編集中の巻き戻り」を防ぐため、厳密な差分判定は行わず、
  //       data オブジェクトの参照が変わったときだけ取り込む（React の state 更新に準拠）。
  //
  // 備考: 楽観的更新の巻き戻り防止は各 dispatch 呼び出し側で行う（ADD_TODO 等は
  // ローカル state を即時更新し、refetch でサーバー値が来ても整合する設計）。
  const prevDataRef = useRef<DayNoteFull | null>(null);
  const prevDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const isFirstLoad = prevDataRef.current === null;
    const isDateChanged = prevDateRef.current !== date;
    const isDataChanged = prevDataRef.current !== data;

    if (isFirstLoad) {
      // 初回ロード: 必ず取り込む
      dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
      prevDataRef.current = data;
      prevDateRef.current = date;
      return;
    }

    if (isDateChanged) {
      // 日付変更: data が新しい日付に切り替わった後だけ取り込む
      // （前日データで上書きしてしまうのを防ぐ）
      if (data.dayNote.date === date) {
        dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
        prevDataRef.current = data;
        prevDateRef.current = date;
      }
      return;
    }

    // 同一日付内: data 参照が変わった（refetch 等）ときだけ取り込む。
    // convert 成功後の refetch で新しい TODO を取り込むため。
    if (isDataChanged) {
      dispatch({ type: 'REPLACE_ALL', data: toWorkData(data) });
      prevDataRef.current = data;
    }
  }, [data, date]);

  return { workData, dispatch };
}

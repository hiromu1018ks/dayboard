/**
 * アプリケーションルート（[roadmap.md T-1-12/13/14, T-2-07〜11, T-3-09/14]）
 *
 * 起動時に今日の DayNote を取得し（AC-01）、Header に日付・曜日・テーマ入力欄・
 * 日付移動ボタンを表示する（[要件 6.2]）。日付移動で currentDate が変わると
 * 再フェッチする（AC-10）。
 *
 * Phase 2 で追加:
 * - useAutosave でテーマ編集を800ms後に自動保存（AC-13/14、T-2-09）
 * - 日付移動の直前に flush を呼び、localStorage 同期書込成功で遷移（T-2-10）
 * - localStorage 書込失敗時は FlushFailDialog で確認（T-2-11）
 * - 右上に SaveStatus を表示（T-2-08）
 *
 * Phase 3 で追加:
 * - 仕事整理モードの3カラム（TODO/障害/振り返り）を統合（T-3-09）
 * - TODO/Blocker/Reflection の自動保存・即時保存エントリを動的生成
 * - carried/done 表示（T-3-14）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, todayLocal, toggleDone, type SaveTarget } from '@dayboard/domain';
import { FlushFailDialog } from './components/FlushFailDialog.js';
import { Header } from './components/Header.js';
import { SaveStatus } from './components/SaveStatus.js';
import { WorkMode } from './components/WorkMode.js';
import {
  createBlockerOrderSaver,
  createBlockerSaver,
  createReflectionSaver,
  createThemeSaver,
  createTodoOrderSaver,
  createTodoSaver,
} from './autosave/savers.js';
import { recoverOnStartup } from './autosave/recoverOnStartup.js';
import type { AutosaveEntry } from './autosave/types.js';
import {
  deleteBlocker as apiDeleteBlocker,
  deleteTodo as apiDeleteTodo,
  postBlocker as apiPostBlocker,
  postTodo as apiPostTodo,
} from './api/client.js';
import { useDateNavigation } from './hooks/useDateNavigation.js';
import { useAutosave } from './hooks/useAutosave.js';
import { useDayNote } from './hooks/useDayNote.js';
import { useFlushOnQuit } from './hooks/useFlushOnQuit.js';
import { useWorkData } from './hooks/useWorkData.js';
import type { Reflection } from 'shared-types';

/** テーマ保存対象の識別子（T-2-09） */
const THEME_TARGET: SaveTarget = { type: 'dayNote', field: 'theme' };
/** TODO 並替の保存対象識別子 */
const TODO_ORDER_TARGET: SaveTarget = { type: 'todoOrder' };
/** Blocker 並替の保存対象識別子 */
const BLOCKER_ORDER_TARGET: SaveTarget = { type: 'blockerOrder' };
/** 振り返りの保存対象識別子 */
const REFLECTION_TARGET: SaveTarget = { type: 'reflection' };

export default function App() {
  const { currentDate, goTo, isToday } = useDateNavigation();
  const { data, loading, error } = useDayNote(currentDate);
  const { workData, dispatch } = useWorkData(data, currentDate);

  // 保存エントリを data から動的生成（theme + 全 todo + todoOrder + 全 blocker + blockerOrder + reflection）
  // 日付ごと、各対象ごとに Saver を生成する（[autosave_spec.md §2.1]）
  const entries = useMemo<AutosaveEntry[]>(() => {
    const list: AutosaveEntry[] = [{ target: THEME_TARGET, saver: createThemeSaver(currentDate) }];
    if (workData) {
      for (const todo of workData.todos) {
        list.push({ target: { type: 'todo', id: todo.id }, saver: createTodoSaver(todo.id) });
      }
      list.push({ target: TODO_ORDER_TARGET, saver: createTodoOrderSaver(currentDate) });
      for (const blocker of workData.blockers) {
        list.push({
          target: { type: 'blocker', id: blocker.id },
          saver: createBlockerSaver(blocker.id),
        });
      }
      list.push({ target: BLOCKER_ORDER_TARGET, saver: createBlockerOrderSaver(currentDate) });
      list.push({ target: REFLECTION_TARGET, saver: createReflectionSaver(currentDate) });
    }
    return list;
  }, [currentDate, workData]);

  const { saveStatus, flush, retryAll, edit, saveNow } = useAutosave(currentDate, entries);

  // flush の最新参照を保持（終了時 IPC / beforeunload から呼ぶため、T-2-13）
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useFlushOnQuit(() => flushRef.current);

  // 起動時リカバリ: localStorage の未保存分を再送（§6.2、T-2-12）。
  // アプリマウント時に1回だけ実行（日付移動ごとに再実行しない）。
  useEffect(() => {
    void recoverOnStartup((date, target) => {
      if (target.type === 'dayNote' && target.field === 'theme') {
        return createThemeSaver(date);
      }
      if (target.type === 'reflection') {
        return createReflectionSaver(date);
      }
      if (target.type === 'todoOrder') {
        return createTodoOrderSaver(date);
      }
      if (target.type === 'blockerOrder') {
        return createBlockerOrderSaver(date);
      }
      if (target.type === 'todo') {
        return createTodoSaver(target.id);
      }
      if (target.type === 'blocker') {
        return createBlockerSaver(target.id);
      }
      return null;
    });
  }, []);

  // localStorage 書込失敗時の保留中遷移先（§9.3）。null=ダイアログ非表示。
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  /**
   * 日付移動のラッパー: flush → localStorage 成功で遷移、失敗で確認ダイアログ（T-2-10/11）。
   *
   * [autosave_spec.md §4.2/§9.3]:
   * - localStorage 同期書込成功をもって遷移を許可
   * - サーバー保存失敗中でも localStorage 書込成功後は遷移をブロックしない
   * - localStorage 書込自体の失敗時のみ遷移を止めてユーザーへ確認
   *
   * @param targetDate 遷移先日付（YYYY-MM-DD）
   */
  const navigateWithFlush = useCallback(
    async (targetDate: string) => {
      const { localStorageOk } = await flush();
      if (localStorageOk) {
        goTo(targetDate);
      } else {
        // localStorage 書込失敗: 遷移を保留して確認（§9.3）
        setPendingNav(targetDate);
      }
    },
    [flush, goTo],
  );

  const goPrevDay = useCallback(() => {
    void navigateWithFlush(addDays(currentDate, -1));
  }, [navigateWithFlush, currentDate]);

  const goNextDay = useCallback(() => {
    void navigateWithFlush(addDays(currentDate, 1));
  }, [navigateWithFlush, currentDate]);

  const goToday = useCallback(() => {
    void navigateWithFlush(todayLocal());
  }, [navigateWithFlush]);

  // ============================================================================
  // Phase 3: 仕事整理モードのハンドラ群
  // ============================================================================

  // --- TODO ---

  /** TODO 追加: 即時 API 呼出 + 楽観的 state 更新 */
  const handleAddTodo = useCallback(
    async (title: string) => {
      try {
        const created = await apiPostTodo(currentDate, title);
        dispatch({ type: 'ADD_TODO', todo: created });
      } catch (err) {
        // エラー時は再フェッチで同期（楽観的更新の巻き戻し）
        console.error('TODO追加に失敗:', err);
      }
    },
    [currentDate, dispatch],
  );

  /** TODO 完了切替: 即時保存（saveNow）+ 楽観的 state 更新（AC-09） */
  const handleToggleTodo = useCallback(
    (id: string) => {
      if (!workData) return;
      const todo = workData.todos.find((t) => t.id === id);
      if (!todo) return;
      const nextStatus = toggleDone(todo.status);
      dispatch({ type: 'UPDATE_TODO', id, patch: { status: nextStatus } });
      saveNow({ type: 'todo', id }, { status: nextStatus });
    },
    [workData, dispatch, saveNow],
  );

  /** TODO 本文編集: デバウンス保存（edit）+ 楽観的 state 更新 */
  const handleEditTodoTitle = useCallback(
    (id: string, title: string) => {
      dispatch({ type: 'UPDATE_TODO', id, patch: { title } });
      edit({ type: 'todo', id }, { title });
    },
    [dispatch, edit],
  );

  /** TODO 削除: 即時 API 呼出 + 楽観的 state 更新 */
  const handleDeleteTodo = useCallback(
    async (id: string) => {
      dispatch({ type: 'DELETE_TODO', id });
      try {
        await apiDeleteTodo(id);
      } catch (err) {
        console.error('TODO削除に失敗:', err);
      }
    },
    [dispatch],
  );

  /** TODO 並替: 即時保存（saveNow）+ 楽観的 state 更新 */
  const handleReorderTodos = useCallback(
    (orderedIds: string[]) => {
      dispatch({ type: 'REORDER_TODOS', orderedIds });
      saveNow(TODO_ORDER_TARGET, orderedIds);
    },
    [dispatch, saveNow],
  );

  // --- Blocker ---

  /** 障害追加: 即時 API 呼出 + 楽観的 state 更新 */
  const handleAddBlocker = useCallback(
    async (text: string, linkedTodoId: string | null) => {
      try {
        const created = await apiPostBlocker(currentDate, text, linkedTodoId);
        dispatch({ type: 'ADD_BLOCKER', blocker: created });
      } catch (err) {
        console.error('障害追加に失敗:', err);
      }
    },
    [currentDate, dispatch],
  );

  /** 障害解消切替: 即時保存（saveNow）+ 楽観的 state 更新 */
  const handleToggleBlockerResolved = useCallback(
    (id: string) => {
      if (!workData) return;
      const blocker = workData.blockers.find((b) => b.id === id);
      if (!blocker) return;
      const nextResolved = !blocker.resolved;
      dispatch({ type: 'UPDATE_BLOCKER', id, patch: { resolved: nextResolved } });
      saveNow({ type: 'blocker', id }, { resolved: nextResolved });
    },
    [workData, dispatch, saveNow],
  );

  /** 障害本文編集: デバウンス保存（edit）+ 楽観的 state 更新 */
  const handleEditBlockerText = useCallback(
    (id: string, text: string) => {
      dispatch({ type: 'UPDATE_BLOCKER', id, patch: { text } });
      edit({ type: 'blocker', id }, { text });
    },
    [dispatch, edit],
  );

  /** 障害のTODO紐付け変更: 即時保存（saveNow）+ 楽観的 state 更新 */
  const handleChangeBlockerLinkedTodo = useCallback(
    (id: string, linkedTodoId: string | null) => {
      dispatch({ type: 'UPDATE_BLOCKER', id, patch: { linkedTodoId } });
      saveNow({ type: 'blocker', id }, { linkedTodoId });
    },
    [dispatch, saveNow],
  );

  /** 障害削除: 即時 API 呼出 + 楽観的 state 更新 */
  const handleDeleteBlocker = useCallback(
    async (id: string) => {
      dispatch({ type: 'DELETE_BLOCKER', id });
      try {
        await apiDeleteBlocker(id);
      } catch (err) {
        console.error('障害削除に失敗:', err);
      }
    },
    [dispatch],
  );

  /** 障害並替: 即時保存（saveNow）+ 楽観的 state 更新 */
  const handleReorderBlockers = useCallback(
    (orderedIds: string[]) => {
      dispatch({ type: 'REORDER_BLOCKERS', orderedIds });
      saveNow(BLOCKER_ORDER_TARGET, orderedIds);
    },
    [dispatch, saveNow],
  );

  // --- Reflection ---

  /** 振り返り編集: デバウンス保存（edit）+ 楽観的 state 更新 */
  const handleEditReflection = useCallback(
    (patch: Partial<Reflection>) => {
      dispatch({ type: 'UPDATE_REFLECTION', patch });
      edit(REFLECTION_TARGET, patch);
    },
    [dispatch, edit],
  );

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <Header
        currentDate={currentDate}
        theme={data?.dayNote.theme ?? null}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
        onToday={goToday}
        isToday={isToday}
        onThemeEdit={(theme) => edit(THEME_TARGET, theme)}
      />

      {/* 保存状態表示（右上、[ui_interaction_spec.md §10]） */}
      <div className="pointer-events-none fixed right-4 top-3 z-40">
        <div className="pointer-events-auto">
          <SaveStatus status={saveStatus} onRetry={retryAll} />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-8 py-6">
        {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">データの取得に失敗しました。</p>
            <p className="mt-1 text-red-600">{error.message}</p>
            <p className="mt-2 text-xs text-red-400">
              dayborad_dev への PostgreSQL 接続とマイグレーションを確認してください。
            </p>
          </div>
        )}

        {workData && !loading && (
          <WorkMode
            date={currentDate}
            todos={workData.todos}
            blockers={workData.blockers}
            reflection={workData.reflection}
            dispatch={dispatch}
            handlers={{
              onAddTodo: handleAddTodo,
              onToggleTodo: handleToggleTodo,
              onEditTodoTitle: handleEditTodoTitle,
              onDeleteTodo: handleDeleteTodo,
              onReorderTodos: handleReorderTodos,
              onAddBlocker: handleAddBlocker,
              onToggleBlockerResolved: handleToggleBlockerResolved,
              onEditBlockerText: handleEditBlockerText,
              onChangeBlockerLinkedTodo: handleChangeBlockerLinkedTodo,
              onDeleteBlocker: handleDeleteBlocker,
              onReorderBlockers: handleReorderBlockers,
              onEditReflection: handleEditReflection,
            }}
          />
        )}
      </main>

      {/* localStorage 書込失敗時の確認ダイアログ（§9.3） */}
      <FlushFailDialog
        open={pendingNav !== null}
        onProceed={() => {
          if (pendingNav) {
            // ユーザー明示で遷移（localStorage 保護なし、§9.3「移動する」）
            goTo(pendingNav);
          }
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}

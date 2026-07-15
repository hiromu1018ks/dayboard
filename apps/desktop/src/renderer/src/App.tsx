/**
 * アプリケーションルート（[roadmap.md T-1-12/13/14, T-2-07〜11, T-3-09/14, T-4-04〜09, T-7-03〜10]）
 *
 * 起動時に今日の DayNote を取得し（AC-01）、Header に日付・曜日・テーマ入力欄・
 * 日付移動ボタンを表示する（[要件 6.2]）。日付移動で currentDate が変わると
 * 再フェッチする（AC-10）。
 *
 * Phase 2 で追加:
 * - useAutosave でテーマ編集を800ms後に自動保存（AC-13/14、T-2-09）
 * - 日付移動の直前に flush を呼び、localStorage 同期書込成功で遷移（T-2-10）
 * - localStorage 書込失敗時は FlushFailDialog で確認（T-2-11）
 * - 右下に SaveStatus を表示（T-2-08。Header 操作と重ならないよう右下端）
 *
 * Phase 3 で追加:
 * - 仕事整理モードの3カラム（TODO/障害/振り返り）を統合（T-3-09）
 * - TODO/Blocker/Reflection の自動保存・即時保存エントリを動的生成
 * - carried/done 表示（T-3-14）
 *
 * Phase 4 で追加:
 * - viewMode（work/note）の切替。`⌘/Ctrl+J` でノートモード、`Esc`/`⌘J` で戻る（AC-03/04）
 * - NoteMode + NoteEditor（CodeMirror 6）で会議メモ本文を編集（T-4-03/05/09）
 * - ノート本文を800msデバウンスで PATCH /note-entry へ自動保存（T-4-04）
 * - モード切替前に flush、localStorage 書込成功で切替（T-4-08）
 * - IME 変換中はショートカット判定をスキップ（T-4-06、AC-19 基盤）
 * - Esc の優先順位（T-4-07）。Phase 4 は「ノートモード → work 戻り」のみ
 *
 * Phase 7 で追加:
 * - ユーザー設定（keybindingMode / vimDefaultState）の取得・更新（T-7-01/02、AC-15）
 * - 設定モーダル（SettingsModal）。歯車アイコンから開く、即時保存（T-7-02）
 * - 標準キーバインド（仕事整理モード: ⌘1/2/3 列フォーカス、⌘Enter TODO追加）
 *   + 日付移動（⌘T 今日、Option←/→ 前日翌日、AC-10）（T-7-03/04）
 * - Vim キーバインド（仕事整理モード: h/j/k/l, i, x, Space 系）（T-7-05/06/07）
 * - Vim操作状態（vimState）。ノートモードは CodeMirror 内部が権威で onVimModeChange で同期
 * - VimStateBadge 表示（T-7-08）
 * - Esc の4段優先順位完成（Vim Insert→Normal、モーダル、モード戻り）（T-7-09、AC-17/18/19）
 * - Post-MVP ショートカット（⌘K/⌘Shift+R/⌘Shift+M）の握り潰し（T-7-10、AC-22）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, todayLocal, toggleDone, type SaveTarget } from '@dayboard/domain';
import { DuplicateConversionDialog } from './components/DuplicateConversionDialog.js';
import { FlushFailDialog } from './components/FlushFailDialog.js';
import { Header } from './components/Header.js';
import { NoteMode } from './components/NoteMode.js';
import type { NoteEditorHandle } from './components/NoteEditor.js';
import { SaveStatus } from './components/SaveStatus.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Sidebar } from './components/Sidebar.js';
import { Toast, type ToastMessage } from './components/Toast.js';
import { VimStateBadge, type VimState } from './components/VimStateBadge.js';
import { WorkMode } from './components/WorkMode.js';
import {
  createBlockerOrderSaver,
  createBlockerSaver,
  createNoteEntrySaver,
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
  postCarryOver as apiPostCarryOver,
  postConvertBlocker as apiPostConvertBlocker,
  postConvertTodo as apiPostConvertTodo,
  postTodo as apiPostTodo,
  ApiClientError,
} from './api/client.js';
import { useDateNavigation } from './hooks/useDateNavigation.js';
import { useAutosave } from './hooks/useAutosave.js';
import { useDayNote } from './hooks/useDayNote.js';
import { useFlushOnQuit } from './hooks/useFlushOnQuit.js';
import { useSettings } from './hooks/useSettings.js';
import { useTheme } from './hooks/useTheme.js';
import { useWorkData } from './hooks/useWorkData.js';
import { useViewMode } from './state/viewMode.js';
import { isComposing } from './keybindings/guardIme.js';
import { handleEsc } from './keybindings/escPriority.js';
import {
  isAddTodoShortcut,
  isGoNextDayShortcut,
  isGoPrevDayShortcut,
  isGoTodayShortcut,
  isToggleModeShortcut,
  isToggleSidebarShortcut,
  matchColumnFocusShortcut,
} from './keybindings/standard.js';
import { handlePostMvpShortcut } from './keybindings/postMvp.js';
import { handleSpaceLeader, handleVimWorkKey, SPACE_LEADER_TIMEOUT_MS } from './keybindings/vim.js';
import {
  focusSectionInput,
  focusElementAtSelection,
  focusInputAtSelection,
} from './keybindings/focus.js';
import {
  THEME_SELECTION,
  initialSelection,
  isOnAddInput,
  selectedItemId,
  clampSelection,
  type WorkSelection,
  type WorkLayout,
} from './keybindings/selection.js';
import type { Reflection } from 'shared-types';

/** テーマ保存対象の識別子（T-2-09） */
const THEME_TARGET: SaveTarget = { type: 'dayNote', field: 'theme' };
/** TODO 並替の保存対象識別子 */
const TODO_ORDER_TARGET: SaveTarget = { type: 'todoOrder' };
/** Blocker 並替の保存対象識別子 */
const BLOCKER_ORDER_TARGET: SaveTarget = { type: 'blockerOrder' };
/** 振り返りの保存対象識別子 */
const REFLECTION_TARGET: SaveTarget = { type: 'reflection' };
/** ノート本文の保存対象識別子（T-4-04） */
const NOTE_ENTRY_TARGET: SaveTarget = { type: 'noteEntry' };

export default function App() {
  const { currentDate, goTo, isToday } = useDateNavigation();
  const { data, loading, error, refetch } = useDayNote(currentDate);
  const { workData, dispatch } = useWorkData(data, currentDate);
  const { viewMode, setMode } = useViewMode();

  // --- Phase 7: ユーザー設定・キーバインド ---
  const { settings, updateKeybindingMode, updateVimDefaultState } = useSettings();
  // 外観テーマ（墨ダーク／和紙ライト／System=OS追従）。永続化は localStorage。
  // 季節アクセントは表示中の日付の月から自動判定するため currentDate を渡す。
  const { theme, setTheme, resolvedMode } = useTheme(currentDate);
  // Vim操作状態（仕事整理モード用。ノートモードは CodeMirror 内部状態が権威）
  const [vimState, setVimState] = useState<VimState>('normal');
  // 仕事整理モードの選択状態（2D カーソル、[selection.ts]）。Vim キーバインド時のみ有意。
  // Normal 状態で hjkl/gg/G で移動、Insert 状態で編集中位置を指す。
  const [selection, setSelectionState] = useState<WorkSelection>(THEME_SELECTION);
  // 最新の selection を Ref 経由で参照（起動時フォーカス同期 useEffect が古い闭包を
  // 捕捉しないように。依存配列に selection を含めると hjkl 移動ごとに再フォーカスが
  // 走り setSelection 内のフォーカスと二重制御になるため、Ref で最新値だけ読む）。
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // Vim コマンドバッファ（g/d/数字のリーダー入力用。handleVimWorkKey が読み書き）
  const [commandBuffer, setCommandBuffer] = useState('');
  // 設定モーダル（[ui_interaction_spec.md §8]）
  const [settingsOpen, setSettingsOpen] = useState(false);
  // サイドバー表示状態（Post-MVP: localStorage で永続化、既定 true）
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('dayborad:sidebar');
    return stored !== 'false';
  });
  const toggleSidebar = useCallback(() => {
    setSidebarVisible((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('dayborad:sidebar', String(next));
      }
      return next;
    });
  }, []);
  // 設定ロード完了後、vimDefaultState に従い初期化（normal/insert）
  const settingsInitializedRef = useRef(false);
  useEffect(() => {
    if (!settingsInitializedRef.current) {
      setVimState(settings.vimDefaultState);
      settingsInitializedRef.current = true;
    }
  }, [settings.vimDefaultState]);
  // keybindingMode が standard に切替わったら vimState を強制的に normal に戻す
  // （標準キーバインドでは Normal/Insert の概念を使わないため。後述のキーハンドラでも
  // keybindingMode !== 'vim' のときは vimState を見ないが、表示バッジを消すため）
  useEffect(() => {
    if (settings.keybindingMode === 'standard') {
      setVimState('normal');
    }
  }, [settings.keybindingMode]);

  // --- Phase 5: 変換（TODO化 / 障害化） ---
  // トースト通知（[§6.2] 2s）
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // 変換成功後のハイライト（[§4.3] 1.2s）
  const [highlightTodoIds, setHighlightTodoIds] = useState<Set<string>>(new Set());
  const [highlightBlockerIds, setHighlightBlockerIds] = useState<Set<string>>(new Set());
  // 重複確認ダイアログ（[§7]）
  const [duplicateDialog, setDuplicateDialog] = useState<{
    target: 'todo' | 'blocker';
    existingTitle: string | undefined;
    retry: () => Promise<void>;
  } | null>(null);

  // noteLineMetas を sourceNoteLineMetaId → NoteLineMeta のマップへ（発生元表示用、T-5-13）
  const noteLineMetaMap = useMemo(() => {
    const map = new Map<string, import('shared-types').NoteLineMeta>();
    if (data) {
      for (const m of data.noteLineMetas) {
        map.set(m.id, m);
      }
    }
    return map;
  }, [data]);

  // --- NoteEntry の楽観的 state（Phase 4） ---
  // CodeMirror の本文全文を data.noteEntry.body とは別にローカルで保持する。
  // 理由: handleEditNoteBody で edit() を呼ぶだけだと data state が更新されず、
  // 将来の refetch（Phase 5 の行変換後等）でサーバーの古い値へ巻き戻る不具合が起きる。
  // ローカル state を更新しておけば、refetch で data が新しくなっても、
  // 同一日付内の編集は NoteEditor の shouldApplyExternalValue で保護される。
  // 日付が変わったら新 DayNote の本文で初期化する（他カラムと同じ prevDateRef イディオム）。
  const [noteBody, setNoteBody] = useState('');
  const notePrevDateRef = useRef<string | null>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);

  // --- Phase 7: Vim Space リーダー状態管理（[ui_interaction_spec.md §3.5]、200ms） ---
  // Space を押した時点でリーダー待ち状態に入り、200ms以内に次キーが来なければキャンセル。
  // Vimキーバインド時のみ使用。標準キーバインド時は Space は入力欄の標準挙動に任せる。
  const spaceLeaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [spaceLeaderPending, setSpaceLeaderPending] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (notePrevDateRef.current !== currentDate) {
      setNoteBody(data.noteEntry.body);
      notePrevDateRef.current = currentDate;
    }
    // 同一日付内の data 変化（サーバー保存結果の反映等）ではユーザー編集を保持するため
    // 上書きしない。NoteEditor の shouldApplyExternalValue が CodeMirror と異なる場合のみ
    // 取り込むため、編集中でも安全。
  }, [data, currentDate]);

  // 保存エントリを data から動的生成（theme + 全 todo + todoOrder + 全 blocker + blockerOrder + reflection + noteEntry）
  // 日付ごと、各対象ごとに Saver を生成する（[autosave_spec.md §2.1]）
  const entries = useMemo<AutosaveEntry[]>(() => {
    const list: AutosaveEntry[] = [{ target: THEME_TARGET, saver: createThemeSaver(currentDate) }];
    if (data) {
      list.push({ target: NOTE_ENTRY_TARGET, saver: createNoteEntrySaver(currentDate) });
    }
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
  }, [currentDate, data, workData]);

  const { saveStatus, flush, retryAll, edit, saveNow } = useAutosave(currentDate, entries);

  // flush の最新参照を保持（終了時 IPC / beforeunload から呼ぶため、T-2-13）
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useFlushOnQuit(() => flushRef.current);

  // 仕事整理モード + Vim キーバインド時、selection に応じた要素へフォーカスを当てる。
  // 起動直後・日付移動後・モード切替で work へ戻った際に、選択要素（theme の div や
  // カード button）へフォーカスし、hjkl が即座に効くようにする。
  //
  // **依存配列に selection を含めない（意図的）**: selection を含めると hjkl 移動のたびに
  // 本 useEffect が再実行され、setSelection 内の focusElementAtSelection と二重フォーカス
  // 制御になる。そのため selectionRef（常に最新値を参照）を使い、本 useEffect は
  // 「マウント・workData ロード・モード切替」の初期化タイミングのみ発火させる。
  useEffect(() => {
    if (viewMode !== 'work' || !workData || settings.keybindingMode !== 'vim') return;
    // 次フレームで（DOM に要素が描画されていることを保証してから）フォーカス
    requestAnimationFrame(() => {
      focusElementAtSelection(selectionRef.current, {
        todo: workData.todos,
        blocker: workData.blockers,
      });
    });
  }, [viewMode, workData, settings.keybindingMode]);

  // 起動時リカバリ: localStorage の未保存分を再送（§6.2、T-2-12）。
  // アプリマウント時に1回だけ実行（日付移動ごとに再実行しない）。
  // リカバリでサーバーへ保存された内容を UI へ反映するため、完了後に refetch する。
  // （recoverOnStartup 自体は Saver を呼ぶだけで React state を更新しないため）
  useEffect(() => {
    void recoverOnStartup((date, target) => {
      if (target.type === 'dayNote' && target.field === 'theme') {
        return createThemeSaver(date);
      }
      if (target.type === 'noteEntry') {
        return createNoteEntrySaver(date);
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
    }).then((result) => {
      // リカバリで1件でも成功した日付があれば、UI へ反映するため refetch
      if (result.recoveredDates.length > 0) {
        void refetch();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // localStorage 書込失敗時の保留中操作（§9.3）。null=ダイアログ非表示。
  // 日付移動とモード切替の両方で共通利用する（FlushFailDialog は汎用「移動する/キャンセル」）。
  type PendingAction =
    { kind: 'navigate'; targetDate: string } | { kind: 'setMode'; mode: 'work' | 'note' };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  /** 保留中操作を実行する（FlushFailDialog の「移動する」で呼ばれる、§9.3） */
  const runPendingAction = useCallback(
    (action: PendingAction) => {
      if (action.kind === 'navigate') {
        goTo(action.targetDate);
      } else {
        setMode(action.mode);
      }
    },
    [goTo, setMode],
  );

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
        // 日付移動後は selection を theme へリセット（[§7]: workFocus 初期化）。
        // 旧日付の selection（無効な itemIndex 等）が残ると焦点がずれるため。
        setSelectionState(THEME_SELECTION);
      } else {
        // localStorage 書込失敗: 遷移を保留して確認（§9.3）
        setPendingAction({ kind: 'navigate', targetDate });
      }
    },
    [flush, goTo],
  );

  /**
   * モード切替のラッパー: flush → localStorage 成功で切替、失敗で確認ダイアログ（T-4-08）。
   *
   * [autosave_spec.md §9.1/§9.3]:
   * - 切替直前に全保留デバウンスを flush し localStorage へ同期書込
   * - localStorage 書込成功後、viewMode を即時切替（サーバー保存はバックグラウンド継続）
   * - localStorage 書込自体の失敗時のみ切替を止めてユーザーへ確認
   *
   * @param mode 切替先の表示モード
   */
  const setModeWithFlush = useCallback(
    async (mode: 'work' | 'note') => {
      const { localStorageOk } = await flush();
      if (localStorageOk) {
        setMode(mode);
        // work へ戻る際は selection を theme へリセット（[§4.1]: workFocus 復元だが
        // Vim では前回位置に依らず theme から再開が自然）。
        if (mode === 'work') setSelectionState(THEME_SELECTION);
      } else {
        setPendingAction({ kind: 'setMode', mode });
      }
    },
    [flush, setMode],
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

  /**
   * 未完了TODOの翌日持ち越し（Phase 6、要件 7.10、AC-11/12）。
   *
   * [api_contract.md §10]: 常に HTTP 200（部分成功）。
   * - carried の各 sourceTodoId について楽観的に status='carried' へ更新
   * - skipped があれば info 通知、無ければ success 通知
   * - エラー時は error 通知
   */
  const handleCarryOverTodos = useCallback(
    async (todoIds: string[]) => {
      if (todoIds.length === 0) return;
      try {
        const result = await apiPostCarryOver(currentDate, todoIds);
        // 持ち越し成功分を楽観的に carried 化（サーバー側で処理済み）
        for (const c of result.carried) {
          dispatch({ type: 'UPDATE_TODO', id: c.sourceTodoId, patch: { status: 'carried' } });
        }
        // 通知（skipped があれば情報付記）
        if (result.skipped.length > 0 && result.carried.length > 0) {
          setToast({
            kind: 'success',
            text: `${result.carried.length}件を翌日に持ち越しました（${result.skipped.length}件は持ち越し済み）`,
          });
        } else if (result.skipped.length > 0) {
          setToast({
            kind: 'info',
            text: `${result.skipped.length}件はすでに翌日に持ち越し済みです`,
          });
        } else {
          setToast({ kind: 'success', text: `${result.carried.length}件を翌日に持ち越しました` });
        }
      } catch (err) {
        console.error('持ち越しに失敗:', err);
        setToast({ kind: 'error', text: '持ち越しに失敗しました' });
      }
    },
    [currentDate, dispatch],
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

  // --- NoteEntry（Phase 4） ---

  /**
   * ノート本文編集: 楽観的 state 更新 + デバウンス保存（edit）（T-4-04）。
   *
   * CodeMirror の本文全文を:
   * 1. noteBody state へ反映（楽観的。refetch でサーバー値へ巻き戻るのを防ぐ）
   * 2. useAutosave.edit へ流す（800ms後に PATCH /note-entry が送信される）
   */
  const handleEditNoteBody = useCallback(
    (body: string) => {
      setNoteBody(body);
      edit(NOTE_ENTRY_TARGET, { body });
    },
    [edit],
  );

  // ============================================================================
  // Phase 5: ノート行変換（TODO化 / 障害化）（T-5-09/11/12）
  // ============================================================================

  /**
   * ハイライトを1.2秒後に消去する（[§4.3]）。
   * 変換成功後、仕事整理モードに戻った際に対象アイテムを軽くハイライトする。
   */
  const triggerHighlight = useCallback((ids: string[], kind: 'todo' | 'blocker') => {
    const setter = kind === 'todo' ? setHighlightTodoIds : setHighlightBlockerIds;
    setter(new Set(ids));
    setTimeout(() => setter(new Set()), 1200);
  }, []);

  /**
   * 変換の共通処理（TODO化・障害化）。
   *
   * [note_conversion_spec.md §1] フロー:
   * - 空行（lineNumber=0 or lineText=""）は通知して終了
   * - API呼出 → 成功時 refetch + トースト + ハイライト予約
   * - 409 DUPLICATE_CONVERSION はダイアログ表示（[§7]）
   * - その他エラーはトーストで通知
   */
  const performConvert = useCallback(
    async (
      target: 'todo' | 'blocker',
      lineNumber: number,
      lineText: string,
      opts: { force?: boolean } = {},
    ): Promise<void> => {
      // 空行チェック（[§1] step 2）
      if (lineNumber === 0 || lineText.trim().length === 0) {
        setToast({ kind: 'info', text: '空行は変換できません' });
        return;
      }

      if (!data) return;
      const noteEntryId = data.noteEntry.id;

      try {
        if (target === 'todo') {
          const result = await apiPostConvertTodo(
            currentDate,
            { noteEntryId, lineNumber, lineText },
            opts,
          );
          // ガター（noteLineMetas）とTODO列を更新するため refetch
          await refetch();
          // 変換後もノートモードに留まる（[要件 9.3]）。ハイライトは仕事整理モード復帰時に表示
          triggerHighlight([result.todo.id], 'todo');
          // 切り詰め通知（200文字超の場合、[§4.5]）。
          // タイトルが「…」で終わる場合のみ切り詰め発生と判定する（extractTitle の仕様）
          if (result.todo.title.endsWith('…')) {
            setToast({ kind: 'info', text: '長いため200文字に切り詰めました' });
          } else {
            setToast({ kind: 'success', text: `TODOに追加しました: ${result.todo.title}` });
          }
        } else {
          const result = await apiPostConvertBlocker(
            currentDate,
            { noteEntryId, lineNumber, lineText },
            opts,
          );
          await refetch();
          triggerHighlight([result.blocker.id], 'blocker');
          setToast({ kind: 'success', text: `障害に追加しました: ${result.blocker.text}` });
        }
      } catch (err) {
        // 409 重複確認ダイアログ（[§7]）
        if (err instanceof ApiClientError && err.code === 'DUPLICATE_CONVERSION') {
          const details = err.details as { existing?: { id: string; title?: string } } | undefined;
          setDuplicateDialog({
            target,
            existingTitle: details?.existing?.title,
            retry: () => performConvert(target, lineNumber, lineText, { force: true }),
          });
          return;
        }
        // その他のエラー
        console.error('変換に失敗:', err);
        setToast({ kind: 'error', text: '変換に失敗しました' });
      }
    },
    [data, currentDate, refetch, triggerHighlight],
  );

  /** TODO化キー（⌘/Ctrl+Enter）押下時 */
  const handleConvertTodo = useCallback(
    (lineNumber: number, lineText: string) => {
      void performConvert('todo', lineNumber, lineText);
    },
    [performConvert],
  );

  /** 障害化キー（⌘/Ctrl+Shift+B）押下時 */
  const handleConvertBlocker = useCallback(
    (lineNumber: number, lineText: string) => {
      void performConvert('blocker', lineNumber, lineText);
    },
    [performConvert],
  );

  // ============================================================================
  // Phase 7: グローバルキーハンドラ（T-4-05/06/07/08 + T-7-03/04/06/07/09/10）
  // ============================================================================

  /**
   * 現在のレイアウト（各列のアイテム数）。selection の計算に使用。
   * workData が未ロード時は空レイアウト。
   */
  const layout: WorkLayout = useMemo(
    () => ({
      theme: { hasInput: true },
      todo: { itemCount: workData?.todos.length ?? 0 },
      blocker: { itemCount: workData?.blockers.length ?? 0 },
      reflection: {},
    }),
    [workData?.todos.length, workData?.blockers.length],
  );

  /** selection を更新し、対応する DOM 要素へフォーカス（selection と DOM フォーカスの同期）。 */
  const setSelection = useCallback(
    (sel: WorkSelection) => {
      const clamped = clampSelection(sel, layout);
      setSelectionState(clamped);
      // DOM フォーカスは次フレームで（React 描画後に要素が存在することを保証）
      requestAnimationFrame(() => {
        focusElementAtSelection(clamped, {
          todo: workData?.todos ?? [],
          blocker: workData?.blockers ?? [],
        });
      });
    },
    [layout, workData?.todos, workData?.blockers],
  );

  /**
   * 選択中アイテムを編集モードへ（Vim `i`/`a`/`Enter`）。Insert 状態へ移行。
   * `focusInputAtSelection` で実際の入力要素（input/textarea）へフォーカスする。
   * （`focusElementAtSelection` は選択移動用・section コンテナへフォーカスするため、
   *   入力開始時には入力欄へ直接フォーカスする本関数を使う）
   */
  const editItemAt = useCallback(
    (sel: WorkSelection) => {
      focusInputAtSelection(sel, {
        todo: workData?.todos ?? [],
        blocker: workData?.blockers ?? [],
      });
      setVimState('insert');
    },
    [workData?.todos, workData?.blockers],
  );

  /**
   * 選択行の下/上に新規追加（Vim `o`/`O`）。Insert 状態へ移行し追加入力欄へフォーカス。
   * MVP では「選択中列の追加入力欄へフォーカス」で代用（厳密な挿入位置制御は Post-MVP）。
   * theme/reflection は追加入力欄が無いため、`focusSectionInput` は最初のフォーカス可能要素へフォールバック。
   */
  const addItemAt = useCallback((sel: WorkSelection, _position: 'below' | 'above') => {
    // 選択中列の追加入力欄へフォーカス（o/O で列は維持）
    focusSectionInput(sel.section);
    setVimState('insert');
  }, []);

  /**
   * 選択中アイテムの完了/解決切替（Vim `x`、AC-09）。
   * todo=done切替（carried は無効）、blocker=resolved切替。追加入力欄選択時は無反応。
   */
  const toggleItemAt = useCallback(
    (sel: WorkSelection) => {
      if (!workData) return;
      if (sel.section === 'todo') {
        if (isOnAddInput(sel, layout)) return;
        const id = selectedItemId(sel, workData.todos);
        if (!id) return;
        const todo = workData.todos.find((t) => t.id === id);
        if (!todo || todo.status === 'carried') return; // carried は操作不可
        handleToggleTodo(id);
      } else if (sel.section === 'blocker') {
        if (isOnAddInput(sel, layout)) return;
        const id = selectedItemId(sel, workData.blockers);
        if (!id) return;
        handleToggleBlockerResolved(id);
      }
      // theme/reflection は x で切替対象なし
    },
    [workData, layout, handleToggleTodo, handleToggleBlockerResolved],
  );

  /**
   * 選択中アイテムを即削除（Vim `dd`、確認ダイアログなし。u で復元可）。
   * 戻り値で「削除後の推奨 selection」を返す:
   * - 末尾アイテム削除時は追加入力欄（= 新しい itemCount）へ
   * - それ以外は同 index を維持（= 削除により繰り上がった次アイテムを指す）
   * - theme/reflection は削除対象外（何もしない、戻り値 null）
   */
  const deleteItemAt = useCallback(
    (sel: WorkSelection): WorkSelection | void => {
      if (!workData) return;
      if (sel.section === 'todo') {
        const id = selectedItemId(sel, workData.todos);
        if (!id) return;
        handleDeleteTodo(id);
        // 削除後の itemCount（= workData.todos.length - 1）を超える場合は追加入力欄へ
        const newCount = workData.todos.length - 1;
        const keepIdx = sel.itemIndex ?? 0;
        return { section: 'todo', itemIndex: Math.min(keepIdx, newCount), field: null };
      } else if (sel.section === 'blocker') {
        const id = selectedItemId(sel, workData.blockers);
        if (!id) return;
        handleDeleteBlocker(id);
        const newCount = workData.blockers.length - 1;
        const keepIdx = sel.itemIndex ?? 0;
        return { section: 'blocker', itemIndex: Math.min(keepIdx, newCount), field: null };
      }
      // theme/reflection は dd 対象外
    },
    [workData, handleDeleteTodo, handleDeleteBlocker],
  );

  /** undo / redo（[useWorkData] の past/future）。サーバー反映は autosave が追従。 */
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [dispatch]);

  // アンマウント時に Space リーダーのタイマーを確実にクリア（タイマー漏れ防止）
  useEffect(() => {
    return () => {
      if (spaceLeaderTimerRef.current !== null) {
        clearTimeout(spaceLeaderTimerRef.current);
        spaceLeaderTimerRef.current = null;
      }
    };
  }, []);

  /**
   * 全グローバルショートカットのキーハンドラ。
   *
   * [ui_interaction_spec.md §4.1/§9.1/§9.2/§11]:
   * - IME 変換中は全ショートカット判定をスキップ（T-4-06、AC-19 基盤）
   * - 共通（標準/Vim両方）: `⌘J`（モード切替）、`⌘T`（今日）、`Option←/→`（前日翌日）、
   *   `⌘K`/`⌘Shift+R`/`⌘Shift+M`（Post-MVP無効化、AC-22）
   * - 標準キーバインド（仕事整理モードのみ）: `⌘1/2/3`（列フォーカス）、`⌘Enter`（TODO追加）
   * - Vimキーバインド: h/j/k/l（列/項目移動）、i（Insert）、x（TODO切替）、Space 系（リーダー）
   * - Esc: escPriority で4段優先順位処理（T-4-07/T-7-09、AC-17/18/19）
   *
   * ノートモードでの Vim 操作（h/j/k/l/i/Esc）は CodeMirror の Vim 拡張が処理するため、
   * 本ハンドラではノートモード時の Vim キーは処理しない（共通系ショートカットのみ）。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // IME 変換中はショートカット判定をスキップ（T-4-06、[§9.1]、AC-19）
      if (isComposing(e)) return;

      // ----- Post-MVP ショートカットの握り潰し（T-7-10、AC-22） -----
      // 標準/Vim両方で無効化。入力内容は破壊しない。
      if (handlePostMvpShortcut(e)) return;

      // ----- 共通ショートカット（標準/Vim両方で有効、[要件 8.6]） -----

      // ⌘/Ctrl+J: モード切替（AC-03/04）
      if (isToggleModeShortcut(e)) {
        e.preventDefault();
        const nextMode = viewMode === 'work' ? 'note' : 'work';
        // Vim の場合、note→work に戻る際は vimState を normal へ（AC-18）
        if (viewMode === 'note' && settings.keybindingMode === 'vim') {
          setVimState('normal');
        }
        void setModeWithFlush(nextMode).then(() => {
          if (nextMode === 'note') {
            requestAnimationFrame(() => {
              noteEditorRef.current?.focus();
              // Vim の場合は vimDefaultState を CodeMirror へ反映するためのフック。
              // NoteEditor 側で Vim 拡張が初期状態を扱う（T-7-05）。
            });
          }
        });
        return;
      }

      // ⌘/Ctrl+T: 今日へ（AC-10）
      if (isGoTodayShortcut(e)) {
        e.preventDefault();
        goToday();
        return;
      }

      // Alt/Option+←: 前日へ（AC-10）
      if (isGoPrevDayShortcut(e)) {
        e.preventDefault();
        goPrevDay();
        return;
      }
      // Alt/Option+→: 翌日へ（AC-10）
      if (isGoNextDayShortcut(e)) {
        e.preventDefault();
        goNextDay();
        return;
      }

      // ⌘/Ctrl+\: サイドバー表示切替（Post-MVP）
      if (isToggleSidebarShortcut(e)) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // ----- Ctrl+c / Esc: Vim Insert → Normal（4段優先順位、[§9.2]） -----
      //   Vim では Ctrl+c も Esc と同様に Insert → Normal へ戻る。両者を handleEsc 経由で
      //   統一処理する（段2: refocusSelection で入力欄から選択要素へフォーカスを戻す）。
      const isEscOrCtrlC =
        e.key === 'Escape' ||
        (e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.shiftKey &&
          e.key.toLowerCase() === 'c' &&
          settings.keybindingMode === 'vim');
      if (isEscOrCtrlC) {
        const consumed = handleEsc({
          viewMode,
          vimState: settings.keybindingMode === 'vim' ? vimState : 'normal',
          settingsOpen,
          setVimState: settings.keybindingMode === 'vim' ? setVimState : undefined,
          // Insert → Normal 復帰時、仕事整理モードなら選択要素（section/button）へフォーカスを戻す。
          // 入力欄にフォーカスが残ると hjkl がスルー判定で効かないため。
          refocusSelection:
            settings.keybindingMode === 'vim' && viewMode === 'work'
              ? () => {
                  focusElementAtSelection(selection, {
                    todo: workData?.todos ?? [],
                    blocker: workData?.blockers ?? [],
                  });
                }
              : undefined,
          closeSettings: () => setSettingsOpen(false),
          goToWork: () => {
            void setModeWithFlush('work');
          },
        });
        if (consumed) e.preventDefault();
        return;
      }

      // 設定モーダルが開いている時は上記以外のショートカットを処理しない
      // （モーダル内のラジオ操作等を優先）
      if (settingsOpen) return;

      // ----- 標準キーバインド専用（仕事整理モードのみ、[要件 8.2]） -----
      if (settings.keybindingMode === 'standard' && viewMode === 'work') {
        // ⌘/Ctrl+1/2/3: 列フォーカス（入力要素へ）
        const section = matchColumnFocusShortcut(e);
        if (section !== null) {
          e.preventDefault();
          focusSectionInput(section);
          return;
        }
        // ⌘/Ctrl+Enter: TODO追加（TODO列の追加入力欄へフォーカス）
        if (isAddTodoShortcut(e)) {
          e.preventDefault();
          focusSectionInput('todo');
          return;
        }
        return;
      }

      // ----- Vimキーバインド（仕事整理モードのみ、[要件 8.6]） -----
      // ノートモードでは CodeMirror の Vim 拡張がキーを処理するため、
      // アプリ層では Vim キーを処理しない（共通系ショートカットのみ上で処理済み）。
      if (settings.keybindingMode === 'vim' && viewMode === 'work') {
        // Space リーダー待ち状態の場合（[§3.5]）
        if (spaceLeaderPending) {
          // タイマーをクリア
          if (spaceLeaderTimerRef.current !== null) {
            clearTimeout(spaceLeaderTimerRef.current);
            spaceLeaderTimerRef.current = null;
          }
          setSpaceLeaderPending(false);
          const commandKey = e.key.toLowerCase();
          const result = handleSpaceLeader(commandKey);
          if (result.status === 'handled') {
            e.preventDefault();
            if (result.requestToggleMode) {
              // Space n: モード切替
              const nextMode = viewMode === 'work' ? 'note' : 'work';
              void setModeWithFlush(nextMode).then(() => {
                if (nextMode === 'note') {
                  requestAnimationFrame(() => noteEditorRef.current?.focus());
                }
              });
            } else if (result.requestSection) {
              // Space 1/2/3: 列直接選択。selection 更新 + DOM フォーカス
              setSelection(initialSelection(result.requestSection));
              focusSectionInput(result.requestSection);
            }
          }
          return;
        }

        // Space: リーダー待ち状態へ（[§3.5]、200ms）
        if (e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // Normal状態のみリーダーとして扱う（Insert では Space は文字入力）
          if (vimState === 'normal') {
            e.preventDefault();
            setSpaceLeaderPending(true);
            spaceLeaderTimerRef.current = setTimeout(() => {
              // 200ms超過でキャンセル（[edge_cases.md §9.4]）
              spaceLeaderTimerRef.current = null;
              setSpaceLeaderPending(false);
            }, SPACE_LEADER_TIMEOUT_MS);
            return;
          }
          return;
        }

        // その他の Vim キー（h/j/k/l/gg/G/i/a/o/O/x/dd/u/Ctrl+r/数字前置、[§3.4/§3.5]）
        // selection model ベース。handleVimWorkKey がコマンド解析＋副作用コールバック呼出。
        const result = handleVimWorkKey(e, {
          vimState,
          viewMode,
          selection,
          layout,
          buffer: commandBuffer,
          setSelection,
          editItemAt,
          addItemAt,
          toggleItemAt,
          deleteItemAt,
          undo,
          redo,
          setBuffer: setCommandBuffer,
        });
        if (result === 'handled' || result === 'buffered') {
          e.preventDefault();
        }
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewMode,
    settings.keybindingMode,
    vimState,
    settingsOpen,
    setModeWithFlush,
    goToday,
    goPrevDay,
    goNextDay,
    toggleSidebar,
    selection,
    commandBuffer,
    layout,
    workData?.todos,
    workData?.blockers,
    setSelection,
    editItemAt,
    addItemAt,
    toggleItemAt,
    deleteItemAt,
    undo,
    redo,
    spaceLeaderPending,
  ]);

  // ============================================================================
  // レンダリング（Phase 4: viewMode で work/note を切替、[要件 7.7]）
  // Post-MVP: work/note 両モードを共通親でラップし、左に Sidebar を配置。
  // ============================================================================

  return (
    <div className="flex h-screen bg-bg text-ink">
      {/* サイドバー（Post-MVP: カレンダー + 検索） */}
      {sidebarVisible && <Sidebar currentDate={currentDate} onSelectDate={navigateWithFlush} />}

      {/* サイドバー折りたたみボタン（常に表示。非表示時は開く、表示時は閉じる） */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarVisible ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        aria-expanded={sidebarVisible}
        className="z-30 flex w-5 shrink-0 cursor-pointer items-center justify-center self-stretch text-faint hover:bg-raised hover:text-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={sidebarVisible ? '' : 'rotate-180'}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* メインエリア（work / note で内容を切替） */}
      {viewMode === 'note' ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <NoteMode
            ref={noteEditorRef}
            currentDate={currentDate}
            body={noteBody}
            onBodyChange={handleEditNoteBody}
            loading={loading || !data}
            noteEntryId={data?.noteEntry.id}
            noteLineMetas={data?.noteLineMetas}
            onConvertTodo={handleConvertTodo}
            onConvertBlocker={handleConvertBlocker}
            keybindingMode={settings.keybindingMode}
            onVimModeChange={setVimState}
            resolvedMode={resolvedMode}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            currentDate={currentDate}
            theme={data?.dayNote.theme ?? null}
            onPrevDay={goPrevDay}
            onNextDay={goNextDay}
            onToday={goToday}
            isToday={isToday}
            onThemeEdit={(theme) => edit(THEME_TARGET, theme)}
            onOpenSettings={() => setSettingsOpen(true)}
            onToast={setToast}
            selection={selection}
            showSelection={settings.keybindingMode === 'vim'}
            vimState={vimState}
          />

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-10 py-6">
            {loading && <p className="text-sm text-sub">Loading…</p>}

            {error && (
              <div className="rounded border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                <p className="head font-semibold">データの取得に失敗しました。</p>
                <p className="mt-1">{error.message}</p>
                <p className="mt-2 text-xs opacity-80">
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
                  onCarryOverTodos: handleCarryOverTodos,
                  onAddBlocker: handleAddBlocker,
                  onToggleBlockerResolved: handleToggleBlockerResolved,
                  onEditBlockerText: handleEditBlockerText,
                  onChangeBlockerLinkedTodo: handleChangeBlockerLinkedTodo,
                  onDeleteBlocker: handleDeleteBlocker,
                  onReorderBlockers: handleReorderBlockers,
                  onEditReflection: handleEditReflection,
                }}
                noteLineMetaMap={noteLineMetaMap}
                highlightTodoIds={highlightTodoIds}
                highlightBlockerIds={highlightBlockerIds}
                selection={selection}
                vimState={vimState}
                keybindingMode={settings.keybindingMode}
              />
            )}
          </main>
        </div>
      )}

      {/* 保存状態表示（右下、[ui_interaction_spec.md §10]）。
          右上は Header の日付ナビと重なるため右下に配置。Vim バッジの上に積む。
          ラッパは pointer-events-none で下の UI のクリックを透過し、
          error 時の再試行ボタンのみ SaveStatus 側で pointer-events-auto を持つ。 */}
      <div className="pointer-events-none fixed bottom-10 right-4 z-40">
        <SaveStatus status={saveStatus} onRetry={retryAll} />
      </div>

      {/* Vim操作状態表示（右下、Phase 7 T-7-08、[要件 9.4]） */}
      <VimStateBadge keybindingMode={settings.keybindingMode} vimState={vimState} />

      {/* 変換成功・エラーのトースト通知（Phase 5、[§6.2]） */}
      <Toast message={toast} onClose={() => setToast(null)} />

      {/* 設定モーダル（Phase 7 T-7-02、[ui_interaction_spec.md §8]） */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChangeKeybindingMode={(mode) => {
          void updateKeybindingMode(mode);
        }}
        onChangeVimDefaultState={(state) => {
          void updateVimDefaultState(state);
        }}
        theme={theme}
        onChangeTheme={setTheme}
        onClose={() => setSettingsOpen(false)}
      />

      {/* 重複変換確認ダイアログ（Phase 5、[§7]） */}
      <DuplicateConversionDialog
        open={duplicateDialog !== null}
        target={duplicateDialog?.target ?? 'todo'}
        existingTitle={duplicateDialog?.existingTitle}
        onForce={() => {
          const d = duplicateDialog;
          setDuplicateDialog(null);
          if (d) void d.retry();
        }}
        onCancel={() => setDuplicateDialog(null)}
      />

      {/* localStorage 書込失敗時の確認ダイアログ（§9.3、モード切替兼用） */}
      <FlushFailDialog
        open={pendingAction !== null}
        onProceed={() => {
          if (pendingAction) {
            // ユーザー明示で操作を実行（localStorage 保護なし、§9.3「移動する」）
            runPendingAction(pendingAction);
          }
          setPendingAction(null);
        }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

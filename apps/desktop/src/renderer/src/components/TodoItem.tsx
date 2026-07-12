/**
 * TODO 個別アイテム（[roadmap.md T-3-10/11/14]）
 *
 * 機能:
 * - 完了切替（チェックボックス / Space / x、AC-09）
 * - 本文編集（ダブルクリック or Enter で編集モード、[ui_interaction_spec.md §5.2]）
 * - 空確定で削除確認ダイアログ（[edge_cases.md §2.1]）
 * - done 表示（取り消し線 + 薄色 + ✓アイコン）
 * - carried 表示（「→ 翌日へ持ち越し済み」ラベル、[要件 7.10]）
 * - 並替（↑/↓ ボタン、MVP ではシンプル実装）
 *
 * [ui_interaction_spec.md §12]: 色だけで状態を伝えずアイコン/テキスト併用。
 */

import { useEffect, useRef, useState } from 'react';
import { formatMonthDay } from '@dayboard/domain';
import type { NoteLineMeta, TodoItem as TodoItemType } from 'shared-types';

export type TodoItemProps = {
  todo: TodoItemType;
  /** 先頭か（↑ ボタンの無効判定） */
  isFirst: boolean;
  /** 末尾か（↓ ボタンの無効判定） */
  isLast: boolean;
  /**
   * 発生元ノート行のスナップショット（Phase 5、AC-08）。
   * sourceNoteLineMetaId が null の場合は渡さない（ホバー時のポップアップ非表示）。
   */
  sourceNoteLineMeta?: NoteLineMeta | null;
  /** 変換成功後の一時ハイライト（Phase 5、[§4.3] 1.2s） */
  highlight?: boolean;
  onToggle: () => void;
  onEditTitle: (title: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function TodoItem({
  todo,
  isFirst,
  isLast,
  sourceNoteLineMeta,
  highlight = false,
  onToggle,
  onEditTitle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 編集モード開始時にフォーカス
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(todo.title);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // 空確定 → 削除確認ダイアログ（[edge_cases.md §2.1]）
      setConfirmDelete(true);
      setEditing(false);
      return;
    }
    if (trimmed !== todo.title) {
      onEditTitle(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setEditing(false);
  };

  const isDone = todo.status === 'done';
  const isCarried = todo.status === 'carried';

  return (
    <li
      className={`group flex items-start gap-2 rounded px-1 py-1 transition-colors duration-700 ${highlight ? 'bg-amber-100' : ''}`}
    >
      {/* 完了チェック（carried は操作不可）
          Phase 7: data-focus-item で Vim j/k（項目移動）・x（完了切替、AC-09）のターゲット */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isCarried}
        aria-label={isDone ? '未完了に戻す' : '完了にする'}
        data-focus-item={todo.id}
        tabIndex={0}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-300 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
        aria-pressed={isDone}
      >
        {isDone && <span aria-hidden="true">✓</span>}
        {isCarried && <span aria-hidden="true">→</span>}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            maxLength={200}
            className="w-full border-b border-stone-300 bg-transparent px-1 py-0.5 text-stone-700 outline-none focus:border-stone-500"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              onDoubleClick={startEdit}
              className={`text-stone-700 ${isDone ? 'text-stone-400 line-through' : ''} ${isCarried ? 'text-stone-400' : ''}`}
            >
              {todo.title}
            </span>
            {/* carried ラベル（[要件 7.10]） */}
            {isCarried && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                → 翌日へ持ち越し済み
              </span>
            )}
            {/* 持ち越し元の日付表示（[要件 7.10] 表示例「7/8から持ち越し」） */}
            {todo.carriedFromDate && (
              <span className="text-xs text-stone-400">
                {formatMonthDay(todo.carriedFromDate)} から持ち越し
              </span>
            )}
            {/* 発生元ノート行スナップショット（Phase 5、AC-08、[note_conversion_spec.md §9.2]） */}
            {sourceNoteLineMeta && (
              <span className="relative">
                <span className="cursor-help text-xs text-stone-300 hover:text-stone-500">ⓘ</span>
                <span className="pointer-events-none absolute left-0 top-5 z-20 hidden max-w-xs rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 shadow-md group-hover:block whitespace-pre-wrap">
                  元ノート行: {sourceNoteLineMeta.lineText}
                </span>
              </span>
            )}
          </div>
        )}

        {/* 削除確認ダイアログ（[edge_cases.md §2.1]） */}
        {confirmDelete && (
          <div className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <p>本文が空です。このTODOを削除しますか？</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700"
              >
                削除
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  startEdit();
                }}
                className="rounded border border-amber-300 px-2 py-0.5 hover:bg-amber-100"
              >
                編集に戻る
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 並替・編集・削除ボタン（ホバー時表示） */}
      {!editing && !confirmDelete && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="上へ移動"
            className="rounded px-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="下へ移動"
            className="rounded px-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={startEdit}
            aria-label="編集"
            className="rounded px-1 text-stone-400 hover:text-stone-700"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="削除"
            className="rounded px-1 text-stone-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}

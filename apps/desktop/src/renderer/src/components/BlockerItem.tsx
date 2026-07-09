/**
 * 障害アイテム個別（[roadmap.md T-3-12]）
 *
 * 機能:
 * - 本文編集（ダブルクリック or 編集ボタン）
 * - 解消切替（resolved、要件 7.4）
 * - TODO紐付け（任意、ドロップダウンで当日のTODOから選択）
 * - 解消状態の視覚的区別（薄色 + ✓アイコン、色のみ依存しない、[ui_interaction_spec.md §12]）
 * - 並替（↑/↓ ボタン）
 */

import { useEffect, useRef, useState } from 'react';
import type { BlockerItem as BlockerItemType, TodoItem as TodoItemType } from 'shared-types';

export type BlockerItemProps = {
  blocker: BlockerItemType;
  todos: TodoItemType[];
  isFirst: boolean;
  isLast: boolean;
  onToggleResolved: () => void;
  onEditText: (text: string) => void;
  onChangeLinkedTodo: (linkedTodoId: string | null) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function BlockerItem({
  blocker,
  todos,
  isFirst,
  isLast,
  onToggleResolved,
  onEditText,
  onChangeLinkedTodo,
  onDelete,
  onMoveUp,
  onMoveDown,
}: BlockerItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(blocker.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(blocker.text);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setConfirmDelete(true);
      setEditing(false);
      return;
    }
    if (trimmed !== blocker.text) {
      onEditText(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(blocker.text);
    setEditing(false);
  };

  const linkedTodo = blocker.linkedTodoId
    ? todos.find((t) => t.id === blocker.linkedTodoId)
    : null;

  return (
    <li className="group flex items-start gap-2 py-1">
      <button
        type="button"
        onClick={onToggleResolved}
        aria-label={blocker.resolved ? '未解消に戻す' : '解消済みにする'}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 text-xs disabled:opacity-40"
        aria-pressed={blocker.resolved}
      >
        {blocker.resolved && <span aria-hidden="true">✓</span>}
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
              className={`text-stone-700 ${blocker.resolved ? 'text-stone-400 line-through' : ''}`}
            >
              ・{blocker.text}
            </span>
            {/* 紐づくTODO表示 */}
            {linkedTodo && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                → {linkedTodo.title}
              </span>
            )}
            {blocker.resolved && (
              <span className="text-xs text-stone-400">解消済み</span>
            )}
          </div>
        )}

        {/* TODO紐付けセレクト（任意、要件 7.4） */}
        {!editing && !confirmDelete && (
          <select
            value={blocker.linkedTodoId ?? ''}
            onChange={(e) => onChangeLinkedTodo(e.target.value === '' ? null : e.target.value)}
            className="mt-1 bg-transparent text-xs text-stone-400 outline-none hover:text-stone-600"
            aria-label="紐づくTODO"
          >
            <option value="">（TODO紐付けなし）</option>
            {todos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}

        {/* 削除確認ダイアログ */}
        {confirmDelete && (
          <div className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <p>本文が空です。この障害を削除しますか？</p>
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

      {/* 並替・編集・削除ボタン */}
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

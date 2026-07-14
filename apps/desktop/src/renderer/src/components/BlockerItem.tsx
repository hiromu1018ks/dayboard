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
import type {
  BlockerItem as BlockerItemType,
  NoteLineMeta,
  TodoItem as TodoItemType,
} from 'shared-types';

export type BlockerItemProps = {
  blocker: BlockerItemType;
  todos: TodoItemType[];
  isFirst: boolean;
  isLast: boolean;
  /** 発生元ノート行のスナップショット（Phase 5、AC-08） */
  sourceNoteLineMeta?: NoteLineMeta | null;
  /** 変換成功後の一時ハイライト（Phase 5、[§4.3] 1.2s） */
  highlight?: boolean;
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
  sourceNoteLineMeta,
  highlight = false,
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

  const linkedTodo = blocker.linkedTodoId ? todos.find((t) => t.id === blocker.linkedTodoId) : null;

  return (
    <li
      className={`group relative flex items-start gap-2.5 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-raised/30 ${
        editing
          ? 'before:absolute before:bottom-1.5 before:left-0.5 before:top-1.5 before:w-0.5 before:rounded before:bg-ink/70'
          : ''
      } ${highlight ? 'bg-warn/15' : ''}`}
    >
      <button
        type="button"
        onClick={onToggleResolved}
        aria-label={blocker.resolved ? '未解消に戻す' : '解消済みにする'}
        data-focus-item={blocker.id}
        tabIndex={0}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-40 ${
          blocker.resolved
            ? 'border-ink bg-ink text-panel hover:border-ink'
            : 'border-line text-transparent hover:border-ink/60'
        }`}
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
            className="w-full border-none bg-transparent px-1 py-0.5 text-ink outline-none"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              onDoubleClick={startEdit}
              className={`text-ink ${blocker.resolved ? 'text-faint line-through' : ''}`}
            >
              ・{blocker.text}
            </span>
            {/* 紐づくTODO表示 */}
            {linkedTodo && (
              <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-sub">
                → {linkedTodo.title}
              </span>
            )}
            {blocker.resolved && <span className="text-xs text-faint">Resolved</span>}
            {/* 発生元ノート行スナップショット（Phase 5、AC-08、[note_conversion_spec.md §9.2]） */}
            {sourceNoteLineMeta && (
              <span className="relative">
                <span className="cursor-help text-xs text-faint hover:text-sub">ⓘ</span>
                <span className="pointer-events-none absolute left-0 top-5 z-20 hidden max-w-xs rounded border border-line bg-panel px-2 py-1 text-xs text-sub shadow-md group-hover:block whitespace-pre-wrap">
                  元ノート行: {sourceNoteLineMeta.lineText}
                </span>
              </span>
            )}
          </div>
        )}

        {/* TODO紐付けセレクト（任意、要件 7.4） */}
        {!editing && !confirmDelete && (
          <select
            value={blocker.linkedTodoId ?? ''}
            onChange={(e) => onChangeLinkedTodo(e.target.value === '' ? null : e.target.value)}
            className="mt-1 rounded bg-raised/40 px-1.5 py-0.5 text-xs text-faint outline-none hover:bg-raised/70 hover:text-sub"
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
          <div className="mt-1 rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
            <p>本文が空です。この障害を削除しますか？</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                className="rounded bg-warn px-2 py-0.5 text-bg hover:brightness-110"
              >
                削除
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  startEdit();
                }}
                className="rounded border border-warn/60 px-2 py-0.5 text-warn hover:bg-warn/10"
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
            className="rounded px-1 text-faint hover:text-ink disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="下へ移動"
            className="rounded px-1 text-faint hover:text-ink disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={startEdit}
            aria-label="編集"
            className="rounded px-1 text-faint hover:text-ink"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="削除"
            className="rounded px-1 text-faint hover:text-danger"
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}

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
import type { VimState } from './VimStateBadge.js';

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
  /** 選択中か（Vim キーバインド時の selection カーソル、[selection.ts]） */
  isSelected?: boolean;
  /** 選択ハイライトを表示するか（keybindingMode='vim'時のみ true） */
  showSelection?: boolean;
  /** Vim操作状態（Insert 時は選択ハイライトを強調） */
  vimState?: VimState;
  /**
   * 外部からの編集モード指定（Vim `i`/`Enter`/`a` で親が制御、[§3.4]）。
   * 未指定（undefined）時は従来通りローカル制御（ダブルクリック/✎ボタン）。
   * true が来たら input へフォーカスし編集モードへ入る。
   */
  isEditing?: boolean;
  /** 編集モードの開始/終了を親へ通知（Vim の Insert→Normal 連動用） */
  onEditingChange?: (editing: boolean) => void;
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
  isSelected = false,
  showSelection = false,
  vimState = 'normal',
  isEditing,
  onEditingChange,
  onToggle,
  onEditTitle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TodoItemProps) {
  // 外部制御（Vim の i/Enter）とローカル制御（ダブルクリック/✎）の合成。
  // isEditing が undefined の時は従来通りローカル state が真実源。
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = isEditing ?? internalEditing;
  const [draft, setDraft] = useState(todo.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 編集モード開始時にフォーカス（外部制御・ローカル制御どちらも対象）
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(todo.title);
    setInternalEditing(true);
    onEditingChange?.(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // 空確定 → 削除確認ダイアログ（[edge_cases.md §2.1]）
      setConfirmDelete(true);
      setInternalEditing(false);
      onEditingChange?.(false);
      return;
    }
    if (trimmed !== todo.title) {
      onEditTitle(trimmed);
    }
    setInternalEditing(false);
    onEditingChange?.(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setInternalEditing(false);
    onEditingChange?.(false);
  };

  const isDone = todo.status === 'done';
  const isCarried = todo.status === 'carried';

  // 選択中の視覚（Vim キーバインド時）: 行全体の薄い背景 + 左端カーソルバー。
  // Insert 状態時は背景をやや濃くして「編集中」を明示。
  // light/dark でコントラストを調整（light は濃いめ・太めで視認性を確保）。
  const selectionClass =
    showSelection && isSelected
      ? vimState === 'insert'
        ? 'bg-accent/30 dark:bg-accent/20 before:absolute before:bottom-1.5 before:left-0.5 before:top-1.5 before:w-1 dark:before:w-0.5 before:rounded before:bg-accent'
        : 'bg-accent/25 dark:bg-accent/10 before:absolute before:bottom-1.5 before:left-0.5 before:top-1.5 before:w-1 dark:before:w-0.5 before:rounded before:bg-accent'
      : '';

  return (
    <li
      className={`group relative flex items-start gap-2.5 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-raised/30 ${
        editing
          ? 'before:absolute before:bottom-1.5 before:left-0.5 before:top-1.5 before:w-0.5 before:rounded before:bg-ink/70'
          : ''
      } ${highlight ? 'bg-warn/15' : ''} ${selectionClass}`}
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
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-40 ${
          isDone
            ? 'border-ink bg-ink text-panel hover:border-ink'
            : 'border-line text-transparent hover:border-ink/60'
        }`}
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
            className="w-full border-none bg-transparent px-1 py-0.5 text-ink outline-none"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              onDoubleClick={startEdit}
              className={`text-ink ${isDone ? 'text-faint line-through' : ''} ${isCarried ? 'text-faint' : ''}`}
            >
              {todo.title}
            </span>
            {/* carried ラベル（[要件 7.10]） */}
            {isCarried && (
              <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-sub">
                → Carried to tomorrow
              </span>
            )}
            {/* 持ち越し元の日付表示（[要件 7.10] 表示例「7/8から持ち越し」） */}
            {todo.carriedFromDate && (
              <span className="text-xs text-faint">
                {formatMonthDay(todo.carriedFromDate)} から持ち越し
              </span>
            )}
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

        {/* 削除確認ダイアログ（[edge_cases.md §2.1]） */}
        {confirmDelete && (
          <div className="mt-1 rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
            <p>本文が空です。このTODOを削除しますか？</p>
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

      {/* 並替・編集・削除ボタン（ホバー時表示） */}
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

/**
 * TODO 列（[roadmap.md T-3-10]）
 *
 * [ui_interaction_spec.md §5.1]:
 * - 追加入力欄を下部に配置
 * - Enter で確定 → POST、確定後フォーカス維持（連続追加）
 * - 空入力で Enter/Esc でフォーカスをリスト先頭へ
 *
 * 並替は ↑/↓ ボタン（TodoItem 内）。ドラッグ&ドロップは Post-MVP。
 */

import { useEffect, useRef, useState } from 'react';
import type { NoteLineMeta, TodoItem as TodoItemType } from 'shared-types';
import { TodoItem } from './TodoItem.js';

export type TodoColumnProps = {
  date: string;
  todos: TodoItemType[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  /** 未完了TODOを翌日に持ち越す（Phase 6、要件 7.10） */
  onCarryOverTodos: (todoIds: string[]) => void;
  /** sourceNoteLineMetaId → NoteLineMeta のマップ（発生元表示用、Phase 5） */
  noteLineMetaMap?: Map<string, NoteLineMeta>;
  /** ハイライト対象のTODO id セット（Phase 5） */
  highlightIds?: Set<string>;
};

export function TodoColumn({
  date,
  todos,
  onAdd,
  onToggle,
  onEditTitle,
  onDelete,
  onReorder,
  onCarryOverTodos,
  noteLineMetaMap,
  highlightIds,
}: TodoColumnProps) {
  const [draft, setDraft] = useState('');
  const [confirmCarryOver, setConfirmCarryOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // date が変わったら入力欄をクリア
  useEffect(() => {
    setDraft('');
    setConfirmCarryOver(false);
  }, [date]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraft('');
      return;
    }
    onAdd(trimmed);
    setDraft('');
    // フォーカス維持（連続追加、[ui_interaction_spec.md §5.1]）
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // 持ち越し対象: 未完了（status='todo'）のみ。done/carried は除外
  const incompleteTodos = todos.filter((t) => t.status === 'todo');

  /** 指定 index の TODO を一つ上へ移動 */
  const moveUp = (index: number) => {
    if (index === 0) return;
    const ids = todos.map((t) => t.id);
    [ids[index - 1]!, ids[index]!] = [ids[index]!, ids[index - 1]!];
    onReorder(ids);
  };

  /** 指定 index の TODO を一つ下へ移動 */
  const moveDown = (index: number) => {
    if (index === todos.length - 1) return;
    const ids = todos.map((t) => t.id);
    [ids[index + 1]!, ids[index]!] = [ids[index]!, ids[index + 1]!];
    onReorder(ids);
  };

  return (
    <section
      className="flex flex-col rounded-lg border border-stone-200 bg-white p-5"
      aria-label="TODO"
    >
      <h2 className="mb-3 text-sm font-semibold text-stone-600">
        <span className="mr-1 text-stone-400">①</span>TODO
      </h2>

      <ul className="flex-1 space-y-0.5">
        {todos.map((todo, i) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            isFirst={i === 0}
            isLast={i === todos.length - 1}
            sourceNoteLineMeta={
              todo.sourceNoteLineMetaId && noteLineMetaMap
                ? (noteLineMetaMap.get(todo.sourceNoteLineMetaId) ?? null)
                : null
            }
            highlight={highlightIds?.has(todo.id) ?? false}
            onToggle={() => onToggle(todo.id)}
            onEditTitle={(title) => onEditTitle(todo.id, title)}
            onDelete={() => onDelete(todo.id)}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
          />
        ))}
        {todos.length === 0 && (
          <li className="py-4 text-center text-xs text-stone-300">TODOはありません</li>
        )}
      </ul>

      {/* 未完了TODOの翌日持ち越しボタン（Phase 6、要件 7.10）
          未完了（status='todo'）のTODOがある場合のみ表示。
          持ち越しは不可逆操作（carried は終端状態）のため確認ダイアログを挟む */}
      {incompleteTodos.length > 0 && !confirmCarryOver && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => setConfirmCarryOver(true)}
            className="text-xs text-stone-500 hover:text-stone-800 hover:underline"
          >
            未完了を翌日へ持ち越し（{incompleteTodos.length}件）
          </button>
        </div>
      )}
      {incompleteTodos.length > 0 && confirmCarryOver && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <p>未完了TODO {incompleteTodos.length}件を翌日に持ち越しますか？</p>
          <p className="mt-0.5 text-amber-600">持ち越し後は元に戻せません。</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmCarryOver(false);
                onCarryOverTodos(incompleteTodos.map((t) => t.id));
              }}
              className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700"
            >
              持ち越す
            </button>
            <button
              type="button"
              onClick={() => setConfirmCarryOver(false)}
              className="rounded border border-amber-300 px-2 py-0.5 hover:bg-amber-100"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 追加入力欄（[ui_interaction_spec.md §5.1]） */}
      <div className="mt-3 border-t border-stone-100 pt-3">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="TODOを追加して Enter"
          maxLength={200}
          className="w-full border-b border-stone-200 bg-transparent px-1 py-0.5 text-sm text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-400"
          aria-label="新規TODO入力"
        />
      </div>
    </section>
  );
}

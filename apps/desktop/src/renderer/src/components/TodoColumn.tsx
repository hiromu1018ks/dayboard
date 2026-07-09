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
import type { TodoItem as TodoItemType } from 'shared-types';
import { TodoItem } from './TodoItem.js';

export type TodoColumnProps = {
  date: string;
  todos: TodoItemType[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
};

export function TodoColumn({
  date,
  todos,
  onAdd,
  onToggle,
  onEditTitle,
  onDelete,
  onReorder,
}: TodoColumnProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // date が変わったら入力欄をクリア
  useEffect(() => {
    setDraft('');
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

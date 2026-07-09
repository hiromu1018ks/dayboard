/**
 * 障害・詰まり列（[roadmap.md T-3-12]）
 *
 * [要件 7.4]: 追加・編集・解消切替・TODO紐付け（任意）。
 * TodoColumn と同構造。並替は ↑/↓ ボタン。
 */

import { useEffect, useRef, useState } from 'react';
import type { BlockerItem as BlockerItemType, TodoItem as TodoItemType } from 'shared-types';
import { BlockerItem } from './BlockerItem.js';

export type BlockerColumnProps = {
  date: string;
  blockers: BlockerItemType[];
  todos: TodoItemType[];
  onAdd: (text: string, linkedTodoId: string | null) => void;
  onToggleResolved: (id: string) => void;
  onEditText: (id: string, text: string) => void;
  onChangeLinkedTodo: (id: string, linkedTodoId: string | null) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
};

export function BlockerColumn({
  date,
  blockers,
  todos,
  onAdd,
  onToggleResolved,
  onEditText,
  onChangeLinkedTodo,
  onDelete,
  onReorder,
}: BlockerColumnProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft('');
  }, [date]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraft('');
      return;
    }
    onAdd(trimmed, null);
    setDraft('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const ids = blockers.map((b) => b.id);
    [ids[index - 1]!, ids[index]!] = [ids[index]!, ids[index - 1]!];
    onReorder(ids);
  };

  const moveDown = (index: number) => {
    if (index === blockers.length - 1) return;
    const ids = blockers.map((b) => b.id);
    [ids[index + 1]!, ids[index]!] = [ids[index]!, ids[index + 1]!];
    onReorder(ids);
  };

  return (
    <section
      className="flex flex-col rounded-lg border border-stone-200 bg-white p-5"
      aria-label="障害・詰まり"
    >
      <h2 className="mb-3 text-sm font-semibold text-stone-600">
        <span className="mr-1 text-stone-400">②</span>障害・詰まり
      </h2>

      <ul className="flex-1 space-y-0.5">
        {blockers.map((blocker, i) => (
          <BlockerItem
            key={blocker.id}
            blocker={blocker}
            todos={todos}
            isFirst={i === 0}
            isLast={i === blockers.length - 1}
            onToggleResolved={() => onToggleResolved(blocker.id)}
            onEditText={(text) => onEditText(blocker.id, text)}
            onChangeLinkedTodo={(linkedTodoId) => onChangeLinkedTodo(blocker.id, linkedTodoId)}
            onDelete={() => onDelete(blocker.id)}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
          />
        ))}
        {blockers.length === 0 && (
          <li className="py-4 text-center text-xs text-stone-300">障害はありません</li>
        )}
      </ul>

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
          placeholder="障害を追加して Enter"
          maxLength={200}
          className="w-full border-b border-stone-200 bg-transparent px-1 py-0.5 text-sm text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-400"
          aria-label="新規障害入力"
        />
      </div>
    </section>
  );
}

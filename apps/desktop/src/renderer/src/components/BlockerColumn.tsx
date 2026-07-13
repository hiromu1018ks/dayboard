/**
 * 障害・詰まり列（[roadmap.md T-3-12]）
 *
 * [要件 7.4]: 追加・編集・解消切替・TODO紐付け（任意）。
 * TodoColumn と同構造。並替は ↑/↓ ボタン。
 */

import { useEffect, useRef, useState } from 'react';
import type {
  BlockerItem as BlockerItemType,
  NoteLineMeta,
  TodoItem as TodoItemType,
} from 'shared-types';
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
  /** sourceNoteLineMetaId → NoteLineMeta のマップ（発生元表示用、Phase 5） */
  noteLineMetaMap?: Map<string, NoteLineMeta>;
  /** ハイライト対象の障害 id セット（Phase 5） */
  highlightIds?: Set<string>;
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
  noteLineMetaMap,
  highlightIds,
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
      className="flex flex-col rounded-lg border border-line bg-panel p-5"
      aria-label="障害・詰まり"
      data-focus-section="blocker"
    >
      <h2 className="head mb-3 text-sm text-sub">
        <span className="mr-1 text-faint">②</span>障害・詰まり
      </h2>

      <ul className="flex-1 space-y-0.5">
        {blockers.map((blocker, i) => (
          <BlockerItem
            key={blocker.id}
            blocker={blocker}
            todos={todos}
            isFirst={i === 0}
            isLast={i === blockers.length - 1}
            sourceNoteLineMeta={
              blocker.sourceNoteLineMetaId && noteLineMetaMap
                ? (noteLineMetaMap.get(blocker.sourceNoteLineMetaId) ?? null)
                : null
            }
            highlight={highlightIds?.has(blocker.id) ?? false}
            onToggleResolved={() => onToggleResolved(blocker.id)}
            onEditText={(text) => onEditText(blocker.id, text)}
            onChangeLinkedTodo={(linkedTodoId) => onChangeLinkedTodo(blocker.id, linkedTodoId)}
            onDelete={() => onDelete(blocker.id)}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
          />
        ))}
        {blockers.length === 0 && (
          <li className="py-4 text-center text-xs text-faint">障害はありません</li>
        )}
      </ul>

      {/* Phase 7: data-focus-input で列フォーカス（⌘2, Vim h/l/Space 2, i）の対象 */}
      <div className="mt-3 border-t border-linesoft pt-3">
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
          data-focus-input
          className="w-full border-b border-linesoft bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          aria-label="新規障害入力"
        />
      </div>
    </section>
  );
}

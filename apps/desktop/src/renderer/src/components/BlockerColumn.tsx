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
import type { VimState } from './VimStateBadge.js';
import type { WorkSelection } from '../keybindings/selection.js';

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
  /** 現在の選択位置（Vim キーバインド時） */
  selection: WorkSelection;
  /** 選択ハイライトを表示するか（keybindingMode='vim'時のみ true） */
  showSelection: boolean;
  /** Vim操作状態（選択ハイライト強調用） */
  vimState: VimState;
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
  selection,
  showSelection,
  vimState,
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

  // 選択中判定（Vim キーバインド時のみ）
  const isThisColumnSelected = showSelection && selection.section === 'blocker';
  const selectedItemId =
    isThisColumnSelected && selection.itemIndex !== null && selection.itemIndex < blockers.length
      ? (blockers[selection.itemIndex]?.id ?? null)
      : null;
  const isAddInputSelected = isThisColumnSelected && selection.itemIndex === blockers.length;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded border bg-panel/30 p-7 transition-colors focus:outline-none ${
        isThisColumnSelected ? 'border-accent/50' : 'border-line/60'
      }`}
      aria-label="障害・詰まり"
      data-focus-section="blocker"
      tabIndex={-1}
    >
      <h2 className="head mb-5 flex items-center gap-2 text-lg text-ink">
        <span className="inline-block h-4 w-0.5 bg-ink/70" aria-hidden="true" />
        Stuck
      </h2>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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
            isSelected={selectedItemId === blocker.id}
            showSelection={showSelection}
            vimState={vimState}
            onToggleResolved={() => onToggleResolved(blocker.id)}
            onEditText={(text) => onEditText(blocker.id, text)}
            onChangeLinkedTodo={(linkedTodoId) => onChangeLinkedTodo(blocker.id, linkedTodoId)}
            onDelete={() => onDelete(blocker.id)}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
          />
        ))}
        {blockers.length === 0 && (
          <li className="py-4 text-center text-xs text-faint">No blockers</li>
        )}
      </ul>

      {/* Phase 7: data-focus-input で列フォーカス（⌘2, Vim h/l/Space 2, i）の対象 */}
      <div className="mt-3 flex items-center gap-2 border-t border-linesoft pt-3">
        <span className="select-none text-sm text-faint" aria-hidden="true">
          ＋
        </span>
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
          className={`w-full border-none bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-faint ${
            isAddInputSelected && vimState === 'normal' ? 'ring-1 ring-accent/40' : ''
          }`}
          aria-label="新規障害入力"
        />
      </div>
    </section>
  );
}

/**
 * 障害・詰まり列（[roadmap.md T-3-12]）
 *
 * [要件 7.4]: 追加・編集・解消切替・TODO紐付け（任意）。
 * TodoColumn と同構造。並替はドラッグ&ドロップ（@dnd-kit）+ ↑/↓ ボタン（アクセシビリティ代替）。
 */

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  BlockerItem as BlockerItemType,
  NoteLineMeta,
  TodoItem as TodoItemType,
} from 'shared-types';
import { BlockerItem, type BlockerItemProps } from './BlockerItem.js';
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
  /**
   * 現在編集中のアイテム id（Vim `i`/`Enter`/`a`/`A` で外部制御、[§3.4]）。
   * null = 編集中なし。未指定時は各アイテムのローカル制御。
   */
  editingItemId?: string | null;
  /**
   * 編集開始時のカーソル位置ヒント（Vim `A` = 行末、それ以外 = 維持、[§3.4]）。
   * editingItemId がセットされたタイミングで参照される。
   */
  editCursorHint?: 'keep' | 'end';
  /** 編集モードの開始/終了を親へ通知（id または null） */
  onEditingChange?: (id: string | null) => void;
  /**
   * 追加入力欄で Enter 確定した際のコールバック（Vim 時のみ指定、[§5.1]）。
   * App 側で vimState を Normal へ戻し、選択要素へフォーカスを戻す。
   * 未指定（標準キーバインド）時は連続追加（フォーカス維持）の現状挙動。
   */
  onCommitAddInput?: () => void;
};

/**
 * 並替可能な障害アイテムのラッパー（@dnd-kit useSortable 適用）。
 * BlockerItem には sortableRef/style/dragHandleProps/isDragging を注入する。
 *
 * TODO 側（SortableTodoItem）とは異なり `disabled` 指定なし。理由: TODO には carried
 * （持ち越し済み）という操作不可状態があるが、Blocker には resolved（解消）しかなく、
 * 解消済みでも並替えは有効な操作のため全行ドラッグ可能とする。
 */
function SortableBlockerItem(props: BlockerItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.blocker.id,
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <BlockerItem
      {...props}
      sortableRef={setNodeRef}
      sortableStyle={sortableStyle}
      dragHandleProps={listeners ? { ...listeners, ...attributes } : undefined}
      isDragging={isDragging}
    />
  );
}

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
  editingItemId,
  editCursorHint,
  onEditingChange,
  onCommitAddInput,
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
      // Vim 時は空確定でも Normal 戻り（追加入力欄から抜ける）
      onCommitAddInput?.();
      return;
    }
    onAdd(trimmed, null);
    setDraft('');
    if (onCommitAddInput) {
      // Vim 時: Normal 戻り + 選択要素へフォーカス（連続追加しない）
      onCommitAddInput();
    } else {
      // 標準時: フォーカス維持（連続追加、[ui_interaction_spec.md §5.1]）
      requestAnimationFrame(() => inputRef.current?.focus());
    }
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

  // DnD センサ（TodoColumn と同構成）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** DnD 終了時: 全 id 配列を再構築し onReorder へ */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = blockers.map((b) => b.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded border bg-panel/30 p-7 transition-colors focus:outline-none ${
        isThisColumnSelected ? 'border-accent dark:border-accent/50' : 'border-line/60'
      }`}
      aria-label="障害・詰まり"
      data-focus-section="blocker"
      tabIndex={-1}
    >
      <h2 className="head mb-5 flex items-center gap-2 text-lg text-ink">
        <span className="inline-block h-4 w-0.5 bg-ink/70" aria-hidden="true" />
        Stuck
      </h2>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blockers.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {blockers.map((blocker, i) => (
              <SortableBlockerItem
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
                // editingItemId が未指定（undefined = 標準キーバインド）の場合は
                // isEditing も undefined にして BlockerItem 側の internalEditing を権威とする。
                // `editingItemId === blocker.id` とすると undefined/null が false に変換され、
                // `editing = isEditing ?? internalEditing` で internalEditing が無視されてしまう。
                isEditing={editingItemId === undefined ? undefined : editingItemId === blocker.id}
                editCursorHint={editCursorHint}
                onEditingChange={(e) => onEditingChange?.(e ? blocker.id : null)}
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
        </SortableContext>
      </DndContext>

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
            isAddInputSelected && vimState === 'normal'
              ? 'ring-2 ring-accent dark:ring-accent/40'
              : ''
          }`}
          aria-label="新規障害入力"
        />
      </div>
    </section>
  );
}

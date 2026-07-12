/**
 * 仕事整理モード（3カラムレイアウト、[roadmap.md T-3-09]）
 *
 * [要件 6.2/14]: TODO / 障害・詰まり / 振り返り の3カラムを画面いっぱいに配置。
 * Tailwind でノート風UI（紙ノート余白、罫線は控えめ、[要件 14.1]）。
 */

import type { Dispatch } from 'react';
import type { DayNoteFull, NoteLineMeta, TodoItem, BlockerItem, Reflection } from 'shared-types';
import { BlockerColumn } from './BlockerColumn.js';
import { ReflectionColumn } from './ReflectionColumn.js';
import { TodoColumn } from './TodoColumn.js';
import type { WorkAction } from '../hooks/useWorkData.js';

/** WorkMode が扱うコールバック群（App.tsx から注入）。 */
export type WorkModeHandlers = {
  // TODO
  onAddTodo: (title: string) => void;
  onToggleTodo: (id: string) => void;
  onEditTodoTitle: (id: string, title: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodos: (orderedIds: string[]) => void;
  /** 未完了TODOを翌日に持ち越す（Phase 6、要件 7.10） */
  onCarryOverTodos: (todoIds: string[]) => void;
  // Blocker
  onAddBlocker: (text: string, linkedTodoId: string | null) => void;
  onToggleBlockerResolved: (id: string) => void;
  onEditBlockerText: (id: string, text: string) => void;
  onChangeBlockerLinkedTodo: (id: string, linkedTodoId: string | null) => void;
  onDeleteBlocker: (id: string) => void;
  onReorderBlockers: (orderedIds: string[]) => void;
  // Reflection
  onEditReflection: (patch: Partial<Reflection>) => void;
};

export type WorkModeProps = {
  date: string;
  todos: TodoItem[];
  blockers: BlockerItem[];
  reflection: Reflection;
  dispatch: Dispatch<WorkAction>;
  handlers: WorkModeHandlers;
  /** sourceNoteLineMetaId → NoteLineMeta のマップ（発生元表示用、Phase 5） */
  noteLineMetaMap?: Map<string, NoteLineMeta>;
  /** ハイライト対象のTODO id セット（Phase 5、変換成功後の1.2s） */
  highlightTodoIds?: Set<string>;
  /** ハイライト対象の障害 id セット（Phase 5） */
  highlightBlockerIds?: Set<string>;
};

/**
 * 仕事整理モードの3カラムレイアウト。
 *
 * 各カラムは `rounded-lg border border-stone-200 bg-white` のカードで、
 * 紙ノート余白を表現するため `p-5` のパディングを持つ（[要件 14.1]）。
 */
export function WorkMode({
  date,
  todos,
  blockers,
  reflection,
  handlers,
  noteLineMetaMap,
  highlightTodoIds,
  highlightBlockerIds,
}: WorkModeProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <TodoColumn
        date={date}
        todos={todos}
        onAdd={handlers.onAddTodo}
        onToggle={handlers.onToggleTodo}
        onEditTitle={handlers.onEditTodoTitle}
        onDelete={handlers.onDeleteTodo}
        onReorder={handlers.onReorderTodos}
        onCarryOverTodos={handlers.onCarryOverTodos}
        noteLineMetaMap={noteLineMetaMap}
        highlightIds={highlightTodoIds}
      />
      <BlockerColumn
        date={date}
        blockers={blockers}
        todos={todos}
        onAdd={handlers.onAddBlocker}
        onToggleResolved={handlers.onToggleBlockerResolved}
        onEditText={handlers.onEditBlockerText}
        onChangeLinkedTodo={handlers.onChangeBlockerLinkedTodo}
        onDelete={handlers.onDeleteBlocker}
        onReorder={handlers.onReorderBlockers}
        noteLineMetaMap={noteLineMetaMap}
        highlightIds={highlightBlockerIds}
      />
      <ReflectionColumn reflection={reflection} onEdit={handlers.onEditReflection} />
    </div>
  );
}

// DayNoteFull は prop の型整合性のために import（将来の拡張で dayNote 全体を扱う可能性）
export type { DayNoteFull };

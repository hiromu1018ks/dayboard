/**
 * 仕事整理モード（3カラムレイアウト、[roadmap.md T-3-09]）
 *
 * [要件 6.2/14]: TODO / 障害・詰まり / 振り返り の3カラムを画面いっぱいに配置。
 * Tailwind でノート風UI（紙ノート余白、罫線は控えめ、[要件 14.1]）。
 */

import type { Dispatch } from 'react';
import type { DayNoteFull, NoteLineMeta, TodoItem, BlockerItem, Reflection } from 'shared-types';
import type { KeybindingMode } from 'shared-types';
import type { VimState } from './VimStateBadge.js';
import type { WorkSelection } from '../keybindings/selection.js';
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
  /** 現在の選択位置（Vim キーバインド時の2D カーソル、[selection.ts]） */
  selection: WorkSelection;
  /** Vim操作状態（normal/insert）。選択ハイライトの強調表示に使用 */
  vimState: VimState;
  /** キーバインドモード。standard の時は選択ハイライトを表示しない */
  keybindingMode: KeybindingMode;
  /**
   * 現在編集中の todo/blocker id（Vim `i`/`Enter`/`a` で外部制御、[§3.4]）。
   * null = 編集中なし。Vim キーバインド時のみ指定。
   */
  editingItemId?: string | null;
  /** 編集モードの開始/終了を親へ通知（id または null） */
  onEditingChange?: (id: string | null) => void;
  /**
   * 追加入力欄で Enter 確定した際のコールバック（Vim 時のみ指定、[§5.1]）。
   * 親で vimState を Normal へ戻し、選択要素へフォーカスを戻す。
   */
  onCommitAddInput?: () => void;
};

/**
 * 仕事整理モードの3カラムレイアウト。
 *
 * 「箱型カード3枚」ではなく、1枚の紙ノートを縦罫線で3区画に分ける構成。
 * 各カラムは `rounded border border-line/60 bg-panel/30` の枠で、
 * 和紙の繊維ノイズ（body の dot pattern）が透けて見えるように背景を薄くする。
 * 余白は広め（p-7）で「ノートの書き込みスペース」を表現（[要件 14.1]）。
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
  selection,
  vimState,
  keybindingMode,
  editingItemId,
  onEditingChange,
  onCommitAddInput,
}: WorkModeProps) {
  // Vim キーバインド時のみ選択ハイライトを有効化
  const showSelection = keybindingMode === 'vim';
  // Vim キーバインド時のみ編集モード外部制御と追加入力欄の Normal 戻りを有効化
  const editingProps =
    keybindingMode === 'vim' ? { editingItemId, onEditingChange, onCommitAddInput } : {};
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-3">
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
        selection={selection}
        showSelection={showSelection}
        vimState={vimState}
        {...editingProps}
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
        selection={selection}
        showSelection={showSelection}
        vimState={vimState}
        {...editingProps}
      />
      <ReflectionColumn
        reflection={reflection}
        onEdit={handlers.onEditReflection}
        selection={selection}
        showSelection={showSelection}
        vimState={vimState}
      />
    </div>
  );
}

// DayNoteFull は prop の型整合性のために import（将来の拡張で dayNote 全体を扱う可能性）
export type { DayNoteFull };

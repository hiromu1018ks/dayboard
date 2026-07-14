/**
 * Markdown 出力（ピュア関数）
 *
 * 1日分の DayNoteFull を Markdown 文字列へ変換する。API（GET /api/day-notes/:date/markdown）
 * と Renderer（クリップボードコピー）の両方から参照されるため、ピュア TS としてドメイン層に置く
 * （[architecture.md §4]）。
 *
 * 出力形式の設計:
 * - 日付見出し: `# Jul 13, 2026 (Sun)`（`formatDisplayDate` + `getWeekdayLabelEn`）
 * - セクション: Today's Theme / Today / Stuck / Reflection (Done/Stuck/Next Step) / Notes
 * - TODO: `done`→`[x]`、`todo`→`[ ]`、`carried`→`[>]（carried to tomorrow）`
 * - 障害: resolved なら `[x]`、未解決なら `[ ]`
 * - 空セクションは出力しない（ノート本文空なら Notes 省略 等）
 */

import type { DayNoteFull, TodoItem } from 'shared-types';
import { formatDisplayDate, getWeekdayLabelEn } from './date.js';

/**
 * TODO のステータスを Markdown のチェックボックス記号へ変換する。
 * - `done`   → `[x]`
 * - `todo`   → `[ ]`
 * - `carried`→ `[>]`（持ち越し済みを示す Git diff 風記号）
 */
function todoCheckbox(status: TodoItem['status']): string {
  switch (status) {
    case 'done':
      return '[x]';
    case 'carried':
      return '[>]';
    case 'todo':
    default:
      return '[ ]';
  }
}

/**
 * `exportDayNoteToMarkdown` の内部用: ステータスが `carried` の TODO 行に注記を付ける。
 * 「carried to tomorrow」の付与で、Markdown 単独でも意味が通るようにする。
 */
function formatTodoLine(todo: TodoItem): string {
  const checkbox = todoCheckbox(todo.status);
  const note = todo.status === 'carried' ? '（carried to tomorrow）' : '';
  return `- ${checkbox} ${todo.title}${note}`;
}

/**
 * 1日分の DayNoteFull を Markdown 文字列へ変換する。
 *
 * @param full `DayNoteFull`（GET /api/day-notes/:date/full と同形式）
 * @returns Markdown 文字列。空セクションは省略される。
 */
export function exportDayNoteToMarkdown(full: DayNoteFull): string {
  const { dayNote, todos, blockers, reflection, noteEntry } = full;
  const lines: string[] = [];

  // 日付見出し: # Jul 13, 2026 (Sun)
  lines.push(`# ${formatDisplayDate(dayNote.date)} (${getWeekdayLabelEn(dayNote.date)})`);
  lines.push('');

  // Today's Theme
  if (dayNote.theme) {
    lines.push("## Today's Theme");
    lines.push(dayNote.theme);
    lines.push('');
  }

  // Today (TODO) — 全ステータス含む。空なら省略。
  if (todos.length > 0) {
    lines.push('## Today');
    for (const todo of todos) {
      lines.push(formatTodoLine(todo));
    }
    lines.push('');
  }

  // Stuck (Blocker) — 空なら省略。
  if (blockers.length > 0) {
    lines.push('## Stuck');
    for (const blocker of blockers) {
      const checkbox = blocker.resolved ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${blocker.text}`);
    }
    lines.push('');
  }

  // Reflection — 各セクション空文字でなければ出力
  const hasReflection =
    reflection.doneText || reflection.stuckText || reflection.tomorrowActionText;
  if (hasReflection) {
    lines.push('## Reflection');
    if (reflection.doneText) {
      lines.push('### Done');
      lines.push(reflection.doneText);
      lines.push('');
    }
    if (reflection.stuckText) {
      lines.push('### Stuck');
      lines.push(reflection.stuckText);
      lines.push('');
    }
    if (reflection.tomorrowActionText) {
      lines.push('### Next Step');
      lines.push(reflection.tomorrowActionText);
      lines.push('');
    }
  }

  // Notes — 本文空なら省略
  if (noteEntry.body) {
    lines.push('## Notes');
    lines.push(noteEntry.body);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * 未存在日の DayNote 用に、日付見出しのみの空 Markdown テンプレートを生成する。
 *
 * Markdown 出力エンドポイントで該当日の DayNote が未存在の場合、404 ではなく
 * この空テンプレートを返す（Export ボタンが常に機能し、UX を一貫させる）。
 *
 * @param dateStr YYYY-MM-DD（実在日付を前提）
 * @returns `# Jul 13, 2026 (Sun)\n\n（no content）\n`
 */
export function buildEmptyDayNoteMarkdown(dateStr: string): string {
  return `# ${formatDisplayDate(dateStr)} (${getWeekdayLabelEn(dateStr)})\n\n（no content）\n`;
}

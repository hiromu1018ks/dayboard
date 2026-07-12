/**
 * ノートモード（[roadmap.md T-4-05/09]、[要件 6.3]）
 *
 * 会議・打ち合わせ・会話メモを画面いっぱいの広いテキストエリアで編集する（[要件 6.3]）。
 * ヘッダーには日付・曜日・モード名・戻る操作の案内を表示する（[要件 6.3 表示項目]）。
 *
 * Phase 4:
 * - NoteEditor（CodeMirror 6）で本文編集（T-4-03）
 * - 本文変更は親（App）の `onBodyChange` へ通知 → 800ms デバウンス保存（T-4-04）
 * - `⌘/Ctrl+J` と `Esc` による work 戻りは App のグローバルキーハンドラで処理（T-4-05/07/08）
 * - editorRef を公開し、モード切替直後に App からフォーカスを当てる（[§4.1]）
 * - loading 中は本文の代わりに「読み込み中…」を表示（日付移動直後の空白画面防止）
 *
 * Phase 5 で追加:
 * - 変換済みマーク（ガター）表示のため、noteEntryId と noteLineMetas を NoteEditor へ伝播（T-5-10）
 * - TODO化・障害化のキー操作を NoteEditor へ伝播（T-5-09）
 */

import { forwardRef } from 'react';
import { getWeekdayLabel } from '@dayboard/domain';
import type { NoteLineMeta } from 'shared-types';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor.js';

/** YYYY-MM-DD を「2026/07/08」形式に整形（Header.tsx と共通の表示形式） */
function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

export type NoteModeProps = {
  /** 表示中の日付（YYYY-MM-DD） */
  currentDate: string;
  /** NoteEntry.body 全文 */
  body: string;
  /** 本文変更時に呼ばれる（親で useAutosave.edit へ接続） */
  onBodyChange: (body: string) => void;
  /** データロード中か（true のとき本文の代わりに読み込み中表示） */
  loading?: boolean;
  /** NoteEntry の id（lineHash 計算・ガター表示用、Phase 5） */
  noteEntryId?: string;
  /** 変換済みメタ（ガター表示用、Phase 5） */
  noteLineMetas?: NoteLineMeta[];
  /** TODO化キー（⌘/Ctrl+Enter）押下時（Phase 5） */
  onConvertTodo?: (lineNumber: number, lineText: string) => void;
  /** 障害化キー（⌘/Ctrl+Shift+B）押下時（Phase 5） */
  onConvertBlocker?: (lineNumber: number, lineText: string) => void;
};

export const NoteMode = forwardRef<NoteEditorHandle, NoteModeProps>(function NoteMode(
  {
    currentDate,
    body,
    onBodyChange,
    loading = false,
    noteEntryId,
    noteLineMetas,
    onConvertTodo,
    onConvertBlocker,
  },
  ref,
) {
  const displayDate = formatDisplayDate(currentDate);
  const weekday = getWeekdayLabel(currentDate);

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          {/* 日付・曜日・モード名 */}
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-800">
              <span className="font-mono">{displayDate}</span>
              <span className="ml-2 text-stone-500">{weekday}</span>
            </h1>
            <span className="text-sm text-stone-400">会議・打ち合わせ・会話メモ</span>
          </div>

          {/* 戻る操作の案内（[要件 6.3]） */}
          <div className="flex items-center gap-3 text-sm text-stone-400">
            <span>
              <kbd className="rounded border border-stone-300 px-1.5 py-0.5 font-sans text-xs text-stone-500">
                Esc
              </kbd>{' '}
              戻る
            </span>
            <span className="text-stone-300">/</span>
            <span>
              <kbd className="rounded border border-stone-300 px-1.5 py-0.5 font-sans text-xs text-stone-500">
                ⌘J
              </kbd>{' '}
              戻る
            </span>
          </div>
        </div>
      </header>

      {/* CodeMirror 本文エリア（[要件 6.3]: 広いテキストエリアを主役に） */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 py-4">
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : (
          <div className="flex-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <NoteEditor
              ref={ref}
              value={body}
              onChange={onBodyChange}
              noteEntryId={noteEntryId}
              noteLineMetas={noteLineMetas}
              onConvertTodo={onConvertTodo}
              onConvertBlocker={onConvertBlocker}
            />
          </div>
        )}
      </main>
    </div>
  );
});

export default NoteMode;

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
import { formatDisplayDate, getWeekdayLabelEn } from '@dayboard/domain';
import type { KeybindingMode, NoteLineMeta } from 'shared-types';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor.js';

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
  /** キーバインドモード（Phase 7 T-7-05: Vim拡張の有効化に使用） */
  keybindingMode?: KeybindingMode;
  /** CodeMirror の Vim mode 変化通知（Phase 7 T-7-05） */
  onVimModeChange?: (mode: 'normal' | 'insert') => void;
  /** 外観モード（墨と波テーマ）。CodeMirror の配色切替に使用 */
  resolvedMode?: 'dark' | 'light';
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
    keybindingMode,
    onVimModeChange,
    resolvedMode,
  },
  ref,
) {
  const displayDate = formatDisplayDate(currentDate);
  const weekday = getWeekdayLabelEn(currentDate);

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <header className="border-b border-line bg-panel px-8 py-4">
        <div className="flex items-center justify-between">
          {/* 日付・曜日・モード名 */}
          <div className="flex items-baseline gap-3">
            <h1 className="head text-2xl tracking-tight text-ink">
              <span className="mono">{displayDate}</span>
              <span className="ml-2 text-sub">{weekday}</span>
            </h1>
            <span className="text-sm text-faint">Meetings, talks &amp; notes</span>
          </div>

          {/* 戻る操作の案内（[要件 6.3]） */}
          <div className="flex items-center gap-3 text-sm text-faint">
            <span>
              <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-sans text-xs text-sub">
                Esc
              </kbd>{' '}
              戻る
            </span>
            <span className="text-faint">/</span>
            <span>
              <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-sans text-xs text-sub">
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
          <p className="text-sm text-sub">Loading…</p>
        ) : (
          <div className="flex-1 overflow-hidden rounded-lg border border-line bg-panel shadow-sm shadow-black/20">
            <NoteEditor
              ref={ref}
              value={body}
              onChange={onBodyChange}
              noteEntryId={noteEntryId}
              noteLineMetas={noteLineMetas}
              onConvertTodo={onConvertTodo}
              onConvertBlocker={onConvertBlocker}
              keybindingMode={keybindingMode}
              onVimModeChange={onVimModeChange}
              resolvedMode={resolvedMode}
            />
          </div>
        )}
      </main>
    </div>
  );
});

export default NoteMode;

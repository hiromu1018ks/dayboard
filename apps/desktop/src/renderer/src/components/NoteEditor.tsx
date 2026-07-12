/**
 * ノート本文エディタ（[roadmap.md T-4-03、T-5-09/10]）
 *
 * CodeMirror 6 を React にラップし、ノートモードの広いテキストエリアを提供する
 * （[要件 6.3]、[edge_cases.md §6.1]: 数万文字でも実用上軽快）。
 *
 * 設計:
 * - `value`（NoteEntry.body 全文）を CodeMirror の doc と同期する
 * - 外部からの value 変更（日付切替・サーバー再フェッチ等）は、CodeMirror の現在内容と
 *   異なる場合のみ反映する（ユーザー入力が外部取り込みで巻き戻るのを避ける、[§8.1]）
 * - 入力のたびに `onChange(body 全文)` を呼ぶ（800ms デバウンス保存へ接続）
 * - `focus()` を公開し、モード切替直後に即入力できる（[ui_interaction_spec.md §4.1]、AC-03）
 *
 * Phase 5 で追加:
 * - `getCurrentLine()`: 現在カーソル行のテキスト・行番号を取得（T-5-09）
 * - `⌘/Ctrl+Enter` でTODO化、`⌘/Ctrl+Shift+B` で障害化（T-5-09、[§6.2]）
 * - 変換済みマーク（ガター `✓T` / `✓B`）（T-5-10、[§8]）
 *
 * Phase 4 では標準エディタとして利用。`@codemirror/vim` 拡張の有効化は Phase 7（T-7-05）。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import type { BlockInfo, ViewUpdate } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { NoteLineMeta } from 'shared-types';
import { computeLineHash, normalizeLineText } from '@dayboard/domain';

export type NoteEditorProps = {
  /** NoteEntry.body 全文 */
  value: string;
  /** 入力変更時に呼ばれる。body 全文を渡す（[autosave_spec.md §3.4]） */
  onChange: (body: string) => void;
  /** NoteEntry の id（lineHash 計算に必要、Phase 5） */
  noteEntryId?: string;
  /** 変換済みメタ（ガター表示用、Phase 5） */
  noteLineMetas?: NoteLineMeta[];
  /** TODO化キー（⌘/Ctrl+Enter）押下時。行テキストが空の場合は呼ばれない */
  onConvertTodo?: (lineNumber: number, lineText: string) => void;
  /** 障害化キー（⌘/Ctrl+Shift+B）押下時。行テキストが空の場合は呼ばれない */
  onConvertBlocker?: (lineNumber: number, lineText: string) => void;
};

/**
 * 親から呼べる命令型API。
 * - `focus()`: CodeMirror へフォーカス（モード切替直後の即入力用）
 * - `hasFocus()`: CodeMirror が現在フォーカスを持っているか
 * - `getCurrentLine()`: 現在カーソル行の情報（Phase 5）
 */
export type NoteEditorHandle = {
  focus: () => void;
  hasFocus: () => boolean;
  /** 現在カーソル行の行番号（1始まり）とテキスト。エディタ未初期化時は null。 */
  getCurrentLine: () => { lineNumber: number; lineText: string } | null;
};

/**
 * CodeMirror の値を外部から取り込むか判定する。
 * ユーザー入力中に onChange → 親 state 更新 → value 変更で再描画、のループを避けるため、
 * CodeMirror の現在の doc と異なる場合のみ取り込む。
 */
function shouldApplyExternalValue(view: EditorView, next: string): boolean {
  return view.state.doc.toString() !== next;
}

// ---- 変換済みマーク（ガター、T-5-10）----

/** ガターに表示するマーカー（`✓T` / `✓B` / `✓T ✓B`） */
class ConversionMarker extends GutterMarker {
  constructor(readonly text: string) {
    super();
  }
  override toDOM() {
    const span = document.createElement('span');
    span.textContent = this.text;
    span.className = 'text-xs text-stone-400';
    return span;
  }
}

/** ガターの行→マーカーを再計算する StateEffect */
const updateConversionMarks = StateEffect.define<Record<number, string>>();

/**
 * 変換済みマークの StateField。
 * 行番号（0始まり）→ マーク文字列のマップを保持する。
 */
const conversionMarksField = StateField.define<Record<number, string>>({
  create: () => ({}),
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(updateConversionMarks)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * ガター拡張を生成する。行ごとにマーカーを表示する（[note_conversion_spec.md §8]）。
 */
function conversionGutterExtension(): Extension {
  return gutter({
    class: 'cm-conversion-gutter',
    lineMarker(view: EditorView, line: BlockInfo) {
      const marks = view.state.field(conversionMarksField);
      const lineNumber = view.state.doc.lineAt(line.from).number - 1; // 0始まり
      const text = marks[lineNumber];
      if (text) return new ConversionMarker(text);
      return null;
    },
    // noteLineMetas 変化で StateField が更新された際にガターを再描画
    lineMarkerChange: (update: ViewUpdate) =>
      update.transactions.some((tr) => tr.effects.some((e) => e.is(updateConversionMarks))),
    initialSpacer: () => new ConversionMarker('   '),
  });
}

/**
 * noteLineMetas と本文から、各行の変換済みマークを再計算する（[§8.2]）。
 *
 * 各行の normalizedLineText を計算し、lineHash が一致する NoteLineMeta の
 * convertedToTodoId / convertedToBlockerId からマーク（`✓T` / `✓B`）を決定する。
 *
 * パフォーマンス（[edge_cases.md §6.2]）: 全行計算だが、数万文字（数百行）程度なら
 * 実用上問題ない。更大規模な場合は編集行と前後のみ再計算する最適化を検討。
 */
function computeConversionMarks(
  body: string,
  noteEntryId: string,
  metas: NoteLineMeta[],
): Record<number, string> {
  const result: Record<number, string> = {};
  if (metas.length === 0) return result;

  // lineHash → { hasTodo, hasBlocker } のマップを構築
  const hashMap = new Map<string, { hasTodo: boolean; hasBlocker: boolean }>();
  for (const meta of metas) {
    const entry = hashMap.get(meta.lineHash) ?? { hasTodo: false, hasBlocker: false };
    if (meta.convertedToTodoId !== null) entry.hasTodo = true;
    if (meta.convertedToBlockerId !== null) entry.hasBlocker = true;
    hashMap.set(meta.lineHash, entry);
  }

  // 各行の lineHash を計算して照合
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeLineText(lines[i]!);
    if (normalized.length === 0) continue;
    const hash = computeLineHash(noteEntryId, normalized);
    const entry = hashMap.get(hash);
    if (entry) {
      const marks: string[] = [];
      if (entry.hasTodo) marks.push('✓T');
      if (entry.hasBlocker) marks.push('✓B');
      if (marks.length > 0) result[i] = marks.join(' ');
    }
  }
  return result;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { value, onChange, noteEntryId, noteLineMetas = [], onConvertTodo, onConvertBlocker },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 初回マウント時の value を捕捉（CodeMirror 生成の doc に用いる）
  const initialValueRef = useRef(value);
  // onChange の最新参照を保持（EditorView の updateListener が初回生成で固定されるため）
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // 外部取り込み中かどうか（onChange ループ回避）
  const applyingExternal = useRef(false);
  // 変換コールバックの最新参照
  const onConvertTodoRef = useRef(onConvertTodo);
  onConvertTodoRef.current = onConvertTodo;
  const onConvertBlockerRef = useRef(onConvertBlocker);
  onConvertBlockerRef.current = onConvertBlocker;

  // 命令型APIを公開
  useImperativeHandle(
    ref,
    (): NoteEditorHandle => ({
      focus: () => {
        viewRef.current?.focus();
      },
      hasFocus: () => viewRef.current?.hasFocus ?? false,
      getCurrentLine: () => {
        const view = viewRef.current;
        if (!view) return null;
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        return { lineNumber: line.number, lineText: line.text }; // number は1始まり
      },
    }),
    [],
  );

  // 初回マウントで CodeMirror を生成
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: '15px' },
          '.cm-scroller': {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            lineHeight: '1.7',
          },
          '.cm-content': { padding: '16px 20px', maxWidth: '100%' },
          '&.cm-focused': { outline: 'none' },
          '.cm-conversion-gutter': { width: '2.5em' },
        }),
        // 変換済みマーク（ガター + StateField）
        conversionMarksField,
        conversionGutterExtension(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applyingExternal.current) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
        // キーバインド: ⌘/Ctrl+Enter でTODO化、⌘/Ctrl+Shift+B で障害化（T-5-09、[§6.2]）
        // domEventHandlers で実装し、preventDefault で競合を防ぐ
        EditorView.domEventHandlers({
          keydown: (event) => {
            const e = event as KeyboardEvent;
            // IME 変換中はスキップ（[ui_interaction_spec.md §9.1]、T-4-06 と同じパターン）
            if (e.isComposing || e.keyCode === 229) return false;

            // ⌘/Ctrl+Enter でTODO化（Shift なし）
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleConvert('todo');
              return true;
            }
            // ⌘/Ctrl+Shift+B で障害化
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
              e.preventDefault();
              handleConvert('blocker');
              return true;
            }
            return false;
          },
        }),
      ],
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  /**
   * 現在カーソル行を取得し、変換コールバックを呼ぶ。
   * 空行（normalizeLineText 後空）の場合は通知してAPIを呼ばない（[§1 フロー]）。
   */
  function handleConvert(target: 'todo' | 'blocker') {
    const view = viewRef.current;
    if (!view) return;
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const lineNumber = line.number; // 1始まり
    const lineText = line.text;

    // 空行チェック（[note_conversion_spec.md §1] フロー step 2）
    const normalized = normalizeLineText(lineText);
    if (normalized.length === 0) {
      // 空行は変換できない。コールバック経由で親に通知（トースト表示）
      // 空行の場合は lineNumber=0, lineText="" で通知
      if (target === 'todo') {
        onConvertTodoRef.current?.(0, '');
      } else {
        onConvertBlockerRef.current?.(0, '');
      }
      return;
    }

    if (target === 'todo') {
      onConvertTodoRef.current?.(lineNumber, lineText);
    } else {
      onConvertBlockerRef.current?.(lineNumber, lineText);
    }
  }

  // 外部からの value 変更（日付切替・サーバー再フェッチ等）を CodeMirror へ反映
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!shouldApplyExternalValue(view, value)) return;

    applyingExternal.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingExternal.current = false;
  }, [value]);

  // noteLineMetas の変化でガターマークを更新（T-5-10）
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !noteEntryId) return;
    const marks = computeConversionMarks(value, noteEntryId, noteLineMetas);
    view.dispatch({ effects: updateConversionMarks.of(marks) });
  }, [noteLineMetas, noteEntryId, value]);

  return <div ref={hostRef} className="h-full w-full" data-testid="note-editor" />;
});

export default NoteEditor;

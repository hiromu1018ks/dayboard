/**
 * ノート本文エディタ（[roadmap.md T-4-03]）
 *
 * CodeMirror 6 を React にラップし、ノートモードの広いテキストエリアを提供する
 * （[要件 6.3]、[edge_cases.md §6.1]: 数万文字でも実用上軽快）。
 *
 * 設計:
 * - `value`（NoteEntry.body 全文）を CodeMirror の doc と同期する
 * - 外部からの value 変更（日付切替・サーバー再フェッチ等）は、CodeMirror の現在内容と
 *   異なる場合のみ反映する（ユーザー入力が外部取り込みで巻き戻るのを避ける、[§8.1]）
 * - 入力のたびに `onChange(body 全文)` を呼ぶ（Phase 4 T-4-04 で 800ms デバウンス保存へ接続）
 * - `focus()` を公開し、モード切替直後に即入力できる（[ui_interaction_spec.md §4.1]、AC-03）
 *
 * Phase 4 では標準エディタとして利用。`@codemirror/vim` 拡張の有効化は Phase 7（T-7-05）。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';

export type NoteEditorProps = {
  /** NoteEntry.body 全文 */
  value: string;
  /** 入力変更時に呼ばれる。body 全文を渡す（[autosave_spec.md §3.4]） */
  onChange: (body: string) => void;
};

/**
 * 親から呼べる命令型API。
 * - `focus()`: CodeMirror へフォーカス（モード切替直後の即入力用）
 * - `hasFocus()`: CodeMirror が現在フォーカスを持っているか
 */
export type NoteEditorHandle = {
  focus: () => void;
  hasFocus: () => boolean;
};

/**
 * CodeMirror の値を外部から取り込むか判定する。
 * ユーザー入力中に onChange → 親 state 更新 → value 変更で再描画、のループを避けるため、
 * CodeMirror の現在の doc と異なる場合のみ取り込む。
 */
function shouldApplyExternalValue(view: EditorView, next: string): boolean {
  return view.state.doc.toString() !== next;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { value, onChange },
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

  // 命令型APIを公開（モード切替直後のフォーカス用、[§4.1]）
  useImperativeHandle(
    ref,
    (): NoteEditorHandle => ({
      focus: () => {
        viewRef.current?.focus();
      },
      hasFocus: () => viewRef.current?.hasFocus ?? false,
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
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applyingExternal.current) {
            onChangeRef.current(u.state.doc.toString());
          }
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

  return <div ref={hostRef} className="h-full w-full" data-testid="note-editor" />;
});

export default NoteEditor;

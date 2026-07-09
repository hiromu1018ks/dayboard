/**
 * ノート本文エディタ（[roadmap.md T-4-03]）
 *
 * CodeMirror 6 を React にラップし、ノートモードの広いテキストエリアを提供する
 * （[要件 6.3]、[edge_cases.md §6.1]: 数万文字でも実用上軽快）。
 *
 * 設計:
 * - `value`（NoteEntry.body 全文）を CodeMirror の初期 doc に設定
 * - 日付切替等の外部からの value 変更は、CodeMirror の現在内容と異なる場合のみ反映
 *   （ユーザー入力が外部取り込みで巻き戻るのを避ける、[autosave_spec.md §8.1]）
 * - 入力のたびに `onChange(body 全文)` を呼ぶ（Phase 4 T-4-04 で 800ms デバウンス保存へ接続）
 *
 * Phase 4 では標準エディタとして利用。`@codemirror/vim` 拡張の有効化は Phase 7（T-7-05）。
 */

import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';

export type NoteEditorProps = {
  /** NoteEntry.body 全文 */
  value: string;
  /** 入力変更時に呼ばれる。body 全文を渡す（[autosave_spec.md §3.4]） */
  onChange: (body: string) => void;
};

/**
 * CodeMirror の値を外部から取り込むか判定する。
 * ユーザー入力中に onChange → 親 state 更新 → value 変更で再描画、のループを避けるため、
 * CodeMirror の現在の doc と異なる場合のみ取り込む。
 */
function shouldApplyExternalValue(view: EditorView, next: string): boolean {
  return view.state.doc.toString() !== next;
}

export function NoteEditor({ value, onChange }: NoteEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // onChange の最新参照を保持（EditorView の updateListener が初回生成で固定されるため）
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // 外部取り込み中かどうか（onChange ループ回避）
  const applyingExternal = useRef(false);

  // 初回マウントで CodeMirror を生成
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      doc: value,
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
    // 初回マウント時のみ。value の変化は下の別 effect で処理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部からの value 変更（日付切替等）を CodeMirror へ反映
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
}

export default NoteEditor;

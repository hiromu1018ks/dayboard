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
import { EditorView, GutterMarker, gutter, keymap } from '@codemirror/view';
import type { BlockInfo, ViewUpdate } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import type { KeybindingMode, NoteLineMeta } from 'shared-types';
import { computeLineHash, normalizeLineText } from '@dayboard/domain';
import { createVimExtension, getCodeMirrorVimMode } from '../keybindings/vim.js';

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
  /**
   * キーバインドモード（Phase 7 T-7-05）。
   * 'vim' のとき CodeMirror の Vim 拡張を有効化する。'standard' なら通常エディタ。
   */
  keybindingMode?: KeybindingMode;
  /**
   * CodeMirror の Vim 操作状態（Normal/Insert）が変化したときに呼ばれる（Phase 7 T-7-05）。
   * ノートモードでは CodeMirror 内部が状態の権威のため、これ経由で App 側の vimState へ反映する。
   * keybindingMode='vim' のときのみ有意。
   */
  onVimModeChange?: (mode: 'normal' | 'insert') => void;
  /**
   * 外観モード（墨と波テーマ）。'dark'（墨）/'light'（和紙）。
   * 未指定時は CodeMirror 既定の light 配色になる（後方互換）。
   */
  resolvedMode?: 'dark' | 'light';
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

// ---- 墨と波テーマ: CodeMirror 配色（Kanagawa Wave/Lotus 系） ----

/** モードごとの配色パレット（Kanagawa 由来） */
const CM_PALETTE = {
  dark: {
    bg: '#1F1F28', // sumiInk1（カード背景に合わせる）
    bgAlt: '#16161D', // sumiInk0（ガター等の一段暗い面）
    text: '#DCD7BA', // fujiWhite
    gutter: '#7E9CD1', // roninBlue（行番号）
    activeLine: '#2A2A37', // sumiInk2
    selection: 'rgba(127, 180, 202, 0.25)', // springBlue 薄
    cursor: '#7FB4CA', // springBlue
    border: '#363646', // sumiInk3
    heading: '#7FB4CA', // springBlue
    emphasis: '#E6C384', // carpYellow
    link: '#98BB6C', // springGreen
    quote: '#938AA9', // oniViolet（控えめ）
  },
  light: {
    bg: '#FCF9F2', // 和紙
    bgAlt: '#F5F1E8', // 生成り
    text: '#2A2620', // 墨
    gutter: '#A09074', // 薄墨
    activeLine: '#ECE6D7', // 軽い浮き
    selection: 'rgba(127, 156, 209, 0.20)', // roninBlue 薄
    cursor: '#7E9CD1', // roninBlue
    border: '#D8CDB2', // 罫線
    heading: '#7E9CD1', // roninBlue
    emphasis: '#8A6D3B', // 山吹
    link: '#5A7D3A', // 苔緑
    quote: '#8C7B6B', // 薄墨
  },
} as const;

/**
 * CodeMirror の UI（背景・ガター・選択・カーソル）テーマを生成する。
 * レイアウト（フォント/サイズ/padding）は共通、配色だけ mode で切り替える。
 */
function createEditorTheme(mode: 'dark' | 'light'): Extension {
  const p = CM_PALETTE[mode];
  return EditorView.theme({
    '&': { height: '100%', fontSize: '15px', backgroundColor: p.bg, color: p.text },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      lineHeight: '1.7',
    },
    '.cm-content': { padding: '16px 20px', maxWidth: '100%', caretColor: p.cursor },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': {
      backgroundColor: p.bg,
      color: p.gutter,
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: p.activeLine },
    '.cm-activeLineGutter': { backgroundColor: p.activeLine, color: p.text },
    '.cm-selectionBackground, ::selection': { backgroundColor: p.selection },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.cursor },
    '.cm-conversion-gutter': { width: '2.5em' },
  });
}

/**
 * Markdown のシンタックスハイライト（見出し/強調/リンク等）の配色。
 * basicSetup が内包する defaultHighlightStyle を上書きする。
 */
function createHighlightStyle(mode: 'dark' | 'light'): Extension {
  const p = CM_PALETTE[mode];
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.heading1, color: p.heading, fontWeight: '700' },
      { tag: tags.heading2, color: p.heading, fontWeight: '700' },
      { tag: tags.heading3, color: p.heading, fontWeight: '600' },
      { tag: tags.strong, color: p.emphasis, fontWeight: '700' },
      { tag: tags.emphasis, color: p.emphasis, fontStyle: 'italic' },
      { tag: tags.link, color: p.link, textDecoration: 'underline' },
      { tag: tags.quote, color: p.quote, fontStyle: 'italic' },
      { tag: tags.url, color: p.link },
      { tag: tags.processingInstruction, color: p.quote },
    ]),
  );
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
    span.className = 'text-xs text-accent';
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
  {
    value,
    onChange,
    noteEntryId,
    noteLineMetas = [],
    onConvertTodo,
    onConvertBlocker,
    keybindingMode = 'standard',
    onVimModeChange,
    resolvedMode,
  },
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
  // onVimModeChange の最新参照（updateListener が初回生成で固定されるため）
  const onVimModeChangeRef = useRef(onVimModeChange);
  onVimModeChangeRef.current = onVimModeChange;
  // 直近の Vim mode（変化検知用。updateListener は初回生成で固定されるため ref で持つ）
  const lastVimModeRef = useRef<'normal' | 'insert' | null>(null);

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

  // Phase 7 T-7-05: Vim 拡張を Compartment で動的切替するための仕掛け。
  // keybindingMode が変わっても CodeMirror を再生成せず、reconfigure で差し替える。
  // これによりカーソル位置・スクロール位置・ガターマークが保持される。
  const vimCompartmentRef = useRef(new Compartment());
  // 外観テーマ（墨/和紙）も Compartment で動的切替。同じく再生成せず reconfigure で差し替える。
  const themeCompartmentRef = useRef(new Compartment());

  // 初回マウントで CodeMirror を生成（一度きり。keybindingMode/resolvedMode 変更時は reconfigure）
  useEffect(() => {
    if (!hostRef.current) return;

    const initialMode = resolvedMode ?? 'light';
    const view = new EditorView({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        // 外観テーマ（墨と波）: UI 配色＋シンタックスハイライト。
        // 後ろに置くことで basicSetup の defaultHighlightStyle を上書きする。
        themeCompartmentRef.current.of([
          createEditorTheme(initialMode),
          createHighlightStyle(initialMode),
        ]),
        // 変換済みマーク（ガター + StateField）
        conversionMarksField,
        conversionGutterExtension(),
        // Vim 拡張（Compartment で動的切替、T-7-05）
        vimCompartmentRef.current.of(keybindingMode === 'vim' ? createVimExtension() : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applyingExternal.current) {
            onChangeRef.current(u.state.doc.toString());
          }
          // Phase 7 T-7-05: CodeMirror の Vim mode 変化を検知して App へ通知
          if (keybindingMode === 'vim') {
            const mode = getCodeMirrorVimMode(view);
            if (mode && mode !== lastVimModeRef.current) {
              lastVimModeRef.current = mode;
              onVimModeChangeRef.current?.(mode);
            }
          }
        }),
        // キーバインド: ⌘/Ctrl+Enter でTODO化、⌘/Ctrl+Shift+B で障害化（T-5-09、[§6.2]）
        // 併せて Post-MVP ショートカットの握り潰し（T-7-10、AC-22）
        //
        // CodeMirror の defaultKeymap が Mod-Enter（⌘/Ctrl+Enter）を
        // 「insertBlankLine 等の行操作」へ割り当てており、domEventHandlers の
        // keydown よりも先に消費されてしまう。そのため Prec.highest で最優先の
        // keymap として登録し、defaultKeymap より前に処理させる。
        // IME 変換中（isComposing / keyCode 229）は keymap に到達する前の
        // ブラウザ層でガード済み（guardIme）のため、ここでは改行挿入等の通常動作になる。
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => {
                handleConvert('todo');
                return true;
              },
            },
            {
              key: 'Mod-Shift-b',
              preventDefault: true,
              run: () => {
                handleConvert('blocker');
                return true;
              },
            },
            // Post-MVP ショートカットの握り潰し（T-7-10、AC-22）
            // preventDefault で何も起きないようにする（入力内容は破壊しない）
            {
              key: 'Mod-k',
              preventDefault: true,
              run: () => true,
            },
            {
              key: 'Mod-Shift-r',
              preventDefault: true,
              run: () => true,
            },
            // 時刻つきメモ追加（`⌘/Ctrl+Shift+M`）: 現在時刻の `### HH:mm` 見出しを挿入。
            // Post-MVP から実装済み機能へ昇格。挿入後は updateListener 経由で onChange が発火し、
            // 自動保存へ接続される。
            {
              key: 'Mod-Shift-m',
              preventDefault: true,
              run: (view) => {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                view.dispatch(view.state.replaceSelection(`\n### ${hh}:${mm}\n`));
                view.focus();
                return true;
              },
            },
          ]),
        ),
      ],
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 初回マウントのみ（keybindingMode は別 effect で reconfigure）。
    // keybindingMode を依存配列に含めないのは意図的: 再生成せず Compartment で切替えるため。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 7 T-7-05: keybindingMode 変更時に Vim 拡張を動的 reconfigure。
  // CodeMirror を再生成しないため、カーソル位置・スクロール・ガターマークが保持される。
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartmentRef.current.reconfigure(
        keybindingMode === 'vim' ? createVimExtension() : [],
      ),
    });
    // reconfigure 後、Vim mode の通知をリセット
    if (keybindingMode === 'vim') {
      const mode = getCodeMirrorVimMode(view);
      lastVimModeRef.current = mode;
      if (mode) onVimModeChangeRef.current?.(mode);
    } else {
      lastVimModeRef.current = null;
    }
  }, [keybindingMode]);

  // 外観テーマ（墨/和紙）変化時に CodeMirror の配色を動的 reconfigure。
  // Vim と同じく Compartment で差し替え、カーソル位置・スクロール・ガターマークを保持する。
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !resolvedMode) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure([
        createEditorTheme(resolvedMode),
        createHighlightStyle(resolvedMode),
      ]),
    });
  }, [resolvedMode]);

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

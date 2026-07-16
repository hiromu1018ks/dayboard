/**
 * キーバインドガイド起動キー判定（[roadmap.md T-7-G-01]、[要件 8.1]、[ui_interaction_spec.md §10.5]、AC-23）
 *
 * `?` キー（修飾キーなし）でキーバインドガイドをトグルする。標準/Vim 両方のキーバインドモードで有効。
 *
 * 入力要素フォーカス中の貫通:
 * テキスト入力欄（input/textarea/contenteditable = CodeMirror の `.cm-content`）にフォーカス中は
 * `?` を文字入力として扱いガイドを開かない。この貫通判定は `isHelpShortcut` ではなく呼び出し元
 * （App.tsx のグローバルキーハンドラ）で `isTextInputElement(document.activeElement)` により行う。
 * これは Vim の Normal 操作（[§3.4]）や既存ショートカットのスルー設計と同じ方針。
 */

/**
 * キーバインドガイド起動（`?`、修飾キーなし）のキー一致判定（AC-23）。
 *
 * `?` 入力自体は多くのキーボード配列で `Shift + /` で発生するが、ここでは `e.key === '?'`
 * （レイアウト非依存の文字比較）で判定する。Cmd/Ctrl/Alt 修飾キーが伴う場合は除外する
 * （ブラウザやOSのショートカットと衝突しないよう、素の `?` のみを対象とする）。
 */
export function isHelpShortcut(e: KeyboardEvent): boolean {
  return e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * IME 変換中のガード（[roadmap.md T-4-06]、[ui_interaction_spec.md §9.1]）
 *
 * 日本語IMEで変換中のキー操作がショートカット判定へ誤進入するのを防ぐ。
 * すべてのキーハンドラの先頭で `isComposing(e)` をチェックし、true の場合は
 * ショートカット判定をスキップして入力欄へ文字を流す（AC-19 の基盤）。
 *
 * 判定条件（仕様どおり2条件のOR）:
 * - `KeyboardEvent.isComposing === true`（現代ブラウザ）
 * - `keyCode === 229`（変換未確定文字列の入力を示す従来フラグ、IE/古いブラウザ互換）
 *
 * Phase 7 で Vim 拡張有効化時にも本ガードを使用する。
 */

/**
 * 渡された KeyboardEvent が IME 変換中のものか判定する。
 *
 * @returns true の場合、ショートカット判定をスキップすべき
 */
export function isComposing(e: KeyboardEvent): boolean {
  return e.isComposing === true || e.keyCode === 229;
}

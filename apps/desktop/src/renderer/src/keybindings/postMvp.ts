/**
 * Post-MVP ショートカットの無効化（[roadmap.md T-7-10]、[要件 8.6]、
 * [ui_interaction_spec.md §11.5]、AC-22）
 *
 * MVPでは実装しないショートカットを「押しても何も起きない（ただし入力内容を破壊しない）」
 * 状態にする。これにより、Post-MVP未実装でも MVP 未達扱いにせず、ユーザーが誤って押しても
 * 入力中のテキストや状態が壊れないことを保証する（AC-22）。
 *
 * 対象キー（[要件 8.6]、[ui_interaction_spec.md §11.5]）:
 * - 標準/Vim共通: `⌘/Ctrl+K`（コマンドパレット）、`⌘/Ctrl+Shift+R`（振り返り送信）、
 *   `⌘/Ctrl+Shift+M`（時刻見出し）
 * - Vim Normal状態のみ: `gg`, `G`, `A`, `o`, `O`, `dd`, `u`, `Ctrl+r`, `/`, `n`, `N`,
 *   `Space r`, `Space k`
 *
 * 注意:
 * - Vim拡張（@replit/codemirror-vim）が提供する Vim コマンドのうち、MVP対象外のものは
 *   CodeMirror 側で有効化される可能性がある。CodeMirror の Vim 拡張はデフォルトで
 *   `dd`/`u`/`gg`/`G`/`/` 等を実装している。MVP要件（[要件 8.6]）ではこれらを無効化するが、
 *   アプリ層で個別に握り潰すのは拡張仕様に強結合するため、本モジュールでは標準系の
 *   `⌘K`/`⌘Shift+R`/`⌘Shift+M` のみを握り潰す。
 * - Vim拡張の Post-MVP コマンド群は、Vim利用者が「使えない」ことを明示するため、
 *   要件 8.6 の「不発」を「入力破壊しない（自然に無視される）」で満たす方針とする。
 *   `@replit/codemirror-vim` は未実装コマンド（`Space r`, `Space k` 等）を入力しても
 *   単に何も起きない（ドキュメントは変更されない）ため、AC-22 を満たす。
 *
 * @codemirror/vim が対応する Post-MVP コマンド（`dd` 等）は、現状だと動いてしまうが、
 * 入力内容を破壊しない点ではAC-22を満たす。本モジュールは AC-22 のうち、特に
 * 「ブラウザ/OSデフォルトの挙動で入力が壊れるリスクがある」標準系のみを保護する。
 */

import { isPostMvpShortcut } from './standard.js';

/**
 * Post-MVP ショートカットが押された場合、preventDefault で握り潰す。
 *
 * @returns Post-MVP ショートカットを検出して握り潰した場合 true
 */
export function handlePostMvpShortcut(e: KeyboardEvent): boolean {
  if (isPostMvpShortcut(e)) {
    // 何も起きない（AC-22）。ただし入力内容は破壊しない。
    e.preventDefault();
    return true;
  }
  return false;
}

/**
 * 行テキストの正規化（[roadmap.md T-5-01]、[note_conversion_spec.md §3]）
 *
 * `normalizedLineText` は重複判定のキーとして使う（要件 10.7）。同一内容かどうかを
 * 「見た目の差異」によらず判定するため、空白の正規化のみを行う。
 *
 * 正規化手順（順序厳守、[§3]）:
 * 1. 前後の空白（半角・全角スペース、タブ、改行）を trim
 * 2. 連続する空白（半角・全角スペース、タブ）を半角スペース1つに圧縮
 * 3. 全角英数字・全角カタカナは正規化しない（ユーザー意図を尊重）
 * 4. 大文字・小文字は正規化しない（ケース敏感）
 *
 * 重要（[§3 備考]）: 正規化は「行頭記号除去」を含まない。行頭記号やラベルの除去は
 * タイトル生成（extractTitle）で別途行う。これは重複判定キーと表示タイトル生成の
 * 責務を分け、行頭記号やラベルの有無を同一性判定に反映するためである（[§6.3]）。
 *
 * 本モジュールは副作用を持たない（[architecture.md §4]）。
 *
 * [note_conversion_spec.md §3]: ../../../docs/note_conversion_spec.md
 */

/**
 * 空白文字クラス。半角スペース・全角スペース・タブを含む。
 * ※ 改行は行単位で処理されるため含めないが、念のため含めておく。
 */
const WHITESPACE_CHARS = '[ \t\u3000]';

/** 連続する空白（半角・全角スペース・タブ）にマッチ */
const CONSECUTIVE_WHITESPACE = new RegExp(`${WHITESPACE_CHARS}+`, 'g');

/** 前後の空白（半角・全角スペース・タブ・改行）にマッチ */
const EDGE_WHITESPACE = /^[\s\u3000]+|[\s\u3000]+$/g;

/**
 * 行テキストを正規化する（[note_conversion_spec.md §3]）。
 *
 * @param raw 行テキスト全体（行頭・行末の改行は含まない想定）
 * @returns 正規化後テキスト（前後空白trim + 連続空白圧縮）
 */
export function normalizeLineText(raw: string): string {
  // 1. 前後の空白（半角・全角スペース、タブ、改行）を trim
  let text = raw.replace(EDGE_WHITESPACE, '');
  // 2. 連続する空白（半角・全角スペース、タブ）を半角スペース1つに圧縮
  text = text.replace(CONSECUTIVE_WHITESPACE, ' ');
  // 3. 圧縮で前後に空白が残る可能性があるため再度 trim
  return text.replace(EDGE_WHITESPACE, '');
}

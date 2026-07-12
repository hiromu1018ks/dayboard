/**
 * TODO/障害タイトル生成（[roadmap.md T-5-02]、[note_conversion_spec.md §4]）
 *
 * 行頭のリスト記号・番号リスト・特定ラベルを除去し、TODO/障害のタイトルを生成する。
 *
 * 除去対象（順序厳守、[§4.1]）:
 * 1. 前後の空白を trim
 * 2. 行頭のリスト記号（`-` / `•` / `・` / `*`）+ 空白（0文字以上）を除去
 * 3. 行頭の番号リスト（`\d+[.)]`）+ 空白（0文字以上）を除去
 * 4. 行頭のTODO/障害ラベル（大文字小文字無視・全角半角無視）+ コロン（`:` / `：`）+ 空白（0文字以上）を除去
 *    ラベル: "TODO", "TODO化", "やること", "障害", "障害化", "詰まり", "Blocker", "メモ"
 * 5. 連続空白を圧縮（§3 と同じ）
 * 6. 前後の空白を再度 trim
 *
 * 空になった場合（[§4.4]）: 空文字を返す。呼出元で VALIDATION_ERROR 扱い。
 * 200文字超（[§4.5]）: 先頭199文字 + `…`（計200文字）に切り詰め。呼出元で通知。
 *
 * 除去「しない」もの（[§4.3]）:
 * - 汎用見出しラベル（`宿題：`, `決定事項：` 等）
 * - 絵文字・装飾記号（`※`, `★`, `✔` 等）
 * - Markdown装飾（`**太字**`, `[リンク](url)` 等）
 *
 * 本モジュールは副作用を持たない（[architecture.md §4]）。
 *
 * [note_conversion_spec.md §4]: ../../../docs/note_conversion_spec.md
 */

import { normalizeLineText } from './normalize.js';

/** タイトルの最大長（[api_contract.md §5]、[§4.5]） */
export const TITLE_MAX_LENGTH = 200;

/** 省略記号を含めた最大長（先頭199文字 + `…` = 200文字） */
const TITLE_TRUNCATED_LENGTH = TITLE_MAX_LENGTH - 1; // 199

/**
 * 行頭のリスト記号（`-` / `•` / `・` / `*`）とそれに続く空白にマッチ。
 * 記号直後の空白は0文字以上（[§5.3 edge_cases]）。
 */
const LEADING_LIST_MARKER = /^[-•・*][ \t\u3000]*/;

/**
 * 行頭の番号リスト（`1.` / `2)` 等）とそれに続く空白にマッチ。
 * 番号直後の空白は0文字以上。
 */
const LEADING_NUMBERED_LIST = /^\d+[.)][ \t\u3000]*/;

/**
 * ラベルの正規化用マップ。
 * マッチ時の大文字小文字・全角半角を吸収するため、比較時に入力を正規化する。
 * ラベルの末尾はコロン（`:` または `：`）+ 空白（0文字以上）。
 *
 * [§4.1 ステップ4]: "TODO", "TODO化", "やること", "障害", "障害化", "詰まり", "Blocker", "メモ"
 */
const LABELS = [
  'TODO化',
  'TODO',
  'やること',
  '障害化',
  '障害',
  '詰まり',
  'Blocker',
  'メモ',
] as const;

/**
 * 全角英数字・記号を半角へ正規化（ラベルマッチ用）。
 * ラベルの大文字小文字・全角半角を無視するため（[§4.1]）。
 */
function normalizeForLabelMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/** ラベル正規化済みのセット（マッチ高速化用） */
const NORMALIZED_LABELS = new Set(LABELS.map(normalizeForLabelMatch));

/**
 * 行頭からラベル + コロン（`:` / `：`）+ 空白（0文字以上）を除去する。
 * ラベルは大文字小文字・全角半角を無視してマッチ（[§4.1]）。
 *
 * @returns ラベル除去後のテキスト。ラベルがない場合は入力をそのまま返す。
 */
function stripLeadingLabel(text: string): string {
  // コロン（半角・全角）が先頭近くにあるか確認してからラベルマッチを試す。
  // キャプチャグループ1 = コロンの前のテキスト、グループ2 = コロン。
  // パフォーマンス: コロンがない行は早期リターン
  const colonMatch = text.match(/^([^:：]{0,20})([:：])/);
  if (!colonMatch) return text;

  const beforeColon = colonMatch[1] ?? '';
  const normalizedBeforeColon = normalizeForLabelMatch(beforeColon);

  if (NORMALIZED_LABELS.has(normalizedBeforeColon)) {
    // コロン直後の空白（0文字以上）を除去。
    // colonMatch[0] は「ラベル + コロン」全体なので、その直後から切り取る。
    return text.slice(colonMatch[0]!.length).replace(/^[ \t\u3000]*/, '');
  }
  return text;
}

/**
 * 行テキストからTODO/障害タイトルを生成する（[note_conversion_spec.md §4]）。
 *
 * @param raw 行テキスト全体
 * @returns 生成されたタイトル。ラベル/記号のみで空になった場合は空文字（`""`）。
 *          呼出元で空文字の場合は VALIDATION_ERROR 扱いとする（[§4.4]）。
 *          200文字超の場合は先頭199文字 + `…` に切り詰める（[§4.5]）。
 */
export function extractTitle(raw: string): string {
  // 1. 前後の空白を trim
  let text = raw.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');

  // 2. 行頭のリスト記号を除去
  text = text.replace(LEADING_LIST_MARKER, '');

  // 3. 行頭の番号リストを除去
  text = text.replace(LEADING_NUMBERED_LIST, '');

  // 4. 行頭のTODO/障害ラベル + コロンを除去
  text = stripLeadingLabel(text);

  // 5. 連続空白を圧縮 + 6. 前後空白を再度 trim（normalizeLineText と同等）
  text = normalizeLineText(text);

  // 200文字超は先頭199文字 + `…`（[§4.5]）
  if (text.length > TITLE_MAX_LENGTH) {
    text = text.slice(0, TITLE_TRUNCATED_LENGTH) + '…';
  }

  return text;
}

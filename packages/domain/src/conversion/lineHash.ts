/**
 * lineHash 生成（[roadmap.md T-5-03]、[note_conversion_spec.md §5]）
 *
 * [database_schema.md §3.7] / 要件 10.7 に従い、`lineHash` は
 * `noteEntryId + normalizedLineText` を元に生成する。
 *
 * アルゴリズム（[§5.1]）:
 *   lineHash = sha256( noteEntryId + "\n" + normalizedLineText ).slice(0, 16) （hex 16文字）
 *
 * - SHA-256を使用（Node `crypto`、ブラウザ `crypto.subtle` で利用可能）
 * - 16文字（64bit）で十分な一意性（同一 noteEntryId 内の衝突確率は無視できる）
 * - `noteEntryId` を含めることで、異なるノートエントリ間の同じ行テキストを別物として扱う
 *
 * 本モジュールは副作用を持たない（[architecture.md §4]）。
 *
 * [note_conversion_spec.md §5]: ../../../docs/note_conversion_spec.md
 */

import { createHash } from 'node:crypto';

/**
 * lineHash を生成する（[note_conversion_spec.md §5.1]）。
 *
 * @param noteEntryId       NoteEntry の ID
 * @param normalizedLineText 正規化済み行テキスト（normalizeLineText の出力）
 * @returns hex 16文字のハッシュ
 */
export function computeLineHash(noteEntryId: string, normalizedLineText: string): string {
  const input = `${noteEntryId}\n${normalizedLineText}`;
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

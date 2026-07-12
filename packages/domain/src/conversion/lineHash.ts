/**
 * lineHash 生成（[roadmap.md T-5-03]、[note_conversion_spec.md §5]）
 *
 * [database_schema.md §3.7] / 要件 10.7 に従り、`lineHash` は
 * `noteEntryId + normalizedLineText` を元に生成する。
 *
 * アルゴリズム:
 *   lineHash = fnv1a_64( noteEntryId + "\n" + normalizedLineText ).toString(16) （hex 16文字）
 *
 * 実装上の注意（Phase 7 修正）:
 * 本関数は Node（API サーバー）とブラウザ（Electron renderer、`nodeIntegration:false`）
 * の両方から呼ばれる。当初は `node:crypto` の SHA-256 を使っていたが、ブラウザ環境では
 * `node:crypto` にアクセスできず renderer ビルドが失敗する（Vite が external 化しないため）。
 * そのため、外部依存のない純粋 TypeScript の FNV-1a（64bit）実装へ切り替えた。
 *
 * FNV-1a は SHA-256 ほどの暗号強度はないが、lineHash の用途（同一 noteEntryId 内の
 * 行重複判定用キー）では実用上十分な一意性を持つ（64bit、衝突確率は無視できる）。
 * ドメイン層で1関数を共有しているため、サーバー・クライアント間のハッシュ値の整合性は保たれる。
 *
 * 仕様上の hash 文字数は16文字（hex）。FNV-1a 64bit の hex 表現は16文字のため、
 * slice せずにそのまま返す。
 *
 * 本モジュールは副作用を持たない（[architecture.md §4]）。
 *
 * [note_conversion_spec.md §5]: ../../../docs/note_conversion_spec.md
 */

/**
 * FNV-1a（64bit）ハッシュ。純粋 TypeScript で実装（[Phase 7 修正]）。
 *
 * Node・ブラウザ双方で同一の結果を返す。BigInt を使って 64bit 演算を行う。
 *
 * @param input ハッシュ対象文字列（UTF-16 → UTF-8 バイト列として扱う）
 * @returns 64bit 値の16進数文字列（16文字）
 */
function fnv1a64(input: string): string {
  // FNV-1a 64bit 定数
  const FNV_OFFSET_BASIS = 1099511628211n;
  const FNV_PRIME = 16777619n;
  const MASK64 = (1n << 64n) - 1n;

  let hash = FNV_OFFSET_BASIS;
  // UTF-8 バイト列へ変換（TextEncoder は Node・ブラウザ両方で利用可能）
  const bytes = new TextEncoder().encode(input);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]!);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  // 16進数16文字へ整形（0埋め）
  return hash.toString(16).padStart(16, '0');
}

/**
 * lineHash を生成する（[note_conversion_spec.md §5.1]）。
 *
 * @param noteEntryId       NoteEntry の ID
 * @param normalizedLineText 正規化済み行テキスト（normalizeLineText の出力）
 * @returns hex 16文字のハッシュ
 */
export function computeLineHash(noteEntryId: string, normalizedLineText: string): string {
  const input = `${noteEntryId}\n${normalizedLineText}`;
  return fnv1a64(input);
}

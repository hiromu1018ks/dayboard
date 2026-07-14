/**
 * 検索ヘルパー（ピュア関数）
 *
 * 全文検索のクエリエスケープ・スニペット装飾・ハイライト分割を担う。
 * API 層（ILIKE パラメータ生成・スニペット装飾）と Renderer 層（ハイライト描画）の
 * 両方から参照されるため、ピュア TS としてドメイン層に置く（[architecture.md §4]）。
 */

/**
 * ILIKE パターンの特殊文字（`%` / `_` / `\`）をリテラルとしてエスケープする。
 *
 * PostgreSQL の ILIKE は `%`（任意文字列）/ `_`（任意1文字）/ `\`（エスケープ文字）を
 * 特別扱いする。ユーザー入力をそのまま ILIKE パターンに埋め込むと、これらの文字が
 * 意図せずワイルドカードとして解釈されるため、`\` でエスケープする。
 *
 * エスケープ後の文字列は `'%' || escapeForIlike(q) || '%'` のように前後を `%` で囲んで
 * 部分一致パターンとして用いる。エスケープ文字として `\` を使うため、API 側で
 * ILIKE に `ESCAPE '\'` を指定する必要がある（PostgreSQL 既定のエスケープ文字も `\`）。
 *
 * @param q ユーザー入力の検索クエリ
 * @returns ILIKE パターンに安全に埋め込めるエスケープ済み文字列
 */
export function escapeForIlike(q: string): string {
  return q.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * スニペットの前後に省略記号（`…`）を付与する。
 *
 * SQL の SUBSTRING で前後30文字を切り出したスニペットは、元のテキストの先頭/末尾で
 * ない場合に文脈が途切れている。途切れている側に `…` を付与して、省略されていることを
 * 表示に伝える。先頭も末尾も途切れていない（全文が表示されている）場合は何も付与しない。
 *
 * 判定は「スニペット内にクエリが含まれている位置」から前後の余白を見るのではなく、
 * 呼出元（API）が SUBSTRING の開始位置を知っているべきだが、純粋関数として独立させるため、
 * スニペット先頭がクエリの先頭位置より前に始まっていない（= start <= 1 の）情報を
 * パラメータで受け取る設計とする。
 *
 * @param snippet      SQL から取得したスニペット文字列
 * @param truncatedStart スニペットが元テキストの先頭から始まっていない場合 true
 * @param truncatedEnd   スニペットが元テキストの末尾で終わっていない場合 true
 * @returns 前後に `…` が付与されたスニペット
 */
export function decorateSnippet(
  snippet: string,
  truncatedStart: boolean,
  truncatedEnd: boolean,
): string {
  const prefix = truncatedStart ? '…' : '';
  const suffix = truncatedEnd ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
}

/**
 * スニペット内のクエリ一致箇所を分割し、ハイライト描画のためのセグメント配列を返す。
 *
 * React 側で `<span className="bg-accent/30">` 等でヒット箇所を強調表示するために用いる。
 * 大小区別しない（ILIKE と整合）。クエリが空の場合はスニペット全体を単一セグメントとして返す。
 *
 * @param snippet ハイライト対象のスニペット文字列
 * @param query   検索クエリ（大小区別なし）
 * @returns `{ text, isHit }` の配列。`isHit: true` のセグメントがハイライト対象
 */
export type SnippetSegment = { text: string; isHit: boolean };

export function highlightSnippet(snippet: string, query: string): SnippetSegment[] {
  if (!query) return [{ text: snippet, isHit: false }];
  const lowerSnippet = snippet.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: SnippetSegment[] = [];
  let cursor = 0;
  while (cursor < snippet.length) {
    const idx = lowerSnippet.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      segments.push({ text: snippet.slice(cursor), isHit: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: snippet.slice(cursor, idx), isHit: false });
    }
    segments.push({ text: snippet.slice(idx, idx + query.length), isHit: true });
    cursor = idx + query.length;
  }
  return segments;
}

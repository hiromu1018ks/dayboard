/**
 * ID 生成ユーティリティ
 *
 * [database_schema.md §1]: ID は text（UUID v4 または ULID）。
 * Node 標準の `crypto.randomUUID()` を用いる。
 *
 * テストで固定値を注入できるよう、ファクトリ関数の差し替えポイントを用意する
 * （[test_strategy.md §7]: ランダムIDは生成関数をモック可能に）。
 */

/**
 * 新しい UUID v4 文字列を生成する。
 */
export function createId(): string {
  return crypto.randomUUID();
}

/**
 * テスト用: 生成された ID を固定値で上書きできるファクトリ。
 *
 * 使用例:
 *   const ids = ['dn_1', 'rf_1', 'ne_1', ...];
 *   const factory = createSequentialIdFactory(ids);
 *   // factory() を呼ぶ度に ids を順に返す
 */
export function createSequentialIdFactory(ids: string[]): () => string {
  let i = 0;
  return () => {
    if (i >= ids.length) {
      throw new Error(`createSequentialIdFactory: ID list exhausted (used ${i} of ${ids.length})`);
    }
    return ids[i++];
  };
}

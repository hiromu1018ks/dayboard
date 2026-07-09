/**
 * リトライポリシー（指数バックオフ）（[roadmap.md T-2-03]）
 *
 * [autosave_spec.md §7.1] のリトライ方針を純粋関数で表現する。
 *
 * - 最大リトライ回数: 3回
 * - リトライ間隔: 指数バックオフ 1s → 2s → 4s
 * - リトライ対象: ネットワークエラー、500、503、504（一時的）
 * - リトライしない: 4xx（バリデーション等。冪等でないため）
 *
 * 副作用（setTimeout による待機）は Renderer 層が担う。
 *
 * [autosave_spec.md §7]: ../../../docs/autosave_spec.md
 */

/**
 * 最大リトライ回数（[autosave_spec.md §7.1]）。
 * 初回を含めると合計4回の保存試行（初回 + リトライ3回）。
 */
export const MAX_RETRIES = 3;

/**
 * リトライ間隔（ミリ秒）。添字 = 試行回数（1回目のリトライ前に1s待つ）。
 * 指数バックオフ: 1s → 2s → 4s（[autosave_spec.md §7.1]）。
 */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/**
 * リトライすべき一時的エラーの HTTP ステータス（[autosave_spec.md §7.1]）。
 * ネットワークエラー（status なし）もリトライ対象。
 */
export const RETRIABLE_STATUS: readonly number[] = [500, 503, 504];

/**
 * 保存APIの失敗を表すエラー分類（純粋データ）。
 *
 * `status` が undefined の場合はネットワークエラー（接続失敗・タイムアウト）を表す。
 * Renderer 側の `ApiClientError` 等から変換して渡す。
 */
export type SaveErrorKind = {
  /** HTTP ステータス。未定義はネットワークエラー。 */
  status: number | undefined;
  /** エラーコード（ApiClientError.code）。4xx の詳細判別用。 */
  code: string | undefined;
};

/**
 * 当該エラーがリトライ対象かを判定する（純粋、[autosave_spec.md §7.1]）。
 *
 * - ネットワークエラー（status 未定義）→ リトライ対象
 * - 500/503/504 → リトライ対象
 * - 4xx（400/404/409 等）→ リトライしない（冪等でないため）
 * - その他の5xx（501/502 等）→ 安全側に倒してリトライ対象とする
 *
 * @param error 保存失敗の分類
 */
export function isRetriable(error: SaveErrorKind): boolean {
  if (error.status === undefined) return true; // ネットワークエラー
  if (error.status >= 500) return true; // サーバーエラー系
  return false; // 4xx はリトライしない
}

/**
 * リトライを継続すべきかを判定する（純粋、[autosave_spec.md §7.1]）。
 *
 * リトライ対象エラーで、かつ試行回数が上限に達していない場合に true。
 *
 * @param error   直近の保存失敗
 * @param attempt 既に実施したリトライ回数（0 = 初回失敗直後、リトライ未実施）
 * @returns 更にリトライすべき場合 true
 */
export function shouldRetry(error: SaveErrorKind, attempt: number): boolean {
  return isRetriable(error) && attempt < MAX_RETRIES;
}

/**
 * 次回リトライまでの待機時間を返す（純粋、[autosave_spec.md §7.1]）。
 *
 * attempt 回目のリトライを終えて失敗した後、attempt+1 回目のリトライまで待つ時間。
 * 1回目: 1s、2回目: 2s、3回目: 4s。
 *
 * @param attempt 直前に失敗したリトライ回数（0 = 初回保存失敗、リトライ0回）
 * @returns 待機ミリ秒。配列範囲外の場合は最後の値（4s）を返す。
 */
export function nextDelayMs(attempt: number): number {
  const idx = Math.min(attempt, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
}

/**
 * リトライ上限に到達したかを判定する（純粋）。
 *
 * @param attempt 実施したリトライ回数
 */
export function isRetryExhausted(attempt: number): boolean {
  return attempt >= MAX_RETRIES;
}

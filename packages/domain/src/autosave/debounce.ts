/**
 * デバウンス管理ロジック（[roadmap.md T-2-02]）
 *
 * [autosave_spec.md §3] に従い、編集対象ごと（per-field）に独立した
 * デバウンスタイマーを管理するための純粋関数・定数。
 *
 * 重要: 本モジュールはタイマー副作用（setTimeout/clearTimeout）を持たない。
 * 実際のタイマー操作は Renderer 層（useAutosave）が行い、本モジュールは
 * 「いつ発火すべきか」「遅延はいくつか」といった決定論的計算のみを担う
 * （[architecture.md §4] ドメイン層はピュアTS）。
 *
 * [autosave_spec.md §3]: ../../../docs/autosave_spec.md
 */

/**
 * デバウンス遅延（[autosave_spec.md §3.1]）。
 * 最後の入力または編集から 800ms 間新たな入力がなければ保存発火。
 *
 * 根拠（§3.2）: 一般的な自動保存（Notion、Google Docs等）の実績値。
 * 入力リズムに割り込まず、入力停止を検出できる。
 */
export const DEBOUNCE_MS = 800;

/**
 * タイマーが現在実行中かを判定する（純粋）。
 *
 * タイマーハンドルは環境依存（Node の Timeout / ブラウザの number）のため、
 * ハンドルの型は呼び出し元が決定する。本関数は「ハンドルが nullish でなければ
 * 実行中」という純粋な判定のみを提供する。
 *
 * @param handle タイマーハンドル（null/undefined は未設定を表す）
 */
export function isTimerActive<T>(handle: T | null | undefined): handle is T {
  return handle !== null && handle !== undefined;
}

/**
 * 編集対象の等価性判定（純粋）。
 *
 * 同一対象への再入力でタイマーをリセットする（§3.3「同じ対象に再入力があったら
 * タイマーをリセット」）。対象キー（文字列）の単純比較で十分だが、
 * 対象オブジェクトからキーを生成する責務は `pendingSnapshot.ts` が持つため、
 * 本関数はキー文字列の比較のみを行う。
 */
export function isSameTarget(targetKeyA: string, targetKeyB: string): boolean {
  return targetKeyA === targetKeyB;
}

/**
 * デバウンス発火判定（純粋）。
 *
 * 最後の編集時刻から DEBOUNCE_MS 経過したかを判定する。
 * Renderer 側で `setTimeout` の代わりに時刻ベースで判定する場合や、
 * テストで擬似タイマーと組み合わせる場合に用いる。
 *
 * @param lastEditMs 最後の編集時刻（エポックミリ秒）
 * @param nowMs       現在時刻（エポックミリ秒）
 * @returns 発火すべき場合 true
 */
export function shouldFire(lastEditMs: number, nowMs: number): boolean {
  return nowMs - lastEditMs >= DEBOUNCE_MS;
}

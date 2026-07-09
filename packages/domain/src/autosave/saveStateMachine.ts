/**
 * 自動保存の有限状態機械（FSM）（[roadmap.md T-2-01]）
 *
 * [autosave_spec.md §5] の4状態遷移を純粋関数で表現する。
 *
 * 状態:
 * - `idle`  : 保留中の編集あり（デバウンスタイマー待機中）
 * - `saving`: サーバーへ保存要求中
 * - `saved` : 最新状態が保存済み
 * - `error` : 保存失敗、リトライ中または上限到達
 *
 * 本モジュールは副作用を持たない。タイマー・fetch は Renderer 層が担う
 * （[architecture.md §4] ドメイン層はピュアTS）。
 *
 * [autosave_spec.md §5]: ../../../docs/autosave_spec.md
 */

/**
 * 単一保存対象の状態（[autosave_spec.md §5.1]）。
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * FSM に投入するイベント（[autosave_spec.md §5.2]）。
 *
 * - `EDIT`            : 編集開始（タイマー開始/再開）。任意状態から `idle` へ。
 * - `TIMER_FIRE`      : デバウンスタイマー発火。`idle` から `saving` へ。
 * - `RETRY_FIRE`      : リトライ再実行の開始。`error` から `saving` へ。
 *                       （`TIMER_FIRE` は `idle` からしか遷移しないため、リトライ再実行を区別する）
 * - `SAVE_SUCCESS`    : 保存API 2xx。`saving` から `saved` へ。初回・リトライ成功で共通。
 * - `SAVE_FAILURE`    : 保存API 4xx/5xx/ネットワークエラー。`saving`/`error` から `error` へ。
 * - `RETRY_EXHAUSTED` : リトライ上限到達。`error` のまま（手動復旧へ）。
 */
export type SaveEvent =
  | { type: 'EDIT' }
  | { type: 'TIMER_FIRE' }
  | { type: 'RETRY_FIRE' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_FAILURE' }
  | { type: 'RETRY_EXHAUSTED' };

/**
 * 状態遷移表（[autosave_spec.md §5.2]）。
 *
 * 定義のない (状態, イベント) 組合せは現在状態を維持する（自己遷移）。
 * これにより、例えば `saving` 中の `TIMER_FIRE` を無視できる。
 *
 * @returns 遷移後の状態。未定義組合せは現在状態をそのまま返す。
 */
export function transition(state: SaveStatus, event: SaveEvent): SaveStatus {
  switch (event.type) {
    case 'EDIT':
      // 任意状態からの編集開始は `idle`（タイマー開始/再開）
      return 'idle';

    case 'TIMER_FIRE':
      // デバウンスタイマー発火は `idle` から `saving` のみ。
      // `saving`/`saved`/`error` での発火は無視（現在状態維持）。
      // ※リトライ再実行は RETRY_FIRE で表現する（error 状態からの再保存）。
      return state === 'idle' ? 'saving' : state;

    case 'RETRY_FIRE':
      // リトライ再実行の開始は `error` から `saving` のみ。
      // `idle`/`saving`/`saved` では無視（現在状態維持）。
      return state === 'error' ? 'saving' : state;

    case 'SAVE_SUCCESS':
      // 保存成功は `saving` から `saved` のみ。
      // 初回保存成功もリトライ成功も、saving 状態から本イベントで saved へ遷移する。
      return state === 'saving' ? 'saved' : state;

    case 'SAVE_FAILURE':
      // 保存失敗は `saving` から `error` へ。
      // （RETRY_FIRE で saving へ遷移済みのため、リトライ失敗時も saving → error になる）
      // 他状態での SAVE_FAILURE は無視（現在状態維持）。
      return state === 'saving' ? 'error' : state;

    case 'RETRY_EXHAUSTED':
      // リトライ上限到達は `error` のまま（手動復旧へ）。
      return state === 'error' ? 'error' : state;
  }
}

/**
 * 複数保存対象の状態を1つのUI表示用ステータスへ集約する（[autosave_spec.md §5.2 備考]）。
 *
 * 優先順位:
 *  1. いずれかが `error` なら `error`（ユーザーに保存失敗を最優先通知）
 *  2. いずれかが `idle`/`saving` ならその順で（アクティブな保存進行を表示）
 *  3. 全て `saved`（または空）なら `saved`
 *
 * @param statuses 各保存対象の状態配列。空の場合は `saved`（保存対象なし＝最新）。
 */
export function aggregateStatus(statuses: SaveStatus[]): SaveStatus {
  if (statuses.length === 0) return 'saved';
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.some((s) => s === 'saving')) return 'saving';
  if (statuses.some((s) => s === 'idle')) return 'idle';
  return 'saved';
}

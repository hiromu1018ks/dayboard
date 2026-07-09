/**
 * TODO 状態遷移の純粋関数（[roadmap.md T-3-01]）
 *
 * [database_schema.md §3.3] の状態遷移を表現する。
 *
 * 状態:
 * - `todo`    : 未完了（初期状態）
 * - `done`    : 完了
 * - `carried` : 翌日への持ち越し済み（不可逆・終端状態）
 *
 * 許可される遷移:
 *   todo ⇄ done（完了操作 / 完了解除）
 *   todo → carried（持ち越し操作、不可逆）
 *
 * 禁止される遷移（INVALID_TRANSITION）:
 *   done → carried
 *   carried → todo
 *   carried → done
 *
 * 仕様メモ（[database_schema.md §3.3]）:
 * - `todo → carried` は持ち越しAPI（[api_contract.md §10]）経由のみ。
 *   本関数は遷移の可否のみを判定し、API経路の制限は呼び出し元（API層）で担保する。
 * - `carried` は表示用終端状態。翌日側には別の新しい TodoItem を作るため、
 *   元TODOのステータスを戻す必要はない。
 *
 * 本モジュールは副作用を持たない（[architecture.md §4]）。
 *
 * [database_schema.md §3.3]: ../../../docs/database_schema.md
 * [api_contract.md §10]: ../../../docs/api_contract.md
 */

import type { TodoStatus } from 'shared-types';

/**
 * 許可される遷移の候補（from → to）。
 * `status` を変更する操作がこの候補に含まれない場合は INVALID_TRANSITION 扱い。
 *
 * 自己遷移（todo→todo 等）は「変更なし（冪等）」として許可する。
 * PATCH で同一 status を送っても INVALID_TRANSITION にしないため。
 */
const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  'todo:todo',
  'todo:done',
  'done:done',
  'done:todo',
  'carried:carried',
  'todo:carried',
]);

/**
 * 指定した状態遷移（from → to）が許可されるかを判定する（[database_schema.md §3.3]）。
 *
 * @returns true=許可、false=INVALID_TRANSITION
 */
export function canTransition(from: TodoStatus, to: TodoStatus): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}:${to}`);
}

/**
 * 完了操作・完了解除のトグル結果を返す（要件 7.3、AC-09）。
 *
 * - `todo → done`
 * - `done → todo`
 * - `carried → *` は INVALID_TRANSITION（呼び出し元で 400 応答へ変換）
 *
 * @returns トグル後の状態。遷移不可の場合は `from` と同じ値（呼び出し元で canTransition と併用して判定）。
 */
export function toggleDone(from: TodoStatus): TodoStatus {
  if (from === 'todo') return 'done';
  if (from === 'done') return 'todo';
  return from; // carried はそのまま（呼び出し元で INVALID_TRANSITION 判定を推奨）
}

/**
 * `completedAt` をセットすべきか（status が `done` になったタイミング）。
 * API/リポジトリ層で `completed_at` カラムの設定判定に用いる（[database_schema.md §3.3]）。
 */
export function shouldSetCompletedAt(from: TodoStatus, to: TodoStatus): boolean {
  return from === 'todo' && to === 'done';
}

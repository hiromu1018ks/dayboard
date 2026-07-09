/**
 * PendingSnapshot 型と対象別マージ関数（[roadmap.md T-2-05]）
 *
 * [autosave_spec.md §6.2] の localStorage フェイルセーフ用スナップショットを
 * 純粋関数・型として表現する。localStorage/Web Storage へのアクセスは行わない
 * （[architecture.md §4] ドメイン層はピュアTS）。永続化の読み書きは Renderer 層の
 * `pendingStore.ts` が担う。
 *
 * 重要な要件（§6.2）:
 * - 同一日付内でテーマ保存だけ成功しても、未同期のノート本文/TODOスナップショットを消さない
 * - flush/デバウンス発火時には該当対象のスナップショットを最新内容で上書き
 * - サーバー保存成功時は該当対象だけ削除。全対象が空になったら日付キーを削除
 *
 * [autosave_spec.md §6.2]: ../../../docs/autosave_spec.md
 */

import type { ViewMode } from 'shared-types';

/**
 * 保存対象の識別子（§6.2 の target 和）。
 *
 * テーマ・TODO本文・ノート本文など、自動保存する各対象を判別する。
 * Phase 2 では `dayNote:theme` を主に使う。Phase 3/4 で他対象を追加。
 */
export type SaveTarget =
  | { type: 'dayNote'; field: 'theme' | 'lastOpenedMode' }
  | { type: 'todo'; id: string }
  | { type: 'todoOrder' }
  | { type: 'blocker'; id: string }
  | { type: 'reflection' }
  | { type: 'noteEntry' };

/**
 * 保存対象ごとの保留中ペイロード（§6.2 targets の要素）。
 *
 * `payload` は対象ごとに異なる形状（テーマは文字列、TODO本文は {title} 等）を取る。
 * `dirty: true` は固定（未同期を表す）。保存成功時に target 全体を削除する。
 */
export type PendingTarget = {
  target: SaveTarget;
  payload: unknown;
  dirty: true;
  updatedAt: string; // ISO 8601
  lastError?: string;
};

/**
 * 日付単位の保留スナップショット（§6.2）。
 * localStorage の `dayborad:pending:${date}` キーの値として直列化される。
 */
export type PendingSnapshot = {
  version: 1;
  date: string; // YYYY-MM-DD
  updatedAt: string; // ISO 8601
  targets: Record<string, PendingTarget>;
};

/**
 * 対象からスナップショット内のキー（targets のプロパティ名）を生成する（純粋）。
 *
 * 例:
 * - `{type:'noteEntry'}` → `'noteEntry'`
 * - `{type:'dayNote', field:'theme'}` → `'dayNote:theme'`
 * - `{type:'todo', id:'todo_1'}` → `'todo:todo_1'`
 *
 * [§6.2]: targets のキーは対象を一意に表す文字列とする。
 */
export function targetKey(target: SaveTarget): string {
  switch (target.type) {
    case 'dayNote':
      return `dayNote:${target.field}`;
    case 'todo':
      return `todo:${target.id}`;
    case 'todoOrder':
      return 'todoOrder';
    case 'blocker':
      return `blocker:${target.id}`;
    case 'reflection':
      return 'reflection';
    case 'noteEntry':
      return 'noteEntry';
  }
}

/**
 * 空の（対象なし）スナップショットを生成する（純粋）。
 *
 * @param date      YYYY-MM-DD
 * @param updatedAt ISO 8601
 */
export function createEmptySnapshot(date: string, updatedAt: string): PendingSnapshot {
  return { version: 1, date, updatedAt, targets: {} };
}

/**
 * スナップショットが対象を持たない（空）かを判定する（純粋、§6.2）。
 *
 * 全対象が保存済みになり targets が空になったら日付キーを削除する判定に用いる。
 */
export function isSnapshotEmpty(snapshot: PendingSnapshot): boolean {
  return Object.keys(snapshot.targets).length === 0;
}

/**
 * スナップショットへ対象を upsert する（純粋・非破壊、§6.2）。
 *
 * 「flush/デバウンス発火時には該当対象のスナップショットを最新内容で上書き」に対応。
 * 同一キーの対象があれば置換、なければ追加。元のスナップショットは変更しない。
 *
 * @param snapshot   元スナップショット
 * @param target     保存対象
 * @param payload    保留中のペイロード
 * @param updatedAt  ISO 8601
 * @param lastError  直近のエラーメッセージ（任意）
 */
export function upsertTarget(
  snapshot: PendingSnapshot,
  target: SaveTarget,
  payload: unknown,
  updatedAt: string,
  lastError?: string,
): PendingSnapshot {
  const key = targetKey(target);
  const nextTarget: PendingTarget = { target, payload, dirty: true, updatedAt, lastError };
  return {
    ...snapshot,
    updatedAt,
    targets: { ...snapshot.targets, [key]: nextTarget },
  };
}

/**
 * スナップショットから対象を削除する（純粋・非破壊、§6.2）。
 *
 * 「サーバー保存成功時は該当対象だけを削除」に対応。
 * テーマ保存だけ成功してもノート本文等の未同期分は残る。
 * 存在しないキーの場合は元のままを返す。
 *
 * @param snapshot 元スナップショット
 * @param target   削除対象
 */
export function removeTarget(snapshot: PendingSnapshot, target: SaveTarget): PendingSnapshot {
  const key = targetKey(target);
  if (!(key in snapshot.targets)) return snapshot;
  const rest: Record<string, PendingTarget> = { ...snapshot.targets };
  delete rest[key];
  return { ...snapshot, targets: rest };
}

/**
 * 複数対象を一度に削除する（純粋・非破壊）。
 *
 * 部分成功時の「成功した対象だけ削除」を一括で行うために用いる。
 *
 * @param snapshot 元スナップショット
 * @param targets  削除対象群
 */
export function removeTargets(snapshot: PendingSnapshot, targets: SaveTarget[]): PendingSnapshot {
  let result = snapshot;
  for (const target of targets) {
    result = removeTarget(result, target);
  }
  return result;
}

/**
 * スナップショット内の全対象キーを取得する（純粋）。
 *
 * 起動時リカバリ（§6.2）で全対象を再送する際に用いる。
 */
export function listTargetKeys(snapshot: PendingSnapshot): string[] {
  return Object.keys(snapshot.targets);
}

/**
 * スナップショットから特定キーの対象を取得する（純粋）。
 */
export function getTarget(snapshot: PendingSnapshot, key: string): PendingTarget | undefined {
  return snapshot.targets[key];
}

/**
 * 日付から localStorage キー名を生成する（純粋、§6.2）。
 *
 * @param date YYYY-MM-DD
 * @returns `dayborad:pending:YYYY-MM-DD`
 */
export function pendingKey(date: string): string {
  return `dayborad:pending:${date}`;
}

/**
 * 文字列が `dayborad:pending:` プレフィックスを持つ localStorage キーかを判定し、
 * 該当する場合は日付を抽出する（純粋）。
 *
 * 起動時リカバリで `dayborad:pending:*` を走査する際に用いる（§6.2）。
 *
 * @returns 該当キーなら日付文字列、それ以外は undefined
 */
export function parsePendingKey(key: string): string | undefined {
  const prefix = 'dayborad:pending:';
  if (!key.startsWith(prefix)) return undefined;
  const date = key.slice(prefix.length);
  // YYYY-MM-DD 形式の簡単な検証（実在性は呼び出し元で別途確認可能）
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

// ----- 対象ごとの型付きペイロードヘルパー（純粋） -----

/**
 * 各 SaveTarget に対応するペイロードの型マップ。
 * Renderer 側で型安全に対象別 payload を扱うための補助。
 */
export type TargetPayload = {
  dayNote_theme: string | null;
  dayNote_lastOpenedMode: ViewMode;
  todo: { title: string; status?: import('shared-types').TodoStatus };
  todoOrder: string[]; // todoId の順序配列
  blocker: { text: string; resolved?: boolean; linkedTodoId?: string | null };
  reflection: { doneText?: string; stuckText?: string; tomorrowActionText?: string };
  noteEntry: { body: string };
};

/**
 * 対象から期待されるペイロード型を取り出すヘルパー（型レベル）。
 * 実行時には何もしない（payload は unknown のまま保持）。
 */
export type PayloadFor<T extends SaveTarget> = T extends { type: 'dayNote'; field: 'theme' }
  ? TargetPayload['dayNote_theme']
  : T extends { type: 'dayNote'; field: 'lastOpenedMode' }
    ? TargetPayload['dayNote_lastOpenedMode']
    : T extends { type: 'todo' }
      ? TargetPayload['todo']
      : T extends { type: 'todoOrder' }
        ? TargetPayload['todoOrder']
        : T extends { type: 'blocker' }
          ? TargetPayload['blocker']
          : T extends { type: 'reflection' }
            ? TargetPayload['reflection']
            : T extends { type: 'noteEntry' }
              ? TargetPayload['noteEntry']
              : unknown;

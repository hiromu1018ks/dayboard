/**
 * localStorage pending ストア（[roadmap.md T-2-07]）
 *
 * [autosave_spec.md §6.2] の localStorage フェイルセーフ層。
 * domain の PendingSnapshot 純粋関数を使って `dayborad:pending:${date}` の
 * 読み書きを行う。
 *
 * 役割:
 * - 編集ごと / flush 時に保留対象を localStorage へ書き込む（サーバー保存失敗時の保険）
 * - サーバー保存成功時に該当対象だけ削除（部分成功でも他対象を残す）
 * - 起動時に `dayborad:pending:*` を走査してリカバリ（recoverOnStartup が行う）
 *
 * 容量超過（QuotaExceededError）はキャッチし、呼び出し元へ false で通知する
 * （[edge_cases.md §6.3]: フォールバックが書けなくてもメモリバッファには残る）。
 *
 * [autosave_spec.md §6.2]: ../../../../../../docs/autosave_spec.md
 */

import {
  type PendingSnapshot,
  type SaveTarget,
  createEmptySnapshot,
  isSnapshotEmpty,
  pendingKey,
  parsePendingKey,
  removeTarget as removeTargetFn,
  upsertTarget as upsertTargetFn,
} from '@dayboard/domain';

/**
 * localStorage 書き込みの結果。
 * `ok: false` は QuotaExceededError 等で書き込めなかったことを表す。
 * flush 時の遷移可否判定（§9.3）に用いる。
 */
export type PendingWriteResult = { ok: true } | { ok: false; reason: string };

/**
 * 現在時刻（ISO 8601）を取得。テストで差し替え可能にするため関数化。
 */
function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/**
 * localStorage から指定日のスナップショットを読み込む。
 * キーが存在しない・パース失敗時は空スナップショットを返す。
 *
 * SSR / テスト環境（localStorage 未定義）では空を返す。
 */
export function readSnapshot(date: string): PendingSnapshot {
  if (typeof localStorage === 'undefined') return createEmptySnapshot(date, nowIso());
  try {
    const raw = localStorage.getItem(pendingKey(date));
    if (!raw) return createEmptySnapshot(date, nowIso());
    const parsed = JSON.parse(raw) as PendingSnapshot;
    // 形式の簡易検証（version/date/targets）
    if (parsed?.version === 1 && parsed.date === date && parsed.targets) {
      return parsed;
    }
    return createEmptySnapshot(date, nowIso());
  } catch {
    // 破損データは空として扱う（回復不能なら空から再出発）
    return createEmptySnapshot(date, nowIso());
  }
}

/**
 * スナップショットを localStorage へ書き込む（低レベル）。
 * QuotaExceededError 等はキャッチして結果を返す。
 */
function writeSnapshot(snapshot: PendingSnapshot): PendingWriteResult {
  if (typeof localStorage === 'undefined') {
    return { ok: false, reason: 'localStorage が利用できません' };
  }
  try {
    localStorage.setItem(pendingKey(snapshot.date), JSON.stringify(snapshot));
    return { ok: true };
  } catch (err) {
    // QuotaExceededError 等
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

/**
 * 指定日のスナップショットへ対象を upsert して localStorage へ書き込む（§6.2）。
 *
 * flush/デバウンス発火時に「該当対象のスナップショットを最新内容で上書き」で用いる。
 * 既存の他対象は保持される。
 *
 * @param date    YYYY-MM-DD
 * @param target  保存対象
 * @param payload 保留中のペイロード
 * @param now     現在時刻（テスト注入用）
 * @returns 書き込み結果。`ok:false` は容量超過等。
 */
export function persistTarget(
  date: string,
  target: SaveTarget,
  payload: unknown,
  now: Date = new Date(),
): PendingWriteResult {
  const snapshot = readSnapshot(date);
  const updated = upsertTargetFn(snapshot, target, payload, nowIso(now));
  return writeSnapshot(updated);
}

/**
 * サーバー保存成功時に該当対象をスナップショットから削除する（§6.2）。
 *
 * 「サーバー保存成功時は該当対象だけを削除。全対象が保存済みになり targets が空に
 * なった時だけキーを削除」に対応。テーマ保存だけ成功してもノート本文等は残る。
 *
 * @returns 書き込み結果（空になったキー削除時も）。`ok:true` は削除成功。
 */
export function clearTarget(date: string, target: SaveTarget): PendingWriteResult {
  if (typeof localStorage === 'undefined')
    return { ok: false, reason: 'localStorage が利用できません' };
  const snapshot = readSnapshot(date);
  const removed = removeTargetFn(snapshot, target);
  if (isSnapshotEmpty(removed)) {
    // 全対象が保存済み → 日付キーを削除（§6.2）
    try {
      localStorage.removeItem(pendingKey(date));
      return { ok: true };
    } catch {
      // removeItem は通常失敗しないが念のため
      return { ok: false, reason: 'キー削除に失敗' };
    }
  }
  return writeSnapshot(removed);
}

/**
 * localStorage の `dayborad:pending:*` を全走査し、日付→スナップショットのマップを返す。
 * 起動時リカバリ（§6.2）で用いる。
 */
export function readAllPendingSnapshots(): Map<string, PendingSnapshot> {
  const result = new Map<string, PendingSnapshot>();
  if (typeof localStorage === 'undefined') return result;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const date = parsePendingKey(key);
    if (!date) continue;
    const snapshot = readSnapshot(date);
    if (!isSnapshotEmpty(snapshot)) {
      result.set(date, snapshot);
    }
  }
  return result;
}

/**
 * テスト用途: 指定日の pending キーを強制削除。
 */
export function removePendingKey(date: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(pendingKey(date));
  } catch {
    // 無視
  }
}

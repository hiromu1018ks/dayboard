/**
 * 起動時リカバリ（[roadmap.md T-2-12]）
 *
 * [autosave_spec.md §6.2] の起動時走査:
 * アプリクラッシュ・リロード後に localStorage の `dayborad:pending:*` を走査し、
 * 未同期データがあれば対応するAPIへ再送（リカバリ）する。
 *
 * 1. 全 `dayborad:pending:*` を走査
 * 2. 各対象をサーバーへ再送
 * 3. 成功した対象だけ削除（部分成功でも他対象は残す）
 * 4. targets が空になった日付キーだけ削除
 * 5. 失敗時は useAutosave の通常の error/リトライ状態へ（呼び出し元で処理）
 *
 * [autosave_spec.md §6.2]: ../../../../../../docs/autosave_spec.md
 */

import type { SaveTarget } from '@dayboard/domain';
import type { Saver } from './types.js';
import { clearTarget, readAllPendingSnapshots } from './pendingStore.js';

/**
 * 対象キーから SaveTarget への逆変換（リカバリ再送用）。
 *
 * pendingStore に保存された target 情報をそのまま使うため、実際には
 * スナップショット内の `target` フィールドから復元する。本関数は
 * フォールバック/検証用の文字列パースを提供する。
 */
export function parseTargetKey(key: string): SaveTarget | null {
  if (key === 'noteEntry') return { type: 'noteEntry' };
  if (key === 'reflection') return { type: 'reflection' };
  if (key === 'todoOrder') return { type: 'todoOrder' };
  if (key.startsWith('dayNote:')) {
    const field = key.slice('dayNote:'.length);
    if (field === 'theme') return { type: 'dayNote', field: 'theme' };
    if (field === 'lastOpenedMode') return { type: 'dayNote', field: 'lastOpenedMode' };
    return null;
  }
  if (key.startsWith('todo:')) {
    return { type: 'todo', id: key.slice('todo:'.length) };
  }
  if (key.startsWith('blocker:')) {
    return { type: 'blocker', id: key.slice('blocker:'.length) };
  }
  return null;
}

/**
 * 再送結果。成功した対象キーのリストと、失敗した対象キーのリストを返す。
 */
export type RecoveryResult = {
  /** 全対象の再送に成功したか（UI表示用） */
  allSucceeded: boolean;
  /** 成功した日付のリスト（キー削除済み） */
  recoveredDates: string[];
  /** 失敗が残った日付のリスト（localStorage に保持） */
  failedDates: string[];
};

/**
 * 起動時に localStorage の全保留スナップショットを再送する。
 *
 * 対象別の Saver を `saverResolver` で解決する。各保留スナップショットの日付を
 * 渡すため、resolver は日付ごとに適切な Saver を生成できる（API パスに日付が含まれるため）。
 * Phase 2 ではテーマのみ。Phase 3/4 で他対象を追加。
 *
 * @param saverResolver (date, target) から Saver を解決する関数
 */
export async function recoverOnStartup(
  saverResolver: (date: string, target: SaveTarget) => Saver | null,
): Promise<RecoveryResult> {
  const snapshots = readAllPendingSnapshots();
  const recoveredDates: string[] = [];
  const failedDates: string[] = [];
  let allSucceeded = true;

  for (const [date, snapshot] of snapshots) {
    let dateAllSucceeded = true;
    const successTargets: SaveTarget[] = [];

    for (const targetEntry of Object.values(snapshot.targets)) {
      const saver = saverResolver(date, targetEntry.target);
      if (!saver) {
        // 未知の対象（将来互換性等）。スキップし localStorage に残す
        dateAllSucceeded = false;
        allSucceeded = false;
        continue;
      }
      const result = await saver(targetEntry.payload);
      if (result.ok) {
        // 成功した対象だけ削除（部分成功でも他対象は残る、§6.2）
        successTargets.push(targetEntry.target);
      } else {
        dateAllSucceeded = false;
        allSucceeded = false;
      }
    }

    // 成功対象を localStorage から削除
    for (const target of successTargets) {
      clearTarget(date, target);
    }

    if (dateAllSucceeded) {
      recoveredDates.push(date);
    } else {
      failedDates.push(date);
    }
  }

  return { allSucceeded, recoveredDates, failedDates };
}

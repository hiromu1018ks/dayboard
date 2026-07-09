/**
 * 対象別 Saver 実装（[roadmap.md T-2-09]）
 *
 * 各保存対象のサーバーAPI呼び出しを SaverResult 形式へ変換する。
 * useAutosave は Saver の実装詳細（どのAPIを叩くか）に依存しない。
 *
 * Phase 2: テーマ（dayNote:theme）のみ実装。
 * Phase 3/4: TODO/Blocker/Reflection/NoteEntry を追加。
 */

import type { Saver, SaverError } from './types.js';
import { ApiClientError, patchDayNote } from '../api/client.js';

/**
 * テーマ保存の Saver（[roadmap.md T-2-09]）。
 *
 * PATCH /api/day-notes/:date の theme のみ送信（[api_contract.md §4]）。
 * theme は空文字→null 正規化が API 側で行われるため、そのまま送信する。
 *
 * @param date  YYYY-MM-DD
 */
export function createThemeSaver(date: string): Saver {
  return async (payload) => {
    const theme = payload as string | null;
    try {
      await patchDayNote(date, { theme });
      return { ok: true };
    } catch (err) {
      return saverError(err);
    }
  };
}

/**
 * ApiClientError / その他のエラーを SaverError へ変換する共通ヘルパ。
 */
export function saverError(err: unknown): SaverError {
  if (err instanceof ApiClientError) {
    return { ok: false, status: err.status, code: err.code, message: err.message };
  }
  // ネットワークエラー（fetch そのものの失敗）は status 未定義
  if (err instanceof TypeError) {
    // fetch が接続失敗で TypeError を投げる
    return { ok: false, status: undefined, code: 'NETWORK_ERROR', message: err.message };
  }
  return {
    ok: false,
    status: undefined,
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
  };
}

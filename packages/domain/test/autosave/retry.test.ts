/**
 * リトライポリシーの Unit テスト（[roadmap.md T-2-04]）
 *
 * [autosave_spec.md §7.1] の指数バックオフ（1s/2s/4s・最大3回）と、
 * 4xx 非リトライ・5xx/ネットワークエラーリトライを網羅する。
 *
 * [autosave_spec.md §7]: ../../../docs/autosave_spec.md
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_RETRIES,
  RETRY_DELAYS_MS,
  RETRIABLE_STATUS,
  isRetriable,
  shouldRetry,
  nextDelayMs,
  isRetryExhausted,
  type SaveErrorKind,
} from '../../src/autosave/retry.js';

describe('リトライ定数（§7.1）', () => {
  it('最大リトライ回数は3回', () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it('リトライ間隔は指数バックオフ 1s/2s/4s', () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
  });

  it('リトライ対象ステータスは 500/503/504', () => {
    expect(RETRIABLE_STATUS).toEqual([500, 503, 504]);
  });
});

describe('isRetriable', () => {
  it('ネットワークエラー（status 未定義）はリトライ対象', () => {
    expect(isRetriable({ status: undefined, code: undefined })).toBe(true);
    expect(isRetriable({ status: undefined, code: 'NETWORK_ERROR' })).toBe(true);
  });

  it('500/503/504 はリトライ対象', () => {
    expect(isRetriable({ status: 500, code: 'INTERNAL_ERROR' })).toBe(true);
    expect(isRetriable({ status: 503, code: undefined })).toBe(true);
    expect(isRetriable({ status: 504, code: undefined })).toBe(true);
  });

  it('502/501 等の5xx もリトライ対象（安全側）', () => {
    expect(isRetriable({ status: 502, code: undefined })).toBe(true);
    expect(isRetriable({ status: 501, code: undefined })).toBe(true);
  });

  it('4xx はリトライしない（バリデーション等、冪等でない）', () => {
    expect(isRetriable({ status: 400, code: 'VALIDATION_ERROR' })).toBe(false);
    expect(isRetriable({ status: 404, code: 'NOT_FOUND' })).toBe(false);
    expect(isRetriable({ status: 409, code: 'DUPLICATE_CONVERSION' })).toBe(false);
    expect(isRetriable({ status: 422, code: undefined })).toBe(false);
  });

  it('2xx はリトライしない（通常成功時には呼ばれない想定だが）', () => {
    expect(isRetriable({ status: 200, code: undefined })).toBe(false);
    expect(isRetriable({ status: 204, code: undefined })).toBe(false);
  });
});

describe('shouldRetry', () => {
  it('リトライ対象エラーで attempt < MAX_RETRIES なら true', () => {
    const netErr: SaveErrorKind = { status: undefined, code: undefined };
    expect(shouldRetry(netErr, 0)).toBe(true); // 初回失敗、リトライ0回
    expect(shouldRetry(netErr, 1)).toBe(true);
    expect(shouldRetry(netErr, 2)).toBe(true); // 3回目のリトライへ
  });

  it('attempt = MAX_RETRIES なら false（上限到達）', () => {
    const netErr: SaveErrorKind = { status: undefined, code: undefined };
    expect(shouldRetry(netErr, 3)).toBe(false);
    expect(shouldRetry(netErr, 4)).toBe(false);
  });

  it('4xx は attempt に関わらず false（リトライ対象外）', () => {
    const validation: SaveErrorKind = { status: 400, code: 'VALIDATION_ERROR' };
    expect(shouldRetry(validation, 0)).toBe(false);
    expect(shouldRetry(validation, 3)).toBe(false);
  });

  it('5xx の attempt 2 → true（3回目のリトライへ）、attempt 3 → false', () => {
    const serverErr: SaveErrorKind = { status: 503, code: undefined };
    expect(shouldRetry(serverErr, 2)).toBe(true);
    expect(shouldRetry(serverErr, 3)).toBe(false);
  });
});

describe('nextDelayMs', () => {
  it('attempt 0 → 1s（1回目のリトライ前）', () => {
    expect(nextDelayMs(0)).toBe(1000);
  });

  it('attempt 1 → 2s（2回目のリトライ前）', () => {
    expect(nextDelayMs(1)).toBe(2000);
  });

  it('attempt 2 → 4s（3回目のリトライ前）', () => {
    expect(nextDelayMs(2)).toBe(4000);
  });

  it('attempt 3以降 → 最後の値4s（配列範囲外は最後の値）', () => {
    expect(nextDelayMs(3)).toBe(4000);
    expect(nextDelayMs(10)).toBe(4000);
  });
});

describe('isRetryExhausted', () => {
  it('attempt < MAX_RETRIES なら false', () => {
    expect(isRetryExhausted(0)).toBe(false);
    expect(isRetryExhausted(1)).toBe(false);
    expect(isRetryExhausted(2)).toBe(false);
  });

  it('attempt >= MAX_RETRIES なら true', () => {
    expect(isRetryExhausted(3)).toBe(true);
    expect(isRetryExhausted(4)).toBe(true);
  });
});

describe('リトライ系列（§7.1 全体フロー）', () => {
  it('ネットワークエラー: 初回失敗→1s→retry1→2s→retry2→4s→retry3→上限到達', () => {
    const err: SaveErrorKind = { status: undefined, code: undefined };
    // 初回保存失敗（attempt=0）
    expect(shouldRetry(err, 0)).toBe(true);
    expect(nextDelayMs(0)).toBe(1000);
    // retry1 失敗（attempt=1）
    expect(shouldRetry(err, 1)).toBe(true);
    expect(nextDelayMs(1)).toBe(2000);
    // retry2 失敗（attempt=2）
    expect(shouldRetry(err, 2)).toBe(true);
    expect(nextDelayMs(2)).toBe(4000);
    // retry3 失敗（attempt=3）→ 上限到達
    expect(shouldRetry(err, 3)).toBe(false);
    expect(isRetryExhausted(3)).toBe(true);
  });

  it('4xx は即時リトライ終了（初回失敗で shouldRetry=false）', () => {
    const err: SaveErrorKind = { status: 400, code: 'VALIDATION_ERROR' };
    expect(shouldRetry(err, 0)).toBe(false);
    expect(isRetryExhausted(0)).toBe(false); // 上限到達ではないが、リトライ対象外
  });
});

/**
 * 統一エラーハンドラ
 *
 * [api_contract.md §1.4/§8] の統一エラー形式を返す。
 * 各エンドポイントで投げられた `ApiHttpError` を捕捉し、
 * それ以外は `INTERNAL_ERROR` (500) として扱う。
 */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError, ErrorCode } from 'shared-types';

/**
 * API層で投げる例外。
 * コード・HTTPステータス・メッセージ・詳細（任意）を持つ。
 */
export class ApiHttpError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details?: ApiError['error']['details'];

  constructor(
    code: ErrorCode,
    status: ContentfulStatusCode,
    message: string,
    details?: ApiError['error']['details'],
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** VALIDATION_ERROR を生成するヘルパー */
  static validation(fields: { field: string; message: string }[]): ApiHttpError {
    return new ApiHttpError('VALIDATION_ERROR', 400, '入力内容に誤りがあります。', { fields });
  }

  /** NOT_FOUND を生成するヘルパー */
  static notFound(message = '指定されたノートが見つかりません。'): ApiHttpError {
    return new ApiHttpError('NOT_FOUND', 404, message);
  }

  /** INVALID_TRANSITION を生成するヘルパー（[api_contract.md §5/§8]、Phase 3） */
  static invalidTransition(message = 'この操作は現在の状態では実行できません。'): ApiHttpError {
    return new ApiHttpError('INVALID_TRANSITION', 400, message);
  }
}

/**
 * エラー応答ボディを構築する。
 */
function buildErrorBody(err: ApiHttpError): ApiError {
  const body: ApiError = {
    error: {
      code: err.code,
      message: err.message,
    },
  };
  if (err.details !== undefined) {
    body.error.details = err.details;
  }
  return body;
}

/**
 * Hono の onError ハンドラ。
 * `ApiHttpError` はそのステータス・コードで返し、
 * それ以外は INTERNAL_ERROR (500) に集約する。
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ApiHttpError) {
    return c.json(buildErrorBody(err), err.status);
  }
  // 想定外エラー。クライアントの自動保存リトライをトリガする（[api_contract.md §8]）。
  console.error('[api] INTERNAL_ERROR:', err);
  const internal = new ApiHttpError(
    'INTERNAL_ERROR',
    500,
    '保存できませんでした。しばらくしてからお試しください。',
  );
  return c.json(buildErrorBody(internal), 500);
}

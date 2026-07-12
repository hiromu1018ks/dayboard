/**
 * UserSettings 系エンドポイント（[roadmap.md T-7-01]、[api_contract.md §11]、要件 8.5）
 *
 * - GET   /api/settings  — 設定取得（未作成なら初期値で作成して返す）
 * - PATCH /api/settings  — keybindingMode / vimDefaultState の部分更新
 *
 * MVPは単一ユーザーのため常に1行（id='default'）。
 * エラーは errorHandler（[api_contract.md §1.4]）が統一形式で返す。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { userSettingsRepository } from 'repository';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const settingsRoutes = new Hono();

/**
 * GET /api/settings
 *
 * 常に1行返す。未作成の場合は初期値（standard/normal）で作成して返す（[api_contract.md §11]）。
 */
settingsRoutes.get('/', async (c) => {
  const settings = await userSettingsRepository.get();
  return c.json(settings);
});

/** PATCH /api/settings のボディスキーマ（両方任意、部分更新） */
const patchSettingsBodySchema = z
  .object({
    keybindingMode: z.enum(['standard', 'vim']).optional(),
    vimDefaultState: z.enum(['normal', 'insert']).optional(),
  })
  .strict();

/**
 * PATCH /api/settings
 *
 * keybindingMode / vimDefaultState の部分更新（[api_contract.md §11]）。
 * 不正な値や未知フィールドは VALIDATION_ERROR。
 */
settingsRoutes.patch('/', async (c) => {
  // ボディのパース。空ボディも許容（何も更新しない）。
  const raw = await c.req.json().catch(() => ({}));
  const parsed = patchSettingsBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const updated = await userSettingsRepository.update(parsed.data);
  return c.json(updated);
});

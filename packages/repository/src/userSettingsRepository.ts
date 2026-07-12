/**
 * UserSettingsRepository 実装（[database_schema.md §3.2/§11]、[api_contract.md §11]）
 *
 * `UserSettingsRepository` IF（[types.ts]）に準拠する。
 * MVPは単一ユーザーのため常に1行（id='default'）。
 * 未作成の場合は初期値（standard/normal）で作成して返す（[api_contract.md §11]）。
 */

import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS_ID } from './seedRunner.js';
import { getDb } from './db.js';
import { mapUserSettings } from './mappers.js';
import { userSettings } from './schema/index.js';
import type {
  UserSettingsRepository as IUserSettingsRepository,
  UserSettingsUpdateInput,
} from './types.js';

/**
 * user_settings のデフォルト行（id='default'）を取得する。
 * 行が存在しない場合は初期値（standard/normal）で作成して返す（[api_contract.md §11]）。
 * シード未実行環境やDBリセット直後のフェイルセーフを兼ねる。
 */
async function getOrDefault(): Promise<ReturnType<typeof mapUserSettings>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.id, DEFAULT_SETTINGS_ID))
    .limit(1);
  if (rows.length > 0) {
    return mapUserSettings(rows[0]!);
  }
  // 未作成の場合は初期値で作成（[api_contract.md §11]: 未作成なら初期値で作成して返す）
  const inserted = await db
    .insert(userSettings)
    .values({ id: DEFAULT_SETTINGS_ID, keybindingMode: 'standard', vimDefaultState: 'normal' })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('userSettingsRepository.getOrDefault: insert returned no row');
  return mapUserSettings(row);
}

/** 常に1行返す。未作成の場合は初期値で作成して返す（[api_contract.md §11]）。 */
export const get: IUserSettingsRepository['get'] = async () => {
  return getOrDefault();
};

/**
 * user_settings を部分更新する（[api_contract.md §11]）。
 * 空 input は現状維持。未作成の場合は初期値作成後に更新を適用する。
 */
export const update: IUserSettingsRepository['update'] = async (input) => {
  // 先にデフォルト行の存在を保証（未作成なら作成）
  await getOrDefault();

  const db = getDb();
  const patch: Partial<typeof userSettings.$inferInsert> = {};
  if (input.keybindingMode !== undefined) {
    patch.keybindingMode = input.keybindingMode;
  }
  if (input.vimDefaultState !== undefined) {
    patch.vimDefaultState = input.vimDefaultState;
  }

  if (Object.keys(patch).length === 0) {
    // 更新内容が空なら現状維持（updatedAt も更新しない）
    return getOrDefault();
  }

  const rows = await db
    .update(userSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSettings.id, DEFAULT_SETTINGS_ID))
    .returning();
  const row = rows[0];
  if (!row) throw new Error('userSettingsRepository.update: update returned no row');
  return mapUserSettings(row);
};

/** IF準拠をコンパイル時に検証（実行時には影響しない） */
export const _implements: IUserSettingsRepository = {
  get,
  update,
};
void _implements;

// 型の再エクスポート（外部から利用可能にする）
export type { UserSettingsUpdateInput };

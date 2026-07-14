/**
 * repository パッケージ公開API
 *
 * DB接続・スキーマ定義に加え、Phase 1 のリポジトリ群と DayNote aggregator を公開する。
 */

// DB接続・マイグレーション・シード
export { getPool, getDb, closePool, ping } from './db.js';
export type { Db } from './db.js';
export { runMigrations } from './migrate.js';
export { seedUserSettings, DEFAULT_SETTINGS_ID } from './seedRunner.js';

// スキーマ定義
export * as schema from './schema/index.js';

// リポジトリIF型（[database_schema.md §11] / [test_strategy.md §1.2]）
export type {
  DayNoteRepository,
  TodoRepository,
  BlockerRepository,
  ReflectionRepository,
  NoteEntryRepository,
  NoteLineMetaRepository,
  UserSettingsRepository,
  DayNoteUpdateInput,
  TodoUpdateInput,
  BlockerUpdateInput,
  ReflectionUpdateInput,
  NoteEntryUpdateInput,
  NoteLineMetaCreateInput,
  UserSettingsUpdateInput,
  Tx,
} from './types.js';

// リポジトリ実装（Phase 1）
export * as dayNoteRepository from './dayNoteRepository.js';
export * as reflectionRepository from './reflectionRepository.js';
export * as noteEntryRepository from './noteEntryRepository.js';

// リポジトリ実装（Phase 3: 仕事整理モード）
export * as todoRepository from './todoRepository.js';
export * as blockerRepository from './blockerRepository.js';

// リポジトリ実装（Phase 5: ノート変換）
export * as noteLineMetaRepository from './noteLineMetaRepository.js';

// リポジトリ実装（Phase 7: ユーザー設定）
export * as userSettingsRepository from './userSettingsRepository.js';

// リポジトリ実装（Post-MVP: 全文検索）
export * as searchRepository from './searchRepository.js';

// DayNote aggregator（AC-01: 自動生成 + DayNoteFull 編成）
export {
  getOrCreateFull,
  patchDayNote,
  dayNoteExists,
  findFullByDate,
} from './dayNoteAggregator.js';
// Phase 6: 持ち越しAPI用（既存トランザクション内で翌日DayNoteを取得/生成）
export { getOrCreateDayNoteIdInTx } from './dayNoteAggregator.js';

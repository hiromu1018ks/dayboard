/**
 * DayNote aggregator — AC-01 の中核（[roadmap.md T-1-07]）
 *
 * 存在しない日付の DayNote を、Reflection + NoteEntry と共に
 * 1トランザクションで自動生成する（[architecture.md §6.1 ステップ6]）。
 *
 * アーキテクチャ上の位置づけ（[architecture.md §4]）:
 * - ピュア関数部分（入力値生成・theme正規化）は `@dayboard/domain` が担う
 * - トランザクション実行（副作用）は本モジュールが担う
 * - DBアクセスは各リポジトリ関数（`dayNoteRepository.create` 等）を経由し、
 *   スキーマ直叩きしない。これにより [database_schema.md §11] のリポジトリIF指針と
 *   [test_strategy.md §1.2] の「IFベースで差し替え可能」を満たす。
 *
 * GET /api/day-notes/:date/full の応答データ（`DayNoteFull`）を編成する。
 * 新規生成時は todos/blockers/noteLineMetas は空配列。
 */

import type { DayNoteFull, ViewMode } from 'shared-types';
import {
  buildNewDayNoteInput,
  buildNewNoteEntryInput,
  buildNewReflectionInput,
  createId,
} from '@dayboard/domain';
import { getDb } from './db.js';
import * as blockerRepository from './blockerRepository.js';
import * as dayNoteRepository from './dayNoteRepository.js';
import * as noteEntryRepository from './noteEntryRepository.js';
import * as noteLineMetaRepository from './noteLineMetaRepository.js';
import * as reflectionRepository from './reflectionRepository.js';
import * as todoRepository from './todoRepository.js';
import type { Tx } from './types.js';

/**
 * 指定日付の DayNote を取得する。存在しない場合は DayNote + Reflection + NoteEntry を
 * 1トランザクションで自動生成してから、`DayNoteFull` を返す（AC-01）。
 *
 * @param date YYYY-MM-DD
 */
export async function getOrCreateFull(date: string): Promise<DayNoteFull> {
  const existing = await findFullByDate(date);
  if (existing) return existing;

  try {
    return await createFullInTransaction(date);
  } catch (err) {
    // 並行生成による一意制約違反なら、既存を取得して返す
    if (isUniqueViolation(err)) {
      const concurrent = await findFullByDate(date);
      if (concurrent) return concurrent;
    }
    throw err;
  }
}

/**
 * PATCH /api/day-notes/:date のための部分更新ヘルパー。
 * 存在しない date の場合は null を返す（API 層で 404 に変換）。
 *
 * theme は `normalizeTheme`（空文字→null）で正規化する（[api_contract.md §4]）。
 * theme 正規化の真実源は `dayNoteRepository.update` 内の `normalizeTheme` 呼び出し。
 *
 * @returns 更新後の DayNoteFull。存在しない date の場合は null。
 *          ※ [api_contract.md §4] の PATCH レスポンスは `DayNote` のみだが、
 *          本関数は aggregator として DayNoteFull を返す。API 層で `.dayNote` を
 *          抽出して応答すること。
 */
export async function patchDayNote(
  date: string,
  patch: { theme?: string | null; lastOpenedMode?: ViewMode },
): Promise<DayNoteFull | null> {
  const existing = await findFullByDate(date);
  if (!existing) return null;

  const updated = await dayNoteRepository.update(existing.dayNote.id, patch);
  if (!updated) return null;
  return { ...existing, dayNote: updated };
}

/** テスト・デバッグ用: DayNote の存在確認（日付指定）。 */
export async function dayNoteExists(date: string): Promise<boolean> {
  return dayNoteRepository.existsByDate(date);
}

/**
 * 指定日付の DayNote を取得または生成し、その id を返す（Phase 6: 持ち越しAPI用）。
 *
 * [api_contract.md §10 step1]: 持ち越し実行時に翌日の DayNote が未作成の場合、
 * carry-over エンドポイント内で自動生成する。本関数はそれを既存トランザクション内で
 * 行うため、`tx` を受け取る。Reflection / NoteEntry の空行も同時作成する
 * （Phase 1 の自動生成ロジックと同じ振る舞い）。
 *
 * @param date YYYY-MM-DD
 * @param tx   呼出元が編成したトランザクション接続
 * @returns 当該日付の DayNote の id（存在しなかった場合は新規生成したもの）
 */
export async function getOrCreateDayNoteIdInTx(date: string, tx: Tx): Promise<string> {
  const existing = await dayNoteRepository.findByDate(date);
  if (existing) return existing.id;

  // 未生成の場合は同一 tx 上で DayNote + Reflection + NoteEntry を生成
  const created = await createFullInTx(date, tx);
  return created.dayNote.id;
}

// ---- 内部ヘルパー ----

/**
 * DayNote + Reflection + NoteEntry を1トランザクションで新規生成し、`DayNoteFull` を返す。
 *
 * 3リソースの入力値は `@dayboard/domain` のピュア関数（`buildNew*Input`）で生成し、
 * ID は `createId`（テストで固定化可能）を用いる。DB 書き込みは各リポジトリ関数に
 * `tx` を渡して実行する。これにより AC-01 の「3リソース1トランザクション」原子性を保証する。
 */
async function createFullInTransaction(date: string): Promise<DayNoteFull> {
  const db = getDb();
  return db.transaction(async (tx: Tx) => {
    return createFullInTx(date, tx);
  });
}

/**
 * 既存トランザクション内で DayNote + Reflection + NoteEntry を新規生成する。
 *
 * `getOrCreateFull`（GET /full）からも、`getOrCreateDayNoteIdInTx`（持ち越しAPI、Phase 6）
 * からも呼ばれる共通の生成処理。呼出元がトランザクションを編成するため、本関数は
 * トランザクションを開始せず、渡された `tx` 上で順次 INSERT する。
 *
 * トランザクションは単一クライアントを使うため、Promise.all による並行クエリは
 * pg @9 で非推奨。順次実行で安全に扱う。
 */
async function createFullInTx(date: string, tx: Tx): Promise<DayNoteFull> {
  // 入力値をピュア関数で生成（ID は domain.createId）
  const dayNoteInput = buildNewDayNoteInput(date, createId);
  const reflectionInput = buildNewReflectionInput(dayNoteInput.id, createId);
  const noteEntryInput = buildNewNoteEntryInput(dayNoteInput.id, createId);

  const dayNote = await dayNoteRepository.create(dayNoteInput.id, dayNoteInput.date, tx);
  const reflection = await reflectionRepository.create(
    reflectionInput.id,
    reflectionInput.dayNoteId,
    tx,
  );
  const noteEntry = await noteEntryRepository.create(
    noteEntryInput.id,
    noteEntryInput.dayNoteId,
    tx,
  );

  return {
    dayNote,
    todos: [],
    blockers: [],
    reflection,
    noteEntry,
    noteLineMetas: [],
  } satisfies DayNoteFull;
}

/**
 * date から既存の `DayNoteFull` を編成。各リポジトリ関数で取得する。
 *
 * データ不整合時の挙動: DayNote/Reflection/NoteEntry のいずれかが欠けている場合
 * （通常の運用では起こり得ないが、外部要因で部分削除された場合等）は `null` を返す。
 * `getOrCreateFull` はこの場合 `createFullInTransaction` を呼ぶが、DayNote 行が
 * 存在するため一意制約違反となり、最終的に例外を再送する（自動修復は行わない）。
 * これは安全側に倒れた挙動であり、管理者の介入を前提とする。
 *
 * Phase 5: noteLineMetas を NoteEntry のID経由で取得し、変換済みマーク表示に供する。
 */
async function findFullByDate(date: string): Promise<DayNoteFull | null> {
  const dayNote = await dayNoteRepository.findByDate(date);
  if (!dayNote) return null;

  // dayNoteId で Reflection/NoteEntry/Todos/Blockers を並行取得
  // （Pool から別クライアントを使うため安全）
  const [reflection, noteEntry, todos, blockers] = await Promise.all([
    reflectionRepository.findByDayNote(dayNote.id),
    noteEntryRepository.findByDayNote(dayNote.id),
    todoRepository.listByDayNote(dayNote.id),
    blockerRepository.listByDayNote(dayNote.id),
  ]);
  if (!reflection || !noteEntry) return null;

  // noteLineMetas は NoteEntry のIDで取得（変換済みマーク表示用、Phase 5）
  const noteLineMetas = await noteLineMetaRepository.listByNoteEntry(noteEntry.id);

  return {
    dayNote,
    todos,
    blockers,
    reflection,
    noteEntry,
    noteLineMetas,
  } satisfies DayNoteFull;
}

/** PostgreSQL の unique_violation（SQLSTATE 23505）か判定。 */
function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code: string }).code === '23505';
  }
  return false;
}

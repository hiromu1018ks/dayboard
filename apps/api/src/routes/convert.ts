/**
 * ノート行変換エンドポイント（[roadmap.md T-5-06/07]）
 *
 * - POST /api/day-notes/:date/convert/todo    — ノート選択行をTODO化（[api_contract.md §9]）
 * - POST /api/day-notes/:date/convert/blocker — ノート選択行を障害化（[api_contract.md §9]）
 *
 * 変換の正規化・重複判定ルールの詳細は [note_conversion_spec.md] に委ねる。
 * ここではHTTP契約とトランザクション編成を担う。
 *
 * 重複判定（[note_conversion_spec.md §6]）:
 * - 同じ `(noteEntryId, lineHash)` を持ち、対応する変換先が既存の NoteLineMeta があれば 409
 * - `?force=1` で重複チェックをバイパスし、強制的に2つ目を作成（要件 7.8）
 *
 * トランザクション（[edge_cases.md §10.3]）:
 * - TodoItem/BlockerItem + NoteLineMeta を1トランザクションで作成
 * - 一方だけ残る状態（部分失敗）を防ぐ
 * - pg@9 の同一トランザクション内では順次実行（Promise.all 非推奨）
 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  computeLineHash,
  createId,
  extractTitle,
  isValidDateString,
  normalizeLineText,
} from '@dayboard/domain';
import {
  blockerRepository,
  dayNoteRepository,
  getDb,
  noteEntryRepository,
  noteLineMetaRepository,
  todoRepository,
  type Tx,
} from 'repository';
import type { BlockerItem, NoteLineMeta, TodoItem } from 'shared-types';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const convertRoutes = new Hono();

/** 変換リクエストのボディスキーマ（[api_contract.md §9]） */
const convertBodySchema = z
  .object({
    noteEntryId: z.string().min(1),
    /** 1始まり（[note_conversion_spec.md §2.1]） */
    lineNumber: z.number().int().min(1),
    lineText: z.string().max(50000),
  })
  .strict();

/** 変換成功レスポンス（TODO化） */
type ConvertTodoResponse = { todo: TodoItem; noteLineMeta: NoteLineMeta };

/** 変換成功レスポンス（障害化） */
type ConvertBlockerResponse = { blocker: BlockerItem; noteLineMeta: NoteLineMeta };

/**
 * 日付検証 + DayNote の存在確認。存在しない場合は 404。
 * @returns DayNote の id
 */
async function requireDayNoteId(date: string): Promise<string> {
  const dayNote = await dayNoteRepository.findByDate(date);
  if (!dayNote) throw ApiHttpError.notFound('指定された日付のノートが見つかりません。');
  return dayNote.id;
}

/**
 * noteEntryId が当該 DayNote に属するか検証し、NoteEntry を返す。
 * 属さない場合は VALIDATION_ERROR（[api_contract.md §9]）。
 */
async function requireNoteEntryForDayNote(
  noteEntryId: string,
  dayNoteId: string,
): Promise<{ id: string }> {
  const noteEntry = await noteEntryRepository.findByDayNote(dayNoteId);
  if (!noteEntry || noteEntry.id !== noteEntryId) {
    throw ApiHttpError.validation([
      { field: 'noteEntryId', message: '指定されたノートエントリが見つかりません。' },
    ]);
  }
  return noteEntry;
}

/**
 * 共通ボディパース + 正規化・タイトル生成。
 * @returns 正規化済みデータ（lineHash 含む）。タイトルが空の場合は VALIDATION_ERROR。
 */
function parseAndNormalize(
  raw: unknown,
  noteEntryId: string,
): {
  lineNumber: number;
  lineText: string;
  normalizedLineText: string;
  lineHash: string;
  title: string;
} {
  const parsed = convertBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }

  const { noteEntryId: _ne, lineNumber, lineText } = parsed.data;
  void _ne; // noteEntryId は別途検証済み

  // [note_conversion_spec.md §3] 正規化
  const normalizedLineText = normalizeLineText(lineText);

  // 空行チェック（trim後空）。API契約では VALIDATION_ERROR
  if (normalizedLineText.length === 0) {
    throw ApiHttpError.validation([{ field: 'lineText', message: '空行は変換できません。' }]);
  }

  // [note_conversion_spec.md §4] タイトル生成
  const title = extractTitle(lineText);
  if (title.length === 0) {
    throw ApiHttpError.validation([{ field: 'title', message: '変換後のテキストが空です。' }]);
  }

  // [note_conversion_spec.md §5] lineHash 生成
  const lineHash = computeLineHash(noteEntryId, normalizedLineText);

  return { lineNumber, lineText, normalizedLineText, lineHash, title };
}

/**
 * 重複チェック（[note_conversion_spec.md §6]）。
 * `force=1` の場合はスキップ。
 */
async function checkDuplicate(
  noteEntryId: string,
  lineHash: string,
  target: 'todo' | 'blocker',
  force: boolean,
): Promise<void> {
  if (force) return;
  const existing = await noteLineMetaRepository.findByNoteEntryAndLineHash(
    noteEntryId,
    lineHash,
    target,
  );
  if (existing.length > 0) {
    // 最初の重複候補を details.existing に添付
    const first = existing[0]!;
    let existingItem: { id: string; title?: string; sourceNoteLineMetaId?: string | null };
    if (target === 'todo' && first.convertedToTodoId) {
      const todo = await todoRepository.findById(first.convertedToTodoId);
      existingItem = {
        id: first.convertedToTodoId,
        title: todo?.title,
        sourceNoteLineMetaId: first.id,
      };
    } else if (target === 'blocker' && first.convertedToBlockerId) {
      const blocker = await blockerRepository.findById(first.convertedToBlockerId);
      existingItem = {
        id: first.convertedToBlockerId,
        title: blocker?.text,
        sourceNoteLineMetaId: first.id,
      };
    } else {
      existingItem = { id: first.id, sourceNoteLineMetaId: first.id };
    }
    throw ApiHttpError.duplicateConversion(existingItem, target);
  }
}

/**
 * POST /api/day-notes/:date/convert/todo
 *
 * ノート選択行をTODO化する（要件 7.8、US-MVP-009、[api_contract.md §9]）。
 *
 * サーバー側処理（[api_contract.md §9]）:
 * 1. lineText を正規化 → normalizedLineText
 * 2. lineHash を noteEntryId + normalizedLineText から生成
 * 3. 同 (noteEntryId, lineHash) で convertedToTodoId IS NOT NULL の NoteLineMeta があれば 409
 * 4. 新規 TodoItem（sourceNoteLineMetaId 付き）と NoteLineMeta を1トランザクションで作成
 *
 * `?force=1` で重複チェックをバイパス（要件 7.8「別TODOとして作成」）。
 */
convertRoutes.post('/:date/convert/todo', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const force = c.req.query('force') === '1';

  const dayNoteId = await requireDayNoteId(date);
  const noteEntry = await requireNoteEntryForDayNote(raw.noteEntryId ?? '', dayNoteId);

  const { lineNumber, lineText, normalizedLineText, lineHash, title } = parseAndNormalize(
    raw,
    noteEntry.id,
  );

  // 重複チェック（[§6]）
  await checkDuplicate(noteEntry.id, lineHash, 'todo', force);

  // 1トランザクションで TodoItem + NoteLineMeta を作成（[edge_cases.md §10.3]）
  const db = getDb();
  const result = await db.transaction(async (tx: Tx) => {
    const todoId = createId();
    const metaId = createId();

    // 循環FKの解決（[database_schema.md §7.3]）:
    // NoteLineMeta.convertedToTodoId は TodoItem.id を、
    // TodoItem.sourceNoteLineMetaId は NoteLineMeta.id を相互に参照する。
    // 1. TodoItem を sourceNoteLineMetaId=null で作成
    // 2. NoteLineMeta を convertedToTodoId=todoId で作成
    // 3. TodoItem.sourceNoteLineMetaId を metaId に UPDATE（repository.update 経由）
    const todo = await todoRepository.create(todoId, dayNoteId, title, tx);

    const meta = await noteLineMetaRepository.create(
      metaId,
      {
        noteEntryId: noteEntry.id,
        lineNumberAtConversion: lineNumber,
        normalizedLineText,
        lineHash,
        lineText,
        convertedToTodoId: todo.id,
        convertedToBlockerId: null,
      },
      tx,
    );

    // TodoItem.sourceNoteLineMetaId を設定（[database_schema.md §3.3/§3.7]）
    await todoRepository.update(todo.id, { sourceNoteLineMetaId: meta.id }, tx);

    return { todo: { ...todo, sourceNoteLineMetaId: meta.id }, noteLineMeta: meta };
  });

  return c.json(result satisfies ConvertTodoResponse, 201);
});

/**
 * POST /api/day-notes/:date/convert/blocker
 *
 * ノート選択行を障害化する（要件 7.9、US-MVP-010、[api_contract.md §9]）。
 * TODO化と同じ構造・重複ルール。
 */
convertRoutes.post('/:date/convert/blocker', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const force = c.req.query('force') === '1';

  const dayNoteId = await requireDayNoteId(date);
  const noteEntry = await requireNoteEntryForDayNote(raw.noteEntryId ?? '', dayNoteId);

  const { lineNumber, lineText, normalizedLineText, lineHash, title } = parseAndNormalize(
    raw,
    noteEntry.id,
  );

  // 重複チェック（[§6]）
  await checkDuplicate(noteEntry.id, lineHash, 'blocker', force);

  // 1トランザクションで BlockerItem + NoteLineMeta を作成（[edge_cases.md §10.3]）
  const db = getDb();
  const result = await db.transaction(async (tx: Tx) => {
    const blockerId = createId();
    const metaId = createId();

    // 循環FKの解決（[database_schema.md §7.3]）: TODO化と同じ3ステップ方式。
    // 1. BlockerItem を sourceNoteLineMetaId=null で作成
    // 2. NoteLineMeta を convertedToBlockerId=blockerId で作成
    // 3. BlockerItem.sourceNoteLineMetaId を metaId に UPDATE
    const blocker = await blockerRepository.create(
      blockerId,
      dayNoteId,
      title,
      null, // linkedTodoId は手動追加時のみ。変換時は null
      tx,
    );

    const meta = await noteLineMetaRepository.create(
      metaId,
      {
        noteEntryId: noteEntry.id,
        lineNumberAtConversion: lineNumber,
        normalizedLineText,
        lineHash,
        lineText,
        convertedToTodoId: null,
        convertedToBlockerId: blocker.id,
      },
      tx,
    );

    // BlockerItem.sourceNoteLineMetaId を設定（[database_schema.md §3.4/§3.7]）
    await blockerRepository.update(blocker.id, { sourceNoteLineMetaId: meta.id }, tx);

    return {
      blocker: { ...blocker, sourceNoteLineMetaId: meta.id },
      noteLineMeta: meta,
    };
  });

  return c.json(result satisfies ConvertBlockerResponse, 201);
});

/**
 * 持ち越しエンドポイント（[roadmap.md T-6-03]）
 *
 * - POST /api/day-notes/:date/carry-over — 未完了TODOを翌日に持ち越す（[api_contract.md §10]）
 *
 * 仕様（[api_contract.md §10]、要件 7.10、[edge_cases.md §4.3/§4.4]）:
 * - 1トランザクションで以下を行う（step1-5）:
 *   1. 翌日（date + 1 day）の DayNote が無ければ作成（getOrCreateDayNoteIdInTx）
 *   2. 各 todoId について、翌日に carriedFromTodoId の重複が無いか確認
 *   3. 重複なし & status='todo' のみ carry、done / carried（重複先なし）は VALIDATION_ERROR
 *   4. 翌日に新規 TodoItem 作成（carriedFromTodoId / carriedFromDate 付き、title コピー）
 *   5. 元TODOを status='carried' に更新
 * - 重複があっても HTTP 200 で部分成功応答（carried / skipped）。DUPLICATE_CARRYOVER は
 *   エラーコードではなく skipped[].reason として返す（[test_strategy.md §4.3]）
 *
 * トランザクション（[edge_cases.md §10.3]）: 全 TODO作成 + 元TODO更新を同一 tx で行い、
 * 部分失敗を防ぐ。pg@9 の同一トランザクション内では順次実行（Promise.all 非推奨）。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  createId,
  isValidDateString,
  CarryOverValidationError,
  planCarryOver,
} from '@dayboard/domain';
import {
  dayNoteRepository,
  getDb,
  getOrCreateDayNoteIdInTx,
  todoRepository,
  type Tx,
} from 'repository';
import type { CarryOverResult, TodoItem } from 'shared-types';
import { ApiHttpError } from '../middleware/errorHandler.js';

export const carryOverRoutes = new Hono();

/** 持ち越しリクエストのボディスキーマ（[api_contract.md §10]） */
const carryOverBodySchema = z
  .object({
    /** 持ち越し対象のTODO id 群。各 id は :date の DayNote に属すること */
    todoIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

/**
 * POST /api/day-notes/:date/carry-over
 *
 * 未完了TODOを翌日に持ち越す（要件 7.10、US-MVP-012、[api_contract.md §10]）。
 *
 * 部分成功（HTTP 200）:
 * - `carried`: 持ち越し成功。sourceTodoId / newTodoId / nextDayDate
 * - `skipped`: 重複でスキップ。sourceTodoId / reason=DUPLICATE_CARRYOVER / message
 */
carryOverRoutes.post('/:date/carry-over', async (c) => {
  const date = c.req.param('date');
  if (!isValidDateString(date)) {
    throw ApiHttpError.validation([
      { field: 'date', message: '日付は YYYY-MM-DD 形式で指定してください。' },
    ]);
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = carryOverBodySchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw ApiHttpError.validation(fields);
  }
  const { todoIds } = parsed.data;

  // 当日 DayNote の存在確認（[api_contract.md §10] 前提: 元TODOは :date に属する）
  const sourceDayNote = await dayNoteRepository.findByDate(date);
  if (!sourceDayNote) {
    throw ApiHttpError.notFound('指定された日付のノートが見つかりません。');
  }

  // 各 todoId を取得し、当日 DayNote に属することを検証（[edge_cases.md §10.2] と同方針）
  const sourceTodos: TodoItem[] = [];
  for (const id of todoIds) {
    const todo = await todoRepository.findById(id);
    if (!todo || todo.dayNoteId !== sourceDayNote.id) {
      throw ApiHttpError.validation([
        {
          field: 'todoIds',
          message: `TODO ${id} は指定された日付のノートに属していません。`,
        },
      ]);
    }
    sourceTodos.push(todo);
  }

  const nextDayDate = addDays(date, 1);

  // 1トランザクションで全処理（[api_contract.md §10 step1-5]、[edge_cases.md §10.3]）。
  // 重複判定（step2）も tx 内で行い、チェック〜実行の TOCTOU ギャップを排除する。
  const db = getDb();
  const result = await db.transaction(async (tx: Tx): Promise<CarryOverResult> => {
    // step1: 翌日 DayNote を取得または生成
    const nextDayNoteId = await getOrCreateDayNoteIdInTx(nextDayDate, tx);

    // step2: 重複判定（tx 内）。各 sourceTodo について findByCarriedFrom で翌日側の有無を確認。
    // 既に翌日に carriedFromTodoId で作成されていれば skip。
    const alreadyCarriedSourceIds = new Set<string>();
    for (const todo of sourceTodos) {
      const carried = await todoRepository.findByCarriedFrom(todo.id);
      if (carried.length > 0) {
        alreadyCarriedSourceIds.add(todo.id);
      }
    }

    // step3: 持ち越し計画を作成（純粋関数）。done / carried（重複先なし）は例外を投げる。
    let plan;
    try {
      plan = planCarryOver({
        sourceTodos,
        sourceDate: date,
        alreadyCarriedSourceIds,
        idGenerator: createId,
      });
    } catch (err) {
      if (err instanceof CarryOverValidationError) {
        throw ApiHttpError.validation([
          {
            field: 'todoIds',
            message: `TODO ${err.invalidTodoId} は現在のステータス（${err.status}）では持ち越しできません。`,
          },
        ]);
      }
      throw err;
    }

    const carried: CarryOverResult['carried'] = [];
    const skipped: CarryOverResult['skipped'] = [];

    for (const item of plan) {
      if (item.kind === 'skip') {
        // step2 の重複（既に翌日に持ち越し済み）
        skipped.push({
          sourceTodoId: item.source.id,
          reason: 'DUPLICATE_CARRYOVER',
          message: 'すでに翌日に持ち越し済みです。',
        });
        continue;
      }

      // step4: 翌日に新規TODO作成（carriedFromTodoId / carriedFromDate 付き）
      await todoRepository.createCarriedOver(
        item.newTodoId,
        nextDayNoteId,
        item.title,
        item.source.id,
        item.carriedFromDate,
        tx,
      );

      // step5: 元TODOを carried 化
      await todoRepository.update(item.source.id, { status: 'carried' }, tx);

      carried.push({
        sourceTodoId: item.source.id,
        newTodoId: item.newTodoId,
        nextDayDate,
      });
    }

    return { carried, skipped };
  });

  // 常に HTTP 200（部分成功、[api_contract.md §10]、[test_strategy.md §4.3]）
  return c.json(result satisfies CarryOverResult, 200);
});

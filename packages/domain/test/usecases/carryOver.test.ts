/**
 * 持ち越しユースケース（planCarryOver）の Unit テスト（[roadmap.md T-6-02]）
 *
 * [test_strategy.md §3.3] の観点:
 * - 未完了のみ carry
 * - done は CarryOverValidationError
 * - carried（重複先なし = データ不整合）もエラー
 * - 重複（alreadyCarriedSourceIds）は skip
 * - 翌日DayNote自動生成・carriedFromDate 保持・title コピー
 *
 * [edge_cases.md §4.3/§4.4] のケースを含む。
 */

import { describe, expect, it } from 'vitest';
import type { TodoItem } from 'shared-types';
import { createSequentialIdFactory } from '../../src/id.js';
import {
  CarryOverValidationError,
  planCarryOver,
  type PlanCarryOverInput,
} from '../../src/usecases/carryOver.js';

/** テスト用 TodoItem を生成。デフォルトは未完了（status='todo'）。 */
function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'todo_1',
    dayNoteId: 'dn_1',
    title: '田中さん確認',
    status: 'todo',
    order: 0,
    sourceNoteLineMetaId: null,
    carriedFromTodoId: null,
    carriedFromDate: null,
    createdAt: '2026-07-08T00:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

/** planCarryOver への入力を組み立てるヘルパー（デフォルト値付き）。 */
function makeInput(overrides: Partial<PlanCarryOverInput> = {}): PlanCarryOverInput {
  return {
    sourceTodos: [],
    sourceDate: '2026-07-08',
    alreadyCarriedSourceIds: new Set<string>(),
    idGenerator: createSequentialIdFactory(['new_1', 'new_2', 'new_3']),
    ...overrides,
  };
}

describe('planCarryOver', () => {
  describe('未完了TODO（status=todo）', () => {
    it('carry として計画され、source の title をコピーした新規TODO入力値を構築', () => {
      const todo = makeTodo({ id: 'todo_1', title: '田中さん確認' });
      const result = planCarryOver(makeInput({ sourceTodos: [todo] }));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'carry',
        source: todo,
        newTodoId: 'new_1',
        title: '田中さん確認',
        carriedFromDate: '2026-07-08',
      });
    });

    it('carriedFromDate に sourceDate を設定する', () => {
      const todo = makeTodo({ id: 'todo_1' });
      const result = planCarryOver(makeInput({ sourceTodos: [todo], sourceDate: '2026-12-31' }));

      expect(result[0]?.kind).toBe('carry');
      if (result[0]?.kind === 'carry') {
        expect(result[0].carriedFromDate).toBe('2026-12-31');
      }
    });

    it('新規TODO id を idGenerator から順に採番する', () => {
      const todos = [makeTodo({ id: 'a', title: 'A' }), makeTodo({ id: 'b', title: 'B' })];
      const result = planCarryOver(makeInput({ sourceTodos: todos }));

      expect(result.map((r) => (r.kind === 'carry' ? r.newTodoId : null))).toEqual([
        'new_1',
        'new_2',
      ]);
    });

    it('source 自身の carriedFromTodoId/carriedFromDate が設定されていても status=todo なら carry', () => {
      // 別日から持ち越されてきたTODOを、さらに翌日へ持ち越す操作はMVPでは想定しないが、
      // status=todo で重複無しなら純粋関数としては carry と判定する。
      const todo = makeTodo({
        id: 'todo_1',
        status: 'todo',
        carriedFromTodoId: 'orig_1',
        carriedFromDate: '2026-07-07',
      });
      const result = planCarryOver(makeInput({ sourceTodos: [todo] }));

      expect(result[0]?.kind).toBe('carry');
    });
  });

  describe('完了TODO（status=done）', () => {
    it('CarryOverValidationError を投げる（[api_contract.md §10 step3]）', () => {
      const done = makeTodo({ id: 'done_1', status: 'done', completedAt: '2026-07-08T01:00:00Z' });
      expect(() => planCarryOver(makeInput({ sourceTodos: [done] }))).toThrow(
        CarryOverValidationError,
      );
    });

    it('エラーが invalidTodoId と status を保持する', () => {
      const done = makeTodo({ id: 'done_x', status: 'done' });
      try {
        planCarryOver(makeInput({ sourceTodos: [done] }));
        throw new Error('should not reach');
      } catch (err) {
        expect(err).toBeInstanceOf(CarryOverValidationError);
        const e = err as CarryOverValidationError;
        expect(e.invalidTodoId).toBe('done_x');
        expect(e.status).toBe('done');
      }
    });
  });

  describe('持ち越し済みTODO（status=carried）', () => {
    it('重複先ありの場合は skip（DUPLICATE_CARRYOVER）', () => {
      // [edge_cases.md §4.4]: 翌日に carriedFromTodoId の重複がある carried TODO
      const carried = makeTodo({ id: 'carried_1', status: 'carried' });
      const result = planCarryOver(
        makeInput({
          sourceTodos: [carried],
          alreadyCarriedSourceIds: new Set(['carried_1']),
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'skip',
        source: carried,
        reason: 'DUPLICATE_CARRYOVER',
      });
    });

    it('重複先なし（データ不整合）の carried は CarryOverValidationError', () => {
      // [edge_cases.md §4.4]: 重複先が存在しない carried = データ不整合
      const carried = makeTodo({ id: 'carried_orphan', status: 'carried' });
      expect(() => planCarryOver(makeInput({ sourceTodos: [carried] }))).toThrow(
        CarryOverValidationError,
      );
    });
  });

  describe('重複スキップ判定（[edge_cases.md §4.3]）', () => {
    it('既に翌日に carriedFromTodoId で作成済みの TODO は skip', () => {
      const todo = makeTodo({ id: 'todo_dup', status: 'todo' });
      const result = planCarryOver(
        makeInput({
          sourceTodos: [todo],
          alreadyCarriedSourceIds: new Set(['todo_dup']),
        }),
      );

      expect(result[0]).toEqual({
        kind: 'skip',
        source: todo,
        reason: 'DUPLICATE_CARRYOVER',
      });
    });

    it('skip の場合 idGenerator は消費しない', () => {
      const factory = createSequentialIdFactory(['new_1']);
      const todo = makeTodo({ id: 'todo_dup', status: 'todo' });
      const result = planCarryOver(
        makeInput({
          sourceTodos: [todo],
          alreadyCarriedSourceIds: new Set(['todo_dup']),
          idGenerator: factory,
        }),
      );

      expect(result[0]?.kind).toBe('skip');
      // factory は1つも消費されていない（次に new_1 を返せるはず）
      expect(factory()).toBe('new_1');
    });
  });

  describe('混在ケース（部分成功）', () => {
    it('未完了・重複・未完了の順で混在しても各々正しく判定される', () => {
      const t1 = makeTodo({ id: 't1', title: '未完了1', order: 0 });
      const t2 = makeTodo({ id: 't2', title: '重複', order: 1 });
      const t3 = makeTodo({ id: 't3', title: '未完了2', order: 2 });

      const result = planCarryOver(
        makeInput({
          sourceTodos: [t1, t2, t3],
          alreadyCarriedSourceIds: new Set(['t2']),
        }),
      );

      expect(result).toHaveLength(3);
      expect(result[0]?.kind).toBe('carry');
      expect(result[1]?.kind).toBe('skip');
      expect(result[2]?.kind).toBe('carry');

      // carry 2件で idGenerator を2消費
      expect((result[0] as { newTodoId: string }).newTodoId).toBe('new_1');
      expect((result[2] as { newTodoId: string }).newTodoId).toBe('new_2');
    });

    it('一部に done が含まれる場合は全体がエラー（部分成功の対象外）', () => {
      const t1 = makeTodo({ id: 't1', status: 'todo' });
      const t2 = makeTodo({ id: 't2', status: 'done' });

      expect(() => planCarryOver(makeInput({ sourceTodos: [t1, t2] }))).toThrow(
        CarryOverValidationError,
      );
    });
  });

  describe('空入力', () => {
    it('sourceTodos が空配列の場合は空の計画を返す', () => {
      const result = planCarryOver(makeInput({ sourceTodos: [] }));
      expect(result).toEqual([]);
    });
  });
});

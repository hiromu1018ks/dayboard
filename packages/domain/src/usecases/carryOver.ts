/**
 * 持ち越しユースケース（[roadmap.md T-6-01]）
 *
 * ドメイン層はピュアTS（副作用なし、[architecture.md §4]）。ここでは
 * 「持ち越し対象の選別・スキップ判定・新規TODO入力値の構築」のみを行う。
 * 実際の DB 書き込み（トランザクション編成）は API 層の route が担う。
 *
 * 仕様（[api_contract.md §10]、要件 7.10、[edge_cases.md §4.3/§4.4]）:
 * - 各 sourceTodo について「既に翌日に carriedFromTodoId で作成されたTODOがあるか」を判定
 * - 重複あり → skip（DUPLICATE_CARRYOVER）。元TODOが carried でも todo でも問わず skip
 * - 重複なし & status='todo' → carry（title コピー、carriedFromDate=sourceDate）
 * - 重複なし & status!='todo'（done / carried）→ エラーを投げる（呼出元で VALIDATION_ERROR）
 *
 * スナップショットコピー（[edge_cases.md §3.3]）:
 * 持ち越しは title のスナップショットコピー。翌日側で編集しても前日側には反映されない。
 */

import type { TodoItem } from 'shared-types';

/**
 * 持ち越し不可エラー。
 *
 * [api_contract.md §10 step3]: done または carried（重複先なし）のTODOを
 * 持ち越し対象に含めた場合に投げる。呼出元は VALIDATION_ERROR (400) へ変換する。
 */
export class CarryOverValidationError extends Error {
  readonly invalidTodoId: string;
  readonly status: TodoItem['status'];

  constructor(todoId: string, status: TodoItem['status']) {
    super(`持ち越し不可なステータス: id=${todoId}, status=${status}`);
    this.name = 'CarryOverValidationError';
    this.invalidTodoId = todoId;
    this.status = status;
  }
}

/**
 * 持ち越し計画の各項目。
 *
 * - `carry`: 翌日に新規TODOを作成し、元TODOを carried 化する対象
 * - `skip`:  既に翌日に持ち越されているためスキップ（DUPLICATE_CARRYOVER）
 */
export type CarryPlanItem =
  | {
      kind: 'carry';
      /** 持ち越し元TODO */
      source: TodoItem;
      /** 翌日に作成する新規TODOのid（idGenerator で生成） */
      newTodoId: string;
      /** 新規TODOのタイトル（source.title のコピー、[edge_cases.md §3.3] スナップショット） */
      title: string;
      /**
       * 持ち越し元DayNoteの日付スナップショット（YYYY-MM-DD）。
       * [database_schema.md §3.3]: 元TODO削除後も「M/Dから持ち越し」表示を維持するため。
       */
      carriedFromDate: string;
    }
  | {
      kind: 'skip';
      /** スキップ対象の元TODO */
      source: TodoItem;
      reason: 'DUPLICATE_CARRYOVER';
    };

/** planCarryOver の入力 */
export type PlanCarryOverInput = {
  /** 持ち越し対象候補のTODO群（呼出元で :date に属することを検証済み） */
  sourceTodos: TodoItem[];
  /** 持ち越し元日付（YYYY-MM-DD）。carriedFromDate スナップショットに用いる */
  sourceDate: string;
  /**
   * 既に翌日に carriedFromTodoId で作成済みの sourceTodo id セット。
   * 呼出元が `findByCarriedFrom` の結果から構築する。
   * これに含まれる TODO は重複として skip される。
   */
  alreadyCarriedSourceIds: Set<string>;
  /** 新規TODO id の生成関数（テストで固定化可能、[test_strategy.md §7]） */
  idGenerator: () => string;
};

/**
 * 持ち越し計画を作成する（純粋関数）。
 *
 * 入力の sourceTodos を各々 carry / skip に分類し、carry の場合は新規TODOの
 * 入力値（id, title, carriedFromDate）を構築する。DB 副作用は持たない。
 *
 * @throws {CarryOverValidationError} 重複なし & status!='todo' のTODOが含まれる場合
 */
export function planCarryOver(input: PlanCarryOverInput): CarryPlanItem[] {
  const { sourceTodos, sourceDate, alreadyCarriedSourceIds, idGenerator } = input;

  return sourceTodos.map((source) => {
    // 重複チェック（[api_contract.md §10 step2]、[edge_cases.md §4.3/§4.4]）
    // 元TODOが carried でも todo でも、既に翌日に持ち越されていれば skip。
    if (alreadyCarriedSourceIds.has(source.id)) {
      return {
        kind: 'skip',
        source,
        reason: 'DUPLICATE_CARRYOVER',
      } satisfies CarryPlanItem;
    }

    // 重複なしの場合は status 検証（[api_contract.md §10 step3]）
    // done / carried（重複先なし = データ不整合）は持ち越し不可。
    if (source.status !== 'todo') {
      throw new CarryOverValidationError(source.id, source.status);
    }

    // carry: title のスナップショットコピー、carriedFromDate に sourceDate を設定
    return {
      kind: 'carry',
      source,
      newTodoId: idGenerator(),
      title: source.title,
      carriedFromDate: sourceDate,
    } satisfies CarryPlanItem;
  });
}

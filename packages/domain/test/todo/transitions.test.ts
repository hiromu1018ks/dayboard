/**
 * TODO 状態遷移の Unit テスト（[roadmap.md T-3-02]）
 *
 * [database_schema.md §3.3] の全遷移パスと違反遷移を網羅する。
 * [edge_cases.md §3.1] の carried 操作違反を含む。
 *
 * [database_schema.md §3.3]: ../../../docs/database_schema.md
 * [edge_cases.md §3.1]: ../../../docs/edge_cases.md
 */

import { describe, expect, it } from 'vitest';
import type { TodoStatus } from 'shared-types';
import { canTransition, shouldSetCompletedAt, toggleDone } from '../../src/todo/transitions.js';

const ALL_STATUSES: TodoStatus[] = ['todo', 'done', 'carried'];

describe('canTransition: 許可される遷移', () => {
  it('todo → done（完了操作、AC-09）', () => {
    expect(canTransition('todo', 'done')).toBe(true);
  });
  it('done → todo（完了解除、AC-09）', () => {
    expect(canTransition('done', 'todo')).toBe(true);
  });
  it('todo → carried（持ち越し操作、不可逆）', () => {
    expect(canTransition('todo', 'carried')).toBe(true);
  });
});

describe('canTransition: 禁止される遷移（INVALID_TRANSITION）', () => {
  it('done → carried（完了状態からの持ち越しは禁止）', () => {
    expect(canTransition('done', 'carried')).toBe(false);
  });
  it('carried → todo（持ち越し済みからの完了解除は禁止、不可逆）', () => {
    expect(canTransition('carried', 'todo')).toBe(false);
  });
  it('carried → done（持ち越し済みからの完了操作は禁止、不可逆）', () => {
    expect(canTransition('carried', 'done')).toBe(false);
  });
});

describe('canTransition: 同一状態（自己遷移）', () => {
  // 同一状態への遷移は「変更なし」。PATCH リクエストで同一 status を送っても
  // 遷移違反にはならない（冪等な操作）。ただし API 層では現状維持扱い。
  for (const s of ALL_STATUSES) {
    it(`${s} → ${s} は許可（自己遷移）`, () => {
      expect(canTransition(s, s)).toBe(true);
    });
  }
});

describe('canTransition: 3x3 全組合せの整合性', () => {
  // 期待表: [from][to] → boolean。true は許可、false は INVALID_TRANSITION。
  const expected: Record<TodoStatus, Record<TodoStatus, boolean>> = {
    todo: { todo: true, done: true, carried: true },
    done: { todo: true, done: true, carried: false },
    carried: { todo: false, done: false, carried: true },
  };

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      it(`${from} → ${to} は ${expected[from][to] ? '許可' : '禁止'}`, () => {
        expect(canTransition(from, to)).toBe(expected[from][to]);
      });
    }
  }
});

describe('toggleDone: 完了トグル（要件 7.3、AC-09）', () => {
  it('todo → done', () => {
    expect(toggleDone('todo')).toBe('done');
  });
  it('done → todo', () => {
    expect(toggleDone('done')).toBe('todo');
  });
  it('carried → carried（完了操作は不可、そのまま返す）', () => {
    // 呼び出し元は canTransition('carried', 'done') === false で INVALID_TRANSITION 判定する想定
    expect(toggleDone('carried')).toBe('carried');
  });
});

describe('toggleDone + canTransition の併用（edge_cases.md §3.1）', () => {
  // carried のTODOに対する完了操作は INVALID_TRANSITION となることを確認する統合パス。
  // 完了操作の意図する遷移先は done。carried → done は禁止されている。
  it('carried のTODOを完了操作しようとすると遷移不可（edge_cases §3.1）', () => {
    const current: TodoStatus = 'carried';
    const intended: TodoStatus = 'done'; // 完了操作の意図する遷移先
    expect(canTransition(current, intended)).toBe(false);
  });
});

describe('shouldSetCompletedAt: completedAt 設定判定（[database_schema.md §3.3]）', () => {
  it('todo → done のとき true', () => {
    expect(shouldSetCompletedAt('todo', 'done')).toBe(true);
  });
  it('done → todo のとき false（completedAt を NULL にするが設定判定は false）', () => {
    expect(shouldSetCompletedAt('done', 'todo')).toBe(false);
  });
  it('todo → carried のとき false', () => {
    expect(shouldSetCompletedAt('todo', 'carried')).toBe(false);
  });
  it('carried → * は遷移不可だが、設定判定も false', () => {
    expect(shouldSetCompletedAt('carried', 'todo')).toBe(false);
    expect(shouldSetCompletedAt('carried', 'done')).toBe(false);
  });
  it('自己遷移（todo→todo / done→done）は false', () => {
    expect(shouldSetCompletedAt('todo', 'todo')).toBe(false);
    expect(shouldSetCompletedAt('done', 'done')).toBe(false);
  });
});

/**
 * デバウンス管理ロジックの Unit テスト（[roadmap.md T-2-04]）
 *
 * [autosave_spec.md §3] のデバウンス値と計算ロジックを検証する。
 * タイマー副作用そのものは useAutosave のテストで扱う。
 *
 * [autosave_spec.md §3]: ../../../docs/autosave_spec.md
 */

import { describe, expect, it } from 'vitest';
import {
  DEBOUNCE_MS,
  isTimerActive,
  isSameTarget,
  shouldFire,
} from '../../src/autosave/debounce.js';

describe('DEBOUNCE_MS', () => {
  it('800ms である（[autosave_spec.md §3.1]）', () => {
    expect(DEBOUNCE_MS).toBe(800);
  });
});

describe('isTimerActive', () => {
  it('ハンドルが非 nullish なら true', () => {
    expect(isTimerActive(123)).toBe(true);
    expect(isTimerActive({})).toBe(true);
    expect(isTimerActive(0)).toBe(true); // 0 は falsy だが非 nullish → 実行中
    expect(isTimerActive('')).toBe(true); // 空文字も非 nullish → 実行中
  });

  it('ハンドルが null/undefined なら false', () => {
    expect(isTimerActive(null)).toBe(false);
    expect(isTimerActive(undefined)).toBe(false);
  });
});

describe('isSameTarget', () => {
  it('同じ対象キーなら true', () => {
    expect(isSameTarget('dayNote:theme', 'dayNote:theme')).toBe(true);
    expect(isSameTarget('noteEntry', 'noteEntry')).toBe(true);
    expect(isSameTarget('todo:todo_1', 'todo:todo_1')).toBe(true);
  });

  it('異なる対象キーなら false', () => {
    expect(isSameTarget('dayNote:theme', 'dayNote:lastOpenedMode')).toBe(false);
    expect(isSameTarget('todo:todo_1', 'todo:todo_2')).toBe(false);
    expect(isSameTarget('noteEntry', 'reflection')).toBe(false);
  });
});

describe('shouldFire', () => {
  it('最終編集から800ms経過で発火', () => {
    expect(shouldFire(1000, 1800)).toBe(true);
    expect(shouldFire(1000, 1801)).toBe(true);
  });

  it('800ms未満は発火しない', () => {
    expect(shouldFire(1000, 1799)).toBe(false);
    expect(shouldFire(1000, 1500)).toBe(false);
    expect(shouldFire(1000, 1000)).toBe(false);
  });

  it('ちょうど800msで発火（境界値）', () => {
    expect(shouldFire(1000, 1800)).toBe(true);
  });

  it('同じ時刻、または過去の時刻（now < lastEdit）は発火しない', () => {
    expect(shouldFire(1000, 999)).toBe(false);
    expect(shouldFire(1000, 500)).toBe(false);
  });
});

/**
 * 自動保存 FSM の Unit テスト（[roadmap.md T-2-04]）
 *
 * [autosave_spec.md §5.2] の状態遷移表の全パスと、
 * 集約ステータス（aggregateStatus）の優先順位を網羅する。
 *
 * [autosave_spec.md §5]: ../../../docs/autosave_spec.md
 */

import { describe, expect, it } from 'vitest';
import {
  type SaveStatus,
  transition,
  aggregateStatus,
} from '../../src/autosave/saveStateMachine.js';

const ALL_STATES: SaveStatus[] = ['idle', 'saving', 'saved', 'error'];

describe('transition: EDIT（編集開始）', () => {
  // 任意状態からの編集開始は `idle`（タイマー開始/再開）
  for (const state of ALL_STATES) {
    it(`${state} + EDIT → idle`, () => {
      expect(transition(state, { type: 'EDIT' })).toBe('idle');
    });
  }
});

describe('transition: TIMER_FIRE（タイマー発火）', () => {
  it('idle + TIMER_FIRE → saving', () => {
    expect(transition('idle', { type: 'TIMER_FIRE' })).toBe('saving');
  });
  it('saving + TIMER_FIRE → saving（無視）', () => {
    expect(transition('saving', { type: 'TIMER_FIRE' })).toBe('saving');
  });
  it('saved + TIMER_FIRE → saved（無視）', () => {
    expect(transition('saved', { type: 'TIMER_FIRE' })).toBe('saved');
  });
  it('error + TIMER_FIRE → error（無視）', () => {
    expect(transition('error', { type: 'TIMER_FIRE' })).toBe('error');
  });
});

describe('transition: SAVE_SUCCESS（保存成功）', () => {
  it('saving + SAVE_SUCCESS → saved', () => {
    expect(transition('saving', { type: 'SAVE_SUCCESS' })).toBe('saved');
  });
  it('idle + SAVE_SUCCESS → idle（無視。保存中でなければ成功は来ない）', () => {
    expect(transition('idle', { type: 'SAVE_SUCCESS' })).toBe('idle');
  });
  it('saved + SAVE_SUCCESS → saved（無視）', () => {
    expect(transition('saved', { type: 'SAVE_SUCCESS' })).toBe('saved');
  });
  it('error + SAVE_SUCCESS → error（SAVE_SUCCESS ではなく RETRY_SUCCESS を使うべき）', () => {
    expect(transition('error', { type: 'SAVE_SUCCESS' })).toBe('error');
  });
});

describe('transition: RETRY_FIRE（リトライ再実行開始）', () => {
  it('error + RETRY_FIRE → saving', () => {
    expect(transition('error', { type: 'RETRY_FIRE' })).toBe('saving');
  });
  it('idle + RETRY_FIRE → idle（無視。デバウンス中は TIMER_FIRE を使う）', () => {
    expect(transition('idle', { type: 'RETRY_FIRE' })).toBe('idle');
  });
  it('saving + RETRY_FIRE → saving（無視。既に保存中）', () => {
    expect(transition('saving', { type: 'RETRY_FIRE' })).toBe('saving');
  });
  it('saved + RETRY_FIRE → saved（無視）', () => {
    expect(transition('saved', { type: 'RETRY_FIRE' })).toBe('saved');
  });
});

describe('transition: SAVE_FAILURE（保存失敗）', () => {
  it('saving + SAVE_FAILURE → error', () => {
    expect(transition('saving', { type: 'SAVE_FAILURE' })).toBe('error');
  });
  it('idle + SAVE_FAILURE → idle（無視）', () => {
    expect(transition('idle', { type: 'SAVE_FAILURE' })).toBe('idle');
  });
  it('saved + SAVE_FAILURE → saved（無視）', () => {
    expect(transition('saved', { type: 'SAVE_FAILURE' })).toBe('saved');
  });
});

describe('transition: RETRY_EXHAUSTED（リトライ上限到達）', () => {
  it('error + RETRY_EXHAUSTED → error（そのまま）', () => {
    expect(transition('error', { type: 'RETRY_EXHAUSTED' })).toBe('error');
  });
  it('idle + RETRY_EXHAUSTED → idle（無視）', () => {
    expect(transition('idle', { type: 'RETRY_EXHAUSTED' })).toBe('idle');
  });
  it('saving + RETRY_EXHAUSTED → saving（無視）', () => {
    expect(transition('saving', { type: 'RETRY_EXHAUSTED' })).toBe('saving');
  });
});

describe('transition: 代表的な連続遷移パス（§5.2 実シナリオ）', () => {
  it('編集→発火→成功（idle→saving→saved、AC-13）', () => {
    let s: SaveStatus = 'saved';
    s = transition(s, { type: 'EDIT' });
    expect(s).toBe('idle');
    s = transition(s, { type: 'TIMER_FIRE' });
    expect(s).toBe('saving');
    s = transition(s, { type: 'SAVE_SUCCESS' });
    expect(s).toBe('saved');
  });

  it('編集→発火→失敗→リトライ再実行→成功（idle→saving→error→saving→saved、AC-14）', () => {
    let s: SaveStatus = 'saved';
    s = transition(s, { type: 'EDIT' });
    s = transition(s, { type: 'TIMER_FIRE' });
    s = transition(s, { type: 'SAVE_FAILURE' });
    expect(s).toBe('error');
    // リトライ再実行開始: error → saving
    s = transition(s, { type: 'RETRY_FIRE' });
    expect(s).toBe('saving');
    // リトライ成功: saving → saved（初回成功と同じ SAVE_SUCCESS）
    s = transition(s, { type: 'SAVE_SUCCESS' });
    expect(s).toBe('saved');
  });

  it('編集→発火→失敗→リトライ再実行→再失敗（error のまま）', () => {
    let s: SaveStatus = 'saved';
    s = transition(s, { type: 'EDIT' });
    s = transition(s, { type: 'TIMER_FIRE' });
    s = transition(s, { type: 'SAVE_FAILURE' });
    s = transition(s, { type: 'RETRY_FIRE' });
    expect(s).toBe('saving');
    s = transition(s, { type: 'SAVE_FAILURE' });
    expect(s).toBe('error');
  });

  it('編集→発火→失敗→リトライ上限到達（error のまま、手動復旧へ）', () => {
    let s: SaveStatus = 'saved';
    s = transition(s, { type: 'EDIT' });
    s = transition(s, { type: 'TIMER_FIRE' });
    s = transition(s, { type: 'SAVE_FAILURE' });
    s = transition(s, { type: 'RETRY_EXHAUSTED' });
    expect(s).toBe('error');
  });

  it('savedから再編集開始で idle に戻る（saved→idle）', () => {
    let s: SaveStatus = 'saved';
    s = transition(s, { type: 'EDIT' });
    expect(s).toBe('idle');
  });

  it('error状態から編集再開で idle へ（新規デバウンス開始）', () => {
    let s: SaveStatus = 'error';
    s = transition(s, { type: 'EDIT' });
    expect(s).toBe('idle');
  });
});

describe('aggregateStatus（集約ステータス）', () => {
  it('空配列 → saved（保存対象なし）', () => {
    expect(aggregateStatus([])).toBe('saved');
  });

  it('全 saved → saved', () => {
    expect(aggregateStatus(['saved', 'saved', 'saved'])).toBe('saved');
  });

  it('error が1つでも含まれれば error を優先（§5.2 備考）', () => {
    expect(aggregateStatus(['saved', 'error', 'saving'])).toBe('error');
    expect(aggregateStatus(['idle', 'error'])).toBe('error');
    expect(aggregateStatus(['error'])).toBe('error');
  });

  it('error がなく saving があれば saving', () => {
    expect(aggregateStatus(['saved', 'saving'])).toBe('saving');
    expect(aggregateStatus(['idle', 'saving'])).toBe('saving');
  });

  it('error/saving がなく idle があれば idle', () => {
    expect(aggregateStatus(['saved', 'idle'])).toBe('idle');
    expect(aggregateStatus(['idle'])).toBe('idle');
  });

  it('優先順位: error > saving > idle > saved', () => {
    expect(aggregateStatus(['error', 'saving', 'idle', 'saved'])).toBe('error');
    expect(aggregateStatus(['saving', 'idle', 'saved'])).toBe('saving');
    expect(aggregateStatus(['idle', 'saved'])).toBe('idle');
    expect(aggregateStatus(['saved'])).toBe('saved');
  });
});

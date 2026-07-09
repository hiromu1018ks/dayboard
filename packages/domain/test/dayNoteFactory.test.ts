/**
 * dayNoteFactory（純粋関数）の Unit テスト
 */

import { describe, expect, it } from 'vitest';
import { createSequentialIdFactory } from '../src/id.js';
import {
  buildNewDayNoteInput,
  buildNewNoteEntryInput,
  buildNewReflectionInput,
  normalizeTheme,
} from '../src/usecases/dayNoteFactory.js';

describe('buildNewDayNoteInput', () => {
  it('指定日付・デフォルト値（theme=null, lastOpenedMode=work）で入力値を構築', () => {
    const factory = createSequentialIdFactory(['dn_1']);
    const input = buildNewDayNoteInput('2026-07-08', factory);
    expect(input).toEqual({
      id: 'dn_1',
      date: '2026-07-08',
      theme: null,
      lastOpenedMode: 'work',
    });
  });

  it('idGenerator から ID を取得する', () => {
    const factory = createSequentialIdFactory(['abc']);
    expect(buildNewDayNoteInput('2026-01-01', factory).id).toBe('abc');
  });
});

describe('buildNewReflectionInput', () => {
  it('空文字3セクションで入力値を構築', () => {
    const factory = createSequentialIdFactory(['rf_1']);
    const input = buildNewReflectionInput('dn_1', factory);
    expect(input).toEqual({
      id: 'rf_1',
      dayNoteId: 'dn_1',
      doneText: '',
      stuckText: '',
      tomorrowActionText: '',
    });
  });
});

describe('buildNewNoteEntryInput', () => {
  it('body 空文字で入力値を構築', () => {
    const factory = createSequentialIdFactory(['ne_1']);
    const input = buildNewNoteEntryInput('dn_1', factory);
    expect(input).toEqual({
      id: 'ne_1',
      dayNoteId: 'dn_1',
      body: '',
    });
  });
});

describe('normalizeTheme', () => {
  it('空文字列は null に正規化', () => {
    expect(normalizeTheme('')).toBeNull();
  });

  it('null は null のまま', () => {
    expect(normalizeTheme(null)).toBeNull();
  });

  it('undefined は null に正規化', () => {
    expect(normalizeTheme(undefined)).toBeNull();
  });

  it('空でない文字列はそのまま返す', () => {
    expect(normalizeTheme('A社提案を前に進める')).toBe('A社提案を前に進める');
    expect(normalizeTheme('テーマ')).toBe('テーマ');
  });

  it('空白のみの文字列はそのまま返す（trim はしない）', () => {
    // normalizeTheme は空文字→null のみを担い、trim は別層の責務
    expect(normalizeTheme('  ')).toBe('  ');
  });
});

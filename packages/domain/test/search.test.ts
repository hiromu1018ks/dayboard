/**
 * 検索ヘルパーの Unit テスト
 *
 * escapeForIlike / decorateSnippet / highlightSnippet の純粋関数を検証する。
 */

import { describe, expect, it } from 'vitest';
import { decorateSnippet, escapeForIlike, highlightSnippet } from '../src/search.js';

describe('escapeForIlike', () => {
  it('特殊文字を含まない場合はそのまま返す', () => {
    expect(escapeForIlike('hello')).toBe('hello');
    expect(escapeForIlike('顧客デモ')).toBe('顧客デモ');
  });

  it('% をエスケープする', () => {
    expect(escapeForIlike('50%')).toBe('50\\%');
    expect(escapeForIlike('%complete')).toBe('\\%complete');
  });

  it('_ をエスケープする', () => {
    expect(escapeForIlike('user_id')).toBe('user\\_id');
    expect(escapeForIlike('_init')).toBe('\\_init');
  });

  it('\\ をエスケープする', () => {
    expect(escapeForIlike('C:\\Users')).toBe('C:\\\\Users');
    expect(escapeForIlike('a\\b')).toBe('a\\\\b');
  });

  it('複数の特殊文字が混在する場合', () => {
    expect(escapeForIlike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('空文字はそのまま', () => {
    expect(escapeForIlike('')).toBe('');
  });
});

describe('decorateSnippet', () => {
  it('前後とも途切れていない場合は装飾なし', () => {
    expect(decorateSnippet('全文が表示されている', false, false)).toBe('全文が表示されている');
  });

  it('前だけ途切れている場合 → 先頭に …', () => {
    expect(decorateSnippet('後ろの文脈', true, false)).toBe('…後ろの文脈');
  });

  it('後ろだけ途切れている場合 → 末尾に …', () => {
    expect(decorateSnippet('前の文脈', false, true)).toBe('前の文脈…');
  });

  it('前後とも途切れている場合 → 両側に …', () => {
    expect(decorateSnippet('中間の文脈', true, true)).toBe('…中間の文脈…');
  });
});

describe('highlightSnippet', () => {
  it('クエリが空の場合は全体を1セグメント（非ヒット）で返す', () => {
    const result = highlightSnippet('hello world', '');
    expect(result).toEqual([{ text: 'hello world', isHit: false }]);
  });

  it('ヒット箇所を3セグメントに分割する（前 / ヒット / 後）', () => {
    const result = highlightSnippet('hello world foo', 'world');
    expect(result).toEqual([
      { text: 'hello ', isHit: false },
      { text: 'world', isHit: true },
      { text: ' foo', isHit: false },
    ]);
  });

  it('大小区別しない（ILIKE と整合）', () => {
    const result = highlightSnippet('Hello WORLD', 'world');
    expect(result).toEqual([
      { text: 'Hello ', isHit: false },
      { text: 'WORLD', isHit: true },
    ]);
  });

  it('スニペット先頭でヒットする場合', () => {
    const result = highlightSnippet('world hello', 'world');
    expect(result).toEqual([
      { text: 'world', isHit: true },
      { text: ' hello', isHit: false },
    ]);
  });

  it('スニペット末尾でヒットする場合', () => {
    const result = highlightSnippet('hello world', 'world');
    expect(result).toEqual([
      { text: 'hello ', isHit: false },
      { text: 'world', isHit: true },
    ]);
  });

  it('クエリが見つからない場合は全体を1セグメント（非ヒット）で返す', () => {
    const result = highlightSnippet('hello world', 'foo');
    expect(result).toEqual([{ text: 'hello world', isHit: false }]);
  });

  it('複数回ヒットする場合', () => {
    const result = highlightSnippet('foo bar foo', 'foo');
    expect(result).toEqual([
      { text: 'foo', isHit: true },
      { text: ' bar ', isHit: false },
      { text: 'foo', isHit: true },
    ]);
  });

  it('日本語のヒット', () => {
    const result = highlightSnippet('顧客デモを完成させる', 'デモ');
    expect(result).toEqual([
      { text: '顧客', isHit: false },
      { text: 'デモ', isHit: true },
      { text: 'を完成させる', isHit: false },
    ]);
  });
});

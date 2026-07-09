/**
 * ID 生成ユーティリティの Unit テスト
 */

import { describe, expect, it } from 'vitest';
import { createId, createSequentialIdFactory } from '../src/id.js';

describe('createId', () => {
  it('UUID v4 形式の文字列を返す', () => {
    const id = createId();
    // UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y は 8/9/a/b)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('呼び出しごとに異なる ID を生成する', () => {
    const id1 = createId();
    const id2 = createId();
    const id3 = createId();
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('36文字（ハイフン含む）の長さ', () => {
    expect(createId()).toHaveLength(36);
  });
});

describe('createSequentialIdFactory', () => {
  it('渡した ID リストを順に返す', () => {
    const factory = createSequentialIdFactory(['dn_1', 'rf_1', 'ne_1']);
    expect(factory()).toBe('dn_1');
    expect(factory()).toBe('rf_1');
    expect(factory()).toBe('ne_1');
  });

  it('リストを使い果たすと例外を投げる', () => {
    const factory = createSequentialIdFactory(['only_one']);
    expect(factory()).toBe('only_one');
    expect(() => factory()).toThrow(/exhausted/);
  });

  it('空リストの場合は最初の呼び出しで例外', () => {
    const factory = createSequentialIdFactory([]);
    expect(() => factory()).toThrow(/exhausted/);
  });

  it('複数の独立したファクトリが干渉しない', () => {
    const factoryA = createSequentialIdFactory(['a1', 'a2']);
    const factoryB = createSequentialIdFactory(['b1', 'b2']);
    expect(factoryA()).toBe('a1');
    expect(factoryB()).toBe('b1');
    expect(factoryA()).toBe('a2');
    expect(factoryB()).toBe('b2');
  });
});

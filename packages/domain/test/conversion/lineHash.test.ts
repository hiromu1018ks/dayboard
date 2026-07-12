/**
 * computeLineHash の Unit テスト（[roadmap.md T-5-04]）
 *
 * [note_conversion_spec.md §5] の仕様を検証。
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { computeLineHash } from '../../src/conversion/lineHash.js';

describe('computeLineHash', () => {
  describe('§5.1 基本仕様', () => {
    it('同一入力で同じハッシュを返す（決定論的）', () => {
      const a = computeLineHash('ne_001', '見積作成');
      const b = computeLineHash('ne_001', '見積作成');
      expect(a).toBe(b);
    });

    it('16文字のhex文字列を返す', () => {
      const hash = computeLineHash('ne_001', '見積作成');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(hash.length).toBe(16);
    });

    it('異なる noteEntryId で別ハッシュになる（[§5.1]）', () => {
      const a = computeLineHash('ne_001', '見積作成');
      const b = computeLineHash('ne_002', '見積作成');
      expect(a).not.toBe(b);
    });

    it('異なるテキストで別ハッシュになる', () => {
      const a = computeLineHash('ne_001', '見積作成');
      const b = computeLineHash('ne_001', '部長承認待ち');
      expect(a).not.toBe(b);
    });
  });

  describe('§5.2 同一性判定の範囲', () => {
    it('異なる noteEntryId の同じ行テキストは別物として扱う', () => {
      const hash1 = computeLineHash('ne_day1', '見積作成');
      const hash2 = computeLineHash('ne_day2', '見積作成');
      expect(hash1).not.toBe(hash2);
    });

    it('同じ noteEntryId + 同じテキストは同一', () => {
      const hash1 = computeLineHash('ne_001', '見積作成');
      const hash2 = computeLineHash('ne_001', '見積作成');
      expect(hash1).toBe(hash2);
    });
  });

  describe('SHA-256 の検証', () => {
    it('noteEntryId + 改行 + text のSHA-256先頭16文字と一致する', () => {
      const expected = createHash('sha256')
        .update('ne_001\n見積作成', 'utf8')
        .digest('hex')
        .slice(0, 16);
      expect(computeLineHash('ne_001', '見積作成')).toBe(expected);
    });

    it('改行区切りが使われている（単純結合ではない）', () => {
      // "ne_001" + "\n" + "text" と "ne_001\ntext" は同じだが、
      // "ne_001" + "text"（改行なし）とは異なることを確認
      const withoutNewline = createHash('sha256')
        .update('ne_001text', 'utf8')
        .digest('hex')
        .slice(0, 16);
      expect(computeLineHash('ne_001', 'text')).not.toBe(withoutNewline);
    });
  });

  describe('境界値', () => {
    it('空のテキストでもハッシュを生成する', () => {
      const hash = computeLineHash('ne_001', '');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('長いテキストでも16文字のハッシュを返す', () => {
      const hash = computeLineHash('ne_001', 'あ'.repeat(10000));
      expect(hash.length).toBe(16);
    });

    it('特殊文字を含むテキスト', () => {
      const hash = computeLineHash('ne_001', '- TODO化：見積作成\t\n');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});

/**
 * extractTitle の Unit テスト（[roadmap.md T-5-04]）
 *
 * [note_conversion_spec.md §4.2/§4.3] の適用例と除去対象外例を全て網羅。
 * [edge_cases.md §5.2/§5.3/§5.4] の境界値ケースを含む。
 * **最も重点的なUnitテスト対象**（[test_strategy.md §3.5]）。
 */

import { describe, expect, it } from 'vitest';
import { extractTitle, TITLE_MAX_LENGTH } from '../../src/conversion/extractTitle.js';

describe('extractTitle', () => {
  describe('§4.2 適用例', () => {
    it('- TODO化：見積作成 → 見積作成', () => {
      expect(extractTitle('- TODO化：見積作成')).toBe('見積作成');
    });

    it('・部長承認待ち → 部長承認待ち', () => {
      expect(extractTitle('・部長承認待ち')).toBe('部長承認待ち');
    });

    it('宿題：単価表を確認 → 宿題：単価表を確認（※ 「宿題：」は除去対象外）', () => {
      expect(extractTitle('宿題：単価表を確認')).toBe('宿題：単価表を確認');
    });

    it('* やること: 確認 → 確認', () => {
      expect(extractTitle('* やること: 確認')).toBe('確認');
    });

    it('1. 見積作成 → 見積作成', () => {
      expect(extractTitle('1. 見積作成')).toBe('見積作成');
    });

    it('部長承認待ち → 部長承認待ち（記号なし）', () => {
      expect(extractTitle('部長承認待ち')).toBe('部長承認待ち');
    });
  });

  describe('§4.2 空になるケース（TODO：のみ）', () => {
    it('TODO： （ラベルのみ）→ 空文字', () => {
      expect(extractTitle('TODO：')).toBe('');
    });
  });

  describe('§4.3 除去「しない」もの', () => {
    it('宿題：は汎用見出しラベルのため除去しない', () => {
      expect(extractTitle('宿題：単価表を確認')).toBe('宿題：単価表を確認');
    });

    it('決定事項：は汎用見出しラベルのため除去しない', () => {
      expect(extractTitle('決定事項：来週までに見積提出')).toBe('決定事項：来週までに見積提出');
    });

    it('確認事項：は汎用見出しラベルのため除去しない', () => {
      expect(extractTitle('確認事項：単価表')).toBe('確認事項：単価表');
    });

    it('絵文字・装飾記号（※, ★, ✔）は除去しない', () => {
      expect(extractTitle('※ 重要事項')).toBe('※ 重要事項');
      expect(extractTitle('★ 重要')).toBe('★ 重要');
    });

    it('Markdown装飾（**太字**）は先頭 * がリスト記号として除去される（[§4.1]）', () => {
      // §4.1 で * はリスト記号除去対象。先頭1文字の * が除去され、*重要なタスク** になる。
      // ※ [§4.3] の「Markdown装飾を維持」という意図は、**全体を解釈して太字化しない**という意味で、
      //    行頭 * の除去とは矛盾しない（記号除去ルールが優先される）。
      expect(extractTitle('**重要なタスク**')).toBe('*重要なタスク**');
    });
  });

  describe('行頭リスト記号バリエーション（[edge_cases.md §5.3]）', () => {
    it.each([
      ['- 見積作成', '見積作成'],
      ['• 見積作成', '見積作成'],
      ['・見積作成', '見積作成'],
      ['* 見積作成', '見積作成'],
    ])('リスト記号 %p → %p', (input, expected) => {
      expect(extractTitle(input)).toBe(expected);
    });

    it('記号直後の空白なしても除去される（・部長承認待ち）', () => {
      expect(extractTitle('・部長承認待ち')).toBe('部長承認待ち');
    });

    it('ハイフン直後に空白なし（-見積作成 → 見積作成）', () => {
      expect(extractTitle('-見積作成')).toBe('見積作成');
    });
  });

  describe('番号リストバリエーション（[edge_cases.md §5.3]）', () => {
    it.each([
      ['1. 見積作成', '見積作成'],
      ['2)確認', '確認'],
      ['10. タスク', 'タスク'],
      ['99)アイテム', 'アイテム'],
    ])('番号リスト %p → %p', (input, expected) => {
      expect(extractTitle(input)).toBe(expected);
    });

    it('番号直後の空白なし（1.見積作成 → 見積作成）', () => {
      expect(extractTitle('1.見積作成')).toBe('見積作成');
    });
  });

  describe('ラベル除去バリエーション（[§4.1]）', () => {
    it.each([
      ['TODO化：見積作成', '見積作成'],
      ['TODO: 見積作成', '見積作成'],
      ['todo: 見積作成', '見積作成'], // 小文字
      ['ＴＯＤＯ：見積作成', '見積作成'], // 全角英数字
      ['やること: 確認する', '確認する'],
      ['障害化：部長承認待ち', '部長承認待ち'],
      ['障害: A社回答待ち', 'A社回答待ち'],
      ['詰まり：仕様不明', '仕様不明'],
      ['Blocker: 待ち', '待ち'],
      ['blocker: 待ち', '待ち'], // 小文字
      ['メモ：自分メモ', '自分メモ'],
      ['メモ:内容', '内容'], // コロン直後空白なし
    ])('ラベル %p → %p', (input, expected) => {
      expect(extractTitle(input)).toBe(expected);
    });

    it('TODO化とTODOで長い方が優先されても結果は同じ', () => {
      // どちらも「見積作成」になる
      expect(extractTitle('TODO化：見積作成')).toBe('見積作成');
      expect(extractTitle('TODO：見積作成')).toBe('見積作成');
    });
  });

  describe('複合除去（記号 + ラベル）', () => {
    it('- TODO化：見積作成 → 見積作成', () => {
      expect(extractTitle('- TODO化：見積作成')).toBe('見積作成');
    });

    it('* やること: 確認 → 確認', () => {
      expect(extractTitle('* やること: 確認')).toBe('確認');
    });

    it('・ 障害：A社回答待ち → A社回答待ち', () => {
      expect(extractTitle('・ 障害：A社回答待ち')).toBe('A社回答待ち');
    });

    it('1. TODO：見積作成 → 見積作成', () => {
      expect(extractTitle('1. TODO：見積作成')).toBe('見積作成');
    });
  });

  describe('§4.4 空になるケース（VALIDATION_ERROR 対象）', () => {
    it.each([
      ['TODO：'],
      ['TODO化：'],
      ['やること：'],
      ['障害：'],
      ['障害化：'],
      ['詰まり：'],
      ['Blocker:'],
      ['メモ：'],
      ['-'], // リスト記号のみ
      ['・'], // リスト記号のみ
      ['1.'], // 番号リストのみ
      ['- TODO：'], // 記号 + ラベルのみ
      ['   '], // 空白のみ
      [''], // 空文字
    ])('空になる: %p', (input) => {
      expect(extractTitle(input)).toBe('');
    });
  });

  describe('§4.5 タイトル最大長（200文字切り詰め）', () => {
    it('200文字ちょうどは切り詰めなし', () => {
      const text = 'あ'.repeat(TITLE_MAX_LENGTH);
      expect(extractTitle(text)).toBe(text);
      expect(extractTitle(text).length).toBe(TITLE_MAX_LENGTH);
    });

    it('201文字超は先頭199文字 + …（計200文字）', () => {
      const text = 'あ'.repeat(TITLE_MAX_LENGTH + 10);
      const result = extractTitle(text);
      expect(result.length).toBe(TITLE_MAX_LENGTH);
      expect(result).toBe('あ'.repeat(TITLE_MAX_LENGTH - 1) + '…');
    });

    it('ラベル除去後に200文字超になる場合も切り詰め', () => {
      const body = 'あ'.repeat(TITLE_MAX_LENGTH + 5);
      const result = extractTitle(`TODO：${body}`);
      expect(result.length).toBe(TITLE_MAX_LENGTH);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  describe('前後空白・連続空白の正規化', () => {
    it('前後空白を trim する', () => {
      expect(extractTitle('  見積作成  ')).toBe('見積作成');
    });

    it('連続空白を圧縮する', () => {
      expect(extractTitle('見積  作成')).toBe('見積 作成');
    });

    it('全角スペースを圧縮する', () => {
      expect(extractTitle('見積　作成')).toBe('見積 作成');
    });
  });
});

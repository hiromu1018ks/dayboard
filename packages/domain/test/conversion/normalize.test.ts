/**
 * normalizeLineText の Unit テスト（[roadmap.md T-5-04]）
 *
 * [note_conversion_spec.md §3.1] の正規化例を全て網羅。
 * [edge_cases.md §5.3] の行頭記号バリエーションは extractTitle 側で検証（正規化は記号除去しない）。
 */

import { describe, expect, it } from 'vitest';
import { normalizeLineText } from '../../src/conversion/normalize.js';

describe('normalizeLineText', () => {
  describe('§3.1 適用例', () => {
    it('- 宿題：単価表を確認 → 記号は除去せずそのまま', () => {
      expect(normalizeLineText('- 宿題：単価表を確認')).toBe('- 宿題：単価表を確認');
    });

    it('前後の空白を trim する（  見積作成  → 見積作成）', () => {
      expect(normalizeLineText('  見積作成  ')).toBe('見積作成');
    });

    it('全角スペース1つを半角スペースに圧縮（見積　作成 → 見積 作成）', () => {
      expect(normalizeLineText('見積　作成')).toBe('見積 作成');
    });

    it('連続半角スペースを半角1つに圧縮（見積  作成 → 見積 作成）', () => {
      expect(normalizeLineText('見積  作成')).toBe('見積 作成');
    });

    it('部長　承認待ち（全角スペース）→ 部長 承認待ち', () => {
      expect(normalizeLineText('部長　承認待ち')).toBe('部長 承認待ち');
    });
  });

  describe('空白正規化の組み合わせ', () => {
    it('前後空白 + 連続空白の組み合わせ', () => {
      expect(normalizeLineText('   見積   作成   ')).toBe('見積 作成');
    });

    it('タブを半角スペースに圧縮', () => {
      expect(normalizeLineText('見積\t作成')).toBe('見積 作成');
    });

    it('タブ連続を半角スペース1つに圧縮', () => {
      expect(normalizeLineText('見積\t\t作成')).toBe('見積 作成');
    });

    it('全角スペース + タブ + 半角スペースの混在を圧縮', () => {
      expect(normalizeLineText('A \u3000\t B')).toBe('A B');
    });

    it('前後のタブ・全角スペースを trim', () => {
      expect(normalizeLineText('\t\u3000見積作成\u3000\t')).toBe('見積作成');
    });
  });

  describe('保持されるもの（[§3] 仕様）', () => {
    it('全角英数字を保持する', () => {
      expect(normalizeLineText('ＡＢＣ１２３')).toBe('ＡＢＣ１２３');
    });

    it('全角カタカナを保持する', () => {
      expect(normalizeLineText('カタカナ')).toBe('カタカナ');
    });

    it('大文字・小文字を保持する（ケース敏感）', () => {
      expect(normalizeLineText('ABC abc')).toBe('ABC abc');
    });

    it('行頭記号（-）を保持する（行頭記号除去は extractTitle の責務）', () => {
      expect(normalizeLineText('- 見積作成')).toBe('- 見積作成');
    });

    it('行頭記号の有無で結果が異なる（[§6.3] 同一性判定）', () => {
      expect(normalizeLineText('- 見積作成')).not.toBe(normalizeLineText('見積作成'));
    });
  });

  describe('境界値', () => {
    it('空文字は空文字のまま', () => {
      expect(normalizeLineText('')).toBe('');
    });

    it('空白のみの行は空文字になる', () => {
      expect(normalizeLineText('   ')).toBe('');
    });

    it('全角スペースのみの行は空文字になる', () => {
      expect(normalizeLineText('\u3000')).toBe('');
    });

    it('改行は圧縮対象ではない（[§3] 空白＝半角/全角スペース・タブのみ）', () => {
      // 実運用では行単位で渡されるため改行は含まれないが、
      // 念のため含まれた場合でも改行自体は維持される（空白圧縮の対象外）
      expect(normalizeLineText('見積\n作成')).toBe('見積\n作成');
    });
  });
});

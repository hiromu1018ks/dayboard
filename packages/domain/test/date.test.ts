/**
 * 日付ユーティリティの Unit テスト
 *
 * [test_strategy.md §3.2]: 月境界、うるう年、年末、時刻注入
 * [edge_cases.md §8.1]: 1/31→2/1, 2/28→2/29(うるう年), 12/31→1/1, 深夜0時跨ぎ
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMonthDay,
  getSeason,
  getWeekdayLabel,
  getWeekdayLabelEn,
  isValidDateString,
  toLocalDateString,
  todayLocal,
} from '../src/date.js';

describe('toLocalDateString', () => {
  it('ローカル日付を YYYY-MM-DD で返す', () => {
    // 2026-07-08 12:34:56 ローカル時刻 → 2026-07-08
    const date = new Date(2026, 6, 8, 12, 34, 56);
    expect(toLocalDateString(date)).toBe('2026-07-08');
  });

  it('月・日を2桁ゼロ埋めする', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
    expect(toLocalDateString(new Date(2026, 10, 9, 23, 59, 59))).toBe('2026-11-09');
  });

  it('UTC変換せずローカル日付を用いる（タイムゾーンズレ回避）', () => {
    // 深夜0時前のローカル時刻は当日のまま（UTCなら日付がズレうる）
    const lateNight = new Date(2026, 6, 8, 0, 30, 0);
    expect(toLocalDateString(lateNight)).toBe('2026-07-08');
  });
});

describe('addDays', () => {
  describe('月境界', () => {
    it('1/31 の翌日は 2/1（1月は31日まで）', () => {
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    });

    it('1/31 の前日は 1/30', () => {
      expect(addDays('2026-01-31', -1)).toBe('2026-01-30');
    });

    it('4/30 の翌日は 5/1（4月は30日まで）', () => {
      expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
    });

    it('3/31 の翌日は 4/1（3月は31日まで）', () => {
      expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    });
  });

  describe('うるう年', () => {
    it('うるう年 2024/2/28 の翌日は 2/29', () => {
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    });

    it('平年 2026/2/28 の翌日は 3/1（2/29 は存在しない）', () => {
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('うるう年 2024/2/29 の翌日は 3/1', () => {
      expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    });

    it('うるう年判定: 2000年（400で割り切れる）は2/29存在', () => {
      expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    });

    it('うるう年判定: 1900年（100で割り切れ400で割り切れない）は2/29非存在', () => {
      expect(addDays('1900-02-28', 1)).toBe('1900-03-01');
    });
  });

  describe('年末', () => {
    it('12/31 の翌日は翌年 1/1', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('1/1 の前日は前年 12/31', () => {
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  describe('深夜0時跨ぎ（[edge_cases.md §8.2]）', () => {
    it('23:59に起動した日と 00:01の「今日」は異なる', () => {
      // 23:59 は当日、00:01 は翌日
      const beforeMidnight = new Date(2026, 6, 8, 23, 59, 0);
      const afterMidnight = new Date(2026, 6, 9, 0, 1, 0);
      expect(todayLocal(beforeMidnight)).toBe('2026-07-08');
      expect(todayLocal(afterMidnight)).toBe('2026-07-09');
    });
  });

  it('複数日の一括加算', () => {
    expect(addDays('2026-07-08', 7)).toBe('2026-07-15');
    expect(addDays('2026-07-08', -7)).toBe('2026-07-01');
  });

  it('0日加算は同一日付', () => {
    expect(addDays('2026-07-08', 0)).toBe('2026-07-08');
  });
});

describe('todayLocal', () => {
  it('時刻注入で固定日付を返す（テストの決定論性）', () => {
    const fixed = new Date(2026, 6, 8, 9, 0, 0);
    expect(todayLocal(fixed)).toBe('2026-07-08');
  });

  it('デフォルト引数で現在時刻を用いる（エラーにならない）', () => {
    const result = todayLocal();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isValidDateString', () => {
  it('正しい YYYY-MM-DD を受理', () => {
    expect(isValidDateString('2026-07-08')).toBe(true);
    expect(isValidDateString('0001-01-01')).toBe(true);
    expect(isValidDateString('9999-12-31')).toBe(true);
  });

  it('形式不正を拒否', () => {
    expect(isValidDateString('2026-7-8')).toBe(false); // ゼロ埋めなし
    expect(isValidDateString('26-07-08')).toBe(false); // 2桁年
    expect(isValidDateString('2026/07/08')).toBe(false); // スラッシュ区切り
    expect(isValidDateString('20260708')).toBe(false); // 区切りなし
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('invalid')).toBe(false);
  });

  it('実在しない日付を拒否', () => {
    expect(isValidDateString('2026-13-01')).toBe(false); // 13月
    expect(isValidDateString('2026-00-01')).toBe(false); // 0月
    expect(isValidDateString('2026-01-00')).toBe(false); // 0日
    expect(isValidDateString('2026-01-32')).toBe(false); // 32日
    expect(isValidDateString('2026-02-30')).toBe(false); // 2月30日
  });

  it('うるう日の 2/29 を正しく判定', () => {
    expect(isValidDateString('2024-02-29')).toBe(true); // うるう年
    expect(isValidDateString('2026-02-29')).toBe(false); // 平年
    expect(isValidDateString('2000-02-29')).toBe(true); // 400で割り切れる
    expect(isValidDateString('1900-02-29')).toBe(false); // 100で割り切れ400で割り切れない
  });
});

describe('getWeekdayLabel', () => {
  // 2026-07-08 は水曜日
  it('正しい日本語曜日を返す（水曜日）', () => {
    expect(getWeekdayLabel('2026-07-08')).toBe('水');
  });

  it('各曜日を正しく返す', () => {
    // 2026-07-05(日)〜2026-07-11(土)
    expect(getWeekdayLabel('2026-07-05')).toBe('日');
    expect(getWeekdayLabel('2026-07-06')).toBe('月');
    expect(getWeekdayLabel('2026-07-07')).toBe('火');
    expect(getWeekdayLabel('2026-07-08')).toBe('水');
    expect(getWeekdayLabel('2026-07-09')).toBe('木');
    expect(getWeekdayLabel('2026-07-10')).toBe('金');
    expect(getWeekdayLabel('2026-07-11')).toBe('土');
  });

  it('月末・月初でも正しい曜日を返す', () => {
    // 2026-01-31 は土曜日、2026-02-01 は日曜日
    expect(getWeekdayLabel('2026-01-31')).toBe('土');
    expect(getWeekdayLabel('2026-02-01')).toBe('日');
  });

  it('年末年始をまたいでも正しい', () => {
    // 2026-12-31 は木曜日、2027-01-01 は金曜日
    expect(getWeekdayLabel('2026-12-31')).toBe('木');
    expect(getWeekdayLabel('2027-01-01')).toBe('金');
  });
});

describe('getWeekdayLabelEn', () => {
  it('正しい英語曜日短縮形を返す（水曜日）', () => {
    expect(getWeekdayLabelEn('2026-07-08')).toBe('Wed');
  });

  it('各曜日を正しく返す', () => {
    // 2026-07-05(Sun)〜2026-07-11(Sat)
    expect(getWeekdayLabelEn('2026-07-05')).toBe('Sun');
    expect(getWeekdayLabelEn('2026-07-06')).toBe('Mon');
    expect(getWeekdayLabelEn('2026-07-07')).toBe('Tue');
    expect(getWeekdayLabelEn('2026-07-08')).toBe('Wed');
    expect(getWeekdayLabelEn('2026-07-09')).toBe('Thu');
    expect(getWeekdayLabelEn('2026-07-10')).toBe('Fri');
    expect(getWeekdayLabelEn('2026-07-11')).toBe('Sat');
  });
});

describe('formatMonthDay', () => {
  it('YYYY-MM-DD を M/D（ゼロ埋めなし）で返す', () => {
    expect(formatMonthDay('2026-07-08')).toBe('7/8');
    expect(formatMonthDay('2026-01-05')).toBe('1/5');
    expect(formatMonthDay('2026-12-31')).toBe('12/31');
    expect(formatMonthDay('2026-10-20')).toBe('10/20');
  });

  it('持ち越しラベルの表示例（[要件 7.10]）に一致する', () => {
    // 要件例: 「7/8から持ち越し」「7/9へ持ち越し済み」
    expect(formatMonthDay('2026-07-08')).toBe('7/8');
    expect(formatMonthDay('2026-07-09')).toBe('7/9');
  });

  it('形式不正の文字列では RangeError を投げる', () => {
    expect(() => formatMonthDay('invalid')).toThrow(RangeError);
    expect(() => formatMonthDay('2026/07/08')).toThrow(RangeError);
    expect(() => formatMonthDay('')).toThrow(RangeError);
  });
});

describe('getSeason', () => {
  // 季節アクセント（春=3-5月 / 夏=6-8月 / 秋=9-11月 / 冬=12-2月）。
  // 各季節の境界月を検証する。
  it('春: 3〜5月', () => {
    expect(getSeason('2026-03-01')).toBe('spring');
    expect(getSeason('2026-04-15')).toBe('spring');
    expect(getSeason('2026-05-31')).toBe('spring');
  });

  it('夏: 6〜8月', () => {
    expect(getSeason('2026-06-01')).toBe('summer');
    expect(getSeason('2026-07-13')).toBe('summer');
    expect(getSeason('2026-08-31')).toBe('summer');
  });

  it('秋: 9〜11月', () => {
    expect(getSeason('2026-09-01')).toBe('autumn');
    expect(getSeason('2026-10-20')).toBe('autumn');
    expect(getSeason('2026-11-30')).toBe('autumn');
  });

  it('冬: 12〜2月（年末年始を跨ぐ）', () => {
    expect(getSeason('2026-12-01')).toBe('winter');
    expect(getSeason('2026-12-31')).toBe('winter');
    expect(getSeason('2026-01-01')).toBe('winter');
    expect(getSeason('2026-02-28')).toBe('winter');
  });
});

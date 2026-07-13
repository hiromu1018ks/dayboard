/**
 * 日付ユーティリティ
 *
 * [database_schema.md §8] のローカル日付運用に従う:
 * - `day_notes.date` は `date` 型（タイムゾーンなし）
 * - API層ではユーザーのローカル日付を YYYY-MM-DD 文字列として扱い、そのまま格納
 * - サーバー・クライアントは同一端末・同一タイムゾーンを前提
 * - サーバーの `now()` に頼って日付を決定しない（`now()` は `timestamptz` 用）
 *
 * 全ての時刻依存処理は `now` 引数（時刻注入）で制御可能にし、
 * `new Date()` への暗黙的依存をテスト可能にする（[test_strategy.md §3.2]）。
 */

/**
 * `Date` オブジェクトからローカル日付文字列（YYYY-MM-DD）を生成する。
 *
 * `toISOString()`（UTC変換）を使うと、タイムゾーンによっては1日ズレるため、
 * ローカルの年/月/日を直接取り出して組み立てる（[database_schema.md §8]）。
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日付文字列（YYYY-MM-DD）に n 日を加減算した日付文字列を返す。
 *
 * 月境界・うるう年・年末は `Date` のローカル計算に委ねることで正しく処理される
 * （[edge_cases.md §8.1]: 1/31→2/1, 2/28→2/29(うるう年), 12/31→1/1）。
 *
 * `new Date(year, monthIndex, day)` はローカルタイムで日付を構成するため、
 * タイムゾーンによるズレが発生しない。
 *
 * 事前条件: `dateStr` は実在日付であること。形式チェックのみで実在性は検証しないため、
 * 無効日付（例: `2026-02-29`）を渡すと JS の Date ロールオーバーにより
 * 意図しない日付（例: `2026-03-01`）が返る。呼び出し元で `isValidDateString` 等による
 * 検証を前提とする（本関数の全呼び出し元は自己生成の妥当日付のみ入力する）。
 */
export function addDays(dateStr: string, n: number): string {
  const { year, month, day } = parseYyyyMmDd(dateStr);
  // month は 0 始まり。時刻はローカル深夜0時で正規化（日付計算の純粋性）。
  const base = new Date(year, month - 1, day);
  // `new Date(year, ...)` は year 0-99 を 1900-1999 にマップする JS 仕様のため、
  // setFullYear で正確な年に補正する（紀元付近の日付も正しく扱う）。
  base.setFullYear(year);
  base.setDate(base.getDate() + n);
  return toLocalDateString(base);
}

/**
 * 今日のローカル日付文字列（YYYY-MM-DD）を返す。
 *
 * `now` を省略すると `new Date()`（現在時刻）を用いる。
 * テストでは `now` を固定値で注入して時刻依存性を排除する（[test_strategy.md §3.2]）。
 */
export function todayLocal(now: Date = new Date()): string {
  return toLocalDateString(now);
}

/**
 * YYYY-MM-DD 文字列を { year, month, day }（数値）に分割する。
 * 内部利用。形式不正の場合は RangeError を投げる。
 */
function parseYyyyMmDd(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new RangeError(`Invalid date string: ${dateStr} (expected YYYY-MM-DD)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return { year, month, day };
}

/**
 * 日付文字列の形式が YYYY-MM-DD か判定する。
 * API のパスパラメータバリデーションで用いる。
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const { year, month, day } = parseYyyyMmDd(dateStr);
  // 実在する日付か検証（うるう年の 2/29 等）。
  // `new Date(year, ...)` は year 0-99 を 1900-1999 にマップする JS 仕様のため、
  // setFullYear/getFullYear の組で正確に判定する。
  const d = new Date(year, month - 1, day);
  d.setFullYear(year);
  return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
}

/**
 * YYYY-MM-DD 文字列を「M/D」形式（例: `7/8`）で返す。
 *
 * 持ち越しラベル「7/8 から持ち越し」（[要件 7.10 表示例]）の表示用。
 * ゼロ埋めなし（月・日とも1桁なら1桁のまま）。
 *
 * 事前条件: `dateStr` は YYYY-MM-DD 形式の実在日付であること。
 */
export function formatMonthDay(dateStr: string): string {
  const { month, day } = parseYyyyMmDd(dateStr);
  return `${month}/${day}`;
}

/**
 * 日本語曜日の並び（0=日 〜 6=土）。`getWeekdayLabel` で用いる。
 */
export const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * YYYY-MM-DD 文字列から日本語曜日（日/月/火/水/木/金/土）を返す。
 * Header 等の表示用。曜日計算はローカルタイムで行う（[database_schema.md §8]）。
 *
 * 事前条件: `dateStr` は `isValidDateString` を満たす実在日付であること。
 * 満たさない場合は挙動を保証しない（呼び出し元で検証済みを前提）。
 */
export function getWeekdayLabel(dateStr: string): string {
  const { year, month, day } = parseYyyyMmDd(dateStr);
  const d = new Date(year, month - 1, day);
  d.setFullYear(year);
  return WEEKDAY_LABELS_JA[d.getDay()] ?? '';
}

/**
 * 季節ラベル（テーマのアクセント色を選ぶために用いる）。
 *
 * dayborad の「日次」軸を活かし、表示中の日付の月から季節アクセントを自動選ぶ
 * （春=3-5月 / 夏=6-8月 / 秋=9-11月 / 冬=12-2月）。UI 側は戻り値を `data-season`
 * 属性へ設定し、CSS 変数 `--accent` を季節ごとに切り替える。
 *
 * 事前条件: `dateStr` は `isValidDateString` を満たす実在日付であること。
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function getSeason(dateStr: string): Season {
  const { month } = parseYyyyMmDd(dateStr);
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

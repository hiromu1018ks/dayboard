/**
 * アプリケーションルート（[roadmap.md T-1-12/13/14]）
 *
 * 起動時に今日の DayNote を取得し（AC-01）、Header に日付・曜日・テーマ入力欄・
 * 日付移動ボタンを表示する（[要件 6.2]）。日付移動で currentDate が変わると
 * 再フェッチする（AC-10）。
 *
 * Phase 1 のスコープ:
 * - useDayNote で当日/指定日の DayNoteFull を取得・表示
 * - useDateNavigation + Header で前日/翌日/今日移動
 * - テーマの自動保存接続は Phase 2（T-2-09）
 * - 仕事整理モードの3カラム（TODO/障害/振り返り）本体は Phase 3
 */

import { Header } from './components/Header.js';
import { useDateNavigation } from './hooks/useDateNavigation.js';
import { useDayNote } from './hooks/useDayNote.js';

export default function App() {
  const { currentDate, goPrevDay, goNextDay, goToday, isToday } = useDateNavigation();
  const { data, loading, error } = useDayNote(currentDate);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <Header
        currentDate={currentDate}
        theme={data?.dayNote.theme ?? null}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
        onToday={goToday}
        isToday={isToday}
      />

      <main className="mx-auto max-w-6xl px-8 py-6">
        {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">データの取得に失敗しました。</p>
            <p className="mt-1 text-red-600">{error.message}</p>
            <p className="mt-2 text-xs text-red-400">
              dayborad_dev への PostgreSQL 接続とマイグレーションを確認してください。
            </p>
          </div>
        )}

        {data && !loading && (
          // TODO(Phase 3): この「DayNote 取得確認」デバッグ表示を仕事整理モードの
          // 3カラム（TODO/障害/振り返り）に置き換える。Phase 1 は動作確認用の仮実装。
          <section className="rounded-lg border border-stone-200 bg-white p-6">
            <h2 className="mb-2 text-sm font-medium text-stone-600">DayNote 取得確認</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-32 text-stone-500">id:</dt>
                <dd className="font-mono text-stone-700">{data.dayNote.id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-stone-500">date:</dt>
                <dd className="font-mono text-stone-700">{data.dayNote.date}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-stone-500">theme:</dt>
                <dd className="font-mono text-stone-700">{data.dayNote.theme ?? '(未入力)'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-stone-500">lastOpenedMode:</dt>
                <dd className="font-mono text-stone-700">{data.dayNote.lastOpenedMode}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-stone-400">
              ※ TODO・障害・振り返りの3カラムは Phase 3 で実装されます。
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

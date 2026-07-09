/**
 * アプリケーションルート（[roadmap.md T-1-12/13/14, T-2-07〜11]）
 *
 * 起動時に今日の DayNote を取得し（AC-01）、Header に日付・曜日・テーマ入力欄・
 * 日付移動ボタンを表示する（[要件 6.2]）。日付移動で currentDate が変わると
 * 再フェッチする（AC-10）。
 *
 * Phase 2 で追加:
 * - useAutosave でテーマ編集を800ms後に自動保存（AC-13/14、T-2-09）
 * - 日付移動の直前に flush を呼び、localStorage 同期書込成功で遷移（T-2-10）
 * - localStorage 書込失敗時は FlushFailDialog で確認（T-2-11）
 * - 右上に SaveStatus を表示（T-2-08）
 * - 仕事整理モードの3カラム（TODO/障害/振り返り）本体は Phase 3
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, todayLocal, type SaveTarget } from '@dayboard/domain';
import { FlushFailDialog } from './components/FlushFailDialog.js';
import { Header } from './components/Header.js';
import { SaveStatus } from './components/SaveStatus.js';
import { createThemeSaver } from './autosave/savers.js';
import { recoverOnStartup } from './autosave/recoverOnStartup.js';
import type { AutosaveEntry } from './autosave/types.js';
import { useDateNavigation } from './hooks/useDateNavigation.js';
import { useAutosave } from './hooks/useAutosave.js';
import { useDayNote } from './hooks/useDayNote.js';
import { useFlushOnQuit } from './hooks/useFlushOnQuit.js';

/** テーマ保存対象の識別子（T-2-09） */
const THEME_TARGET: SaveTarget = { type: 'dayNote', field: 'theme' };

export default function App() {
  const { currentDate, goTo, isToday } = useDateNavigation();
  const { data, loading, error } = useDayNote(currentDate);

  // テーマ保存エントリ（日付ごとに Saver を生成、T-2-09）
  const entries = useMemo<AutosaveEntry[]>(
    () => [{ target: THEME_TARGET, saver: createThemeSaver(currentDate) }],
    [currentDate],
  );
  const { saveStatus, flush, retryAll, edit } = useAutosave(currentDate, entries);

  // flush の最新参照を保持（終了時 IPC / beforeunload から呼ぶため、T-2-13）
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useFlushOnQuit(() => flushRef.current);

  // 起動時リカバリ: localStorage の未保存分を再送（§6.2、T-2-12）。
  // アプリマウント時に1回だけ実行（日付移動ごとに再実行しない）。
  useEffect(() => {
    void recoverOnStartup((date, target) => {
      // 現在はテーマのみ。他対象は Phase 3/4 で追加。
      if (target.type === 'dayNote' && target.field === 'theme') {
        return createThemeSaver(date);
      }
      return null;
    });
  }, []);

  // localStorage 書込失敗時の保留中遷移先（§9.3）。null=ダイアログ非表示。
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  /**
   * 日付移動のラッパー: flush → localStorage 成功で遷移、失敗で確認ダイアログ（T-2-10/11）。
   *
   * [autosave_spec.md §4.2/§9.3]:
   * - localStorage 同期書込成功をもって遷移を許可
   * - サーバー保存失敗中でも localStorage 書込成功後は遷移をブロックしない
   * - localStorage 書込自体の失敗時のみ遷移を止めてユーザーへ確認
   *
   * @param targetDate 遷移先日付（YYYY-MM-DD）
   */
  const navigateWithFlush = useCallback(
    async (targetDate: string) => {
      const { localStorageOk } = await flush();
      if (localStorageOk) {
        goTo(targetDate);
      } else {
        // localStorage 書込失敗: 遷移を保留して確認（§9.3）
        setPendingNav(targetDate);
      }
    },
    [flush, goTo],
  );

  const goPrevDay = useCallback(() => {
    void navigateWithFlush(addDays(currentDate, -1));
  }, [navigateWithFlush, currentDate]);

  const goNextDay = useCallback(() => {
    void navigateWithFlush(addDays(currentDate, 1));
  }, [navigateWithFlush, currentDate]);

  const goToday = useCallback(() => {
    void navigateWithFlush(todayLocal());
  }, [navigateWithFlush]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <Header
        currentDate={currentDate}
        theme={data?.dayNote.theme ?? null}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
        onToday={goToday}
        isToday={isToday}
        onThemeEdit={(theme) => edit(THEME_TARGET, theme)}
      />

      {/* 保存状態表示（右上、[ui_interaction_spec.md §10]） */}
      <div className="pointer-events-none fixed right-4 top-3 z-40">
        <div className="pointer-events-auto">
          <SaveStatus status={saveStatus} onRetry={retryAll} />
        </div>
      </div>

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

      {/* localStorage 書込失敗時の確認ダイアログ（§9.3） */}
      <FlushFailDialog
        open={pendingNav !== null}
        onProceed={() => {
          if (pendingNav) {
            // ユーザー明示で遷移（localStorage 保護なし、§9.3「移動する」）
            goTo(pendingNav);
          }
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}

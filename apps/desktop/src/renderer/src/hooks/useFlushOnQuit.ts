/**
 * 終了時 flush フック（[roadmap.md T-2-13]）
 *
 * 2つの経路で保留中の編集を保護する（[autosave_spec.md §10]）:
 *
 * 1. main → renderer の `flush-all` IPC（before-quit 時）:
 *    preload 経由で公開された `window.dayboradAutosave.onFlushAll` で待ち受け、
 *    flush の Promise を待ってから main へ `flush-done` を送る。
 *    この経路は非同期保存の完了を待てる。
 *
 * 2. `beforeunload` イベント:
 *    同期的に終了する必要があるため、非同期の flush は待てない。
 *    ただし `edit` のたびに `persistTarget` で localStorage へ書き込んでいるため、
 *    保留中の編集は既に localStorage へ保護されている（§6.2 が真の保険）。
 *    よって beforeunload では追加の同期処理は不要。リスナは意図的に空実装とし、
 *    保護済みであることを文書化する。
 *
 * [autosave_spec.md §10]: ../../../../../../docs/autosave_spec.md
 */

import { useEffect } from 'react';

/**
 * @param getFlush 現在の flush 関数を返す（ref 経由で最新を取得）
 */
export function useFlushOnQuit(getFlush: () => () => Promise<{ localStorageOk: boolean }>): void {
  useEffect(() => {
    // main からの flush-all 要求（preload が window.dayboradAutosave.onFlushAll で公開）
    const w =
      typeof window !== 'undefined'
        ? (window as unknown as {
            dayboradAutosave?: { onFlushAll: (cb: () => Promise<void> | void) => void };
          })
        : undefined;
    if (w?.dayboradAutosave?.onFlushAll) {
      w.dayboradAutosave.onFlushAll(async () => {
        const flush = getFlush();
        await flush();
      });
    }

    // beforeunload: 非同期保存は待てないが、edit 時の persistTarget で
    // localStorage への保護は既に行われているため、追加処理は不要。
    // リスナは意図的に空実装（保護済みであることを文書化）。
    const handleBeforeUnload = (): void => {
      // 編集ごとに localStorage へ書き込んでいるため、保留内容は保護されている（§6.2）。
      // ここで flush を呼んでも beforeunload の同期制約内では完了を待てないため意味がない。
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
    // マウント時1回のみ登録。getFlush は ref 経由で常に最新を返すため依存配列不要。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

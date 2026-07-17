/**
 * useAutosave フック（[roadmap.md T-2-07]）
 *
 * [autosave_spec.md] の自動保存を React へ統合する中核フック。
 * domain 層の FSM（saveStateMachine）/デバウンス（debounce）/リトライ（retry）と
 * pendingStore（localStorage フェイルセーフ）を組み合わせる。
 *
 * 役割:
 * - 対象ごとのデバウンスタイマー管理（800ms、§3）
 * - タイマー発火で saving → サーバー保存 → saved/error（§5.2）
 * - 失敗時の指数バックオフリトライ（1s/2s/4s・最大3回、§7.1）
 * - flush: 全保留を即時保存し localStorage へ同期書込（§4、日付移動/モード切替前）
 * - 集約 saveStatus を返す（§5.2 備考の優先順位）
 *
 * 保存の直列化（重要、レビュー #2 対策）:
 * - inFlightPayload: 現在サーバーへ送信中のペイロード
 * - pendingPayload: 編集ごとに更新される最新の未保存値
 * 保存中に新規編集が来たら pendingPayload だけ更新し、保存完了後に保留があれば
 * 最新値で再送する。リトライも常に最新 pendingPayload を使うため、古い値で
 * サーバーを上書きすることがない。
 *
 * [autosave_spec.md]: ../../../../../../docs/autosave_spec.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEBOUNCE_MS,
  type SaveStatus,
  type SaveTarget,
  aggregateStatus,
  isRetriable,
  isRetryExhausted,
  nextDelayMs,
  shouldRetry,
  targetKey,
  transition,
} from '@dayboard/domain';
import type { AutosaveEntry } from '../autosave/types.js';
import { persistTarget, clearTarget } from '../autosave/pendingStore.js';

/**
 * 「ペイロード未設定」を表すセンチネル。
 *
 * `pendingPayload` / `inFlightPayload` は `unknown` 型のため、値としての `null`
 * （例: theme を空にしたときの `edit(THEME_TARGET, null)`）と「保留なし」の初期状態を
 * 同じ `null` で表すと区別できず、null ペイロードの保存がスキップされる不具合があった。
 * これを防ぐため、「未設定」はこの Symbol で表し、明示的な null は正当なペイロードとして扱う。
 */
const UNSET: unique symbol = Symbol('autosave.unset');

/**
 * ペイロード型。`UNSET`（保留なしの初期値）または任意の値（null 含む）。
 * null は正当なペイロード（theme の空文字→null 等）として扱う。
 */
type Payload = typeof UNSET | unknown;

/**
 * 対象ごとの内部状態。
 */
type TargetRuntime = {
  status: SaveStatus;
  /** デバウンスタイマーハンドル（null=未設定） */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** 保留中の最新ペイロード（未保存の編集）。UNSET=保留なし（null は正当なペイロード） */
  pendingPayload: Payload;
  /** 現在サーバーへ送信中のペイロード。UNSET=保存中ではない */
  inFlightPayload: Payload;
  /** リトライ試行回数（0=初回保存失敗直後） */
  retryAttempt: number;
  /** リトライ待機タイマーハンドル */
  retryTimer: ReturnType<typeof setTimeout> | null;
};

function createInitialRuntime(): TargetRuntime {
  return {
    status: 'saved',
    debounceTimer: null,
    pendingPayload: UNSET,
    inFlightPayload: UNSET,
    retryAttempt: 0,
    retryTimer: null,
  };
}

/**
 * useAutosave の戻り値。
 */
export type UseAutosaveResult = {
  /** 集約保存状態（§5.2 備考の優先順位で全対象を集約） */
  saveStatus: SaveStatus;
  /** 全保留対象を即時保存し localStorage へ書き込む。遷移前に呼ぶ（§4） */
  flush: () => Promise<{ localStorageOk: boolean }>;
  /** error 状態の対象を手動再試行（§7.2 の「再試行」ボタン用） */
  retryAll: () => void;
  /** error 状態の対象が存在するか（SaveStatus の再試行ボタン表示用） */
  hasError: boolean;
  /**
   * 即時保存（[autosave_spec.md §2.2]）。
   *
   * 追加/削除/完了切替/並替など「操作の確定」が自明な対象をデバウンスせず即座に保存する。
   * 既存の FSM/saveStatus/localStorage フェイルセーフ/リトライ機構をそのまま経由する。
   * POST の二重作成防止は Idempotency-Key（[autosave_spec.md §8.2]）で担保する。
   */
  saveNow: <P>(target: SaveTarget, payload: P) => void;
};

/**
 * @param date    現在表示中の日付（YYYY-MM-DD）。localStorage キーに用いる。
 * @param entries 保存対象の定義群（Phase 2 では theme の1件）
 */
export function useAutosave(
  date: string,
  entries: AutosaveEntry[],
): UseAutosaveResult & {
  /** 対象キー → 編集ハンドラ のマップ。コンポーネントが値変更時に呼ぶ */
  edit: <P>(target: SaveTarget, payload: P) => void;
  /** 対象の現在状態を取得（SaveStatus 表示やデバッグ用） */
  getStatus: (target: SaveTarget) => SaveStatus;
} {
  // 対象ごとのランタイム（ref で保持し、再描画は saveStatus 経由で発火）
  const runtimesRef = useRef<Map<string, TargetRuntime>>(new Map());
  // entries をキー→entry のマップへ（saver を安定参照で保持）
  const entriesMap = useMemo(() => {
    const m = new Map<string, AutosaveEntry>();
    for (const e of entries) m.set(targetKey(e.target), e);
    return m;
  }, [entries]);

  // 集約 saveStatus（これが変わると再描画）
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  /**
   * 全対象の状態を集約して saveStatus を更新する。
   */
  const refreshAggregate = useCallback(() => {
    const statuses: SaveStatus[] = [];
    for (const rt of runtimesRef.current.values()) {
      statuses.push(rt.status);
    }
    setSaveStatus(aggregateStatus(statuses));
  }, []);

  /**
   * 対象の状態を遷移させ、必要に応じて集約を更新。
   */
  const applyTransition = useCallback(
    (key: string, event: Parameters<typeof transition>[1]) => {
      const rt = runtimesRef.current.get(key);
      if (!rt) return;
      rt.status = transition(rt.status, event);
      refreshAggregate();
    },
    [refreshAggregate],
  );

  // 循環参照回避: executeSave を ref 経由で間接呼び出し
  const executeSaveRef = useRef<(key: string, isRetry: boolean) => Promise<void>>(async () => {});

  /**
   * サーバー保存を実行し、成功/失敗で状態遷移 + リトライ制御。
   *
   * 直列化: inFlightPayload を保持し、保存中の新規編集は pendingPayload だけ更新。
   * 保存完了後に pendingPayload が inFlightPayload と異なれば（新規編集あり）、
   * 最新値で再送する。これにより古い値でサーバーを上書きしない（レビュー #2 対策）。
   *
   * @param isRetry true=リトライ再実行（RETRY_FIRE で遷移）、false=初回（TIMER_FIRE）
   */
  const executeSave = useCallback(
    async (key: string, isRetry: boolean) => {
      const entry = entriesMap.get(key);
      const rt = runtimesRef.current.get(key);
      if (!entry || !rt) return;
      // 送信対象は常に最新の保留ペイロード（リトライも最新値を使う、レビュー #2）。
      // UNSET = 保留なし（null は正当なペイロードなので保存対象）。
      if (rt.pendingPayload === UNSET) return;

      rt.inFlightPayload = rt.pendingPayload;
      applyTransition(key, { type: isRetry ? 'RETRY_FIRE' : 'TIMER_FIRE' });

      const result = await entry.saver(rt.inFlightPayload);
      // 保存中に更に編集があれば pendingPayload が進んでいる
      const hasNewerEdit = rt.pendingPayload !== rt.inFlightPayload;

      if (result.ok) {
        rt.retryAttempt = 0;
        rt.inFlightPayload = UNSET;
        // 保存成功時点で保留ペイロードが同一ならクリア（新規編集があれば残す）
        if (!hasNewerEdit) {
          rt.pendingPayload = UNSET;
          // localStorage から成功対象を削除（部分成功でも他対象は残る、§6.2）
          clearTarget(date, entry.target);
        }
        applyTransition(key, { type: 'SAVE_SUCCESS' });

        // 保存中に新規編集が来ていたら、それを最新値として即時再送（直列化）
        if (hasNewerEdit) {
          void executeSaveRef.current(key, false);
        }
        return;
      }

      // 失敗
      rt.inFlightPayload = UNSET;
      applyTransition(key, { type: 'SAVE_FAILURE' });

      // リトライ判定（§7.1）。リトライは最新 pendingPayload を使う
      const errorKind = { status: result.status, code: result.code };
      if (shouldRetry(errorKind, rt.retryAttempt)) {
        scheduleRetry(key);
      } else if (!isRetriable(errorKind) || isRetryExhausted(rt.retryAttempt)) {
        // リトライ対象外（4xx）または上限到達 → 最終 error
        applyTransition(key, { type: 'RETRY_EXHAUSTED' });
      }
    },
    // scheduleRetry は後述するため循環回避で依存配列から除外（ref 経由で呼ぶ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entriesMap, date, applyTransition],
  );
  executeSaveRef.current = executeSave;

  /**
   * 指数バックオフでリトライをスケジュール（§7.1）。
   * executeSave（isRetry=true）を呼び、その中で最新 pendingPayload を使う。
   */
  const scheduleRetry = useCallback((key: string) => {
    const rt = runtimesRef.current.get(key);
    if (!rt) return;
    const delay = nextDelayMs(rt.retryAttempt);
    rt.retryAttempt += 1;
    if (rt.retryTimer) clearTimeout(rt.retryTimer);
    rt.retryTimer = setTimeout(() => {
      rt.retryTimer = null;
      void executeSaveRef.current(key, true);
    }, delay);
  }, []);

  // entries が変わったらランタイムを再初期化（日付切替時など）
  useEffect(() => {
    const next = new Map<string, TargetRuntime>();
    for (const key of entriesMap.keys()) {
      const prev = runtimesRef.current.get(key);
      next.set(key, prev ?? createInitialRuntime());
    }
    // 古い対象のタイマーをクリア
    for (const [key, rt] of runtimesRef.current) {
      if (!next.has(key)) {
        if (rt.debounceTimer) clearTimeout(rt.debounceTimer);
        if (rt.retryTimer) clearTimeout(rt.retryTimer);
      }
    }
    runtimesRef.current = next;
    refreshAggregate();
  }, [entriesMap, refreshAggregate]);

  // アンマウント時に全タイマークリア
  useEffect(() => {
    return () => {
      for (const rt of runtimesRef.current.values()) {
        if (rt.debounceTimer) clearTimeout(rt.debounceTimer);
        if (rt.retryTimer) clearTimeout(rt.retryTimer);
      }
    };
  }, []);

  /**
   * 編集ハンドラ: デバウンスタイマーを（再）設定（§3）。
   * 対象ごとに独立したタイマー。同対象の再入力でリセット。
   */
  const edit = useCallback(
    <P>(target: SaveTarget, payload: P) => {
      const key = targetKey(target);
      const rt = runtimesRef.current.get(key);
      if (!rt) return;
      rt.pendingPayload = payload;
      applyTransition(key, { type: 'EDIT' });
      // デバウンスタイマー再設定
      if (rt.debounceTimer) clearTimeout(rt.debounceTimer);
      // localStorage へ即時書込（サーバー保存失敗の保険、§6.2）
      persistTarget(date, target, payload);
      rt.debounceTimer = setTimeout(() => {
        rt.debounceTimer = null;
        void executeSaveRef.current(key, false);
      }, DEBOUNCE_MS);
    },
    [applyTransition, date],
  );

  /**
   * 即時保存（[autosave_spec.md §2.2]）: デバウンスタイマーを飛ばし即座に保存を発火。
   *
   * 追加/削除/完了切替/並替など「操作の確定」が自明な対象に用いる。
   * edit と同じく localStorage へ即時書込し、FSM（idle→saving→saved/error）と
   * リトライ機構を経由する。POST の二重作成防止は Idempotency-Key（§8.2）で担保。
   */
  const saveNow = useCallback(
    <P>(target: SaveTarget, payload: P) => {
      const key = targetKey(target);
      const rt = runtimesRef.current.get(key);
      if (!rt) return;
      rt.pendingPayload = payload;
      applyTransition(key, { type: 'EDIT' });
      // デバウンスタイマーをクリアし、即座に保存発火
      if (rt.debounceTimer) {
        clearTimeout(rt.debounceTimer);
        rt.debounceTimer = null;
      }
      // localStorage へ即時書込（サーバー保存失敗の保険、§6.2）
      persistTarget(date, target, payload);
      void executeSaveRef.current(key, false);
    },
    [applyTransition, date],
  );

  /**
   * flush: 全保留対象を即時保存し localStorage へ同期書込（§4）。
   * 日付移動/モード切替の直前に呼ぶ。
   * 戻り値の localStorageOk が false の場合のみ遷移を止める（§9.3）。
   */
  const flush = useCallback(async () => {
    let localStorageOk = true;
    for (const [key, rt] of runtimesRef.current) {
      if (rt.pendingPayload === UNSET) continue;
      const entry = entriesMap.get(key);
      if (!entry) continue;
      // デバウンス・リトライタイマーをクリア
      if (rt.debounceTimer) {
        clearTimeout(rt.debounceTimer);
        rt.debounceTimer = null;
      }
      if (rt.retryTimer) {
        clearTimeout(rt.retryTimer);
        rt.retryTimer = null;
      }
      // localStorage への書込は edit 時にも行っているが、flush で最新内容を確実に書込
      const writeResult = persistTarget(date, entry.target, rt.pendingPayload);
      if (!writeResult.ok) localStorageOk = false;
      // サーバー保存はバックグラウンドで発火（レスポンスを待たない、§4.2）
      void executeSaveRef.current(key, false);
    }
    return { localStorageOk };
  }, [entriesMap, date]);

  /**
   * retryAll: error 状態の対象を手動再試行（§7.2）。
   *
   * 注意: executeSave には isRetry=true を渡すこと。
   * isRetry=false だと TIMER_FIRE イベントになり、error 状態では
   * `state === 'idle' ? 'saving' : state` で saving へ遷移せず、
   * 結果として保存成功後の SAVE_SUCCESS も機能しない（saving からしか saved へ遷移しないため）。
   * isRetry=true で RETRY_FIRE イベントを発火させ、`error → saving` へ確実に遷移させる。
   */
  const retryAll = useCallback(() => {
    for (const [key, rt] of runtimesRef.current) {
      if (rt.status !== 'error' || rt.pendingPayload === UNSET) continue;
      rt.retryAttempt = 0; // 手動再試行でカウンタリセット
      void executeSaveRef.current(key, true);
    }
  }, []);

  const getStatus = useCallback(
    (target: SaveTarget) => runtimesRef.current.get(targetKey(target))?.status ?? 'saved',
    [],
  );

  const hasError = useMemo(() => saveStatus === 'error', [saveStatus]);

  return { saveStatus, flush, retryAll, hasError, edit, saveNow, getStatus };
}

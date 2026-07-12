/**
 * ユーザー設定フック（[roadmap.md T-7-01/02]、[api_contract.md §11]、要件 8.5）
 *
 * `GET /api/settings` で設定を取得し、`PATCH /api/settings` で部分更新する。
 * キーバインドモード（standard / vim）と Vim 既定状態（normal / insert）を管理する。
 *
 * - 起動時に1回取得（AC-15）
 * - 更新は楽観的で、失敗時は直前の値へ戻す
 * - キーバインドモード切替は即座にUI（キーハンドラ・CodeMirror）へ反映される
 *   （settings.keybindingMode を参照する各ハンドラが再描画で切り替わる）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeybindingMode, UserSettings, VimDefaultState } from 'shared-types';
import { fetchSettings, patchSettings } from '../api/client.js';

/** キーバインドモード未確定時の初期値（[要件 8.5]: 初期設定は標準） */
export const DEFAULT_KEYBINDING_MODE: KeybindingMode = 'standard';
/** Vim 既定状態の初期値（[要件 10.2 補足]: 既定値は normal） */
export const DEFAULT_VIM_DEFAULT_STATE: VimDefaultState = 'normal';

/** 設定ロード前の一時的なデフォルト値（GET 完了後に上書きされる） */
const INITIAL_SETTINGS: UserSettings = {
  id: 'default',
  keybindingMode: DEFAULT_KEYBINDING_MODE,
  vimDefaultState: DEFAULT_VIM_DEFAULT_STATE,
  createdAt: '',
  updatedAt: '',
};

export type UseSettingsResult = {
  /** 現在の設定。ロード完了前は初期値（standard/normal） */
  settings: UserSettings;
  /** ロード中かどうか */
  loading: boolean;
  /** ロード・更新エラー（null = エラー無し） */
  error: Error | null;
  /** キーバインドモードの部分更新（楽観的、失敗時は戻す） */
  updateKeybindingMode: (mode: KeybindingMode) => Promise<void>;
  /** Vim 既定状態の部分更新（楽観的、失敗時は戻す） */
  updateVimDefaultState: (state: VimDefaultState) => Promise<void>;
  /** 設定を再取得する */
  refetch: () => Promise<void>;
};

/**
 * ユーザー設定を管理するフック。
 *
 * マウント時に1回 GET /api/settings を呼び出す。設定の部分更新は楽観的に行い、
 * API失敗時は直前の値へ戻す。
 *
 * レース対策: 連続した PATCH リクエストの応答順序が入れ替わった場合でも、
 * 最新のリクエストの結果のみを反映するよう、リクエストトークンで判定する。
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // 最新の更新リクエストを追跡（応答順序入れ替わり対策）
  const latestReqRef = useRef(0);

  const refetch = useCallback(async () => {
    try {
      const fetched = await fetchSettings();
      setSettings(fetched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // マウント時に1回取得
  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** 部分更新の共通処理（楽観的更新、失敗時は戻す） */
  const updateWith = useCallback(
    async (patch: { keybindingMode?: KeybindingMode; vimDefaultState?: VimDefaultState }) => {
      // 一意のリクエストトークンを発行。応答順序入れ替わり対策。
      const reqToken = ++latestReqRef.current;
      // 楽観的反映（関数形式で最新 state から派生）
      setSettings((prev) => ({ ...prev, ...patch }));
      try {
        const updated = await patchSettings(patch);
        // 自リクエストより新しいリクエストが発行済みの場合は結果を破棄
        if (reqToken !== latestReqRef.current) return;
        setSettings(updated);
        setError(null);
      } catch (err) {
        if (reqToken !== latestReqRef.current) return;
        // 失敗時は最新 state を再取得して戻す（関数形式で直前の state を参照しない）
        void refetch();
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [refetch],
  );

  const updateKeybindingMode = useCallback(
    (mode: KeybindingMode) => updateWith({ keybindingMode: mode }),
    [updateWith],
  );

  const updateVimDefaultState = useCallback(
    (state: VimDefaultState) => updateWith({ vimDefaultState: state }),
    [updateWith],
  );

  return {
    settings,
    loading,
    error,
    updateKeybindingMode,
    updateVimDefaultState,
    refetch,
  };
}

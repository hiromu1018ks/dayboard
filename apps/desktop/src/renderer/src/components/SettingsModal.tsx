/**
 * 設定モーダル（[roadmap.md T-7-02]、[ui_interaction_spec.md §8]、要件 8.5）
 *
 * 歯車アイコンから開く。キーバインドモード（standard / vim）と Vim 既定状態
 * （normal / insert）を設定する。
 *
 * [ui_interaction_spec.md §8.1/§8.2]:
 * - ヘッダー右端の歯車アイコンクリックで開く（MVPではショートカットキー非割当）
 * - Esc または背景クリックで閉じる
 * - ラジオで keybindingMode を選択。vim 選択時のみ vimDefaultState を表示
 * - 変更は即座に PATCH /api/settings へ送信し、即座にキーバインドを切り替えて適用
 *
 * 即時適用（[要件 8.5 AC-5]、[ui_interaction_spec.md §8.2]）:
 * ラジオ選択の変更はその場でサーバーへ保存し、設定モーダル内に「保存」ボタンは置かない。
 * これにより「保存忘れ」を防ぎ、切替後すぐに全ショートカットが新キーバインドで動く。
 */

import { useEffect, useRef } from 'react';
import type { KeybindingMode, UserSettings, VimDefaultState } from 'shared-types';

export type SettingsModalProps = {
  /** モーダルを表示するか */
  open: boolean;
  /** 現在のユーザー設定 */
  settings: UserSettings;
  /** keybindingMode 変更時（即時保存、楽観的） */
  onChangeKeybindingMode: (mode: KeybindingMode) => void;
  /** vimDefaultState 変更時（即時保存、楽観的） */
  onChangeVimDefaultState: (state: VimDefaultState) => void;
  /** モーダルを閉じる */
  onClose: () => void;
};

/**
 * 設定モーダル。
 *
 * 変更はラジオ選択と同時に即座にサーバーへ保存（PATCH /api/settings）される。
 * 「保存」ボタンは持たず、代わりに「閉じる」ボタンのみ配置する。
 * Esc は escPriority（段3）で閉じる処理へ接続されるが、モーダル内のキーダウンでも
 * フォールバックとして閉じる（二重処理にはならない: 段3が先に消費する）。
 */
export function SettingsModal({
  open,
  settings,
  onChangeKeybindingMode,
  onChangeVimDefaultState,
  onClose,
}: SettingsModalProps) {
  // 背景クリックで閉じるための ref（クリック開始位置が背景なら閉じる）
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // open=false のときは何も描画しない（アニメーションは控えめに、要件14.1）
  if (!open) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // クリック（mousedown→mouseup）が背景で発生した場合のみ閉じる。
    // 子要素のクリックが背景に伝播して閉じてしまうのを防ぐため、
    // target が背景自身（backdropRef.current）のときだけ閉じる。
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-lg">
        <h2 id="settings-title" className="mb-4 text-lg font-semibold text-stone-800">
          設定
        </h2>

        {/* キーバインドモード（[要件 8.5]、[ui_interaction_spec.md §8.2]） */}
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-stone-600">キーバインド</legend>
          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
                settings.keybindingMode === 'standard'
                  ? 'border-stone-400 bg-stone-50'
                  : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <input
                type="radio"
                name="keybindingMode"
                value="standard"
                checked={settings.keybindingMode === 'standard'}
                onChange={() => onChangeKeybindingMode('standard')}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-stone-700">標準</span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  一般的なショートカットで操作する
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
                settings.keybindingMode === 'vim'
                  ? 'border-stone-400 bg-stone-50'
                  : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <input
                type="radio"
                name="keybindingMode"
                value="vim"
                checked={settings.keybindingMode === 'vim'}
                onChange={() => onChangeKeybindingMode('vim')}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-stone-700">Vim</span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  h/j/k/l、i、Esc などのVim風操作を使う
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* Vim 既定状態（Vim 選択時のみ表示、[要件 10.2 補足]、[§8.2]） */}
        {settings.keybindingMode === 'vim' && (
          <fieldset className="mb-4 border-t border-stone-100 pt-4">
            <legend className="mb-2 text-sm font-medium text-stone-600">
              Vim の初期状態
              <span className="ml-1 text-xs font-normal text-stone-400">
                （入力欄フォーカス時）
              </span>
            </legend>
            <div className="space-y-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
                  settings.vimDefaultState === 'normal'
                    ? 'border-stone-400 bg-stone-50'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="vimDefaultState"
                  value="normal"
                  checked={settings.vimDefaultState === 'normal'}
                  onChange={() => onChangeVimDefaultState('normal')}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-stone-700">Normal</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    移動・操作から始める（推奨）
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
                  settings.vimDefaultState === 'insert'
                    ? 'border-stone-400 bg-stone-50'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="vimDefaultState"
                  value="insert"
                  checked={settings.vimDefaultState === 'insert'}
                  onChange={() => onChangeVimDefaultState('insert')}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-stone-700">Insert</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    すぐに文字入力できる状態から始める
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {/* 閉じるボタン（変更は即時保存済みのため「保存」ボタンは不要） */}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * モーダルのキーハンドリングを扱う補助フック。
 * Esc で閉じる処理（[ui_interaction_spec.md §8.1]）。
 *
 * ただし Esc の優先順位は escPriority.ts で段3（モーダル）として統一管理されるため、
 * ここでは escPriority への差し込み用に settingsOpen 状態を親へ渡す設計とする。
 * このフックはモーダル内でのフォーカストラップ等が必要になった際の拡張ポイント。
 */
export function useSettingsModalEsc(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    // escPriority が段3で消費するため、ここではフォールバックとしてのみ動作
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        // 親の escPriority が先に処理するはずだが、念のためフォールバック
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export default SettingsModal;

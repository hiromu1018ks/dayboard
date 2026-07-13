/**
 * 設定モーダル（[roadmap.md T-7-02]、[ui_interaction_spec.md §8]、要件 8.5）
 *
 * 歯車アイコンから開く。以下を設定する:
 * - キーバインドモード（standard / vim）と Vim 既定状態（normal / insert）
 * - 外観テーマ（墨＝ダーク / 和紙＝ライト / System＝OS追従）
 *
 * [ui_interaction_spec.md §8.1/§8.2]:
 * - ヘッダー右端の歯車アイコンクリックで開く（MVPではショートカットキー非割当）
 * - Esc または背景クリックで閉じる
 * - ラジオで keybindingMode を選択。vim 選択時のみ vimDefaultState を表示
 * - 変更は即座に保存（キーバインドは PATCH /api/settings、テーマは localStorage）し即適用
 *
 * 即時適用（[要件 8.5 AC-5]、[ui_interaction_spec.md §8.2]）:
 * ラジオ/ボタン選択の変更はその場で保存し、設定モーダル内に「保存」ボタンは置かない。
 * これにより「保存忘れ」を防ぎ、切替後すぐに全体へ反映される。
 */

import { useRef } from 'react';
import type { KeybindingMode, UserSettings, VimDefaultState } from 'shared-types';
import type { Theme } from '../hooks/useTheme.js';

export type SettingsModalProps = {
  /** モーダルを表示するか */
  open: boolean;
  /** 現在のユーザー設定 */
  settings: UserSettings;
  /** keybindingMode 変更時（即時保存、楽観的） */
  onChangeKeybindingMode: (mode: KeybindingMode) => void;
  /** vimDefaultState 変更時（即時保存、楽観的） */
  onChangeVimDefaultState: (state: VimDefaultState) => void;
  /** 現在の外観テーマ（墨/和紙/System） */
  theme: Theme;
  /** 外観テーマ変更時（localStorage へ即時保存） */
  onChangeTheme: (theme: Theme) => void;
  /** モーダルを閉じる */
  onClose: () => void;
};

/** テーマ選択肢の表示定義（墨と波） */
const THEME_OPTIONS: {
  value: Theme;
  label: string;
  description: string;
  swatches: [string, string];
}[] = [
  {
    value: 'light',
    label: '和紙',
    description: '明るい紙の質感',
    swatches: ['#f5f1e8', '#2a2620'],
  },
  {
    value: 'dark',
    label: '墨',
    description: '暗い墨色',
    swatches: ['#16161d', '#DCD7BA'],
  },
  {
    value: 'system',
    label: '両方',
    description: 'OS 設定に追従',
    swatches: ['#f5f1e8', '#16161d'],
  },
];

/**
 * 設定モーダル。
 *
 * 変更は選択と同時に即座に保存（キーバインドは PATCH /api/settings、テーマは localStorage）される。
 * 「保存」ボタンは持たず、代わりに「閉じる」ボタンのみ配置する。
 * Esc は escPriority（段3）で閉じる処理へ接続されるが、モーダル内のキーダウンでも
 * フォールバックとして閉じる（二重処理にはならない: 段3が先に消費する）。
 */
export function SettingsModal({
  open,
  settings,
  onChangeKeybindingMode,
  onChangeVimDefaultState,
  theme,
  onChangeTheme,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl">
        <h2 id="settings-title" className="head mb-4 text-lg text-ink">
          設定
        </h2>

        {/* 外観テーマ（墨と波: 墨=ダーク / 和紙=ライト / System=OS追従） */}
        <fieldset className="mb-4">
          <legend className="head mb-2 text-sm text-ink">外観</legend>
          <div role="radiogroup" aria-label="外観テーマ" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => {
              const selected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChangeTheme(opt.value)}
                  className={`flex flex-col items-center rounded border px-2 py-3 text-sm transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line bg-bg text-sub hover:border-accent/60'
                  }`}
                >
                  <div className="mb-1.5 flex gap-1">
                    {opt.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="h-3 w-3 rounded-full ring-1 ring-line"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="font-medium">{opt.label}</span>
                  <span className="mt-0.5 text-[10px] opacity-80">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* キーバインドモード（[要件 8.5]、[ui_interaction_spec.md §8.2]） */}
        <fieldset className="mb-4 border-t border-linesoft pt-4">
          <legend className="head mb-2 text-sm text-ink">キーバインド</legend>
          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm transition-colors ${
                settings.keybindingMode === 'standard'
                  ? 'border-accent bg-accent/10'
                  : 'border-line hover:bg-raised'
              }`}
            >
              <input
                type="radio"
                name="keybindingMode"
                value="standard"
                checked={settings.keybindingMode === 'standard'}
                onChange={() => onChangeKeybindingMode('standard')}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium text-ink">標準</span>
                <span className="mt-0.5 block text-xs text-faint">
                  一般的なショートカットで操作する
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm transition-colors ${
                settings.keybindingMode === 'vim'
                  ? 'border-accent bg-accent/10'
                  : 'border-line hover:bg-raised'
              }`}
            >
              <input
                type="radio"
                name="keybindingMode"
                value="vim"
                checked={settings.keybindingMode === 'vim'}
                onChange={() => onChangeKeybindingMode('vim')}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium text-ink">Vim</span>
                <span className="mt-0.5 block text-xs text-faint">
                  h/j/k/l、i、Esc などのVim風操作を使う
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* Vim 既定状態（Vim 選択時のみ表示、[要件 10.2 補足]、[§8.2]） */}
        {settings.keybindingMode === 'vim' && (
          <fieldset className="mb-4 border-t border-linesoft pt-4">
            <legend className="head mb-2 text-sm text-ink">
              Vim の初期状態
              <span className="ml-1 text-xs font-normal text-faint">（入力欄フォーカス時）</span>
            </legend>
            <div className="space-y-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm transition-colors ${
                  settings.vimDefaultState === 'normal'
                    ? 'border-accent bg-accent/10'
                    : 'border-line hover:bg-raised'
                }`}
              >
                <input
                  type="radio"
                  name="vimDefaultState"
                  value="normal"
                  checked={settings.vimDefaultState === 'normal'}
                  onChange={() => onChangeVimDefaultState('normal')}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="font-medium text-ink">Normal</span>
                  <span className="mt-0.5 block text-xs text-faint">
                    移動・操作から始める（推奨）
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm transition-colors ${
                  settings.vimDefaultState === 'insert'
                    ? 'border-accent bg-accent/10'
                    : 'border-line hover:bg-raised'
                }`}
              >
                <input
                  type="radio"
                  name="vimDefaultState"
                  value="insert"
                  checked={settings.vimDefaultState === 'insert'}
                  onChange={() => onChangeVimDefaultState('insert')}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="font-medium text-ink">Insert</span>
                  <span className="mt-0.5 block text-xs text-faint">
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
            className="rounded border border-line px-4 py-1.5 text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;

/**
 * 保存状態表示コンポーネント（[roadmap.md T-2-08]）
 *
 * [ui_interaction_spec.md §10] / [autosave_spec.md §5.1] に従い、
 * 画面右上に4状態を小さく表示する。
 *
 * | saveStatus | 表示 | 色 |
 * |------------|------|----|
 * | idle       | （非表示 または「下書き」） | グレー |
 * | saving     | 「保存中...」 | グレー |
 * | saved      | 「保存済み」 | 緑（控えめ） |
 * | error      | 「保存できませんでした」+ 再試行 | 赤 |
 *
 * [ui_interaction_spec.md §10]: ../../../../../../docs/ui_interaction_spec.md
 */

import type { SaveStatus as DomainSaveStatus } from '@dayboard/domain';

export type SaveStatusProps = {
  /** 集約保存状態（useAutosave.saveStatus） */
  status: DomainSaveStatus;
  /** 「再試行」ボタン押下時（error 時のみ表示） */
  onRetry?: () => void;
};

export function SaveStatus({ status, onRetry }: SaveStatusProps) {
  if (status === 'idle') {
    // idle は「下書き」を小さくグレー表示（入力中だが未保存を示唆）
    return (
      <span className="text-xs text-stone-400" role="status" aria-live="polite">
        下書き
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="text-xs text-stone-400" role="status" aria-live="polite">
        保存中...
      </span>
    );
  }

  if (status === 'saved') {
    // 控えめな緑（ui_interaction_spec §10「緑（控えめ）」）
    return (
      <span className="text-xs text-emerald-600" role="status" aria-live="polite">
        保存済み
      </span>
    );
  }

  // error: 「保存できませんでした」+ 再試行ボタン（§5.1/§7.2）
  return (
    <span className="flex items-center gap-1" role="status" aria-live="assertive">
      <span className="text-xs text-red-600">保存できませんでした</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          再試行
        </button>
      )}
    </span>
  );
}

export default SaveStatus;

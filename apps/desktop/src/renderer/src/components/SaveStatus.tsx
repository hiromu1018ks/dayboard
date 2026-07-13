/**
 * 保存状態表示コンポーネント（[roadmap.md T-2-08]）
 *
 * [ui_interaction_spec.md §10] / [autosave_spec.md §5.1] に従い、保存状態を表示する。
 *
 * **平時は非表示**（Notion/iA Writer 的）。自動保存を売りにする以上、何も起きていない時の
 * 「保存済み」常時表示はノイズになる。保存が絡む動作中のみ表示する:
 *
 * | saveStatus | 表示 | 色 |
 * |------------|------|----|
 * | idle       | 「保存中...」（デバウンス待機中も保存中と同義） | 控えめ |
 * | saving     | 「保存中...」 | 控えめ |
 * | saved      | （非表示） | — | 保存が終わった = 表示が消えることで完了を伝える |
 * | error      | 「保存できませんでした」+ 再試行 | 赤 |
 *
 * 位置は右下（Header 操作と重ならないよう）。error 時のみ再試行ボタンが操作可能。
 */

import type { SaveStatus as DomainSaveStatus } from '@dayboard/domain';

export type SaveStatusProps = {
  /** 集約保存状態（useAutosave.saveStatus） */
  status: DomainSaveStatus;
  /** 「再試行」ボタン押下時（error 時のみ表示） */
  onRetry?: () => void;
};

export function SaveStatus({ status, onRetry }: SaveStatusProps) {
  // saved（平時）は非表示。自動保存なら何も起きてない時の常時表示はノイズ。
  if (status === 'saved') {
    return null;
  }

  // idle（デバウンス待機中）/ saving（サーバー保存中）はどちらも「保存中」。
  // ユーザーから見れば区別する意味がないため同一表示にする。
  if (status === 'idle' || status === 'saving') {
    return (
      <span className="pointer-events-none text-xs text-faint" role="status" aria-live="polite">
        保存中...
      </span>
    );
  }

  // error: 「保存できませんでした」+ 再試行ボタン（§5.1/§7.2）
  // ラッパが pointer-events-none のため、再試行ボタンに pointer-events-auto を付与して操作可能にする
  return (
    <span className="flex items-center gap-1" role="status" aria-live="assertive">
      <span className="pointer-events-none text-xs text-danger">保存できませんでした</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="pointer-events-auto rounded border border-danger px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          再試行
        </button>
      )}
    </span>
  );
}

export default SaveStatus;

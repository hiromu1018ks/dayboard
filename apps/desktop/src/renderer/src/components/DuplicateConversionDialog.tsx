/**
 * 重複変換確認ダイアログ（[roadmap.md T-5-11]）
 *
 * ノート行の重複TODO化/障害化時に表示される確認ダイアログ（[note_conversion_spec.md §7]）。
 * 409 DUPLICATE_CONVERSION 受領時に、既存アイテムのタイトルを表示し、
 * ユーザーに「キャンセル」or「別アイテムとして追加」を選択させる。
 *
 * - キャンセル / Esc → ダイアログ閉じる、何も作成しない
 * - 別アイテム追加 → 親が ?force=1 で再リクエスト
 * - ダイアログ中はノートモードの他操作を無効化（モーダル）
 */

import { useEffect } from 'react';

export type DuplicateConversionDialogProps = {
  open: boolean;
  /** 変換先（'todo' or 'blocker'）。文言切り替えに使用 */
  target: 'todo' | 'blocker';
  /** 既存アイテムのタイトル（details.existing.title） */
  existingTitle: string | undefined;
  /** 「別アイテムとして追加」を選んだ時（親が force=1 で再リクエスト） */
  onForce: () => void;
  /** キャンセル */
  onCancel: () => void;
};

export function DuplicateConversionDialog({
  open,
  target,
  existingTitle,
  onForce,
  onCancel,
}: DuplicateConversionDialogProps) {
  // Esc でキャンセル（モーダル内の Esc はここで消費）
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    // モーダル表示中は最優先で捕捉（capture フェーズ）
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const targetLabel = target === 'todo' ? 'TODO' : '障害';
  const buttonLabel = target === 'todo' ? '別TODOとして追加' : '別障害として追加';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-dialog-title"
      data-testid="duplicate-conversion-dialog"
    >
      <div
        className="mx-4 max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="duplicate-dialog-title" className="head text-lg text-ink">
          この行はすでに{targetLabel}化されています
        </h2>

        {existingTitle !== undefined && (
          <div className="mt-3 rounded border border-line bg-bg px-3 py-2">
            <p className="text-xs text-faint">既存の{targetLabel}:</p>
            <p className="mt-0.5 text-ink">
              {target === 'todo' ? '□' : '・'} {existingTitle}
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-sub">別の{targetLabel}として追加しますか？</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line px-4 py-1.5 text-sm text-sub hover:bg-raised"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onForce}
            className="rounded bg-accent px-4 py-1.5 text-sm text-bg hover:brightness-110"
            autoFocus
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

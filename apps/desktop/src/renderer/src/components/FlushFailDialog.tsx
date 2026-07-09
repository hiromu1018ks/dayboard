/**
 * localStorage 書込失敗時の確認ダイアログ（[roadmap.md T-2-11]）
 *
 * [autosave_spec.md §9.3] のフェイルセーフ:
 * モード切替・日付移動前の localStorage スナップショット書込に失敗した場合、
 * 遷移を中断してユーザーへ確認する。
 *
 * 「キャンセル」: 現在画面に留まる（メモリバッファは維持）
 * 「移動する」: ユーザー明示の上で遷移（localStorage 保護なし、クラッシュ時復元保証なし）
 *
 * サーバー保存のリトライ失敗だけではこのダイアログを出さない（§9.3）。
 *
 * [autosave_spec.md §9.3]: ../../../../../../docs/autosave_spec.md
 */

export type FlushFailDialogProps = {
  /** ダイアログを表示するか */
  open: boolean;
  /** 「移動する」を押下した際のハンドラ（遷移を続行） */
  onProceed: () => void;
  /** 「キャンセル」を押下した際のハンドラ（現在画面に留まる） */
  onCancel: () => void;
};

export function FlushFailDialog({ open, onProceed, onCancel }: FlushFailDialogProps) {
  if (!open) return null;

  return (
    // モーダル背景（Esc キャンセルは Phase 7 のキーバインド層で扱う。ここではボタン操作のみ）
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="flush-fail-title"
      aria-describedby="flush-fail-desc"
    >
      <div className="mx-4 max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 id="flush-fail-title" className="text-base font-semibold text-stone-800">
          未保存データを保護できませんでした
        </h2>
        <p id="flush-fail-desc" className="mt-2 text-sm leading-relaxed text-stone-600">
          このまま移動すると入力内容が失われる可能性があります。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            移動する
          </button>
        </div>
      </div>
    </div>
  );
}

export default FlushFailDialog;

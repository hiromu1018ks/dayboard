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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="flush-fail-title"
      aria-describedby="flush-fail-desc"
    >
      <div className="mx-4 max-w-sm rounded-lg border border-line bg-panel p-5 shadow-xl">
        <h2 id="flush-fail-title" className="head text-base text-ink">
          未保存データを保護できませんでした
        </h2>
        <p id="flush-fail-desc" className="mt-2 text-sm leading-relaxed text-sub">
          このまま移動すると入力内容が失われる可能性があります。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="rounded bg-danger px-3 py-1.5 text-sm text-bg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            移動する
          </button>
        </div>
      </div>
    </div>
  );
}

export default FlushFailDialog;

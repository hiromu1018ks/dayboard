/**
 * トースト通知（[roadmap.md T-5-12]）
 *
 * 変換成功・切り詰め・空行エラー等の小さな通知を表示する（[ui_interaction_spec.md §6.2]）。
 * 2秒後に自動消滅。ノートモードの入力の邪魔にならないよう、右下に控えめに表示。
 *
 * [要件 9.3]: 「TODO化、障害化した場合は小さな通知を出す」
 */

import { useEffect } from 'react';

export type ToastKind = 'success' | 'info' | 'error';

export type ToastMessage = {
  kind: ToastKind;
  text: string;
};

export type ToastProps = {
  message: ToastMessage | null;
  /** 自動消滅までのミリ秒（デフォルト2000ms、[§6.2]） */
  durationMs?: number;
  onClose: () => void;
};

/** ToastKind ごとのスタイル・アイコン（墨と波テーマの状態色） */
const TOAST_STYLES: Record<ToastKind, { bg: string; icon: string }> = {
  success: { bg: 'bg-ok', icon: '✓' },
  info: { bg: 'bg-sub', icon: 'ℹ' },
  error: { bg: 'bg-danger', icon: '!' },
};

export function Toast({ message, durationMs = 2000, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  const style = TOAST_STYLES[message.kind];

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50">
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-lg ${style.bg} px-4 py-2 text-sm text-bg shadow-lg`}
        role="status"
        aria-live="polite"
        data-testid="toast"
      >
        <span aria-hidden="true">{style.icon}</span>
        <span>{message.text}</span>
      </div>
    </div>
  );
}

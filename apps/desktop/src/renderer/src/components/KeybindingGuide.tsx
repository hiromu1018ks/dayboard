/**
 * キーバインドガイドモーダル（[roadmap.md T-7-G-03]、[要件 8.1]、[ui_interaction_spec.md §10.5]、AC-23）
 *
 * `?` キーまたはヘッダーのヘルプアイコンから開く。現在の表示モード（仕事整理/ノート）と
 * キーバインドモード（標準/Vim）に応じて表示セクションを切り替える（[§10.5]）。
 *
 * SettingsModal と同一パターン（`fixed inset-0 z-50 bg-black/40` + `role="dialog"` +
 * `aria-modal="true"` + 背景クリックで閉じる）。Esc は escPriority（段3）で閉じる処理へ接続。
 *
 * 表示内容のデータソースは [ui_interaction_spec.md §11.1〜§11.4] のショートカット早見表。
 */

import { useRef } from 'react';
import type { KeybindingMode } from 'shared-types';
import type { ViewMode } from '../state/viewMode.js';

export type KeybindingGuideProps = {
  /** モーダルを表示するか */
  open: boolean;
  /** 現在の表示モード（仕事整理/ノート）。表示セクションの切替に使用 */
  viewMode: ViewMode;
  /** 現在のキーバインドモード（標準/Vim）。表示セクションの切替に使用 */
  keybindingMode: KeybindingMode;
  /** モーダルを閉じる */
  onClose: () => void;
};

/** ガイド1行の表示定義 */
type ShortcutRow = {
  /** Mac 表記（Win は Ctrl 置換で生成） */
  mac: string;
  /** 操作の説明 */
  action: string;
};

/** `<kbd>` 風キー表示。NoteMode.tsx 既存の kbd スタイルを踏襲。 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-sans text-xs text-sub">
      {children}
    </kbd>
  );
}

/**
 * Mac 表記から Win 表記へ変換（⌘→Ctrl、Option→Alt）。
 * 表示用の簡易変換。`⌘` を `Ctrl`、`Option` を `Alt` へ置換する。
 */
function toWin(mac: string): string {
  return mac.replaceAll('⌘', 'Ctrl').replaceAll('Option', 'Alt');
}

/** ショートカット表を描画 */
function ShortcutTable({ rows, title }: { rows: ShortcutRow[]; title: string }) {
  return (
    <section className="mb-4 first:mt-0">
      <h3 className="head mb-2 text-sm text-ink">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, i) => {
            const win = toWin(row.mac);
            const showBoth = win !== row.mac;
            return (
              <tr key={`${row.mac}-${i}`} className="border-b border-linesoft last:border-0">
                <td className="py-1.5 pr-3 align-top">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {row.mac.split(' ').map((part, j) => (
                      <Kbd key={`m-${j}`}>{part}</Kbd>
                    ))}
                    {showBoth && (
                      <>
                        <span className="px-0.5 text-faint">/</span>
                        {win.split(' ').map((part, j) => (
                          <Kbd key={`w-${j}`}>{part}</Kbd>
                        ))}
                      </>
                    )}
                  </span>
                </td>
                <td className="py-1.5 pl-2 align-top text-sub">{row.action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** セクション定義（モード別に組み立てて表示する） */
const SECTIONS = {
  // 共通（全モード）
  common: {
    title: '基本',
    rows: [
      { mac: '⌘ J', action: 'ノート ⇄ 仕事整理 を切替' },
      { mac: '⌘ T', action: '今日へ戻る' },
      { mac: 'Option ←', action: '前日へ' },
      { mac: 'Option →', action: '翌日へ' },
      { mac: '⌘ \\', action: 'サイドバーの表示切替' },
      { mac: '?', action: 'このガイドを開く / 閉じる' },
    ] satisfies ShortcutRow[],
  },
  // 仕事整理 + 標準
  workStandard: {
    title: '仕事整理モード',
    rows: [
      { mac: '⌘ 1', action: 'TODOへ移動' },
      { mac: '⌘ 2', action: '障害・詰まりへ移動' },
      { mac: '⌘ 3', action: '振り返りへ移動' },
      { mac: '⌘ Enter', action: 'TODOを追加' },
    ] satisfies ShortcutRow[],
  },
  // 仕事整理 + Vim
  workVim: {
    title: '仕事整理モード（Vim）',
    rows: [
      { mac: 'h / l', action: '列を移動（TODO ↔ 障害 ↔ 振り返り）' },
      { mac: 'j / k', action: '項目を移動 / テーマ ↔ 列を行き来' },
      { mac: 'gg / G', action: '列の先頭 / 末尾' },
      { mac: 'i / Enter', action: '選択中の項目を編集（Insertへ）' },
      { mac: 'o / O', action: '下 / 上に新規追加' },
      { mac: 'x', action: '選択項目を切替（完了 / 解決）' },
      { mac: 'dd', action: '選択項目を削除（u で復元）' },
      { mac: 'u / Ctrl+r', action: 'undo / redo' },
      { mac: 'Space n', action: 'ノート ⇄ 仕事整理 を切替' },
      { mac: 'Space 1/2/3', action: '列へ移動' },
      { mac: 'Esc', action: 'Normalへ戻る / 編集を確定' },
    ] satisfies ShortcutRow[],
  },
  // ノート + 標準
  noteStandard: {
    title: 'ノートモード',
    rows: [
      { mac: '⌘ Enter', action: '選択行をTODO化' },
      { mac: '⌘ Shift+B', action: '選択行を障害化' },
      { mac: '⌘ Shift+M', action: '現在時刻の見出しを追加' },
      { mac: 'Esc', action: '仕事整理モードへ戻る' },
    ] satisfies ShortcutRow[],
  },
  // ノート + Vim 追加
  noteVimExtra: {
    title: 'ノートモード（Vim）',
    rows: [
      { mac: 'Space t', action: '選択行をTODO化' },
      { mac: 'Space b', action: '選択行を障害化' },
      { mac: 'i / Esc', action: 'Insert ↔ Normal（CodeMirror の Vim 拡張）' },
    ] satisfies ShortcutRow[],
  },
} as const;

export function KeybindingGuide({ open, viewMode, keybindingMode, onClose }: KeybindingGuideProps) {
  // 背景クリックで閉じるための ref（クリック開始位置が背景なら閉じる）
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // open=false のときは何も描画しない（アニメーションは控えめに、要件14.1）
  if (!open) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // target が背景自身のときだけ閉じる（子要素のクリック伝播で閉じないよう）
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  // 表示セクションを組み立て（[§10.5] のモード別切替ルール）
  const sections: { title: string; rows: ShortcutRow[] }[] = [SECTIONS.common];
  if (viewMode === 'work') {
    if (keybindingMode === 'vim') {
      sections.push(SECTIONS.workVim);
    } else {
      sections.push(SECTIONS.workStandard);
    }
  } else {
    // ノートモード
    sections.push(SECTIONS.noteStandard);
    if (keybindingMode === 'vim') {
      sections.push(SECTIONS.noteVimExtra);
    }
  }

  return (
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keybinding-guide-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-panel p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="keybinding-guide-title" className="head text-lg text-ink">
            キーボードショートカット
          </h2>
          <span className="text-xs text-faint">Mac / Windows 両方を表示</span>
        </div>

        {sections.map((s) => (
          <ShortcutTable key={s.title} title={s.title} rows={s.rows} />
        ))}

        {/* 閉じるボタン */}
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

export default KeybindingGuide;

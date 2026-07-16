/**
 * フォーカス制御ヘルパ（[roadmap.md T-7-03/06]、[ui_interaction_spec.md §3.2/§3.4]）
 *
 * selection model（[selection.ts]）への移行に伴い、本モジュールは **DOM フォーカス移動の
 * ユーティリティ** に特化する。selection（どの位置を選択中か）は React state が管理し、
 * 本モジュールは「その selection に対応する DOM 要素へ実際にフォーカスを当てる」役割と、
 * `⌘1/2/3` / `Space 1/2/3` での列直接フォーカスを担う。
 *
 * 設計方針:
 * - selection 推測（getFocusedSection / getFocusedItemId）は廃止。selection は React state が真実源。
 * - DOM 構造はコンポーネント側が `data-focus-section` / `data-focus-input` / `data-focus-item` /
 *   `data-focus-field` を付与し、本モジュールがそれらへフォーカスする。
 *
 * 列の順序（[§3.4]）: theme ↔ todo ↔ blocker ↔ reflection
 */

import type { WorkSelection, WorkSection } from './selection.js';

// ============================================================================
// DOM フォーカス操作ユーティリティ
// ============================================================================

/**
 * 指定セクションのコンテナを取得する（`data-focus-section` を持つ要素）。
 */
function getSectionContainer(section: WorkSection): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-focus-section="${section}"]`);
}

/**
 * 現在フォーカスされている要素が「テキスト入力要素」か判定する。
 *
 * - `<input>` / `<textarea>`: 通常の入力欄
 * - `isContentEditable === true`: contenteditable 要素（CodeMirror の `.cm-content` 含む）
 *
 * Vim の Normal 操作（`vim.ts`）やキーバインドガイド起動（`?`、`help.ts`）は、
 * これらの要素へフォーカス中は処理せず文字入力へ貫通させる
 * （[ui_interaction_spec.md §3.4 / §10.5]: ユーザーが「普通にフォーカスして入力できる」体験）。
 *
 * jsdom では `isContentEditable` が反映されないことがあるため、
 * `contenteditable` 属性値の直接チェックも併用する。
 */
export function isTextInputElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) return true;
  const attr = htmlEl.getAttribute('contenteditable');
  if (attr === 'true' || attr === '') return true;
  return false;
}

/**
 * 指定セクションの**入力要素**（`data-focus-input`）へフォーカスを移す（[§3.2]）。
 *
 * `⌘1/2/3`、Vim `Space 1/2/3` で使う。selection の更新は呼び出し側（App.tsx）で行い、
 * 本関数は純粋に DOM フォーカスのみを担う。
 *
 * @returns フォーカス移動できた場合 true
 */
export function focusSectionInput(section: WorkSection): boolean {
  const container = getSectionContainer(section);
  if (!container) return false;
  const input = container.querySelector<HTMLElement>('[data-focus-input]');
  if (input) {
    input.focus();
    return true;
  }
  // data-focus-input が無いセクション（reflection 等）は最初のフォーカス可能要素へ
  const focusable = container.querySelector<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable) {
    focusable.focus();
    return true;
  }
  return false;
}

/**
 * selection が指す「選択移動用」要素へフォーカスを移す（hjkl/Space 1/2/3 で呼ばれる）。
 *
 * **選択移動と入力の分離（重要）:**
 * 入力欄（input/textarea）へフォーカスすると vim.ts のスルー判定で hjkl が効かなくなる。
 * そのため本関数は:
 * - todo/blocker の**アイテム選択** → `button[data-focus-item]` へフォーカス（button は入力要素でない、hjkl 有効）
 * - theme/reflection/追加入力欄 の選択 → **section コンテナ自身**（`tabIndex={-1}`）へフォーカス
 *   （入力欄でないため hjkl 有効。選択ハイライトで現在位置を示す）
 *
 * 入力欄へフォーカスしたい（`i` で編集開始）場合は `focusInputAtSelection` を使う。
 *
 * @param selection フォーカス対象の選択位置
 * @param itemsBySection 各セクションのアイテム配列（id 解決用）。todo/blocker のみ必要。
 * @returns フォーカスできた場合 true
 */
export function focusElementAtSelection(
  selection: WorkSelection,
  itemsBySection: {
    todo?: { id: string }[];
    blocker?: { id: string }[];
  },
): boolean {
  const container = getSectionContainer(selection.section);
  if (!container) return false;

  // todo/blocker のアイテム選択時のみ button[data-focus-item] へフォーカス（hjkl 有効）。
  // それ以外（theme/reflection/追加入力欄）は section コンテナ自身へフォーカス（入力欄回避）。
  if (selection.section === 'todo' || selection.section === 'blocker') {
    const items = selection.section === 'todo' ? itemsBySection.todo : itemsBySection.blocker;
    const itemCount = items?.length ?? 0;
    const idx = selection.itemIndex ?? 0;
    // 追加入力欄（番哨行）でなければ button へ
    if (idx < itemCount) {
      const item = items?.[idx];
      if (item) {
        const el = container.querySelector<HTMLElement>(`[data-focus-item="${item.id}"]`);
        if (el) {
          el.focus();
          return true;
        }
      }
    }
  }

  // theme/reflection/追加入力欄選択時、または button 解決失敗時:
  // section コンテナ自身へフォーカス（tabIndex={-1} で JS focus 可、入力要素でない）
  container.focus();
  return true;
}

/**
 * selection が指す**入力欄**へフォーカスを移す（Vim `i`/`Enter` 編集開始で呼ばれる）。
 *
 * `focusElementAtSelection`（選択移動用・section へフォーカス）と対で使う。
 * こちらは実際の入力要素（input/textarea）へフォーカスし、文字入力を可能にする。
 *
 * - theme: テーマ入力欄（`#theme-input` / `data-focus-input`）
 * - reflection: 選択中 field の textarea（`data-focus-field`）
 * - todo/blocker: アイテム選択時は本文編集 input、追加入力欄選択時は `data-focus-input`
 */
export function focusInputAtSelection(
  selection: WorkSelection,
  itemsBySection: {
    todo?: { id: string }[];
    blocker?: { id: string }[];
  },
): boolean {
  const container = getSectionContainer(selection.section);
  if (!container) return false;

  if (selection.section === 'theme' || selection.section === 'reflection') {
    return focusSectionInput(selection.section);
  }

  // todo/blocker: 追加入力欄選択時は data-focus-input へ
  const items = selection.section === 'todo' ? itemsBySection.todo : itemsBySection.blocker;
  const itemCount = items?.length ?? 0;
  const idx = selection.itemIndex ?? 0;
  if (idx >= itemCount) {
    return focusSectionInput(selection.section);
  }

  // アイテム選択時: 編集モードの input へ。実装上は button[data-focus-item] の dblclick 等で
  // 編集モードに入るが、本関数では直接 input を探せないため section コンテナへフォールバック。
  // （todo/blocker の本文編集はコンポーネント側で editing state を介して input 表示）
  // → 呼び出し側（editItemAt）で button のダブルクリック相当の処理を呼ぶのが理想だが、
  //   MVP では section へフォーカスし、ユーザーが Enter/i 再押下で編集モードへ。
  container.focus();
  return true;
}

/**
 * 指定 id のアイテム要素へフォーカスする（編集モード開始時等のピンポイント フォーカス用）。
 */
export function focusItemById(section: WorkSection, itemId: string): boolean {
  const container = getSectionContainer(section);
  if (!container) return false;
  const el = container.querySelector<HTMLElement>(`[data-focus-item="${itemId}"]`);
  if (el) {
    el.focus();
    return true;
  }
  return false;
}

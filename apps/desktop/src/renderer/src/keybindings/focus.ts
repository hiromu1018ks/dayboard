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
 * selection が指す DOM 要素へフォーカスを移す。
 *
 * 新アーキテクチャの中核: selection（React state）と DOM フォーカスの同期。
 * 各コンポーネントは以下の data 属性で選択位置を表現する:
 * - todo/blocker: `data-focus-item="<id>"`（アイテム）、`data-focus-input`（追加入力欄）
 * - reflection: `data-focus-field="doneText|stuckText|tomorrowActionText"`
 * - theme: `data-focus-input`（テーマ入力欄）
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

  if (selection.section === 'theme') {
    return focusSectionInput('theme');
  }

  if (selection.section === 'reflection') {
    if (!selection.field) return focusSectionInput('reflection');
    const el = container.querySelector<HTMLElement>(`[data-focus-field="${selection.field}"]`);
    if (el) {
      el.focus();
      return true;
    }
    return focusSectionInput('reflection');
  }

  // todo/blocker
  const items = selection.section === 'todo' ? itemsBySection.todo : itemsBySection.blocker;
  const itemCount = items?.length ?? 0;
  const idx = selection.itemIndex ?? 0;

  // 追加入力欄（番哨行）を選択中
  if (idx >= itemCount) {
    return focusSectionInput(selection.section);
  }

  // アイテムを選択中: data-focus-item から id を解決
  const item = items?.[idx];
  if (!item) return focusSectionInput(selection.section);
  const el = container.querySelector<HTMLElement>(`[data-focus-item="${item.id}"]`);
  if (el) {
    el.focus();
    return true;
  }
  return focusSectionInput(selection.section);
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

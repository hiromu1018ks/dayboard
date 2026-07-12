/**
 * フォーカス制御ヘルパ（[roadmap.md T-7-03/06]、[ui_interaction_spec.md §3.2/§3.4]）
 *
 * 仕事整理モードの列フォーカス（`⌘1/2/3`、Vim `Space 1/2/3`、`h/l` で列移動）と、
 * 列内項目移動（Vim `j/k`）を支える。
 *
 * 設計方針:
 * - 各カラムの**コンテナ要素**（`<section>`）へ `data-focus-section="<section>"` を付与する
 * - カラム内の**入力要素**（追加入力欄等）へ `data-focus-input` を付与する
 * - カラム内の各項目（TODO/Blocker）へ `data-focus-item="<id>"` を付与する
 * - `focusSectionInput()` はセクション内の**入力要素**（`data-focus-input`）へフォーカスする
 *   （入力要素が無ければ最初の項目 `data-focus-item` へ）
 *
 * 列の順序（[ui_interaction_spec.md §3.4]）: theme ↔ todo ↔ blocker ↔ reflection
 */

/** 仕事整理モードの列（セクション）種別（[ui_interaction_spec.md §2.1/§3.4]） */
export type WorkSection = 'theme' | 'todo' | 'blocker' | 'reflection';

/** 列の左右順序（[ui_interaction_spec.md §3.4]: theme ↔ todo ↔ blocker ↔ reflection） */
export const SECTION_ORDER: readonly WorkSection[] = ['theme', 'todo', 'blocker', 'reflection'];

/**
 * 指定セクションのコンテナを取得する（`data-focus-section` を持つ要素）。
 * コンテナが見つからない場合は null。
 */
function getSectionContainer(section: WorkSection): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-focus-section="${section}"]`);
}

/**
 * 指定セクションの**入力要素**（`data-focus-input`）へフォーカスを移す（[§3.2]）。
 *
 * `⌘1/2/3`、Vim `Space 1/2/3`、`⌘Enter`（TODO追加）、Vim `i`（Insert遷移）で使う。
 * 入力要素が無い場合はセクション内の最初の `data-focus-item` へ、
 * それも無ければコンテナ内の最初のフォーカス可能要素へ。
 *
 * @returns フォーカス移動できた場合 true
 */
export function focusSectionInput(section: WorkSection): boolean {
  const container = getSectionContainer(section);
  if (!container) return false;
  // 優先1: data-focus-input を持つ要素（追加入力欄等）
  const input = container.querySelector<HTMLElement>('[data-focus-input]');
  if (input) {
    input.focus();
    return true;
  }
  // 優先2: data-focus-item の最初の要素
  const firstItem = container.querySelector<HTMLElement>('[data-focus-item]');
  if (firstItem) {
    firstItem.focus();
    return true;
  }
  // 優先3: コンテナ内の最初のフォーカス可能要素（フォールバック）
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
 * 現在フォーカスがある要素の所属セクションを取得する。
 *
 * フォーカス要素（または祖先）が含まれる `data-focus-section` コンテナを探す。
 * フォーカスが当たっていない、または該当コンテナに無い場合は null。
 */
export function getFocusedSection(): WorkSection | null {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const el = (active as HTMLElement).closest<HTMLElement>('[data-focus-section]');
  if (!el) return null;
  const section = el.dataset.focusSection;
  if (
    section === 'theme' ||
    section === 'todo' ||
    section === 'blocker' ||
    section === 'reflection'
  ) {
    return section;
  }
  return null;
}

/**
 * 現在フォーカスがある要素（または祖先）の `data-focus-item` 属性値を取得する。
 *
 * TODO/Blocker の各項目（`data-focus-item="<id>"`）にフォーカスがある場合、その id を返す。
 * Vim の `x`（TODO完了切替）等で「現在選択中の項目」を特定するために使用する。
 */
export function getFocusedItemId(): string | null {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const el = (active as HTMLElement).closest<HTMLElement>('[data-focus-item]');
  if (!el) return null;
  return el.dataset.focusItem ?? null;
}

/**
 * 隣接セクションへフォーカスを移す（[ui_interaction_spec.md §3.4] の列移動）。
 *
 * 移動先は列の入力要素（`focusSectionInput`）へフォーカスする。
 *
 * @param direction 'left' (h) または 'right' (l)
 * @returns フォーカス移動できた場合 true
 */
export function focusAdjacentSection(direction: 'left' | 'right'): boolean {
  const current = getFocusedSection();
  if (!current) {
    // フォーカスが無い場合は最初のセクション（theme）へ
    return focusSectionInput('theme');
  }
  const idx = SECTION_ORDER.indexOf(current);
  if (idx < 0) return false;
  const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
  // 循環しない（[§3.4]: 列の末端で止まる）
  if (nextIdx < 0 || nextIdx >= SECTION_ORDER.length) return false;
  return focusSectionInput(SECTION_ORDER[nextIdx]!);
}

/**
 * セクション内の項目フォーカスを移動する（[ui_interaction_spec.md §3.4] の j/k）。
 *
 * 現在フォーカスがあるセクション（`data-focus-section` コンテナ）内の
 * `data-focus-item` 付き要素群を順序どおりに走査し、次の項目（下方向: j）または
 * 前の項目（上方向: k）へフォーカスを移す。
 *
 * - 列の末尾で `j` を押すと止まる（循環しない、[§3.4]）
 * - 先頭で `k` も止まる
 * - 現在フォーカスが `data-focus-item` 上に無い場合は、down は先頭、up は末尾へ
 *
 * @param direction 'down' (j) または 'up' (k)
 * @returns フォーカス移動できた場合 true
 */
export function focusItemInCurrentSection(direction: 'down' | 'up'): boolean {
  const active = document.activeElement as HTMLElement | null;
  // 現在フォーカス中のセクションコンテナを特定
  const sectionEl = active?.closest<HTMLElement>('[data-focus-section]');
  if (!sectionEl) return false;

  // セクション内の項目要素群を取得（data-focus-item を持つ要素）
  const items = Array.from(sectionEl.querySelectorAll<HTMLElement>('[data-focus-item]'));
  if (items.length === 0) return false;

  // 現在フォーカス中の項目のインデックスを探す
  const currentItemEl = active?.closest<HTMLElement>('[data-focus-item]');
  const currentIdx = currentItemEl ? items.indexOf(currentItemEl) : -1;

  let nextIdx: number;
  if (direction === 'down') {
    // j: 下へ。現在未選択なら先頭へ
    nextIdx = currentIdx < 0 ? 0 : currentIdx + 1;
    // 末尾で止まる（循環しない）
    if (nextIdx >= items.length) return false;
  } else {
    // k: 上へ。現在未選択なら末尾へ
    nextIdx = currentIdx < 0 ? items.length - 1 : currentIdx - 1;
    // 先頭で止まる
    if (nextIdx < 0) return false;
  }
  items[nextIdx]?.focus();
  return true;
}

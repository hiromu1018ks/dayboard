/**
 * 仕事整理モードの selection model（[ui_interaction_spec.md §3.4/§3.5]）
 *
 * 従来の「DOM フォーカスで代用する Vim」に代わる、アプリ層で明示的に管理する
 * 2D カーソルモデル。TODO/Blocker/Reflection を行列のグリッドとして扱い、
 * `h/j/k/l` でグリッド移動、`i/o/x/dd` で選択中アイテムを操作する。
 *
 * 設計方針（[architecture.md §4] 準拠）:
 * - 本モジュールは**ピュア TS**。React/DOM/Hono/Node への依存を持たない。
 *   App.tsx が `WorkSelection` state を保持し、純粋関数で次状態を計算して setState する。
 * - 副作用（フォーカス移動・dispatch）は呼び出し側（App.tsx / vim.ts）が行う。
 *
 * 列の順序（[§3.4]）: theme ↔ todo ↔ blocker ↔ reflection
 * 列内の行順: 各列は上から [アイテム群（order 昇順）, 追加入力欄（番兵: itemIndex = length）]
 *             reflection は3フィールド（doneText→stuckText→tomorrowActionText）を行として扱う
 */

/** 仕事整理モードの列（セクション）種別（[§2.1/§3.4]）。focus.ts と同一だが循環 import を避けここで再定義。 */
export type WorkSection = 'theme' | 'todo' | 'blocker' | 'reflection';

/** Reflection 列の3領域。j/k でこの順に循環移動する。 */
export type ReflectionField = 'doneText' | 'stuckText' | 'tomorrowActionText';

/** 列の左右順序（[§3.4]: theme ↔ todo ↔ blocker ↔ reflection）。 */
export const SECTION_ORDER: readonly WorkSection[] = ['theme', 'todo', 'blocker', 'reflection'];

/**
 * h/l（左右移動）で巡回する列の順序。**theme は除外**（theme は上下で列へ遷移するため）。
 * todo ↔ blocker ↔ reflection のみ左右移動可能。
 */
const COLUMN_ORDER: readonly WorkSection[] = ['todo', 'blocker', 'reflection'];

/** Reflection のフィールド順（j/k の移動順）。 */
export const REFLECTION_FIELDS: readonly ReflectionField[] = [
  'doneText',
  'stuckText',
  'tomorrowActionText',
];

/**
 * 仕事整理モードの選択状態（2D カーソル）。
 *
 * - `section`: 現在の列
 * - `itemIndex`: todo/blocker ではアイテムの 0 起き index。追加入力欄は `length`（番兵）。
 *   theme/reflection では常に `null`
 * - `field`: reflection での選択領域。それ以外は `null`
 */
export type WorkSelection = {
  section: WorkSection;
  itemIndex: number | null;
  field: ReflectionField | null;
};

/**
 * グリッド全体のレイアウト。`moveSelection` 等へ渡す。
 * 4セクション分のレイアウトを格納。存在しないセクションは省略可（その列へは移動しない）。
 */
export type WorkLayout = {
  theme?: { hasInput: boolean };
  todo?: { itemCount: number };
  blocker?: { itemCount: number };
  reflection?: Record<string, never>; // 常に3フィールド固定。追加情報不要
};

/** theme 列の初期選択位置。 */
export const THEME_SELECTION: WorkSelection = {
  section: 'theme',
  itemIndex: null,
  field: null,
};

/** 指定セクションの初期選択位置を生成（空列は追加入力欄、空でなければ先頭アイテム）。 */
export function initialSelection(section: WorkSection): WorkSelection {
  if (section === 'theme') return { ...THEME_SELECTION };
  if (section === 'reflection') return { section, itemIndex: null, field: 'doneText' };
  // todo/blocker: 初期位置は追加入力欄（`itemIndex = itemCount` 相当だが、ここでは itemCount 未知のため null で「未確定」を示す。
  // 呼び出し側は itemCount を知り次第、`clampSelection` で正位置へ寄せる。
  return { section, itemIndex: null, field: null };
}

/**
 * 指定セクションの「行数」を返す。追加入力欄は末尾の1行として含む。
 * theme は1行（テーマ入力欄）、reflection は3行（フィールド固定）。
 */
export function rowCount(section: WorkSection, layout: WorkLayout): number {
  switch (section) {
    case 'theme':
      return 1;
    case 'reflection':
      return REFLECTION_FIELDS.length;
    case 'todo':
      return (layout.todo?.itemCount ?? 0) + (layout.todo !== undefined ? 1 : 0); // +追加入力欄
    case 'blocker':
      return (layout.blocker?.itemCount ?? 0) + (layout.blocker !== undefined ? 1 : 0);
  }
}

/**
 * 選択位置を列の有効範囲へ収める。レイアウト変化（追加/削除）後に呼び、無効 index を補正する。
 *
 * - todo/blocker: `itemIndex` が `itemCount` を超える場合は追加入力欄（= itemCount）へ。
 *   空列で追加入力欄も許容（itemIndex = 0 = 番兵）。
 * - theme/reflection: itemIndex は無視し、field が reflection 外なら doneText へ。
 */
export function clampSelection(sel: WorkSelection, layout: WorkLayout): WorkSelection {
  if (sel.section === 'theme') return { ...THEME_SELECTION };
  if (sel.section === 'reflection') {
    const field = sel.field && REFLECTION_FIELDS.includes(sel.field) ? sel.field : 'doneText';
    return { section: 'reflection', itemIndex: null, field };
  }
  // todo/blocker
  const count = rowCount(sel.section, layout);
  // 追加入力欄を含む行数。itemIndex は 0..count-1 の範囲へ。
  if (sel.itemIndex === null || sel.itemIndex < 0) {
    // 未確定: 先頭(0)へ。アイテムがあれば先頭アイテム、無ければ0=追加入力欄（番兵=0行目）。
    // いずれも itemIndex=0 で表現できる（空列の追加入力欄は 0=count だが count=1 になるため 0 で正しい）。
    return { section: sel.section, itemIndex: 0, field: null };
  }
  if (sel.itemIndex >= count) {
    return { section: sel.section, itemIndex: Math.max(0, count - 1), field: null };
  }
  return sel;
}

/** 追加入力欄（番兵行）を選択中か。todo/blocker でのみ意味を持つ。 */
export function isOnAddInput(sel: WorkSelection, layout: WorkLayout): boolean {
  if (sel.section !== 'todo' && sel.section !== 'blocker') return false;
  if (sel.itemIndex === null) return false;
  const itemCount = sel.section === 'todo' ? layout.todo?.itemCount : layout.blocker?.itemCount;
  return sel.itemIndex === (itemCount ?? 0);
}

/** 選択中アイテムの id 取得用。呼び出し側が items 配列を渡して該当 id を得る。null = 追加入力欄/無効。 */
export function selectedItemId(sel: WorkSelection, items: { id: string }[]): string | null {
  if (sel.itemIndex === null) return null;
  if (sel.itemIndex < 0 || sel.itemIndex >= items.length) return null;
  return items[sel.itemIndex]!.id;
}

// ============================================================================
// 移動（h/j/k/l/gg/G/数字前置）— 全て純粋関数。副作用なし。
// ============================================================================

/** 移動の方向。 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * 上下移動（j/k）。同列内で移動し、末尾/先頭で止まる（循環なし）。
 *
 * - todo/blocker: itemIndex を増減。末尾の追加入力欄で止まる。未選択なら先頭（down）/末尾（up）。
 * - reflection: field を REFLECTION_FIELDS 順に移動。循環なし（doneText の上、tomorrowActionText の下で停止）。
 * - theme: 1行のみ。移動不可（sel をそのまま返す）。
 *
 * @param count 移動量（`3j` 等の数字前置）。既定 1。
 * @returns 新しい選択位置。移動できなかった場合は元と同値。
 */
export function moveVertical(
  sel: WorkSelection,
  dir: 'up' | 'down',
  layout: WorkLayout,
  count = 1,
): WorkSelection {
  // theme ↔ 列 の上下移動（視覚的に theme は最上段、列はその下）。
  // - theme で j → TODO 列の先頭アイテム（itemIndex=0）
  // - 列の先頭（todo/blocker の itemIndex=0、reflection の doneText）で k → theme
  // - theme で k → 停止（最上段）
  if (sel.section === 'theme') {
    if (dir === 'down') {
      // TODO 列へ（先頭アイテム、アイテムが無ければ追加入力欄=0）。
      // MVP 仕様: theme→j は常に TODO へ（Reflection から戻って j でも TODO）。
      // 「直前の列へ戻る」方が自然だが、記憶領域が必要になるため MVP では固定。
      return { section: 'todo', itemIndex: 0, field: null };
    }
    return sel; // theme で k は停止
  }

  // 列の先頭で k → theme へ戻る（列内移動の「先頭で停止」を廃止）。
  // ただし todo/blocker の未選択（itemIndex===null）は「先頭」とは見なさず、下記の未選択着地処理へ流す。
  if (dir === 'up') {
    const atTop =
      (sel.section === 'todo' || sel.section === 'blocker') && sel.itemIndex !== null
        ? sel.itemIndex <= 0
        : sel.section === 'reflection' && (!sel.field || sel.field === 'doneText');
    if (atTop) return { ...THEME_SELECTION };
  }

  if (sel.section === 'reflection') {
    const fields = REFLECTION_FIELDS;
    const currentIdx = sel.field ? fields.indexOf(sel.field) : 0;
    const delta = dir === 'down' ? count : -count;
    const nextIdx = Math.max(0, Math.min(fields.length - 1, currentIdx + delta));
    return { section: 'reflection', itemIndex: null, field: fields[nextIdx]! };
  }

  // todo/blocker
  const rows = rowCount(sel.section, layout);
  if (rows === 0) return sel;
  // 未選択時: down は先頭(0)、up は末尾(rows-1) への「着地」。移動量は加算しない。
  if (sel.itemIndex === null) {
    return { section: sel.section, itemIndex: dir === 'down' ? 0 : rows - 1, field: null };
  }
  const delta = dir === 'down' ? count : -count;
  const nextIdx = Math.max(0, Math.min(rows - 1, sel.itemIndex + delta));
  return { section: sel.section, itemIndex: nextIdx, field: null };
}

/**
 * 左右移動（h/l）。隣接列へ移動する。行位置をできるだけ維持（相対位置の保持）。
 *
 * - 列の順序は SECTION_ORDER（theme↔todo↔blocker↔reflection）。末端で止まる（循環なし）。
 * - 行位置の対応付け: 移動前の「行/行数の割合」を移動先の列で再現。
 *   例: todo の 2/3 行目 → blocker の 2/3 位置。theme(1行)→todo は先頭アイテム/追加入力欄。
 *   reflection は3フィールド固定。todo/blocker ↔ reflection はできるだけ近い位置へ。
 *
 * @returns 新しい選択位置。移動できなかった場合は元と同値。
 */
export function moveHorizontal(
  sel: WorkSelection,
  dir: 'left' | 'right',
  layout: WorkLayout,
): WorkSelection {
  // theme は h/l の対象外（j/k で列へ遷移する）。theme で h/l は無反応。
  if (sel.section === 'theme') return sel;
  const idx = COLUMN_ORDER.indexOf(sel.section);
  if (idx < 0) return sel;
  const nextIdx = dir === 'left' ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= COLUMN_ORDER.length) return sel; // 末端で止まる
  const nextSection = COLUMN_ORDER[nextIdx]!;

  return transferPosition(sel, nextSection, layout);
}

/**
 * 現在の選択位置の「相対位置（0..1）」を維持して別セクションへ転送する。
 * `moveHorizontal` と `Space 1/2/3`（列直接選択時の行記憶）で使う。
 */
export function transferPosition(
  sel: WorkSelection,
  to: WorkSection,
  layout: WorkLayout,
): WorkSelection {
  if (to === 'theme') return { ...THEME_SELECTION };

  if (to === 'reflection') {
    // 相対位置 → 3フィールドのいずれか
    const ratio = positionRatio(sel, layout);
    const fieldIdx = Math.min(
      REFLECTION_FIELDS.length - 1,
      Math.floor(ratio * REFLECTION_FIELDS.length),
    );
    return { section: 'reflection', itemIndex: null, field: REFLECTION_FIELDS[fieldIdx]! };
  }

  // todo/blocker
  const targetRows = rowCount(to, layout);
  if (targetRows === 0) return { section: to, itemIndex: 0, field: null }; // 存在しない場合は追加入力欄相当
  const ratio = positionRatio(sel, layout);
  // 浮動小数点誤差で floor(ratio*targetRows) が想定より1大きくなるのを防ぐため、
  // ratio を [0,1) に制限してから floor。Math.min で追加入力欄(=targetRows-1)を上限とする。
  // ※ reflection の3フィールドは「項目種別」、todo/blocker の追加入力欄は「入力欄」で意味が違うが、
  //   位置の相対対応としては「reflection の最終フィールド → todo/blocker の末尾寄り」が自然。
  const clampedRatio = Math.min(ratio, 0.999999);
  const itemIdx = Math.min(targetRows - 1, Math.floor(clampedRatio * targetRows));
  return { section: to, itemIndex: itemIdx, field: null };
}

/**
 * 現在の選択位置の相対位置（0..1）を返す。theme は0、reflection は field から計算。
 *
 * todo/blocker は `idx / (rows-1)`（先頭=0、末尾=1）。
 * reflection は `idx / length`（3フィールド → 0, 0.33, 0.66）。
 *   ※ `idx/(length-1)` だと tomorrowActionText(idx=2) が 1.0 になり、todo/blocker への
 *   転送で常に追加入力欄（末尾）へ飛んでしまうため、`idx/length` で中間寄りにする。
 */
function positionRatio(sel: WorkSelection, layout: WorkLayout): number {
  if (sel.section === 'theme') return 0;
  if (sel.section === 'reflection') {
    const idx = sel.field ? REFLECTION_FIELDS.indexOf(sel.field) : 0;
    return REFLECTION_FIELDS.length === 0 ? 0 : idx / REFLECTION_FIELDS.length;
  }
  const rows = rowCount(sel.section, layout);
  if (rows === 0) return 0;
  const idx = sel.itemIndex ?? 0;
  return rows <= 1 ? 0 : idx / (rows - 1);
}

// ============================================================================
// コマンド解析（数字前置・dd/gg の2文字コマンド用の state マシン補助）
// ============================================================================

/**
 * キーストローク列から Vim コマンドを解析する。
 *
 * サポート範囲（MVP、[§11.4/§11.5]）:
 * - 数字前置 + 移動: `3j`, `5k`, `2G`（移動のみ。`d3j` 等の複合は Post-MVP）
 * - 単キー移動: `h j k l G`
 * - `gg`: 列先頭
 * - `dd`: 選択アイテム削除
 * - 編集系: `i a A o O`
 * - その他: `x u`（Ctrl+r は別途検出）
 *
 * この関数は**1文字ずつ**呼ばれることを想定せず、入力バッファ（`g` 押下 → 次キー待ち等の
 * リーダー状態）は呼び出し側（vim.ts）が管理する。本関数は「確定したコマンド文字列」を解析する。
 *
 * @param buffer 確定したコマンド文字列（例: "3j", "gg", "dd", "x"）。小文字化済みを想定。
 * @returns 解析結果。未確定・未サポートは null。
 */
export type ParsedVimCommand =
  | { kind: 'move'; direction: Direction; count: number }
  | { kind: 'goto-first'; count: number } // gg（count は無視、gg は常に先頭）
  | { kind: 'goto-line'; line: number } // {n}G（1起き）
  | { kind: 'goto-last' } // G（数字前置なし）
  | { kind: 'edit-insert' } // i
  | { kind: 'edit-append' } // a
  | { kind: 'edit-append-end' } // A
  | { kind: 'add-below' } // o
  | { kind: 'add-above' } // O
  | { kind: 'toggle' } // x
  | { kind: 'delete' } // dd
  | { kind: 'undo' } // u
  | { kind: 'redo' }; // Ctrl+r（呼び出し側で変換済みの "ctrl+r" を渡す）

export function parseVimCommand(buffer: string): ParsedVimCommand | null {
  if (buffer === '') return null;

  // 大文字（Shift 必須）コマンドを先に判定（小文字化前の buffer で厳密比較）
  if (buffer === 'A') return { kind: 'edit-append-end' };
  if (buffer === 'O') return { kind: 'add-above' };
  if (buffer === 'G') return { kind: 'goto-last' };

  const b = buffer.toLowerCase();

  // Ctrl+r（呼び出し側で "ctrl+r" へ変換済みを想定）
  if (b === 'ctrl+r') return { kind: 'redo' };

  // 2文字コマンド
  if (b === 'gg') return { kind: 'goto-first', count: 1 };
  if (b === 'dd') return { kind: 'delete' };

  // 単キー（数字前置なし、小文字）
  if (b === 'h') return { kind: 'move', direction: 'left', count: 1 };
  if (b === 'l') return { kind: 'move', direction: 'right', count: 1 };
  if (b === 'j') return { kind: 'move', direction: 'down', count: 1 };
  if (b === 'k') return { kind: 'move', direction: 'up', count: 1 };
  if (b === 'i') return { kind: 'edit-insert' };
  if (b === 'a') return { kind: 'edit-append' };
  if (b === 'o') return { kind: 'add-below' };
  if (b === 'x') return { kind: 'toggle' };
  if (b === 'u') return { kind: 'undo' };

  // 数字前置の解析: ^(\d+)([jhklg])?$。g は小文字 = {n}G の G（大文字）と区別するため、
  // 大文字 G は上で先処理済み。数字+g（小文字）は不正だが、数字前置+gg 等は Post-MVP なので null。
  const m = b.match(/^(?<n>\d+)(?<cmd>[jhkl])?$/);
  if (m && m.groups) {
    const n = parseInt(m.groups.n!, 10);
    const cmd = m.groups.cmd;
    if (cmd === 'j') return { kind: 'move', direction: 'down', count: n };
    if (cmd === 'k') return { kind: 'move', direction: 'up', count: n };
    if (cmd === 'h') return { kind: 'move', direction: 'left', count: n }; // h/l への count は無視されることが多いが許容
    if (cmd === 'l') return { kind: 'move', direction: 'right', count: n };
    // 数字のみ → 未確定（G 等の続きを待つべき）。null で「確定待ち」を示すことは呼び出し側の責務。
    return null;
  }

  // 数字 + G（大文字）= {n}G。大文字は小文字化されないため別途判定。
  const mG = buffer.match(/^(\d+)G$/);
  if (mG) {
    return { kind: 'goto-line', line: parseInt(mG[1]!, 10) };
  }

  return null;
}

/**
 * 単一キー入力が「確定コマンドか、それともリーダー入力の続きを待つべきか」を判定する。
 * `g`（gg の1文字目）、`d`（dd の1文字目）、数字のみ、はリーダー状態へ。
 *
 * @returns 'complete' = 即確定、'leader' = 続行を待つ、'invalid' = 不正（破棄）
 */
export function classifyKeystroke(buffer: string): 'complete' | 'leader' | 'invalid' {
  if (buffer === '') return 'invalid';
  // 数字のみ、または数字+未確定（大文字小文字関係なし）
  if (/^\d+$/.test(buffer)) return 'leader';
  // 小文字 g / d の1文字のみリーダー（大文字 G/D は即確定コマンド）
  if (buffer === 'g' || buffer === 'd') return 'leader';
  // それ以外は parseVimCommand で判定（大文字小文字を区別）
  return parseVimCommand(buffer) !== null ? 'complete' : 'invalid';
}

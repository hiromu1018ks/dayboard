/**
 * フォーカス制御ヘルパの Unit テスト（[ui_interaction_spec.md §3.2/§3.4]）
 *
 * selection model 移行後の focus.ts は「DOM フォーカス移動ユーティリティ」に特化。
 * focusSectionInput / focusElementAtSelection / focusItemById を jsdom 環境で検証する。
 * selection（位置計算）自体は selection.test.ts で網羅済み。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  focusSectionInput,
  focusElementAtSelection,
  focusInputAtSelection,
  focusItemById,
  isTextInputElement,
} from './focus.js';
import { SECTION_ORDER, type WorkSelection } from './selection.js';

/**
 * テスト用 DOM を構築。実際のコンポーネントと同じ data 属性構造を再現:
 *   <section data-focus-section="todo">
 *     <ul>
 *       <li><button data-focus-item="t1"></li>
 *       <li><button data-focus-item="t2"></li>
 *     </ul>
 *     <input data-focus-input>
 *   </section>
 *   <section data-focus-section="reflection">
 *     <textarea data-focus-field="doneText"></textarea>
 *     ...
 *   </section>
 */
function setupDom(): void {
  document.body.innerHTML = '';

  // todo セクション: アイテム2件 + 追加入力欄
  const todo = document.createElement('section');
  todo.dataset.focusSection = 'todo';
  todo.tabIndex = -1; // section 自体へフォーカス可能に（選択移動用）
  const todoUl = document.createElement('ul');
  for (const id of ['t1', 't2']) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.dataset.focusItem = id;
    btn.tabIndex = 0;
    li.appendChild(btn);
    todoUl.appendChild(li);
  }
  todo.appendChild(todoUl);
  const todoInput = document.createElement('input');
  todoInput.dataset.focusInput = '';
  todo.appendChild(todoInput);
  document.body.appendChild(todo);

  // blocker セクション: アイテム1件 + 追加入力欄
  const blocker = document.createElement('section');
  blocker.dataset.focusSection = 'blocker';
  blocker.tabIndex = -1;
  const blockerUl = document.createElement('ul');
  const bli = document.createElement('li');
  const bbtn = document.createElement('button');
  bbtn.dataset.focusItem = 'b1';
  bbtn.tabIndex = 0;
  bli.appendChild(bbtn);
  blockerUl.appendChild(bli);
  blocker.appendChild(blockerUl);
  const blockerInput = document.createElement('input');
  blockerInput.dataset.focusInput = '';
  blocker.appendChild(blockerInput);
  document.body.appendChild(blocker);

  // reflection セクション: 3 フィールド
  const reflection = document.createElement('section');
  reflection.dataset.focusSection = 'reflection';
  reflection.tabIndex = -1;
  for (const field of ['doneText', 'stuckText', 'tomorrowActionText']) {
    const ta = document.createElement('textarea');
    ta.dataset.focusField = field;
    reflection.appendChild(ta);
  }
  document.body.appendChild(reflection);

  // theme セクション: 入力欄のみ
  const theme = document.createElement('section');
  theme.dataset.focusSection = 'theme';
  theme.tabIndex = -1;
  const themeInput = document.createElement('input');
  themeInput.dataset.focusInput = '';
  theme.appendChild(themeInput);
  document.body.appendChild(theme);
}

const sel = (
  section: WorkSelection['section'],
  itemIndex: number | null = null,
  field: WorkSelection['field'] = null,
): WorkSelection => ({ section, itemIndex, field });

describe('SECTION_ORDER（selection.ts から再エクスポート確認）', () => {
  it('列の順序が正しい', () => {
    expect(SECTION_ORDER).toEqual(['theme', 'todo', 'blocker', 'reflection']);
  });
});

describe('focusSectionInput', () => {
  beforeEach(setupDom);

  it('todo セクションの追加入力欄（data-focus-input）へフォーカス', () => {
    expect(focusSectionInput('todo')).toBe(true);
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(true);
  });

  it('reflection セクションは最初のフォーカス可能要素（先頭 textarea）へ', () => {
    expect(focusSectionInput('reflection')).toBe(true);
    expect(document.activeElement?.getAttribute('data-focus-field')).toBe('doneText');
  });

  it('theme セクションの入力欄へ', () => {
    expect(focusSectionInput('theme')).toBe(true);
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(true);
  });

  it('存在しないセクションは false', () => {
    document.body.innerHTML = '';
    expect(focusSectionInput('todo')).toBe(false);
  });
});

describe('focusElementAtSelection', () => {
  beforeEach(setupDom);

  it('todo のアイテム選択時は data-focus-item へフォーカス', () => {
    const items = { todo: [{ id: 't1' }, { id: 't2' }] };
    expect(focusElementAtSelection(sel('todo', 0), items)).toBe(true);
    expect(document.activeElement?.getAttribute('data-focus-item')).toBe('t1');
  });

  it('todo の追加入力欄選択（itemIndex=2=番哨）時は section コンテナへ（入力欄でない、hjkl有効）', () => {
    const items = { todo: [{ id: 't1' }, { id: 't2' }] };
    expect(focusElementAtSelection(sel('todo', 2), items)).toBe(true);
    // section コンテナ自身へフォーカス（data-focus-input でない）
    expect(document.activeElement?.getAttribute('data-focus-section')).toBe('todo');
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(false);
  });

  it('reflection の field 選択時は section コンテナへ（textarea でない、hjkl有効）', () => {
    expect(focusElementAtSelection(sel('reflection', null, 'stuckText'), {})).toBe(true);
    expect(document.activeElement?.getAttribute('data-focus-section')).toBe('reflection');
    expect(document.activeElement?.hasAttribute('data-focus-field')).toBe(false);
  });

  it('theme 選択時は section コンテナへ（入力欄でない、hjkl有効）', () => {
    expect(focusElementAtSelection(sel('theme'), {})).toBe(true);
    expect(document.activeElement?.getAttribute('data-focus-section')).toBe('theme');
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(false);
  });

  it('範囲外 itemIndex は section コンテナへフォールバック', () => {
    const items = { todo: [{ id: 't1' }] };
    expect(focusElementAtSelection(sel('todo', 99), items)).toBe(true);
    // 追加入力欄扱い = section コンテナへ
    expect(document.activeElement?.getAttribute('data-focus-section')).toBe('todo');
  });

  it('セクション不在時は false', () => {
    document.body.innerHTML = '';
    expect(focusElementAtSelection(sel('todo', 0), { todo: [{ id: 't1' }] })).toBe(false);
  });
});

describe('focusInputAtSelection', () => {
  beforeEach(setupDom);

  it('theme 選択時は入力欄（data-focus-input）へフォーカス', () => {
    expect(focusInputAtSelection(sel('theme'), {})).toBe(true);
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(true);
  });

  it('reflection 選択時は入力欄（最初のフォーカス可能要素）へフォーカス', () => {
    expect(focusInputAtSelection(sel('reflection', null, 'stuckText'), {})).toBe(true);
    // focusSectionInput 経由で最初のフォーカス可能要素（doneText の textarea）へ
    expect(document.activeElement?.getAttribute('data-focus-field')).toBe('doneText');
  });

  it('todo の追加入力欄選択（itemIndex=2=番哨）時は data-focus-input へ', () => {
    const items = { todo: [{ id: 't1' }, { id: 't2' }] };
    expect(focusInputAtSelection(sel('todo', 2), items)).toBe(true);
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(true);
  });

  it('todo のアイテム選択時は section コンテナへフォールバック（編集モード未連動）', () => {
    const items = { todo: [{ id: 't1' }, { id: 't2' }] };
    expect(focusInputAtSelection(sel('todo', 0), items)).toBe(true);
    // アイテム選択時は直接編集 input へ解決できないため section コンテナへ
    expect(document.activeElement?.getAttribute('data-focus-section')).toBe('todo');
  });

  it('セクション不在時は false', () => {
    document.body.innerHTML = '';
    expect(focusInputAtSelection(sel('theme'), {})).toBe(false);
  });
});

describe('focusItemById', () => {
  beforeEach(setupDom);

  it('指定 id のアイテムへフォーカス', () => {
    expect(focusItemById('todo', 't2')).toBe(true);
    expect(document.activeElement?.getAttribute('data-focus-item')).toBe('t2');
  });

  it('存在しない id は false', () => {
    expect(focusItemById('todo', 'nope')).toBe(false);
  });
});

describe('isTextInputElement（[§3.4/§10.5]: Vim/ガイドの入力要素貫通判定）', () => {
  // 本関数は Vim の Normal 操作（vim.ts）とキーバインドガイド起動（?）の両方で
  // 「入力要素へフォーカス中は処理せず文字入力へ貫通」の判定に使う。そのため直接テストする。

  it('null は false', () => {
    expect(isTextInputElement(null)).toBe(false);
  });

  it('button は false（Vim hjkl 有効・ガイド開く）', () => {
    document.body.innerHTML = '<button id="b"></button>';
    expect(isTextInputElement(document.getElementById('b'))).toBe(false);
  });

  it('section は false', () => {
    document.body.innerHTML = '<section id="s"></section>';
    expect(isTextInputElement(document.getElementById('s'))).toBe(false);
  });

  it('input は true', () => {
    document.body.innerHTML = '<input id="i" />';
    expect(isTextInputElement(document.getElementById('i'))).toBe(true);
  });

  it('textarea は true', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    expect(isTextInputElement(document.getElementById('t'))).toBe(true);
  });

  it('contenteditable="true" は true（CodeMirror の .cm-content 相当）', () => {
    document.body.innerHTML = '<div id="ce" contenteditable="true"></div>';
    expect(isTextInputElement(document.getElementById('ce'))).toBe(true);
  });

  it('contenteditable="" （空文字）は true', () => {
    document.body.innerHTML = '<div id="ce2" contenteditable=""></div>';
    expect(isTextInputElement(document.getElementById('ce2'))).toBe(true);
  });

  it('contenteditable="false" は false', () => {
    document.body.innerHTML = '<div id="cef" contenteditable="false"></div>';
    expect(isTextInputElement(document.getElementById('cef'))).toBe(false);
  });
});

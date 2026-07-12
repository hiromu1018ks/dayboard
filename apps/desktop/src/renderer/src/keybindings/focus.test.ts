/**
 * フォーカス制御ヘルパの Unit テスト（[roadmap.md T-7-03/06]、[§3.2/§3.4]）
 *
 * focusSectionInput / getFocusedSection / focusAdjacentSection / focusItemInCurrentSection の検証。
 * jsdom 環境で実行する（document API を使用）。
 *
 * テストの DOM 構造は実際のコンポーネント（TodoColumn 等）と同じ構造にする:
 * - コンテナ要素（section）に data-focus-section
 * - 入力要素（input/textarea）に data-focus-input
 * - 各項目（button）に data-focus-item
 * これにより、実コンポーネントでのフォーカス挙動を正しく検証できる。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  focusSectionInput,
  getFocusedSection,
  getFocusedItemId,
  focusAdjacentSection,
  focusItemInCurrentSection,
  SECTION_ORDER,
  type WorkSection,
} from './focus.js';

/**
 * テスト用のダミーセクション要素群を生成して document.body へ配置。
 * 実際の TodoColumn/BlockerColumn/ReflectionColumn と同じ DOM 構造を再現:
 *   <section data-focus-section="todo">
 *     <ul><li><button data-focus-item="t1"></ul>
 *     <input data-focus-input>
 *   </section>
 */
function setupSections(sections: { section: WorkSection; items?: string[] }[]): void {
  document.body.innerHTML = '';
  for (const { section, items } of sections) {
    // コンテナ要素（<section> 相当）に data-focus-section を付与
    const wrap = document.createElement('section');
    wrap.dataset.focusSection = section;

    // 項目リスト（ul > li > button[data-focus-item]）。実際の TodoColumn と同じ構造。
    if (items && items.length > 0) {
      const ul = document.createElement('ul');
      for (const id of items) {
        const li = document.createElement('li');
        const item = document.createElement('button');
        item.dataset.focusItem = id;
        item.tabIndex = 0;
        li.appendChild(item);
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }

    // セクション内の入力要素（追加入力欄 相当）へ data-focus-input を付与
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.focusInput = '';
    wrap.appendChild(input);

    document.body.appendChild(wrap);
  }
}

describe('SECTION_ORDER（[§3.4]: theme↔todo↔blocker↔reflection）', () => {
  it('列の順序が正しい', () => {
    expect(SECTION_ORDER).toEqual(['theme', 'todo', 'blocker', 'reflection']);
  });
});

describe('focusSectionInput / getFocusedSection（[§3.2]）', () => {
  beforeEach(() => {
    setupSections([
      { section: 'theme' },
      { section: 'todo', items: ['t1', 't2', 't3'] },
      { section: 'blocker', items: ['b1'] },
      { section: 'reflection' },
    ]);
  });

  it('focusSectionInput で指定セクションの入力要素へフォーカス', () => {
    expect(focusSectionInput('todo')).toBe(true);
    expect(getFocusedSection()).toBe('todo');
    // フォーカス先が data-focus-input 要素（input）
    expect(document.activeElement?.hasAttribute('data-focus-input')).toBe(true);
  });

  it('focusSectionInput で reflection（textarea）へフォーカス', () => {
    expect(focusSectionInput('reflection')).toBe(true);
    expect(getFocusedSection()).toBe('reflection');
  });

  it('存在しないセクションは false', () => {
    document.body.innerHTML = '';
    expect(focusSectionInput('todo')).toBe(false);
  });

  it('フォーカスが無い時 getFocusedSection は null', () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(getFocusedSection()).toBeNull();
  });

  it('項目（data-focus-item）にフォーカスしても getFocusedSection で正しいセクションを返す（Bug1 回帰テスト）', () => {
    // todo セクションの t1 ボタンへ直接フォーカス
    const t1Button = document.querySelector<HTMLButtonElement>('[data-focus-item="t1"]')!;
    t1Button.focus();
    // closest('[data-focus-section]') で section コンテナへ辿れる
    expect(getFocusedSection()).toBe('todo');
    expect(getFocusedItemId()).toBe('t1');
  });
});

describe('focusAdjacentSection（[§3.4] の列移動、循環なし）', () => {
  beforeEach(() => {
    setupSections([
      { section: 'theme' },
      { section: 'todo', items: ['t1'] },
      { section: 'blocker', items: ['b1'] },
      { section: 'reflection' },
    ]);
  });

  it('theme から右へ → todo → blocker → reflection', () => {
    focusSectionInput('theme');
    expect(focusAdjacentSection('right')).toBe(true);
    expect(getFocusedSection()).toBe('todo');
    expect(focusAdjacentSection('right')).toBe(true);
    expect(getFocusedSection()).toBe('blocker');
    expect(focusAdjacentSection('right')).toBe(true);
    expect(getFocusedSection()).toBe('reflection');
  });

  it('reflection から右へは止まる（循環しない）', () => {
    focusSectionInput('reflection');
    expect(focusAdjacentSection('right')).toBe(false);
    expect(getFocusedSection()).toBe('reflection');
  });

  it('theme から左へは止まる', () => {
    focusSectionInput('theme');
    expect(focusAdjacentSection('left')).toBe(false);
  });

  it('todo → theme（左）→ 左端で止まる', () => {
    focusSectionInput('todo');
    expect(focusAdjacentSection('left')).toBe(true);
    expect(getFocusedSection()).toBe('theme');
    expect(focusAdjacentSection('left')).toBe(false);
  });

  it('フォーカスが無い時は theme へフォーカス', () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(focusAdjacentSection('right')).toBe(true);
    expect(getFocusedSection()).toBe('theme');
  });

  it('項目フォーカス中の h/l で列移動できる（Bug1 回帰テスト）', () => {
    // todo の t1 にフォーカス
    document.querySelector<HTMLButtonElement>('[data-focus-item="t1"]')!.focus();
    expect(getFocusedSection()).toBe('todo');
    // l で blocker の入力要素へ
    expect(focusAdjacentSection('right')).toBe(true);
    expect(getFocusedSection()).toBe('blocker');
    // h で todo へ戻る
    expect(focusAdjacentSection('left')).toBe(true);
    expect(getFocusedSection()).toBe('todo');
  });
});

describe('focusItemInCurrentSection（[§3.4] の j/k、循環なし）', () => {
  beforeEach(() => {
    setupSections([
      { section: 'todo', items: ['t1', 't2', 't3'] },
      { section: 'blocker', items: ['b1'] },
    ]);
  });

  it('セクション入力欄から j で先頭項目へ（Bug1 回帰テスト: closest で section を辿れる）', () => {
    focusSectionInput('todo');
    // セクション入力欄（input）から項目へ移動
    expect(focusItemInCurrentSection('down')).toBe(true);
    expect(getFocusedItemId()).toBe('t1');
  });

  it('j 連続で次項目へ', () => {
    focusSectionInput('todo');
    focusItemInCurrentSection('down'); // → t1
    expect(focusItemInCurrentSection('down')).toBe(true); // → t2
    expect(getFocusedItemId()).toBe('t2');
    expect(focusItemInCurrentSection('down')).toBe(true); // → t3
    expect(getFocusedItemId()).toBe('t3');
  });

  it('末尾で j は止まる（循環しない）', () => {
    focusSectionInput('todo');
    focusItemInCurrentSection('down'); // → t1
    focusItemInCurrentSection('down'); // → t2
    focusItemInCurrentSection('down'); // → t3
    expect(focusItemInCurrentSection('down')).toBe(false); // 末尾で止まる
    expect(getFocusedItemId()).toBe('t3');
  });

  it('先頭で k は止まる', () => {
    focusSectionInput('todo');
    focusItemInCurrentSection('down'); // → t1
    expect(focusItemInCurrentSection('up')).toBe(false); // 先頭で止まる
    expect(getFocusedItemId()).toBe('t1');
  });

  it('未選択時の k で末尾項目へ', () => {
    focusSectionInput('todo');
    expect(focusItemInCurrentSection('up')).toBe(true); // → t3
    expect(getFocusedItemId()).toBe('t3');
  });

  it('セクション外のフォーカス時は false', () => {
    document.body.innerHTML = '<input type="text" id="x" />';
    const x = document.getElementById('x') as HTMLInputElement;
    x.focus();
    expect(focusItemInCurrentSection('down')).toBe(false);
  });

  it('項目が無いセクションは false', () => {
    setupSections([{ section: 'reflection' }]);
    focusSectionInput('reflection');
    expect(focusItemInCurrentSection('down')).toBe(false);
  });
});

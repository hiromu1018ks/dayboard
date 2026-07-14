/**
 * selection model の Unit テスト（[ui_interaction_spec.md §3.4/§3.5]）
 *
 * selection.ts はピュア TS（DOM/React 非依存、[architecture.md §4]）のため、
 * jsdom 不要の純粋関数テストで網羅する。
 */

import { describe, it, expect } from 'vitest';
import {
  SECTION_ORDER,
  REFLECTION_FIELDS,
  THEME_SELECTION,
  type WorkSelection,
  type WorkLayout,
  initialSelection,
  rowCount,
  clampSelection,
  isOnAddInput,
  selectedItemId,
  moveVertical,
  moveHorizontal,
  transferPosition,
  parseVimCommand,
  classifyKeystroke,
} from './selection.js';

// テスト用の典型的なレイアウト: todo=3件、blocker=2件、reflection=3フィールド、theme=入力欄あり
const LAYOUT: WorkLayout = {
  theme: { hasInput: true },
  todo: { itemCount: 3 },
  blocker: { itemCount: 2 },
  reflection: {},
};

const todo = (itemIndex: number | null): WorkSelection => ({
  section: 'todo',
  itemIndex,
  field: null,
});
const blocker = (itemIndex: number | null): WorkSelection => ({
  section: 'blocker',
  itemIndex,
  field: null,
});
const reflection = (field: (typeof REFLECTION_FIELDS)[number]): WorkSelection => ({
  section: 'reflection',
  itemIndex: null,
  field,
});

describe('SECTION_ORDER / REFLECTION_FIELDS', () => {
  it('列の順序が正しい', () => {
    expect(SECTION_ORDER).toEqual(['theme', 'todo', 'blocker', 'reflection']);
  });
  it('reflection フィールドの順序が正しい', () => {
    expect(REFLECTION_FIELDS).toEqual(['doneText', 'stuckText', 'tomorrowActionText']);
  });
});

describe('THEME_SELECTION / initialSelection', () => {
  it('THEME_SELECTION は theme/null/null', () => {
    expect(THEME_SELECTION).toEqual({ section: 'theme', itemIndex: null, field: null });
  });
  it('initialSelection(theme) は theme', () => {
    expect(initialSelection('theme')).toEqual({ section: 'theme', itemIndex: null, field: null });
  });
  it('initialSelection(reflection) は doneText', () => {
    expect(initialSelection('reflection')).toEqual({
      section: 'reflection',
      itemIndex: null,
      field: 'doneText',
    });
  });
  it('initialSelection(todo/blocker) は未確定（null）', () => {
    expect(initialSelection('todo')).toEqual({ section: 'todo', itemIndex: null, field: null });
    expect(initialSelection('blocker')).toEqual({
      section: 'blocker',
      itemIndex: null,
      field: null,
    });
  });
});

describe('rowCount', () => {
  it('theme は1行', () => {
    expect(rowCount('theme', LAYOUT)).toBe(1);
  });
  it('reflection は3行', () => {
    expect(rowCount('reflection', LAYOUT)).toBe(3);
  });
  it('todo は itemCount+1（追加入力欄）= 4', () => {
    expect(rowCount('todo', LAYOUT)).toBe(4);
  });
  it('blocker は itemCount+1 = 3', () => {
    expect(rowCount('blocker', LAYOUT)).toBe(3);
  });
  it('レイアウト未定義の todo は0', () => {
    expect(rowCount('todo', {})).toBe(0);
  });
});

describe('clampSelection', () => {
  it('theme は常に theme へ正規化', () => {
    expect(clampSelection({ section: 'theme', itemIndex: 99, field: 'doneText' }, LAYOUT)).toEqual(
      THEME_SELECTION,
    );
  });
  it('reflection の不正 field は doneText へ', () => {
    expect(clampSelection({ section: 'reflection', itemIndex: 1, field: null }, LAYOUT)).toEqual(
      reflection('doneText'),
    );
  });
  it('reflection の妥当 field は保持', () => {
    expect(clampSelection(reflection('stuckText'), LAYOUT)).toEqual(reflection('stuckText'));
  });
  it('todo の null itemIndex は先頭(0)へ（アイテムあれば）', () => {
    expect(clampSelection(todo(null), LAYOUT)).toEqual(todo(0));
  });
  it('todo の範囲外 itemIndex は末尾（追加入力欄=3）へ', () => {
    expect(clampSelection(todo(99), LAYOUT)).toEqual(todo(3));
  });
  it('todo の範囲内 itemIndex は保持', () => {
    expect(clampSelection(todo(1), LAYOUT)).toEqual(todo(1));
  });
});

describe('isOnAddInput', () => {
  it('todo で itemIndex=itemCount(3) は追加入力欄', () => {
    expect(isOnAddInput(todo(3), LAYOUT)).toBe(true);
  });
  it('todo で itemIndex<itemCount は追加入力欄でない', () => {
    expect(isOnAddInput(todo(0), LAYOUT)).toBe(false);
    expect(isOnAddInput(todo(2), LAYOUT)).toBe(false);
  });
  it('theme/reflection は常に false', () => {
    expect(isOnAddInput(THEME_SELECTION, LAYOUT)).toBe(false);
    expect(isOnAddInput(reflection('doneText'), LAYOUT)).toBe(false);
  });
  it('null itemIndex は false', () => {
    expect(isOnAddInput(todo(null), LAYOUT)).toBe(false);
  });
});

describe('selectedItemId', () => {
  const items = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
  it('妥当 index は該当 id', () => {
    expect(selectedItemId(todo(0), items)).toBe('t1');
    expect(selectedItemId(todo(2), items)).toBe('t3');
  });
  it('追加入力欄(index=3) は null', () => {
    expect(selectedItemId(todo(3), items)).toBeNull();
  });
  it('null itemIndex は null', () => {
    expect(selectedItemId(todo(null), items)).toBeNull();
  });
  it('範囲外は null', () => {
    expect(selectedItemId(todo(99), items)).toBeNull();
  });
});

describe('moveVertical (j/k)', () => {
  describe('todo', () => {
    it('down で次項目へ（0→1→2→追加入力欄3 で停止）', () => {
      let s = todo(0);
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(todo(1));
      s = todo(1);
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(todo(2));
      s = todo(2);
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(todo(3)); // 追加入力欄
      s = todo(3);
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(todo(3)); // 末尾で停止
    });
    it('up で前項目へ（追加入力欄3→2→1→0 で停止）', () => {
      let s = todo(3);
      expect(moveVertical(s, 'up', LAYOUT)).toEqual(todo(2));
      s = todo(0);
      expect(moveVertical(s, 'up', LAYOUT)).toEqual(todo(0)); // 先頭で停止
    });
    it('未選択(null) から down は先頭(0)へ', () => {
      expect(moveVertical(todo(null), 'down', LAYOUT)).toEqual(todo(0));
    });
    it('未選択(null) から up は末尾(3=追加入力欄)へ', () => {
      expect(moveVertical(todo(null), 'up', LAYOUT)).toEqual(todo(3));
    });
    it('count 指定で一気に移動（3j で 0→3）', () => {
      expect(moveVertical(todo(0), 'down', LAYOUT, 3)).toEqual(todo(3));
    });
    it('count 超過で停止（1番目から5下へは3で止まる）', () => {
      expect(moveVertical(todo(0), 'down', LAYOUT, 5)).toEqual(todo(3));
    });
  });

  describe('reflection', () => {
    it('down で doneText→stuckText→tomorrowActionText で停止', () => {
      let s = reflection('doneText');
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(reflection('stuckText'));
      s = reflection('stuckText');
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(reflection('tomorrowActionText'));
      s = reflection('tomorrowActionText');
      expect(moveVertical(s, 'down', LAYOUT)).toEqual(reflection('tomorrowActionText')); // 停止
    });
    it('up で tomorrowActionText→stuckText→doneText で停止', () => {
      let s = reflection('tomorrowActionText');
      expect(moveVertical(s, 'up', LAYOUT)).toEqual(reflection('stuckText'));
      s = reflection('doneText');
      expect(moveVertical(s, 'up', LAYOUT)).toEqual(reflection('doneText')); // 停止
    });
  });

  describe('theme', () => {
    it('theme は上下移動不可（そのまま）', () => {
      expect(moveVertical(THEME_SELECTION, 'down', LAYOUT)).toEqual(THEME_SELECTION);
      expect(moveVertical(THEME_SELECTION, 'up', LAYOUT)).toEqual(THEME_SELECTION);
    });
  });
});

describe('moveHorizontal (h/l)', () => {
  it('右へ theme→todo→blocker→reflection', () => {
    expect(moveHorizontal(THEME_SELECTION, 'right', LAYOUT).section).toBe('todo');
    expect(moveHorizontal(todo(1), 'right', LAYOUT).section).toBe('blocker');
    expect(moveHorizontal(blocker(0), 'right', LAYOUT).section).toBe('reflection');
  });
  it('左へ reflection→blocker→todo→theme', () => {
    expect(moveHorizontal(reflection('doneText'), 'left', LAYOUT).section).toBe('blocker');
    expect(moveHorizontal(blocker(0), 'left', LAYOUT).section).toBe('todo');
    expect(moveHorizontal(todo(0), 'left', LAYOUT).section).toBe('theme');
  });
  it('theme から左、reflection から右は停止（元と同じ）', () => {
    expect(moveHorizontal(THEME_SELECTION, 'left', LAYOUT)).toEqual(THEME_SELECTION);
    expect(moveHorizontal(reflection('doneText'), 'right', LAYOUT)).toEqual(reflection('doneText'));
  });
  it('行位置を相対で維持（todo の中間→blocker の中間）', () => {
    // todo は4行(0..3)、blocker は3行(0..2)。todo の 2/3 位置(=2)は blocker の 2/3 → floor(2/3*3)=2
    const moved = moveHorizontal(todo(2), 'right', LAYOUT);
    expect(moved.section).toBe('blocker');
    expect(moved.itemIndex).toBe(2); // 相対位置 2/3 → blocker 3行中 idx 2
  });
  it('todo から右へは blocker（隣接列）', () => {
    const moved = moveHorizontal(todo(0), 'right', LAYOUT); // todo 先頭 → blocker
    expect(moved.section).toBe('blocker');
  });
});

describe('transferPosition', () => {
  it('theme へは常に theme', () => {
    expect(transferPosition(todo(1), 'theme', LAYOUT)).toEqual(THEME_SELECTION);
  });
  it('reflection へは3フィールドのいずれか', () => {
    const r = transferPosition(todo(0), 'reflection', LAYOUT);
    expect(r.section).toBe('reflection');
    expect(REFLECTION_FIELDS).toContain(r.field);
  });
  it('todo へは追加入力欄を含む有効 index', () => {
    const t = transferPosition(reflection('stuckText'), 'todo', LAYOUT);
    expect(t.section).toBe('todo');
    expect(t.itemIndex).not.toBeNull();
  });
});

describe('transferPosition: reflection → todo/blocker の相対位置（#7 回帰）', () => {
  // #7: positionRatio で reflection の tomorrowActionText(idx=2) が 1.0 になり、
  // todo/blocker へ転送時に常に追加入力欄（末尾）へ飛んでいた問題。
  // 修正後は idx/length で中間寄り（0, 0.33, 0.66）になる。
  it('reflection doneText → todo は先頭', () => {
    // doneText(0/3=0) → todo 4行 floor(0*4)=0（先頭アイテム）
    const t = transferPosition(reflection('doneText'), 'todo', LAYOUT);
    expect(t.itemIndex).toBe(0);
  });
  it('reflection stuckText → todo は中間', () => {
    // stuckText(1/3=0.33) → todo 4行 floor(0.33*4)=1
    const t = transferPosition(reflection('stuckText'), 'todo', LAYOUT);
    expect(t.itemIndex).toBe(1);
  });
  it('reflection tomorrowActionText → todo は末尾寄り（追加入力欄=3 を超えない）', () => {
    // tomorrowActionText(2/3=0.66) → todo 4行。floor(0.66*4)=2（最後のアイテム idx=2、追加入力欄=3 ではない）
    const t = transferPosition(reflection('tomorrowActionText'), 'todo', LAYOUT);
    expect(t.section).toBe('todo');
    expect(t.itemIndex).toBe(2); // 最後のアイテム。追加入力欄(3)ではない
  });
  it('reflection tomorrowActionText → blocker は範囲内（追加入力欄=2 を超えない）', () => {
    // blocker は3行(0..2)。ratio=0.66 → floor(0.66*3)=1 だが浮動小数点誤差で2になる可能性。
    // clampedRatio(0.999999) で安全に2（=追加入力欄、blocker の末尾）へ。範囲内であれば妥当。
    const b = transferPosition(reflection('tomorrowActionText'), 'blocker', LAYOUT);
    expect(b.section).toBe('blocker');
    expect(b.itemIndex).toBeGreaterThanOrEqual(1);
    expect(b.itemIndex).toBeLessThanOrEqual(2); // 追加入力欄(2)は妥当な末尾
  });
});

describe('parseVimCommand', () => {
  it('h/j/k/l を移動コマンドへ', () => {
    expect(parseVimCommand('h')).toEqual({ kind: 'move', direction: 'left', count: 1 });
    expect(parseVimCommand('l')).toEqual({ kind: 'move', direction: 'right', count: 1 });
    expect(parseVimCommand('j')).toEqual({ kind: 'move', direction: 'down', count: 1 });
    expect(parseVimCommand('k')).toEqual({ kind: 'move', direction: 'up', count: 1 });
  });
  it('数字前置で count 指定（3j 等）', () => {
    expect(parseVimCommand('3j')).toEqual({ kind: 'move', direction: 'down', count: 3 });
    expect(parseVimCommand('5k')).toEqual({ kind: 'move', direction: 'up', count: 5 });
  });
  it('gg は goto-first', () => {
    expect(parseVimCommand('gg')).toEqual({ kind: 'goto-first', count: 1 });
  });
  it('G（大文字単体）は goto-last', () => {
    expect(parseVimCommand('G')).toEqual({ kind: 'goto-last' });
  });
  it('g（小文字単体）は null（リーダー継続を期待）', () => {
    expect(parseVimCommand('g')).toBeNull();
  });
  it('{n}G（大文字）は goto-line', () => {
    expect(parseVimCommand('2G')).toEqual({ kind: 'goto-line', line: 2 });
  });
  it('A（大文字）は edit-append-end', () => {
    expect(parseVimCommand('A')).toEqual({ kind: 'edit-append-end' });
  });
  it('O（大文字）は add-above', () => {
    expect(parseVimCommand('O')).toEqual({ kind: 'add-above' });
  });
  it('dd は delete', () => {
    expect(parseVimCommand('dd')).toEqual({ kind: 'delete' });
  });
  it('編集系 i/a/o を解析', () => {
    expect(parseVimCommand('i')).toEqual({ kind: 'edit-insert' });
    expect(parseVimCommand('a')).toEqual({ kind: 'edit-append' });
    expect(parseVimCommand('o')).toEqual({ kind: 'add-below' });
  });
  it('x は toggle', () => {
    expect(parseVimCommand('x')).toEqual({ kind: 'toggle' });
  });
  it('u は undo', () => {
    expect(parseVimCommand('u')).toEqual({ kind: 'undo' });
  });
  it('ctrl+r は redo', () => {
    expect(parseVimCommand('ctrl+r')).toEqual({ kind: 'redo' });
  });
  it('数字のみは null（リーダー継続を期待）', () => {
    expect(parseVimCommand('3')).toBeNull();
  });
  it('空文字・未サポートは null', () => {
    expect(parseVimCommand('')).toBeNull();
    expect(parseVimCommand('zzz')).toBeNull();
  });
});

describe('classifyKeystroke', () => {
  it('数字のみは leader', () => {
    expect(classifyKeystroke('3')).toBe('leader');
    expect(classifyKeystroke('12')).toBe('leader');
  });
  it('g / d 単体は leader', () => {
    expect(classifyKeystroke('g')).toBe('leader');
    expect(classifyKeystroke('d')).toBe('leader');
  });
  it('h/j/k/l/i/a/o/x/u は complete', () => {
    expect(classifyKeystroke('h')).toBe('complete');
    expect(classifyKeystroke('j')).toBe('complete');
    expect(classifyKeystroke('i')).toBe('complete');
    expect(classifyKeystroke('x')).toBe('complete');
    expect(classifyKeystroke('u')).toBe('complete');
  });
  it('gg / dd は complete', () => {
    expect(classifyKeystroke('gg')).toBe('complete');
    expect(classifyKeystroke('dd')).toBe('complete');
  });
  it('未サポートは invalid', () => {
    expect(classifyKeystroke('z')).toBe('invalid');
    expect(classifyKeystroke('')).toBe('invalid');
  });
});

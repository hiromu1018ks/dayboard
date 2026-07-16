/**
 * キーバインドガイド起動キー判定の Unit テスト（[roadmap.md T-7-G-01]）
 *
 * [ui_interaction_spec.md §10.5]、[要件 8.1]、AC-23:
 * - `?`（修飾キーなし）でガイドをトグル
 * - 修飾キー付き（⌘? 等）は除外
 *
 * 判定関数は純粋（KeyboardEvent を受け取って bool を返す）。
 * 入力要素フォーカス中の貫通判定は App.tsx 側（`isTextInputElement`）で行うため、
 * 本テストではキー判定のみを検証する。
 */

import { describe, it, expect } from 'vitest';
import { isHelpShortcut } from './help.js';

/** KeyboardEvent のモックを簡易生成するヘルパ */
function keyEvent(props: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    ...props,
  } as KeyboardEvent;
}

describe('キーバインドガイド: isHelpShortcut (?)（[§10.5]、AC-23）', () => {
  it('? 単体で true', () => {
    expect(isHelpShortcut(keyEvent({ key: '?' }))).toBe(true);
  });

  it('Shift + ?（key は "?"）で true（キーボード配列非依存）', () => {
    // JIS/US 配列どちらでも e.key === '?' になるため shiftKey の有無は問わない
    expect(isHelpShortcut(keyEvent({ key: '?', shiftKey: true }))).toBe(true);
  });

  it('修飾キーなしの "/" は false', () => {
    expect(isHelpShortcut(keyEvent({ key: '/' }))).toBe(false);
  });

  it('⌘ + ? は false（OS/ブラウザショートカットと衝突回避）', () => {
    expect(isHelpShortcut(keyEvent({ key: '?', metaKey: true }))).toBe(false);
  });

  it('Ctrl + ? は false', () => {
    expect(isHelpShortcut(keyEvent({ key: '?', ctrlKey: true }))).toBe(false);
  });

  it('Alt + ? は false', () => {
    expect(isHelpShortcut(keyEvent({ key: '?', altKey: true }))).toBe(false);
  });

  it('全修飾キーオフの別キーは false', () => {
    expect(isHelpShortcut(keyEvent({ key: 'a' }))).toBe(false);
    expect(isHelpShortcut(keyEvent({ key: 'Escape' }))).toBe(false);
  });
});

/**
 * Esc 4段優先順位の Unit テスト（[roadmap.md T-4-07/T-7-09]、[ui_interaction_spec.md §9.2]）
 *
 * 優先順位:
 *   1. IME 変換中（呼出前ガード済みだが、本関数到達時は IME 終了済みの前提）
 *   2. Vim Insert → Normal（AC-17）
 *   3. 設定モーダル open → 閉じる
 *   4. ノートモード時 → 仕事整理モードへ戻る（AC-04/AC-18）
 *
 * handleEsc は純粋（ctx を受け取って bool を返す）。
 */

import { describe, it, expect, vi } from 'vitest';
import { handleEsc, type EscContext } from './escPriority.js';

/** EscContext のモックを生成するヘルパ */
function ctx(props: Partial<EscContext>): EscContext {
  return {
    viewMode: 'note',
    vimState: 'normal',
    settingsOpen: false,
    setVimState: vi.fn(),
    refocusSelection: vi.fn(),
    closeSettings: vi.fn(),
    goToWork: vi.fn(),
    ...props,
  };
}

describe('Esc 4段優先順位（[§9.2]）', () => {
  describe('段2: Vim Insert → Normal（AC-17）', () => {
    it('Vim Insert 状態では Normal へ戻るのみ（ノートモードでも離脱しない）', () => {
      const c = ctx({ viewMode: 'note', vimState: 'insert', settingsOpen: false });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.setVimState).toHaveBeenCalledWith('normal');
      // ノートモード離脱は呼ばれない（AC-17）
      expect(c.goToWork).not.toHaveBeenCalled();
    });

    it('Vim Insert + 設定モーダル open の場合も Insert→Normal が優先', () => {
      const c = ctx({ vimState: 'insert', settingsOpen: true });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.setVimState).toHaveBeenCalledWith('normal');
      // モーダル閉じるは呼ばれない（段2が優先）
      expect(c.closeSettings).not.toHaveBeenCalled();
    });

    it('Insert → Normal 復帰時に refocusSelection が呼ばれる（入力欄からフォーカスを戻す）', () => {
      const c = ctx({ viewMode: 'work', vimState: 'insert' });
      handleEsc(c);
      expect(c.refocusSelection).toHaveBeenCalledOnce();
    });

    it('refocusSelection が未指定でも Insert→Normal 自体は動く（ノートモード等）', () => {
      const c = ctx({ viewMode: 'note', vimState: 'insert', refocusSelection: undefined });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.setVimState).toHaveBeenCalledWith('normal');
    });
  });

  describe('段3: 設定モーダル open → 閉じる', () => {
    it('モーダル open 時は閉じるのみ', () => {
      const c = ctx({ viewMode: 'work', vimState: 'normal', settingsOpen: true });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.closeSettings).toHaveBeenCalled();
      // work 戻りは呼ばれない
      expect(c.goToWork).not.toHaveBeenCalled();
    });

    it('ノートモード + モーダル open の場合もモーダル閉じるが優先', () => {
      const c = ctx({ viewMode: 'note', vimState: 'normal', settingsOpen: true });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.closeSettings).toHaveBeenCalled();
      expect(c.goToWork).not.toHaveBeenCalled();
    });
  });

  describe('段4: ノートモード → work 戻り（AC-04/AC-18）', () => {
    it('ノートモード（Normal/標準）では work へ戻る', () => {
      const c = ctx({ viewMode: 'note', vimState: 'normal', settingsOpen: false });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.goToWork).toHaveBeenCalled();
    });

    it('Vim Normal 状態でノートモードの場合、work へ戻る（AC-18）', () => {
      const c = ctx({ viewMode: 'note', vimState: 'normal', settingsOpen: false });
      const result = handleEsc(c);
      expect(result).toBe(true);
      expect(c.goToWork).toHaveBeenCalled();
      // setVimState は呼ばれない（既に Normal のため）
      expect(c.setVimState).not.toHaveBeenCalled();
    });
  });

  describe('該当なし', () => {
    it('仕事整理モード + Normal + モーダル閉じ は何もしない', () => {
      const c = ctx({ viewMode: 'work', vimState: 'normal', settingsOpen: false });
      const result = handleEsc(c);
      expect(result).toBe(false);
      expect(c.goToWork).not.toHaveBeenCalled();
      expect(c.closeSettings).not.toHaveBeenCalled();
      expect(c.setVimState).not.toHaveBeenCalled();
    });
  });
});

/**
 * 標準キーバインド判定の Unit テスト（[roadmap.md T-7-03/04/10]）
 *
 * [ui_interaction_spec.md §11.1/§11.2/§11.5]、[要件 8.1/8.2/8.6]:
 * - 共通ショートカット（⌘J, ⌘T, Option←/→）の判定
 * - 仕事整理モード専用（⌘1/2/3, ⌘Enter）
 * - Post-MVP 無効化（⌘K, ⌘Shift+R, ⌘Shift+M）
 *
 * 判定関数は純粋（KeyboardEvent を受け取ってbool/セクションを返す）。
 * KeyboardEvent は必要なプロパティだけを持つモックオブジェクトで検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  isToggleModeShortcut,
  isGoTodayShortcut,
  isGoPrevDayShortcut,
  isGoNextDayShortcut,
  isPostMvpShortcut,
  isToggleSidebarShortcut,
  matchColumnFocusShortcut,
  isAddTodoShortcut,
} from './standard.js';

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

describe('標準キーバインド: 共通ショートカット（[§11.1]）', () => {
  describe('isToggleModeShortcut (⌘/Ctrl+J)', () => {
    it('Mac の ⌘+J で true', () => {
      expect(isToggleModeShortcut(keyEvent({ metaKey: true, key: 'j' }))).toBe(true);
    });
    it('Win の Ctrl+J で true', () => {
      expect(isToggleModeShortcut(keyEvent({ ctrlKey: true, key: 'j' }))).toBe(true);
    });
    it('大文字 J でも true（CapsLock 吸収）', () => {
      expect(isToggleModeShortcut(keyEvent({ metaKey: true, key: 'J' }))).toBe(true);
    });
    it('Shift 付きは false（⌘Shift+J はモード切替ではない）', () => {
      expect(isToggleModeShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 'j' }))).toBe(
        false,
      );
    });
    it('Alt 付きは false', () => {
      expect(isToggleModeShortcut(keyEvent({ metaKey: true, altKey: true, key: 'j' }))).toBe(false);
    });
    it('修飾キー無しは false', () => {
      expect(isToggleModeShortcut(keyEvent({ key: 'j' }))).toBe(false);
    });
    it('別のキーは false', () => {
      expect(isToggleModeShortcut(keyEvent({ metaKey: true, key: 'k' }))).toBe(false);
    });
  });

  describe('isGoTodayShortcut (⌘/Ctrl+T)', () => {
    it('⌘+T で true', () => {
      expect(isGoTodayShortcut(keyEvent({ metaKey: true, key: 't' }))).toBe(true);
    });
    it('Ctrl+T で true', () => {
      expect(isGoTodayShortcut(keyEvent({ ctrlKey: true, key: 't' }))).toBe(true);
    });
    it('Shift 付きは false', () => {
      expect(isGoTodayShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 't' }))).toBe(false);
    });
  });

  describe('isGoPrevDayShortcut (Alt/Option+←)', () => {
    it('Alt+← で true', () => {
      expect(isGoPrevDayShortcut(keyEvent({ altKey: true, key: 'ArrowLeft' }))).toBe(true);
    });
    it('⌘+Alt+← は false（⌘ と併用しない）', () => {
      expect(isGoPrevDayShortcut(keyEvent({ metaKey: true, altKey: true, key: 'ArrowLeft' }))).toBe(
        false,
      );
    });
    it('← 単独は false', () => {
      expect(isGoPrevDayShortcut(keyEvent({ key: 'ArrowLeft' }))).toBe(false);
    });
  });

  describe('isGoNextDayShortcut (Alt/Option+→)', () => {
    it('Alt+→ で true', () => {
      expect(isGoNextDayShortcut(keyEvent({ altKey: true, key: 'ArrowRight' }))).toBe(true);
    });
    it('Ctrl+Alt+→ は false', () => {
      expect(
        isGoNextDayShortcut(keyEvent({ ctrlKey: true, altKey: true, key: 'ArrowRight' })),
      ).toBe(false);
    });
  });
});

describe('標準キーバインド: 仕事整理モード専用（[§11.2]）', () => {
  describe('matchColumnFocusShortcut (⌘1/2/3)', () => {
    it('⌘+1 → todo', () => {
      expect(matchColumnFocusShortcut(keyEvent({ metaKey: true, key: '1' }))).toBe('todo');
    });
    it('⌘+2 → blocker', () => {
      expect(matchColumnFocusShortcut(keyEvent({ metaKey: true, key: '2' }))).toBe('blocker');
    });
    it('⌘+3 → reflection', () => {
      expect(matchColumnFocusShortcut(keyEvent({ metaKey: true, key: '3' }))).toBe('reflection');
    });
    it('Ctrl+1 → todo（Win）', () => {
      expect(matchColumnFocusShortcut(keyEvent({ ctrlKey: true, key: '1' }))).toBe('todo');
    });
    it('Shift 付きは null', () => {
      expect(
        matchColumnFocusShortcut(keyEvent({ metaKey: true, shiftKey: true, key: '1' })),
      ).toBeNull();
    });
    it('⌘+4 は null（未割当）', () => {
      expect(matchColumnFocusShortcut(keyEvent({ metaKey: true, key: '4' }))).toBeNull();
    });
    it('修飾キー無しは null', () => {
      expect(matchColumnFocusShortcut(keyEvent({ key: '1' }))).toBeNull();
    });
  });

  describe('isAddTodoShortcut (⌘Enter)', () => {
    it('⌘+Enter で true', () => {
      expect(isAddTodoShortcut(keyEvent({ metaKey: true, key: 'Enter' }))).toBe(true);
    });
    it('Ctrl+Enter で true', () => {
      expect(isAddTodoShortcut(keyEvent({ ctrlKey: true, key: 'Enter' }))).toBe(true);
    });
    it('Shift+Enter は false', () => {
      expect(isAddTodoShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 'Enter' }))).toBe(
        false,
      );
    });
    it('Enter 単独は false', () => {
      expect(isAddTodoShortcut(keyEvent({ key: 'Enter' }))).toBe(false);
    });
  });
});

describe('Post-MVP ショートカットの無効化（[§11.5]、AC-22）', () => {
  describe('isPostMvpShortcut', () => {
    it('⌘+K（コマンドパレット）で true', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, key: 'k' }))).toBe(true);
    });
    it('Ctrl+K で true', () => {
      expect(isPostMvpShortcut(keyEvent({ ctrlKey: true, key: 'k' }))).toBe(true);
    });
    it('⌘+Shift+R（振り返り送信）で true', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 'r' }))).toBe(true);
    });
    it('⌘+Shift+M（時刻見出し）は false（実装済み機能へ昇格、NoteEditor で消費）', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 'm' }))).toBe(false);
    });
    it('⌘+R（Shift 無し）は false（リロードは別物）', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, key: 'r' }))).toBe(false);
    });
    it('⌘+J（モード切替）は false（MVP有効）', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, key: 'j' }))).toBe(false);
    });
    it('Shift 無し ⌘+M は false', () => {
      expect(isPostMvpShortcut(keyEvent({ metaKey: true, key: 'm' }))).toBe(false);
    });
  });
});

describe('サイドバー切替ショートカット（Post-MVP）', () => {
  describe('isToggleSidebarShortcut', () => {
    it('⌘+\\ で true（Mac）', () => {
      expect(isToggleSidebarShortcut(keyEvent({ metaKey: true, key: '\\' }))).toBe(true);
    });
    it('Ctrl+\\ で true（Win/Linux）', () => {
      expect(isToggleSidebarShortcut(keyEvent({ ctrlKey: true, key: '\\' }))).toBe(true);
    });
    it('Shift+⌘+\\ は false', () => {
      expect(isToggleSidebarShortcut(keyEvent({ metaKey: true, shiftKey: true, key: '\\' }))).toBe(
        false,
      );
    });
    it('\\ 単独は false', () => {
      expect(isToggleSidebarShortcut(keyEvent({ key: '\\' }))).toBe(false);
    });
  });
});

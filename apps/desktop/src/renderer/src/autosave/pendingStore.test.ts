/**
 * pendingStore の Unit テスト（[roadmap.md T-8-02/T-8-03]）
 *
 * localStorage フェイルセーフ層の検証（[edge_cases.md §6.3], [autosave_spec.md §6.2]）:
 * - persistTarget: 保留対象の upsert + localStorage 書込
 * - clearTarget: 部分成功時の対象単位削除、空になったらキー削除
 * - QuotaExceededError: ok:false で通知（フォールバック不可でもメモリバッファに残る前提）
 * - readAllPendingSnapshots: 起動時リカバリの走査
 *
 * 「自動保存失敗による入力喪失 0件」（要件 4.3）の localStorage 保護経路を担保する。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTarget,
  persistTarget,
  readAllPendingSnapshots,
  readSnapshot,
  removePendingKey,
} from './pendingStore.js';

// SaveTarget はオブジェクト型（[pendingSnapshot.ts §25]）。テストでは正しい形状で渡す。
const THEME_TARGET = { type: 'dayNote' as const, field: 'theme' as const };
const NOTE_TARGET = { type: 'noteEntry' as const };

beforeEach(() => {
  localStorage.clear();
});

describe('persistTarget', () => {
  it('保留対象を localStorage へ書き込む', () => {
    const result = persistTarget('2026-07-12', THEME_TARGET, 'テーマ入力');
    expect(result.ok).toBe(true);

    const snapshot = readSnapshot('2026-07-12');
    expect(snapshot.targets['dayNote:theme']?.payload).toBe('テーマ入力');
  });

  it('同一対象の再書込で上書きされる', () => {
    persistTarget('2026-07-12', THEME_TARGET, '1回目');
    persistTarget('2026-07-12', THEME_TARGET, '2回目');

    const snapshot = readSnapshot('2026-07-12');
    expect(snapshot.targets['dayNote:theme']?.payload).toBe('2回目');
  });

  it('別対象を書き込んでも既存対象は保持される（部分保存の保護）', () => {
    persistTarget('2026-07-12', THEME_TARGET, 'テーマ');
    persistTarget('2026-07-12', NOTE_TARGET, 'ノート本文');

    const snapshot = readSnapshot('2026-07-12');
    expect(snapshot.targets['dayNote:theme']?.payload).toBe('テーマ');
    expect(snapshot.targets['noteEntry']?.payload).toBe('ノート本文');
  });

  it('QuotaExceededError 発生時は ok:false を返す（[edge_cases.md §6.3]）', () => {
    // localStorage.setItem が例外を投げるようモック。
    // jsdom の localStorage はプロトタイプメソッドのため、
    // インスタンスのプロパティでオーバーライドする。
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      },
      configurable: true,
      writable: true,
    });

    try {
      const result = persistTarget('2026-07-12', THEME_TARGET, 'テーマ');
      expect(result.ok).toBe(false);
    } finally {
      // 復元（後続テストへの影響を防ぐ）
      if (original) {
        Object.defineProperty(Storage.prototype, 'setItem', original);
      }
    }
  });
});

describe('clearTarget', () => {
  it('サーバー保存成功時に該当対象だけ削除し、他対象は保持する', () => {
    persistTarget('2026-07-12', THEME_TARGET, 'テーマ');
    persistTarget('2026-07-12', NOTE_TARGET, 'ノート本文');

    // テーマだけサーバー保存成功 → 削除
    const result = clearTarget('2026-07-12', THEME_TARGET);
    expect(result.ok).toBe(true);

    // ノート本文は残る
    const snapshot = readSnapshot('2026-07-12');
    expect(snapshot.targets['dayNote:theme']).toBeUndefined();
    expect(snapshot.targets['noteEntry']?.payload).toBe('ノート本文');
  });

  it('全対象が削除されたら日付キー自体を削除する（§6.2）', () => {
    persistTarget('2026-07-12', THEME_TARGET, 'テーマ');

    const result = clearTarget('2026-07-12', THEME_TARGET);
    expect(result.ok).toBe(true);

    // キーが削除され、読込は空スナップショット
    const snapshot = readSnapshot('2026-07-12');
    expect(Object.keys(snapshot.targets)).toHaveLength(0);
  });

  it('存在しない対象の削除でもエラーにならない', () => {
    const result = clearTarget('2026-07-12', THEME_TARGET);
    expect(result.ok).toBe(true);
  });
});

describe('readAllPendingSnapshots（起動時リカバリ走査）', () => {
  it('dayborad:pending:* の全スナップショットを返す', () => {
    persistTarget('2026-07-11', THEME_TARGET, '前日テーマ');
    persistTarget('2026-07-12', THEME_TARGET, '当日テーマ');

    const all = readAllPendingSnapshots();
    expect(all.size).toBe(2);
    expect(all.get('2026-07-11')?.targets['dayNote:theme']?.payload).toBe('前日テーマ');
    expect(all.get('2026-07-12')?.targets['dayNote:theme']?.payload).toBe('当日テーマ');
  });

  it('未保存の日は含まれない', () => {
    persistTarget('2026-07-12', THEME_TARGET, 'テーマ');
    removePendingKey('2026-07-12');

    const all = readAllPendingSnapshots();
    expect(all.size).toBe(0);
  });

  it('無関係な localStorage キーは無視する', () => {
    localStorage.setItem('unrelated-key', 'value');
    persistTarget('2026-07-12', THEME_TARGET, 'テーマ');

    const all = readAllPendingSnapshots();
    expect(all.size).toBe(1);
    expect(all.has('2026-07-12')).toBe(true);
  });
});

describe('readSnapshot（破損データの復帰）', () => {
  it('破損 JSON は空スナップショットとして扱う', () => {
    localStorage.setItem('dayborad:pending:2026-07-12', '{invalid json');
    const snapshot = readSnapshot('2026-07-12');
    expect(Object.keys(snapshot.targets)).toHaveLength(0);
  });

  it('形式不正のデータは空として扱う', () => {
    localStorage.setItem('dayborad:pending:2026-07-12', JSON.stringify({ foo: 'bar' }));
    const snapshot = readSnapshot('2026-07-12');
    expect(Object.keys(snapshot.targets)).toHaveLength(0);
  });

  it('キー未存在時は空スナップショット', () => {
    const snapshot = readSnapshot('2026-07-12');
    expect(Object.keys(snapshot.targets)).toHaveLength(0);
    expect(snapshot.date).toBe('2026-07-12');
  });
});

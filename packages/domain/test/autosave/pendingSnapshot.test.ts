/**
 * PendingSnapshot 純粋関数の Unit テスト（[roadmap.md T-2-06]）
 *
 * [autosave_spec.md §6.2] の対象別マージ・部分成功時の対象単位削除・空判定を網羅する。
 * 重点（test_strategy §6.1）: 同一日付内でテーマ保存だけ成功しても、
 * 未同期のノート本文/TODOスナップショットが削除されないこと。
 *
 * [autosave_spec.md §6.2]: ../../../docs/autosave_spec.md
 */

import { describe, expect, it } from 'vitest';
import {
  type SaveTarget,
  targetKey,
  createEmptySnapshot,
  isSnapshotEmpty,
  upsertTarget,
  removeTarget,
  removeTargets,
  listTargetKeys,
  getTarget,
  pendingKey,
  parsePendingKey,
} from '../../src/autosave/pendingSnapshot.js';

const DATE = '2026-07-08';
const TS = '2026-07-08T10:00:00.000Z';

const themeTarget: SaveTarget = { type: 'dayNote', field: 'theme' };
const noteTarget: SaveTarget = { type: 'noteEntry' };
const todoTarget: SaveTarget = { type: 'todo', id: 'todo_1' };

describe('targetKey（対象キー生成）', () => {
  it('dayNote:theme → dayNote:theme', () => {
    expect(targetKey({ type: 'dayNote', field: 'theme' })).toBe('dayNote:theme');
  });
  it('dayNote:lastOpenedMode → dayNote:lastOpenedMode', () => {
    expect(targetKey({ type: 'dayNote', field: 'lastOpenedMode' })).toBe('dayNote:lastOpenedMode');
  });
  it('noteEntry → noteEntry', () => {
    expect(targetKey({ type: 'noteEntry' })).toBe('noteEntry');
  });
  it('todo:id → todo:id', () => {
    expect(targetKey({ type: 'todo', id: 'todo_1' })).toBe('todo:todo_1');
  });
  it('todoOrder → todoOrder', () => {
    expect(targetKey({ type: 'todoOrder' })).toBe('todoOrder');
  });
  it('blocker:id → blocker:id', () => {
    expect(targetKey({ type: 'blocker', id: 'blk_1' })).toBe('blocker:blk_1');
  });
  it('reflection → reflection', () => {
    expect(targetKey({ type: 'reflection' })).toBe('reflection');
  });
});

describe('createEmptySnapshot / isSnapshotEmpty', () => {
  it('空スナップショットを生成', () => {
    const s = createEmptySnapshot(DATE, TS);
    expect(s.version).toBe(1);
    expect(s.date).toBe(DATE);
    expect(s.targets).toEqual({});
  });

  it('空スナップショットは isSnapshotEmpty=true', () => {
    expect(isSnapshotEmpty(createEmptySnapshot(DATE, TS))).toBe(true);
  });

  it('対象があれば isSnapshotEmpty=false', () => {
    const s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'A社提案', TS);
    expect(isSnapshotEmpty(s)).toBe(false);
  });
});

describe('upsertTarget（対象の挿入・上書き）', () => {
  it('空へ対象を挿入', () => {
    const s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'A社提案', TS);
    expect(s.targets['dayNote:theme']).toEqual({
      target: themeTarget,
      payload: 'A社提案',
      dirty: true,
      updatedAt: TS,
    });
    expect(s.updatedAt).toBe(TS);
  });

  it('既存対象を最新内容で上書き（§6.2 flush時の上書き）', () => {
    const s1 = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, '旧テーマ', TS);
    const s2 = upsertTarget(s1, themeTarget, '新テーマ', '2026-07-08T10:00:01.000Z');
    expect(s2.targets['dayNote:theme']?.payload).toBe('新テーマ');
    expect(Object.keys(s2.targets)).toHaveLength(1);
  });

  it('複数対象を独立して挿入（テーマ + ノート本文 + TODO）', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    s = upsertTarget(s, noteTarget, { body: 'ノート本文' }, TS);
    s = upsertTarget(s, todoTarget, { title: '見積作成' }, TS);
    expect(Object.keys(s.targets).sort()).toEqual(
      ['dayNote:theme', 'noteEntry', 'todo:todo_1'].sort(),
    );
  });

  it('lastError を付与できる', () => {
    const s = upsertTarget(
      createEmptySnapshot(DATE, TS),
      themeTarget,
      'テーマ',
      TS,
      '保存に失敗しました',
    );
    expect(s.targets['dayNote:theme']?.lastError).toBe('保存に失敗しました');
  });

  it('非破壊: 元スナップショットを変更しない', () => {
    const original = createEmptySnapshot(DATE, TS);
    const _updated = upsertTarget(original, themeTarget, 'テーマ', TS);
    expect(isSnapshotEmpty(original)).toBe(true); // 元は空のまま
    void _updated;
  });
});

describe('removeTarget（対象単位削除）', () => {
  it('指定対象のみ削除', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    s = upsertTarget(s, noteTarget, { body: 'ノート' }, TS);
    s = removeTarget(s, themeTarget);
    expect(s.targets['dayNote:theme']).toBeUndefined();
    expect(s.targets['noteEntry']).toBeDefined(); // ノート本文は残る
  });

  it('テーマ保存成功してもノート本文/TODOは残る（§6.2 重点要件）', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    s = upsertTarget(s, noteTarget, { body: '会議メモ' }, TS);
    s = upsertTarget(s, todoTarget, { title: 'TODO' }, TS);
    // テーマだけ保存成功
    s = removeTarget(s, themeTarget);
    expect(s.targets['dayNote:theme']).toBeUndefined();
    expect(s.targets['noteEntry']?.payload).toEqual({ body: '会議メモ' });
    expect(s.targets['todo:todo_1']?.payload).toEqual({ title: 'TODO' });
  });

  it('全対象削除で空になる（isSnapshotEmpty=true）', () => {
    let s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'テーマ', TS);
    s = removeTarget(s, themeTarget);
    expect(isSnapshotEmpty(s)).toBe(true);
  });

  it('存在しないキーの削除は何もしない（元のまま）', () => {
    const s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'テーマ', TS);
    const s2 = removeTarget(s, noteTarget);
    expect(s2).toBe(s); // 同じ参照（変更なし）
  });

  it('非破壊: 元スナップショットを変更しない', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    const _removed = removeTarget(s, themeTarget);
    expect(s.targets['dayNote:theme']).toBeDefined(); // 元は残る
    void _removed;
  });
});

describe('removeTargets（複数対象の一括削除、部分成功用）', () => {
  it('複数対象を一度に削除', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    s = upsertTarget(s, noteTarget, { body: 'ノート' }, TS);
    s = upsertTarget(s, todoTarget, { title: 'TODO' }, TS);
    // テーマ + TODO だけ保存成功
    s = removeTargets(s, [themeTarget, todoTarget]);
    expect(s.targets['dayNote:theme']).toBeUndefined();
    expect(s.targets['todo:todo_1']).toBeUndefined();
    expect(s.targets['noteEntry']).toBeDefined(); // ノート本文は残る
  });

  it('空配列の場合は何もしない', () => {
    const s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'テーマ', TS);
    const s2 = removeTargets(s, []);
    expect(s2).toBe(s);
  });
});

describe('listTargetKeys / getTarget', () => {
  it('全対象キーを取得', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS);
    s = upsertTarget(s, noteTarget, { body: 'ノート' }, TS);
    expect(listTargetKeys(s).sort()).toEqual(['dayNote:theme', 'noteEntry'].sort());
  });

  it('空スナップショットのキー一覧は空', () => {
    expect(listTargetKeys(createEmptySnapshot(DATE, TS))).toEqual([]);
  });

  it('キーから対象を取得', () => {
    const s = upsertTarget(createEmptySnapshot(DATE, TS), themeTarget, 'テーマ', TS);
    const t = getTarget(s, 'dayNote:theme');
    expect(t?.payload).toBe('テーマ');
    expect(t?.dirty).toBe(true);
  });

  it('存在しないキーは undefined', () => {
    expect(getTarget(createEmptySnapshot(DATE, TS), 'dayNote:theme')).toBeUndefined();
  });
});

describe('pendingKey / parsePendingKey', () => {
  it('日付から localStorage キーを生成（§6.2）', () => {
    expect(pendingKey('2026-07-08')).toBe('dayborad:pending:2026-07-08');
    expect(pendingKey('2026-12-31')).toBe('dayborad:pending:2026-12-31');
  });

  it('dayborad:pending: プレフィックスのキーから日付を抽出', () => {
    expect(parsePendingKey('dayborad:pending:2026-07-08')).toBe('2026-07-08');
    expect(parsePendingKey('dayborad:pending:2026-12-31')).toBe('2026-12-31');
  });

  it('プレフィックス不一致は undefined', () => {
    expect(parsePendingKey('other:pending:2026-07-08')).toBeUndefined();
    expect(parsePendingKey('dayborad:theme')).toBeUndefined();
    expect(parsePendingKey('2026-07-08')).toBeUndefined();
  });

  it('日付形式不正は undefined', () => {
    expect(parsePendingKey('dayborad:pending:2026-7-8')).toBeUndefined(); // ゼロ埋めなし
    expect(parsePendingKey('dayborad:pending:invalid')).toBeUndefined();
    expect(parsePendingKey('dayborad:pending:')).toBeUndefined();
  });
});

describe('統合シナリオ（§6.2 全体フロー）', () => {
  it('編集→flush書込→部分保存成功→残対象保持→全保存成功→空', () => {
    let s = createEmptySnapshot(DATE, TS);

    // 1. テーマ・ノート本文・TODO を編集（flush でスナップショットへ）
    s = upsertTarget(s, themeTarget, 'テーマA', TS);
    s = upsertTarget(s, noteTarget, { body: 'ノート本文' }, TS);
    s = upsertTarget(s, todoTarget, { title: 'TODO1' }, TS);
    expect(listTargetKeys(s)).toHaveLength(3);

    // 2. テーマだけ保存成功（部分成功）
    s = removeTarget(s, themeTarget);
    expect(listTargetKeys(s)).toHaveLength(2);
    expect(s.targets['noteEntry']).toBeDefined();
    expect(s.targets['todo:todo_1']).toBeDefined();

    // 3. ノート本文も保存成功
    s = removeTarget(s, noteTarget);
    expect(listTargetKeys(s)).toHaveLength(1);
    expect(s.targets['todo:todo_1']).toBeDefined();

    // 4. TODO も保存成功 → 空（日付キー削除対象）
    s = removeTarget(s, todoTarget);
    expect(isSnapshotEmpty(s)).toBe(true);
  });

  it('リトライ中の対象は lastError を保持したまま残る', () => {
    let s = createEmptySnapshot(DATE, TS);
    s = upsertTarget(s, themeTarget, 'テーマ', TS, 'ネットワークエラー');
    expect(s.targets['dayNote:theme']?.lastError).toBe('ネットワークエラー');
    // 上書きで最新内容を保存（lastError クリア）
    s = upsertTarget(s, themeTarget, '新テーマ', TS);
    expect(s.targets['dayNote:theme']?.lastError).toBeUndefined();
  });
});

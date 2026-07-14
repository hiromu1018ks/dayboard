/**
 * Markdown 出力の Unit テスト
 *
 * exportDayNoteToMarkdown / buildEmptyDayNoteMarkdown の純粋関数を検証する。
 * 全パターン（空TODO・空振り返り・carried・ノート未入力）の文字列一致検証。
 */

import { describe, expect, it } from 'vitest';
import { buildEmptyDayNoteMarkdown, exportDayNoteToMarkdown } from '../src/markdownExport.js';
import type { DayNoteFull } from 'shared-types';

/** テスト用 DayNoteFull フィクスチャ（最小構成・全フィールド上書き可能） */
function makeFixture(overrides: Partial<DayNoteFull> = {}): DayNoteFull {
  return {
    dayNote: {
      id: 'dn-1',
      date: '2026-07-13',
      theme: null,
      lastOpenedMode: 'work',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    todos: [],
    blockers: [],
    reflection: {
      id: 'ref-1',
      dayNoteId: 'dn-1',
      doneText: '',
      stuckText: '',
      tomorrowActionText: '',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    noteEntry: {
      id: 'ne-1',
      dayNoteId: 'dn-1',
      body: '',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    noteLineMetas: [],
    ...overrides,
  };
}

describe('exportDayNoteToMarkdown', () => {
  it('全フィールド空の場合は日付見出しのみ', () => {
    const md = exportDayNoteToMarkdown(makeFixture());
    expect(md).toBe('# Jul 13, 2026 (Mon)\n');
  });

  it('テーマのみ設定', () => {
    const md = exportDayNoteToMarkdown(
      makeFixture({
        dayNote: { ...makeFixture().dayNote, theme: '顧客デモを完成させる' },
      }),
    );
    expect(md).toBe(
      ['# Jul 13, 2026 (Mon)', '', "## Today's Theme", '顧客デモを完成させる'].join('\n') + '\n',
    );
  });

  it('TODO（todo / done / carried の3ステータス）', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      todos: [
        {
          id: 't1',
          dayNoteId: 'dn-1',
          title: '朝会で進捗共有',
          status: 'done',
          order: 0,
          sourceNoteLineMetaId: null,
          carriedFromTodoId: null,
          carriedFromDate: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          completedAt: '2026-07-13T01:00:00.000Z',
          updatedAt: '2026-07-13T01:00:00.000Z',
        },
        {
          id: 't2',
          dayNoteId: 'dn-1',
          title: '仕様を整理する',
          status: 'todo',
          order: 1,
          sourceNoteLineMetaId: null,
          carriedFromTodoId: null,
          carriedFromDate: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          completedAt: null,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
        {
          id: 't3',
          dayNoteId: 'dn-1',
          title: '昨日の残タスク',
          status: 'carried',
          order: 2,
          sourceNoteLineMetaId: null,
          carriedFromTodoId: 't-prev',
          carriedFromDate: '2026-07-12',
          createdAt: '2026-07-12T00:00:00.000Z',
          completedAt: null,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    });
    expect(md).toBe(
      [
        '# Jul 13, 2026 (Mon)',
        '',
        '## Today',
        '- [x] 朝会で進捗共有',
        '- [ ] 仕様を整理する',
        '- [>] 昨日の残タスク（carried to tomorrow）',
      ].join('\n') + '\n',
    );
  });

  it('障害（resolved / 未解決）', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      blockers: [
        {
          id: 'b1',
          dayNoteId: 'dn-1',
          text: '認証の設計が未決',
          linkedTodoId: null,
          sourceNoteLineMetaId: null,
          resolved: false,
          order: 0,
          createdAt: '2026-07-13T00:00:00.000Z',
          resolvedAt: null,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
        {
          id: 'b2',
          dayNoteId: 'dn-1',
          text: 'CIが落ちている',
          linkedTodoId: null,
          sourceNoteLineMetaId: null,
          resolved: true,
          order: 1,
          createdAt: '2026-07-13T00:00:00.000Z',
          resolvedAt: '2026-07-13T02:00:00.000Z',
          updatedAt: '2026-07-13T02:00:00.000Z',
        },
      ],
    });
    expect(md).toBe(
      [
        '# Jul 13, 2026 (Mon)',
        '',
        '## Stuck',
        '- [ ] 認証の設計が未決',
        '- [x] CIが落ちている',
      ].join('\n') + '\n',
    );
  });

  it('振り返り3セクション全て', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      reflection: {
        ...base.reflection,
        doneText: '今日できたこと本文',
        stuckText: '詰まったこと本文',
        tomorrowActionText: '明日の一手本文',
      },
    });
    expect(md).toBe(
      [
        '# Jul 13, 2026 (Mon)',
        '',
        '## Reflection',
        '### Done',
        '今日できたこと本文',
        '',
        '### Stuck',
        '詰まったこと本文',
        '',
        '### Next Step',
        '明日の一手本文',
      ].join('\n') + '\n',
    );
  });

  it('振り返り一部のみ（done のみ）', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      reflection: { ...base.reflection, doneText: 'done本文のみ' },
    });
    expect(md).toBe(
      ['# Jul 13, 2026 (Mon)', '', '## Reflection', '### Done', 'done本文のみ'].join('\n') + '\n',
    );
  });

  it('ノート本文', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      noteEntry: { ...base.noteEntry, body: 'ノート本文（そのまま）' },
    });
    expect(md).toBe(
      ['# Jul 13, 2026 (Mon)', '', '## Notes', 'ノート本文（そのまま）'].join('\n') + '\n',
    );
  });

  it('全セクション満載（統合パターン）', () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      dayNote: { ...base.dayNote, theme: 'テーマ' },
      todos: [
        {
          id: 't1',
          dayNoteId: 'dn-1',
          title: 'タスク',
          status: 'todo',
          order: 0,
          sourceNoteLineMetaId: null,
          carriedFromTodoId: null,
          carriedFromDate: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          completedAt: null,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      blockers: [
        {
          id: 'b1',
          dayNoteId: 'dn-1',
          text: '障害',
          linkedTodoId: null,
          sourceNoteLineMetaId: null,
          resolved: false,
          order: 0,
          createdAt: '2026-07-13T00:00:00.000Z',
          resolvedAt: null,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      reflection: {
        ...base.reflection,
        doneText: 'done',
        stuckText: 'stuck',
        tomorrowActionText: 'next',
      },
      noteEntry: { ...base.noteEntry, body: 'ノート' },
    });
    expect(md).toBe(
      [
        '# Jul 13, 2026 (Mon)',
        '',
        "## Today's Theme",
        'テーマ',
        '',
        '## Today',
        '- [ ] タスク',
        '',
        '## Stuck',
        '- [ ] 障害',
        '',
        '## Reflection',
        '### Done',
        'done',
        '',
        '### Stuck',
        'stuck',
        '',
        '### Next Step',
        'next',
        '',
        '## Notes',
        'ノート',
      ].join('\n') + '\n',
    );
  });

  it('日付の曜日が正しく反映される（2026-07-13 = Monday）', () => {
    const md = exportDayNoteToMarkdown(makeFixture());
    expect(md).toContain('Jul 13, 2026 (Mon)');
  });

  it('noteLineMetas が非空でも本文はそのまま出力される（H-4）', () => {
    // noteLineMetas は Markdown 出力に影響しない（変換済みマークは Markdown では表現しない）。
    // このテストは、メタが存在しても本文が変わらないことを保証する回帰検知。
    const base = makeFixture();
    const mdWithoutMeta = exportDayNoteToMarkdown({
      ...base,
      noteEntry: { ...base.noteEntry, body: 'ノート本文' },
    });
    const mdWithMeta = exportDayNoteToMarkdown({
      ...base,
      noteEntry: { ...base.noteEntry, body: 'ノート本文' },
      noteLineMetas: [
        {
          id: 'meta-1',
          noteEntryId: 'ne-1',
          lineNumberAtConversion: 1,
          normalizedLineText: 'ノート本文',
          lineHash: 'abc123',
          lineText: 'ノート本文',
          convertedToTodoId: 't1',
          convertedToBlockerId: null,
          convertedToReflection: false,
          convertedAt: '2026-07-13T00:00:00.000Z',
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    });
    expect(mdWithMeta).toBe(mdWithoutMeta);
  });

  it("theme が空文字の場合は Today's Theme セクションを省略", () => {
    const base = makeFixture();
    const md = exportDayNoteToMarkdown({
      ...base,
      dayNote: { ...base.dayNote, theme: '' },
    });
    expect(md).not.toContain("## Today's Theme");
    expect(md).toBe('# Jul 13, 2026 (Mon)\n');
  });
});

describe('buildEmptyDayNoteMarkdown', () => {
  it('日付見出し + no content', () => {
    const md = buildEmptyDayNoteMarkdown('2026-07-13');
    expect(md).toBe('# Jul 13, 2026 (Mon)\n\n（no content）\n');
  });

  it('別日付でも正しくフォーマット', () => {
    const md = buildEmptyDayNoteMarkdown('2026-01-05');
    expect(md).toBe('# Jan 5, 2026 (Mon)\n\n（no content）\n');
  });
});

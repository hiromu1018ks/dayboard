/**
 * 振り返り列（[roadmap.md T-3-13]）
 *
 * [要件 7.5]: 3セクション（できたこと/止まったこと/明日の一手）の自由入力。
 * 各セクションはデバウンス保存（800ms、[autosave_spec.md §2.2]）。
 * 単一 SaveTarget（reflection）で3セクションを扱う。
 */

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import type { Reflection } from 'shared-types';

export type ReflectionColumnProps = {
  reflection: Reflection;
  onEdit: (patch: Partial<Reflection>) => void;
};

type SectionKey = 'doneText' | 'stuckText' | 'tomorrowActionText';

const SECTIONS: { key: SectionKey; label: string; placeholder: string }[] = [
  { key: 'doneText', label: 'Done', placeholder: 'What went well today' },
  {
    key: 'stuckText',
    label: 'Stuck',
    placeholder: 'What blocked you, what slowed you down',
  },
  {
    key: 'tomorrowActionText',
    label: 'Next Step',
    placeholder: 'The first thing to do tomorrow',
  },
];

export function ReflectionColumn({ reflection, onEdit }: ReflectionColumnProps) {
  // 各セクションのローカル state（楽観的更新、[autosave_spec.md §8.1]）
  const [drafts, setDrafts] = useState<{ [K in SectionKey]: string }>({
    doneText: reflection.doneText,
    stuckText: reflection.stuckText,
    tomorrowActionText: reflection.tomorrowActionText,
  });

  // reflection の変更（日付切替等）を取り込むための前回値追跡
  const prevReflectionRef = useRef(reflection);
  useEffect(() => {
    if (prevReflectionRef.current !== reflection) {
      setDrafts({
        doneText: reflection.doneText,
        stuckText: reflection.stuckText,
        tomorrowActionText: reflection.tomorrowActionText,
      });
      prevReflectionRef.current = reflection;
    }
  }, [reflection]);

  const handleChange = (key: SectionKey) => (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDrafts((prev) => ({ ...prev, [key]: value }));
    // デバウンス保存へ通知（単一 SaveTarget で変更のあったセクションのみ送信）
    onEdit({ [key]: value });
  };

  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded border border-line/60 bg-panel/30 p-7"
      aria-label="振り返り"
      data-focus-section="reflection"
    >
      <h2 className="head mb-5 flex items-center gap-2 text-lg text-ink">
        <span className="inline-block h-4 w-0.5 bg-ink/70" aria-hidden="true" />
        Reflection
      </h2>

      {/* Phase 7: 最初のセクション（できたこと）へ data-focus-input を付与
          （⌘3, Vim h/l/Space 3, i の列フォーカス対象） */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {SECTIONS.map((section, i) => (
          <div key={section.key}>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-faint">
              {section.label}
            </label>
            <textarea
              value={drafts[section.key]}
              onChange={handleChange(section.key)}
              placeholder={section.placeholder}
              maxLength={4000}
              rows={4}
              {...(i === 0 ? { 'data-focus-input': true } : {})}
              className="input-card"
              aria-label={section.label}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

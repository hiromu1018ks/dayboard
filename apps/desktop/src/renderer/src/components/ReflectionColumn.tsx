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
  { key: 'doneText', label: 'できたこと', placeholder: '今日できたことを書く' },
  { key: 'stuckText', label: '止まったこと', placeholder: '詰まったこと、遅れた理由を書く' },
  {
    key: 'tomorrowActionText',
    label: '明日の一手',
    placeholder: '明日最初にやることを書く',
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
      className="flex flex-col rounded-lg border border-stone-200 bg-white p-5"
      aria-label="振り返り"
      data-focus-section="reflection"
    >
      <h2 className="mb-3 text-sm font-semibold text-stone-600">
        <span className="mr-1 text-stone-400">③</span>振り返り
      </h2>

      {/* Phase 7: 最初のセクション（できたこと）へ data-focus-input を付与
          （⌘3, Vim h/l/Space 3, i の列フォーカス対象） */}
      <div className="flex-1 space-y-4">
        {SECTIONS.map((section, i) => (
          <div key={section.key}>
            <label className="mb-1 block text-xs font-medium text-stone-500">{section.label}</label>
            <textarea
              value={drafts[section.key]}
              onChange={handleChange(section.key)}
              placeholder={section.placeholder}
              maxLength={4000}
              rows={4}
              {...(i === 0 ? { 'data-focus-input': true } : {})}
              className="w-full resize-none rounded border border-stone-200 bg-stone-50/50 px-2 py-1.5 text-sm text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-400 focus:bg-white"
              aria-label={section.label}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

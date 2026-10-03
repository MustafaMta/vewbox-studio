import type { ReviewIssue } from '@/domain/development';

/** LIFE TIMELINES (D20) — a character's age is now, so the years of their own life have a floor. A story that ties a
 *  character in his seventies to his wife's loss in 1947 is wrong before a frame is drawn; the one revision introduced
 *  exactly that and nothing re-read it. The writers are given each character's birth year, and the studio checks every
 *  sentence that names a character together with a year: a year before they were about 16 is flagged. A historical
 *  year may still be named as history — the note asks the writer to check it, it never rewrites anything. Pure. */

/** The age from which a year can belong to a person's own adult life (marriage, work, a loss they lived through). */
export const ADULT_FROM = 16;

export interface LifeOf { name: string; ageYears?: number }

/** The year a character of this age was born, about. */
export const bornAbout = (ageYears: number, year: number): number => year - ageYears;

/** The rule every writing stage reads. */
export const TIMELINE_RULES = `TIMELINES: each existing character's age is their age now and "bornAbout" is the year they were born. Every year in a character's own life — a marriage, a loss, work, a journey — falls after they were about ${ADULT_FROM} and not after this year. A year before a character was born appears only as history they read or heard about, never as something they or their spouse lived.`;

const YEAR = /\b(1[89]\d\d|20\d\d)\b/g;
const SENTENCES = /[^.!?؟\n]+[.!?؟]?/g;

/** The names a person is called by in prose: the full name and each part of it of three letters or more. */
function namesOf(name: string): string[] {
  const parts = name.split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 3);
  return Array.from(new Set([name.trim(), ...parts]));
}

const mentions = (sentence: string, name: string) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u').test(sentence);

/** Every sentence of the story texts that ties a person to a year before they were about 16. */
export function lifeTimelineIssues(texts: Array<{ where: string; text: string | undefined }>, people: LifeOf[], year: number): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    if (!p.ageYears || p.ageYears < 1) continue;
    const born = bornAbout(p.ageYears, year);
    const names = namesOf(p.name);
    for (const t of texts) {
      for (const sentence of (t.text ?? '').match(SENTENCES) ?? []) {
        if (!names.some((n) => mentions(sentence, n))) continue;
        for (const m of sentence.matchAll(YEAR)) {
          const y = Number(m[1]);
          if (y > year || y >= born + ADULT_FROM) continue;
          const key = `${p.name}|${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            criterion: 'CHARACTER', severity: 'MAJOR', where: t.where, source: 'CODE',
            note: `${p.name} is ${p.ageYears} (born about ${born}) but the story ties them to ${y}: “${sentence.trim().slice(0, 160)}”.`,
            fix: `Move the event to a year after ${born + ADULT_FROM}, or make ${y} history ${p.name} only knows about.`,
          });
        }
      }
    }
  }
  return out;
}

/** The story texts of a draft, by where they are. */
export function storyTexts(d: { proposal: { logline: string; premise: string; structure: Array<{ title: string; summary: string }> }; hook?: string; ending?: string; sampleLines?: Array<{ line: string }> }): Array<{ where: string; text: string | undefined }> {
  return [
    { where: 'logline', text: d.proposal.logline },
    { where: 'premise', text: d.proposal.premise },
    ...d.proposal.structure.map((s, i) => ({ where: `structure[${i}]`, text: `${s.title}. ${s.summary}` })),
    { where: 'hook', text: d.hook },
    { where: 'ending', text: d.ending },
    ...(d.sampleLines ?? []).map((l, i) => ({ where: `sampleLines[${i}]`, text: l.line })),
  ];
}

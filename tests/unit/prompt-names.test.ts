import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { bindNamesOutsideDialogue, lintH3Prompt } from '@/server/story/prompts';

/** Acceptance 2026-10-05, open item 2: names reached the H3 prompt (the lint only warned). The last pass binds every
 *  cast name outside the spoken lines; the lines themselves are the script and are never rewritten. */
describe('the last name pass', () => {
  const cast = seed().characters.slice(0, 2);
  const [a, b] = cast;
  const subjectOf = (id: string) => (id === a.id ? '<Subject 1>' : undefined);

  it('binds a pictured person to their subject and describes an unpictured one; the spoken line keeps the name', () => {
    const raw = `${a.name} hands the cup to ${b.name}. <d>[English] Thank you, ${b.name}.</d> ${a.name} smiles.`;
    const r = bindNamesOutsideDialogue(raw, cast, subjectOf);
    expect(r.prompt.startsWith('<Subject 1> hands the cup to the ')).toBe(true);
    expect(r.prompt).toContain(`<d>[English] Thank you, ${b.name}.</d>`);
    expect(r.prompt).toMatch(/<\/d> <Subject 1> smiles\.$/);
    expect(r.replaced.sort()).toEqual([a.name, b.name].sort());
    const lint = lintH3Prompt(r.prompt, { labels: 'LOCAL', pictures: 0, audios: 0, lines: [], names: cast.map((c) => c.name) });
    expect(lint.checks.find((c) => c.rule === 'no-names')?.ok).toBe(true);
  });

  it('a prompt without names is returned unchanged', () => {
    const raw = 'The camera holds on the doorway. <d>[English] Hello.</d>';
    expect(bindNamesOutsideDialogue(raw, cast, subjectOf)).toEqual({ prompt: raw, replaced: [] });
  });
});

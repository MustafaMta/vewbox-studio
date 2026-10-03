import { describe, expect, it } from 'vitest';
import { bornAbout, lifeTimelineIssues, storyTexts } from '@/server/story/development/timeline';
import { draftPeople } from '@/server/story/development/rubric';

/** D20: the revision of "The Static Sky" tied Elias Moore (72) to his wife's loss in 1947 and nothing re-read it. */
const YEAR = 2026;
const draft = {
  proposal: {
    logline: 'A retired librarian and a lighthouse keeper repair a broken radio.',
    premise: 'The radio picks up a faint signal from a ship that disappeared in 1947—the same year Elias’s wife vanished and Najm’s brother disappeared at sea. Elias kept her photo for decades.',
    structure: [{ title: 'Static Echoes', summary: 'A close-up of Elias Moore, then a photo of his wife dated 1947 on the wall.' }],
    cast: [{ name: 'Elias Moore', characterId: 'char-e', ageYears: 30 }, { name: 'Najm', characterId: 'char-n' }],
  },
  hook: 'A meteor streaks across the sky.',
  ending: 'The dial points to 1947.',
};

describe('life timelines (D20)', () => {
  it('a birth year follows from the age', () => { expect(bornAbout(72, YEAR)).toBe(1954); });

  it('flags a year tied to a character before they were about 16, once per person and year, with the sentence', () => {
    const people = draftPeople(draft as never, { mustCast: [{ id: 'char-e', ageYears: 72 } as never, { id: 'char-n', ageYears: 65 } as never], library: { characters: [], locations: [] } });
    // the studio's real ages win over what the draft wrote (30)
    expect(people).toEqual([{ name: 'Elias Moore', ageYears: 72 }, { name: 'Najm', ageYears: 65 }]);
    const issues = lifeTimelineIssues(storyTexts(draft as never), people, YEAR);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.note.startsWith('Elias Moore is 72 (born about 1954) but the story ties them to 1947')).toBe(true);
    expect(issues[1]!.note.startsWith('Najm is 65 (born about 1961) but the story ties them to 1947')).toBe(true);
    expect(issues[0]).toMatchObject({ criterion: 'CHARACTER', severity: 'MAJOR', where: 'premise', source: 'CODE' });
    expect(issues[0]!.note).toContain('1947');
    expect(issues[0]!.fix).toContain('after 1970');
  });

  it('passes the corrected story and a year after adulthood', () => {
    const fixed = { ...draft, proposal: { ...draft.proposal, premise: 'A ship lost in the great storm of 1987, the night Elias’s wife was lost at sea.', structure: [] }, ending: 'Silence.' };
    expect(lifeTimelineIssues(storyTexts(fixed as never), [{ name: 'Elias Moore', ageYears: 72 }], YEAR)).toEqual([]);
  });

  it('ignores sentences that do not name the person, and a person without an age', () => {
    const t = [{ where: 'premise', text: 'The Titanic sank in 1912. Elias repairs radios.' }];
    expect(lifeTimelineIssues(t, [{ name: 'Elias Moore', ageYears: 72 }, { name: 'Najm' }], YEAR)).toEqual([]);
  });

  it('matches a name in Arabic prose too', () => {
    const t = [{ where: 'premise', text: 'فقد أبو سلام زوجته سنة 1940 في البحر.' }];
    expect(lifeTimelineIssues(t, [{ name: 'أبو سلام', ageYears: 62 }], YEAR)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { acceptProposal, addCharacter, addLocation, emptyStudio, findByName, nameKey } from '@/domain/actions';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { withCommandContext } from '@/domain/ids';
import type { IdeaProposal, StudioState } from '@/domain/types';

/** ACCEPTING A PROPOSAL NEVER COPIES WHAT THE STUDIO HAS. The real "The Static Sky" proposal (2026-10-03) named the
 *  studio's existing place "Elias's Workshop" without its id, and accepting it created a second workshop. A kept
 *  place or person without an id is matched by name first (case, spacing, apostrophes and Arabic spelling ignored);
 *  only an unknown name is created. */

const at = '2026-10-03T12:00:00.000Z';
let seq = 0;
const run = <T>(fn: () => T) => withCommandContext(`proposal-dedupe-${++seq}`, at, fn);

function studio(): StudioState {
  return run(() => {
    let s = emptyStudio(DEFAULT_SETTINGS);
    const blank = { role: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] as string[] };
    s = addCharacter(s, { ...blank, name: 'Elias Moore', style: 'CARTOON', sex: 'MALE', ageYears: 72, language: 'EN' }).state;
    s = addCharacter(s, { ...blank, name: 'Najm', nameAr: 'أبو سلام', style: 'CARTOON', sex: 'MALE', ageYears: 65, language: 'EN' }).state;
    s = addLocation(s, { name: 'Elias’s Workshop', kind: 'INTERIOR', description: 'a cluttered radio workshop by the sea', style: 'CARTOON', lighting: [], landmarks: [], props: [] }).state;
    return s;
  });
}

/** Shaped like the accepted Static Sky proposal: the cast offered by name, the workshop without its id, one new place. */
const proposal = (): IdeaProposal => ({
  sample: false, title: 'The Static Sky', logline: 'An old radio repairman hears his late wife in the static of a meteor shower.', premise: 'During a meteor shower, Elias and Najm repair an old radio.',
  genre: 'drama', mood: 'quiet, bittersweet', style: 'CARTOON', language: 'EN', durationSeconds: 60,
  structure: [{ title: 'The radio', summary: 'Elias opens the workshop at night.' }, { title: 'The pier', summary: 'They carry the radio to the pier.' }],
  cast: [
    { key: 'elias', name: 'elias  MOORE', role: 'the repairman', reason: 'the story is his', isNew: false, fromPreference: true },
    { key: 'najm', name: 'ابو سلام', role: 'his friend', reason: 'he brings the radio', isNew: false, fromPreference: true },
    { key: 'girl', name: 'Mira', role: 'a neighbour', reason: 'she hears it first', isNew: true, fromPreference: false, sex: 'FEMALE', ageYears: 10 },
  ],
  locations: [
    { key: 'workshop', name: "Elias's Workshop", description: 'his workshop', isNew: false, fromPreference: false, kind: 'INTERIOR' },
    { key: 'pier', name: 'The Old Pier', description: 'a wooden pier', isNew: true, fromPreference: false, kind: 'EXTERIOR' },
  ],
});

describe('acceptProposal links what already exists (no duplicate places or people)', () => {
  it('names match across case, spacing, apostrophes and Arabic spellings', () => {
    expect(nameKey("Elias's Workshop")).toBe(nameKey('elias’s   WORKSHOP'));
    expect(nameKey('أبو سلام')).toBe(nameKey('ابو سلام'));
    expect(nameKey('مكتبة الحيّ')).toBe(nameKey('مكتبة الحي'));
    expect(nameKey('Café')).toBe(nameKey('cafe'));
    expect(nameKey('The Workshop')).not.toBe(nameKey('Elias’s Workshop'));
    expect(findByName([{ name: 'x', nameAr: 'أبو سلام' }], 'ابو سلام')?.name).toBe('x');
    expect(findByName([{ name: 'x' }], '   ')).toBeUndefined();
  });

  it('the Static Sky proposal reuses Elias’s Workshop, Elias and Najm, and creates only Mira and the pier', () => {
    const s = studio();
    const workshop = s.locations[0]; const [elias, najm] = s.characters;
    const r = run(() => acceptProposal(s, { kind: 'SHORT', aspect: 'WIDE_16_9', proposal: proposal(), keepCast: ['elias', 'najm', 'girl'], keepLocations: ['workshop', 'pier'], preferences: {} }));
    expect(r.state.locations.filter((l) => nameKey(l.name) === nameKey('Elias’s Workshop'))).toHaveLength(1);
    expect(r.state.locations).toHaveLength(2);
    expect(r.state.characters).toHaveLength(3);
    const pier = r.state.locations.find((l) => l.name === 'The Old Pier')!;
    const mira = r.state.characters.find((c) => c.name === 'Mira')!;
    expect(r.production.locationIds).toEqual([workshop.id, pier.id]);
    expect(r.production.castIds).toEqual([elias.id, najm.id, mira.id]);
    // the scene that names the workshop is set there: the existing place, not a copy
    expect(r.production.scenes[0].locationId).toBe(workshop.id);
  });

  it('a name offered twice in one proposal is created once', () => {
    const s = studio();
    const p = proposal();
    p.locations.push({ key: 'pier2', name: 'the old pier', description: 'again', isNew: true, fromPreference: false });
    const r = run(() => acceptProposal(s, { kind: 'SHORT', aspect: 'WIDE_16_9', proposal: p, keepCast: [], keepLocations: ['pier', 'pier2'], preferences: {} }));
    expect(r.state.locations.filter((l) => nameKey(l.name) === nameKey('The Old Pier'))).toHaveLength(1);
    expect(r.production.locationIds).toHaveLength(1);
  });
});

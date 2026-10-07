import { describe, expect, it } from 'vitest';
import { addCharacter, updateCharacter } from '@/domain/actions';
import { runCommand, type Command } from '@/domain/commands';
import { seed } from '@/domain/sample';
import { characterRow } from '@/server/studio/persist';
import { characterFromRow } from '@/server/studio/snapshot';

/** THE PERFORMER KIND (master plan §3, Phase 1): every character is an ACTOR, a SINGER or an ACTOR_SINGER; a kind that
 *  sings keeps a singing profile APART from the spoken voice (its languages default to the spoken language), an actor
 *  has none, and a change of kind keeps the two in step. */

const base = { name: 'Mira', role: 'Lead', style: 'ANIME' as const, sex: 'FEMALE' as const, ageYears: 24, language: 'EN' as const, build: 'slim', face: 'oval', hair: 'black bob', skin: 'fair', eyes: 'dark', wardrobe: 'blue coat', personality: 'warm', distinguishing: [] as string[] };

describe('the performer kind', () => {
  it('a new character is an ACTOR with no singing profile unless it is given a kind that sings', () => {
    const { character: a } = addCharacter(seed(), base);
    expect(a).toMatchObject({ kind: 'ACTOR' });
    expect(a.singing).toBeUndefined();
    const { character: s } = addCharacter(seed(), { ...base, kind: 'SINGER' });
    expect(s).toMatchObject({ kind: 'SINGER', singing: { styles: [], languages: ['EN'] } });
    const { character: b } = addCharacter(seed(), { ...base, kind: 'ACTOR_SINGER', singing: { voiceType: 'MEZZO_SOPRANO', styles: ['ballad'], languages: [] } });
    expect(b.singing).toEqual({ voiceType: 'MEZZO_SOPRANO', styles: ['ballad'], languages: ['EN'] });
    // an actor given a singing profile keeps none: the two never drift apart
    expect(addCharacter(seed(), { ...base, kind: 'ACTOR', singing: { styles: ['pop'], languages: ['EN'] } }).character.singing).toBeUndefined();
  });

  it('the singing profile follows the kind on every change, and never touches the spoken voice', () => {
    let { state, character: c } = addCharacter(seed(), { ...base, kind: 'ACTOR_SINGER', singing: { voiceType: 'ALTO', styles: ['jazz'], languages: ['EN'] } });
    const voice = c.voice;
    state = updateCharacter(state, c.id, { kind: 'ACTOR' });
    c = state.characters.find((x) => x.id === c.id)!;
    expect(c.kind).toBe('ACTOR'); expect(c.singing).toBeUndefined(); expect(c.voice).toEqual(voice);
    state = updateCharacter(state, c.id, { kind: 'SINGER' });
    expect(state.characters.find((x) => x.id === c.id)!.singing).toEqual({ styles: [], languages: ['EN'] });
    state = updateCharacter(state, c.id, { singing: { voiceType: 'TENOR', styles: ['folk'], languages: ['EN'] } });
    expect(state.characters.find((x) => x.id === c.id)!.singing).toMatchObject({ voiceType: 'TENOR', styles: ['folk'] });
  });

  it('the commands validate the kind and the singing profile', () => {
    const cmd = (args: unknown[]): Command => ({ name: 'addCharacter', args, seed: 's', at: '2026-10-07T00:00:00.000Z' } as Command);
    const ok = runCommand(seed(), cmd([{ ...base, kind: 'SINGER', singing: { voiceType: 'BASS', styles: ['gospel'], languages: ['EN'] } }]));
    expect(ok.state.characters.at(-1)).toMatchObject({ name: 'Mira', kind: 'SINGER', singing: { voiceType: 'BASS', styles: ['gospel'] } });
    expect(() => runCommand(seed(), cmd([{ ...base, kind: 'DANCER' }]))).toThrow();
    expect(() => runCommand(seed(), cmd([{ ...base, kind: 'SINGER', singing: { voiceType: 'COUNTERTENOR', styles: [], languages: [] } }]))).toThrow();
  });

  it('kind and singing survive the database row and back', () => {
    const { character: c } = addCharacter(seed(), { ...base, kind: 'ACTOR_SINGER', singing: { voiceType: 'SOPRANO', styles: ['musical'], languages: ['EN'] } });
    const row = characterRow(c);
    expect(row).toMatchObject({ kind: 'ACTOR_SINGER', singing: { voiceType: 'SOPRANO' } });
    const back = characterFromRow({ ...row, version: 1, canonicalAssetId: null, canonicalImage: null } as never, []);
    expect(back).toMatchObject({ kind: 'ACTOR_SINGER', singing: { voiceType: 'SOPRANO', styles: ['musical'], languages: ['EN'] } });
    expect(characterFromRow({ ...characterRow(addCharacter(seed(), base).character), kind: null, version: 1, canonicalAssetId: null, canonicalImage: null } as never, []).kind).toBe('ACTOR');
  });
});

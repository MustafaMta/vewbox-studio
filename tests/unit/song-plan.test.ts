import { describe, expect, it } from 'vitest';
import { songBudget, songFromPlan, songPlanSchema, songPerformers, vocalTag, type SongPlan, type SongPerformer } from '@/server/story/song';
import { songSingers } from '@/worker/handlers/music';
import { seed } from '@/domain/sample';
import { singingCast } from '@/domain/actions';
import { CONTRACTS } from '@/server/org/contracts';
import type { Character } from '@/domain/types';

/** THE SONG PLAN (Phase 2): a song is sung only by the characters cast as singers, by name; the vocal the engine is
 *  asked for is theirs; an unknown or non-singing name is refused, never guessed; an actor never sings the lead. */

const ch = (over: Partial<Character>): Character => ({ ...seed().characters[0], ...over });
const hana = ch({ id: 'hana', name: 'Hana Kisaragi', sex: 'FEMALE', kind: 'SINGER', singing: { voiceType: 'SOPRANO', styles: ['ballad'], languages: ['EN'] } });
const marcus = ch({ id: 'marcus', name: 'Marcus Bell', sex: 'MALE', kind: 'ACTOR_SINGER', singing: { voiceType: 'BARITONE', styles: ['soul'], languages: ['EN'] } });
const walter = ch({ id: 'walter', name: 'Walter Finch', sex: 'MALE', kind: 'ACTOR', singing: undefined });

const plan = (sections: SongPlan['sections']): SongPlan => ({ title: 'Lanterns', concept: 'A song about lights left on for someone.', genre: 'city pop', mood: 'wistful', bpm: 92, key: 'd minor', caption: 'city pop, electric piano, soft drums', sections });

describe('the song plan', () => {
  it('only cast members who sing may sing; the producer may narrow them, in order', () => {
    expect(songPerformers([walter, hana, marcus]).map((s) => s.id)).toEqual(['hana', 'marcus']);
    expect(songPerformers([walter, hana, marcus], ['marcus', 'walter']).map((s) => s.id)).toEqual(['marcus']);
  });

  it('the vocal the engine is asked for is the singers\' own', () => {
    expect(vocalTag([{ sex: 'FEMALE', voiceType: 'SOPRANO' }])).toBe('female soprano lead vocal');
    expect(vocalTag([{ sex: 'MALE', voiceType: 'BARITONE' }, { sex: 'FEMALE', voiceType: 'MEZZO_SOPRANO' }])).toBe('male baritone and female mezzo-soprano vocal duet');
    expect(vocalTag([{ sex: 'MALE' }])).toBe('male lead vocal');
  });

  it('becomes the Song: sections with their singers (lead first), tagged lyrics, a valid key, the tempo', () => {
    const performers: SongPerformer[] = songPerformers([hana, marcus]);
    const song = songFromPlan(plan([
      { kind: 'VERSE', lyrics: 'Every window on the hill\nkeeps a light for you', singers: ['Hana Kisaragi'] },
      { kind: 'CHORUS', lyrics: 'Lanterns, lanterns', singers: ['Hana', 'Marcus Bell'] },
      { kind: 'INSTRUMENTAL', lyrics: '', singers: [] },
    ]), performers, 90);
    expect(song.sections.map((s) => [s.kind, s.singerIds])).toEqual([['VERSE', ['hana']], ['CHORUS', ['hana', 'marcus']], ['INSTRUMENTAL', []]]);
    expect(song.singerIds).toEqual(['hana', 'marcus']);
    expect(song).toMatchObject({ key: 'D minor', bpm: 92, durationSeconds: 90, title: 'Lanterns' });
    expect(song.lyrics).toBe('[Verse]\nEvery window on the hill\nkeeps a light for you\n\n[Chorus]\nLanterns, lanterns\n\n[Instrumental]');
  });

  it('a section given to someone who is not a singer of this song, or to nobody, is refused — never guessed', () => {
    const performers = songPerformers([hana]);
    expect(() => songFromPlan(plan([{ kind: 'VERSE', lyrics: 'a line', singers: ['Walter Finch'] }, { kind: 'CHORUS', lyrics: 'b', singers: ['Hana'] }, { kind: 'VERSE', lyrics: 'c', singers: ['Hana'] }]), performers, 60)).toThrow(/Walter Finch.*not one of this song's singers/);
    expect(() => songFromPlan(plan([{ kind: 'VERSE', lyrics: 'a line', singers: [] }, { kind: 'CHORUS', lyrics: 'b', singers: ['Hana'] }, { kind: 'VERSE', lyrics: 'c', singers: ['Hana'] }]), performers, 60)).toThrow(/without a singer/);
  });

  it('a song of this length holds this much: sections and sung lines are budgeted, not crammed', () => {
    expect(songBudget(90)).toEqual({ maxSections: 8, lines: 20, maxLines: 25 });
    expect(songBudget(60)).toEqual({ maxSections: 5, lines: 13, maxLines: 17 });
  });

  it('an over-long plan is sent back with the reason; lines given as a list are the same words', () => {
    const verse = { kind: 'VERSE', lyrics: Array.from({ length: 9 }, (_, i) => `line ${i}`), singers: ['Hana'] };
    const raw = { ...plan([]), sections: [verse, verse, verse] };
    const r = songPlanSchema(90).safeParse(raw);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/at most 25 sung lines/);
    const ok = songPlanSchema(90).safeParse({ ...raw, sections: [verse, { ...verse, lyrics: ['a', 'b'] }, { kind: 'Pre-chorus', lyrics: 'c', singers: ['Hana'] }] });
    expect(ok.success && ok.data.sections.map((s) => [s.kind, s.lyrics.split('\n').length])).toEqual([['VERSE', 9], ['VERSE', 2], ['PRE_CHORUS', 1]]);
    expect(songPlanSchema(60).safeParse({ ...raw, sections: Array.from({ length: 6 }, () => ({ kind: 'VERSE', lyrics: 'x', singers: ['Hana'] })) }).success).toBe(false);
  });

  it('sections are timed by what they hold: a four-line verse gets twice a two-line one, an intro the room of two lines', () => {
    const song = songFromPlan(plan([
      { kind: 'INTRO', lyrics: '', singers: [] },
      { kind: 'VERSE', lyrics: 'one\ntwo\nthree\nfour', singers: ['Hana'] },
      { kind: 'CHORUS', lyrics: 'five\nsix', singers: ['Hana'] },
    ]), songPerformers([hana]), 80);
    expect(song.sections.map((s) => [s.from, s.to])).toEqual([[0, 20], [20, 60], [60, 80]]);
  });

  it('the song plan call and the recording call pass their tool contracts', () => {
    const c = CONTRACTS['story.structured_answer'];
    const input = { task: 'song', productionId: 'p', characterIds: ['hana', 'marcus'] };
    expect(c.input.safeParse(input).success).toBe(true);
    expect(c.outputFor!(input)!.safeParse(plan([{ kind: 'VERSE', lyrics: 'a', singers: ['Hana'] }, { kind: 'CHORUS', lyrics: 'b', singers: ['Hana', 'Marcus'] }, { kind: 'OUTRO', lyrics: '', singers: [] }])).success).toBe(true);
    expect(CONTRACTS['music.generate'].input.safeParse({ engine: 'ace-step', variant: 'xl-sft', caption: 'c', lyrics: 'l', seconds: 90, bpm: 92, key: 'D minor' }).success).toBe(true);
    expect(CONTRACTS['music.generate'].input.safeParse({ engine: 'minimax-api', variant: 'xl-sft', caption: 'c', lyrics: 'l' }).success).toBe(false);
  });

  it('a new song is given to the cast members who sing, never to an actor', () => {
    expect(singingCast([walter, hana, marcus], ['walter', 'marcus', 'hana', 'nobody'])).toEqual(['marcus', 'hana']);
    expect(singingCast([walter], ['walter'])).toEqual([]);
  });

  it('a recording is refused when its song names an actor, or nobody, as a singer', () => {
    const s = seed();
    const state = { ...s, characters: [hana, walter] };
    const p = { ...s.productions[0], song: { id: 'song-1', title: 't', source: 'GENERATED_EXAMPLE' as const, durationSeconds: 60, caption: 'c', sections: [], singerIds: ['walter'] } };
    expect(() => songSingers(state, p)).toThrow(/Walter Finch is cast as an actor, not a singer/);
    expect(() => songSingers(state, { ...p, song: { ...p.song, singerIds: [] } })).toThrow(/Nobody sings this song/);
    expect(songSingers(state, { ...p, song: { ...p.song, singerIds: ['hana'] } }).map((c) => c.id)).toEqual(['hana']);
  });
});

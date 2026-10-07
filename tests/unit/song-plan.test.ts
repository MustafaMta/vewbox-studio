import { describe, expect, it } from 'vitest';
import { songFromPlan, songPerformers, vocalTag, type SongPlan, type SongPerformer } from '@/server/story/song';
import { songSingers } from '@/worker/handlers/music';
import { seed } from '@/domain/sample';
import { singingCast } from '@/domain/actions';
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

import { describe, expect, it } from 'vitest';
import { applyDialectReview, dialectHints, msaInIraqi, songBudget, songFromPlan, songPlanSchema, songPerformers, vocalTag, type SongPlan, type SongPerformer } from '@/server/story/song';
import { levelTrimDb, scaleSections, settleSections, songSingers } from '@/worker/handlers/music';
import { seed } from '@/domain/sample';
import { recordSongListening, singingCast, songVerdict, updateSong } from '@/domain/actions';
import { CONTRACTS } from '@/server/org/contracts';
import type { Character, Song } from '@/domain/types';

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

  it('an IRAQI song is sung in Arabic script with an English gloss; an MSA-associated word is NOT a failure (a hint for the contextual review)', () => {
    const iraqi = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
    const sec = (lyrics: string, gloss = 'a gloss') => ({ kind: 'VERSE', lyrics, gloss, singers: ['Hana'] });
    const good = { ...plan([]), sections: [sec('باچر نلتقي يا گلبي\nهسه وين إنت'), sec('شلونك يا عيوني'), sec('ماكو غيرك')] };
    expect(songPlanSchema(90, iraqi).safeParse(good).success).toBe(true);
    // formal words do not fail the plan: they become hints for the planner's contextual dialect review
    const formal = { ...good, sections: [sec('سوف أراك غداً'), sec('لماذا رحلت'), sec('ماكو غيرك')] };
    expect(songPlanSchema(90, iraqi).safeParse(formal).success).toBe(true);
    expect(dialectHints(formal as SongPlan)).toEqual([{ word: 'سوف', say: 'راح' }, { word: 'لماذا', say: 'ليش' }]);
    expect(dialectHints(good as SongPlan)).toEqual([]);
    // English lyrics tagged as Arabic: refused
    expect(songPlanSchema(90, iraqi).safeParse({ ...good, sections: [sec('Hold me close'), sec('شلونك'), sec('ماكو')] }).success).toBe(false);
    // a sung section without its English gloss: refused
    expect(songPlanSchema(90, iraqi).safeParse({ ...good, sections: [sec('شلونك', ''), sec('شلونك'), sec('ماكو')] }).success).toBe(false);
    // an English song is untouched by the Arabic rules
    expect(songPlanSchema(90).safeParse(plan([{ kind: 'VERSE', lyrics: 'a', singers: ['Hana'] }, { kind: 'CHORUS', lyrics: 'b', singers: ['Hana'] }, { kind: 'OUTRO', lyrics: '', singers: [] }])).success).toBe(true);
  });

  it('the dialect review replaces only reviewed lyrics, keeps kinds and singers, and may not change a section\'s line count', () => {
    const p = { ...plan([]), sections: [{ kind: 'INTRO', lyrics: '', singers: [] }, { kind: 'VERSE', lyrics: 'سوف أراك\nيا گلبي', gloss: 'I will see you\nmy heart', singers: ['Hana'] }, { kind: 'CHORUS', lyrics: 'شلونك', gloss: 'How are you', singers: ['Hana'] }] } as SongPlan;
    const review = { overall: 'BAGHDADI' as const, notes: 'سوف → راح', sections: [{ index: 1, lyrics: 'راح اشوفك\nيا گلبي', gloss: 'I will see you\nmy heart', changes: [{ from: 'سوف أراك', to: 'راح اشوفك', why: 'MSA future' }], kept: [] }] };
    const out = applyDialectReview(p, review);
    expect(out.sections.map((s) => [s.kind, s.lyrics, s.singers])).toEqual([['INTRO', '', []], ['VERSE', 'راح اشوفك\nيا گلبي', ['Hana']], ['CHORUS', 'شلونك', ['Hana']]]);
    expect(() => applyDialectReview(p, { ...review, sections: [{ ...review.sections[0], lyrics: 'راح اشوفك' }] })).toThrow(/number of lines in section 2/);
    // the review goes through its tool contract
    expect(CONTRACTS['story.structured_answer'].outputFor!({ task: 'song-dialect' })!.safeParse(review).success).toBe(true);
  });

  it('MSA in an Iraqi lyric is found as whole words, also with an attached و/ف, and never inside a Baghdadi word', () => {
    expect(msaInIraqi('ولماذا تركتني؟ الآن')).toEqual([{ word: 'لماذا', say: 'ليش' }, { word: 'الآن', say: 'هسه' }]);
    expect(msaInIraqi('شلونك هسه؟ ماكو شي')).toEqual([]);
    expect(msaInIraqi('لمّا اجيت')).toEqual([]); // «لمّا» is not «لم»
  });

  it('an Arabic plan becomes sections whose SUNG words are textAr (what ACE-Step sings) and whose text is the gloss', () => {
    const iraqi = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
    const song = songFromPlan({ ...plan([]), sections: [{ kind: 'INTRO', lyrics: '', singers: [] }, { kind: 'VERSE', lyrics: 'باچر نلتقي\nيا گلبي', gloss: 'Tomorrow we meet\nmy heart', singers: ['Hana'] }, { kind: 'CHORUS', lyrics: 'شلونك', gloss: 'How are you', singers: ['Hana'] }] }, songPerformers([hana]), 60, undefined, iraqi);
    expect(song.sections.map((s) => [s.kind, s.textAr ?? null, s.text])).toEqual([['INTRO', null, ''], ['VERSE', 'باچر نلتقي\nيا گلبي', 'Tomorrow we meet\nmy heart'], ['CHORUS', 'شلونك', 'How are you']]);
    expect(song.lyrics).toBe('[Intro]\n\n[Verse]\nباچر نلتقي\nيا گلبي\n\n[Chorus]\nشلونك');
    expect(song.sections.map((s) => [s.from, s.to])).toEqual([[0, 24], [24, 48], [48, 60]]); // timed by the sung Arabic lines
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

  it('the level trim is a plain gain to a −1 dBTP true peak, and only when the peak is above it', () => {
    expect(levelTrimDb(0.3)).toBeCloseTo(-1.3); // Harbour Lights' raw recording
    expect(levelTrimDb(-0.4)).toBeCloseTo(-0.6);
    expect(levelTrimDb(-1)).toBe(0);
    expect(levelTrimDb(-6)).toBe(0);
  });

  it('after the recording, the planned sections keep their proportions over the real length (never re-spread evenly)', () => {
    // Harbour Lights as planned for 90 s: intro 0–6, verse 6–19 … outro 84–90; the recording is 90 s → unchanged
    const planned = [[0, 6], [6, 19], [19, 32], [32, 45], [45, 58], [58, 71], [71, 84], [84, 90]].map(([from, to]) => ({ from, to }));
    expect(scaleSections(planned, 90)).toEqual(planned);
    expect(scaleSections(planned, 99).map((s) => [s.from, s.to]).slice(-2)).toEqual([[78, 92], [92, 99]]);
    expect(scaleSections([], 90)).toEqual([]);
  });

  it('after the lyrics are placed, lines run forward and the sections cover 0…duration exactly (Harbour Lights)', () => {
    const L = (...xs: Array<[number, number]>) => xs.map(([from, to], index) => ({ index, from, to }));
    const settled = settleSections([
      { from: 0, to: 6 },
      { from: 6, to: 20, lineTimes: L([6.24, 9.3], [16.26, 19.2]) },
      { from: 20, to: 33, lineTimes: L([18.8, 22.56], [29.76, 32.46]) }, // the chorus's first line reached back into the verse
      { from: 33, to: 47, lineTimes: L([31.5, 35.96], [43.1, 46.4]) },
      { from: 47, to: 60, lineTimes: L([44.06, 49.24], [56.48, 59.08]) }, // 1.6 s early
      { from: 73, to: 90, lineTimes: L([72.54, 78.96], [86, 89.02]) },
      { from: 90, to: 91 }, // the outro past the end
    ], 90);
    const lines = settled.flatMap((s) => s.lineTimes ?? []);
    for (let i = 1; i < lines.length; i++) expect(lines[i].from).toBeGreaterThanOrEqual(lines[i - 1].to);
    expect(settled[2].lineTimes![0].from).toBe(19.2);
    expect(settled[4].lineTimes![0].from).toBe(46.4);
    expect(settled.map((s) => [s.from, s.to])).toEqual([[0, 6], [6, 19], [19, 32], [32, 46], [46, 72], [72, 90], [90, 90]]);
  });

  it('the producer\'s listening verdict belongs to the recording it judged; a patch cannot write one', () => {
    const s = seed();
    const base = { ...s.productions[0], song: { id: 'song-1', title: 't', source: 'GENERATED', durationSeconds: 90, caption: 'c', sections: [], singerIds: [], assetId: 'raw-1' } as Song };
    let st = { ...s, productions: [base, ...s.productions.slice(1)] };
    st = recordSongListening(st, base.id, { verdict: 'ACCEPTED', note: 'coherent; clean joins' });
    const p1 = st.productions[0];
    expect(songVerdict(p1.song)).toMatchObject({ by: 'PRODUCER', verdict: 'ACCEPTED', assetId: 'raw-1', note: 'coherent; clean joins' });
    // a new recording is not accepted by the verdict on the old one
    st = updateSong(st, base.id, { assetId: 'take-2', listening: [{ by: 'PRODUCER', verdict: 'ACCEPTED', assetId: 'take-2', at: 'x' }] });
    expect(st.productions[0].song!.listening).toHaveLength(1);
    expect(songVerdict(st.productions[0].song)).toBeUndefined();
    const none = { ...s, productions: [{ ...base, song: { ...base.song, assetId: undefined } }, ...s.productions.slice(1)] };
    expect(() => recordSongListening(none, base.id, { verdict: 'ACCEPTED' })).toThrow(/no recording/);
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

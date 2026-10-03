import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { acceptProposal, addAsset, addCharacter, addProduction, addScene, addShot, addShow, addTake, addVoiceRecording, deleteAsset, deleteCharacter, deleteShot, duplicateProduction, emptyStudio, markStepDone, moveShot, rejectTake, removeTake, reorderShot, replaceSceneShots, selectTake, setPendingReference, updateCharacter, updateSettings } from '@/domain/actions';
import { appearanceLock } from '@/domain/rules';
import { sampleProposal } from '@/domain/proposals';
import { StudioError } from '@/domain/errors';
import type { StudioState } from '@/domain/types';
import { castOf, nextStep, productionHref, progressOf, shotLabel } from '@/studio/selectors';

/** The studio's pure actions: state in, state out, nothing else touched. The same functions run in the browser and
 *  on the server, so these tests cover the rules both sides enforce. */

describe('fixtures', () => {
  it('seed is self-consistent: every referenced asset, character and location exists', () => {
    const s = seed();
    const assets = new Set(s.assets.map((a) => a.id));
    const chars = new Set(s.characters.map((c) => c.id));
    const locs = new Set(s.locations.map((l) => l.id));
    for (const p of s.productions) {
      if (p.coverAssetId) expect(assets.has(p.coverAssetId), `${p.id} cover`).toBe(true);
      if (p.cutAssetId) expect(assets.has(p.cutAssetId)).toBe(true);
      for (const id of p.castIds) expect(chars.has(id), `${p.id} cast ${id}`).toBe(true);
      for (const id of p.locationIds) expect(locs.has(id), `${p.id} location ${id}`).toBe(true);
      for (const sh of p.shots) {
        expect(p.scenes.some((sc) => sc.id === sh.sceneId), `${p.id} ${sh.id} scene`).toBe(true);
        if (sh.openingFrameAssetId) expect(assets.has(sh.openingFrameAssetId), `${sh.id} opening`).toBe(true);
        if (sh.endingFrameAssetId) expect(assets.has(sh.endingFrameAssetId), `${sh.id} ending`).toBe(true);
        for (const t of sh.takes) { expect(assets.has(t.assetId), `${sh.id} take ${t.id}`).toBe(true); expect(t.status).toBe('READY'); expect(t.provider).toBe('SAMPLE'); }
        if (sh.selectedTakeId) expect(sh.takes.some((t) => t.id === sh.selectedTakeId)).toBe(true);
        for (const id of sh.characterIds) expect(chars.has(id)).toBe(true);
      }
      if (p.song?.assetId) expect(assets.has(p.song.assetId)).toBe(true);
    }
    for (const c of s.characters) { if (c.portraitAssetId) expect(assets.has(c.portraitAssetId)).toBe(true); for (const r of c.refs) expect(assets.has(r.assetId)).toBe(true); for (const v of c.voice.samples) if (v.assetId) expect(assets.has(v.assetId)).toBe(true); else expect(v.source).toBe('GENERATED'); }
    for (const l of s.locations) { if (l.masterAssetId) expect(assets.has(l.masterAssetId)).toBe(true); for (const r of l.refs) expect(assets.has(r.assetId)).toBe(true); }
    for (const se of s.seasons) expect(s.shows.some((x) => x.id === se.showId)).toBe(true);
  });
  it('every asset is marked sample and lives under /sample/', () => {
    for (const a of seed().assets) { expect(a.sample).toBe(true); expect(a.origin).toBe('SAMPLE'); expect(a.src.startsWith('/sample/')).toBe(true); }
  });
});

describe('shows and productions', () => {
  it('adding a show creates season 1; adding an episode numbers it within the season', () => {
    const r = addShow(seed(), { title: 'New', logline: 'x', genre: 'Comedy', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' });
    expect(r.season.number).toBe(1);
    const e1 = addProduction(r.state, { kind: 'EPISODE', showId: r.show.id, seasonId: r.season.id, title: 'One', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: '' }, castIds: [], locationIds: [] });
    const e2 = addProduction(e1.state, { kind: 'EPISODE', showId: r.show.id, seasonId: r.season.id, title: 'Two', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: '' }, castIds: [], locationIds: [] });
    expect(e1.production.episodeNumber).toBe(1);
    expect(e2.production.episodeNumber).toBe(2);
    expect(e2.production.stage).toBe('STORY');
    expect(productionHref(e2.production)).toBe(`/shows/${r.show.id}/seasons/${r.season.id}/episodes/${e2.production.id}`);
  });
  it('an episode without a show is refused', () => {
    expect(() => addProduction(seed(), { kind: 'EPISODE', title: 'Orphan', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: '' }, castIds: [], locationIds: [] })).toThrow(StudioError);
  });
  it('an episode inherits its show’s cast', () => {
    const s = seed();
    const ep = s.productions.find((p) => p.id === 's2e1')!;
    expect(castOf(s, ep).map((c) => c.id)).toEqual(expect.arrayContaining(['abu-samir', 'layla', 'karim', 'the-cat']));
  });
  it('duplicating drops takes and starts at STORY', () => {
    const s = seed();
    const r = duplicateProduction(s, 's1e1');
    expect(r.production?.title).toBe('The Opening Hour (copy)');
    expect(r.production?.stage).toBe('STORY');
    expect(r.production?.shots.every((sh) => sh.takes.length === 0 && !sh.selectedTakeId)).toBe(true);
    expect(r.state.productions.length).toBe(s.productions.length + 1);
  });
  it('a step is marked done only forwards', () => {
    const s = seed();
    const before = s.productions.find((p) => p.id === 's1e1')!.stage; // FINAL_CUT
    expect(markStepDone(s, 's1e1', 'STORY').productions.find((p) => p.id === 's1e1')!.stage).toBe(before);
    expect(markStepDone(s, 's2e1', 'STORY').productions.find((p) => p.id === 's2e1')!.stage).toBe('CAST_AND_WORLD');
  });
});

describe('scenes and shots', () => {
  it('shots are numbered within their scene and renumbered after moves and deletes', () => {
    const s0 = seed();
    const p0 = s0.productions.find((p) => p.id === 's1e1')!;
    const sc1 = p0.scenes[0];
    const { state: s1, shot } = addShot(s0, 's1e1', { sceneId: sc1.id, purpose: 'x', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 3, characterIds: [], dialogue: [], transition: 'CUT' });
    let p = s1.productions.find((x) => x.id === 's1e1')!;
    expect(p.shots.filter((sh) => sh.sceneId === sc1.id).map((sh) => sh.number)).toEqual([1, 2, 3, 4]);
    expect(shotLabel(p, shot)).toBe('1.4');
    expect(p.shots.findIndex((sh) => sh.id === shot.id)).toBe(3);
    const s2 = moveShot(s1, 's1e1', shot.id, -1);
    p = s2.productions.find((x) => x.id === 's1e1')!;
    expect(p.shots.find((sh) => sh.id === shot.id)!.number).toBe(3);
    const s3 = moveShot(s2, 's1e1', p.shots[3].id, 1);
    expect(s3.productions.find((x) => x.id === 's1e1')!.shots[3].id).toBe(p.shots[3].id);
    const s4 = deleteShot(s3, 's1e1', shot.id);
    p = s4.productions.find((x) => x.id === 's1e1')!;
    expect(p.shots.filter((sh) => sh.sceneId === sc1.id).map((sh) => sh.number)).toEqual([1, 2, 3]);
  });
  it('drag reorder places a shot before another in the same scene only', () => {
    const s = seed();
    const p = s.productions.find((x) => x.id === 's1e1')!;
    const [a, b, c] = p.shots.filter((sh) => sh.sceneId === p.scenes[0].id);
    const r = reorderShot(s, 's1e1', c.id, a.id);
    const q = r.productions.find((x) => x.id === 's1e1')!;
    expect(q.shots.slice(0, 3).map((sh) => sh.id)).toEqual([c.id, a.id, b.id]);
    expect(q.shots.slice(0, 3).map((sh) => sh.number)).toEqual([1, 2, 3]);
    const other = p.shots.find((sh) => sh.sceneId === p.scenes[1].id)!;
    expect(reorderShot(s, 's1e1', a.id, other.id)).toBe(s);
  });
  it('adding a scene numbers it and choosing a take updates progress and the next step', () => {
    const s0 = seed();
    const { state: s1, scene } = addScene(s0, 'night-tray', { title: 'Two', timeOfDay: 'NIGHT' });
    expect(scene.number).toBe(2);
    const p1 = s1.productions.find((x) => x.id === 's1e2')!;
    expect(progressOf(p1).chosen).toBe(1);
    expect(nextStep(p1).tab).toBe('produce');
    const s2 = selectTake(s1, 's1e2', 's1e2-2', 's1e2-2-t1');
    expect(progressOf(s2.productions.find((x) => x.id === 's1e2')!).chosen).toBe(2);
  });
  it('a rejected take leaves the cut and cannot be chosen', () => {
    let s = seed();
    s = rejectTake(s, 's1e1', 's1e1-1', 's1e1-1-t2', 'face changes mid-shot');
    const sh = s.productions.find((x) => x.id === 's1e1')!.shots[0];
    expect(sh.selectedTakeId).toBeUndefined();
    expect(sh.takes.find((t) => t.id === 's1e1-1-t2')).toMatchObject({ status: 'REJECTED', rejectionReason: 'face changes mid-shot' });
    expect(() => selectTake(s, 's1e1', 's1e1-1', 's1e1-1-t2')).toThrow(StudioError);
  });
  it('replanning a scene with takes is refused unless forced', () => {
    const s = seed();
    const sc = s.productions.find((x) => x.id === 's1e1')!.scenes[0];
    const shots = [{ sceneId: sc.id, purpose: 'new', action: 'a', framing: 'WIDE' as const, cameraMove: 'STATIC' as const, durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' as const }];
    expect(() => replaceSceneShots(s, 's1e1', sc.id, shots)).toThrow(StudioError);
    const forced = replaceSceneShots(s, 's1e1', sc.id, shots, true);
    const p = forced.productions.find((x) => x.id === 's1e1')!;
    expect(p.shots.filter((x) => x.sceneId === sc.id)).toHaveLength(1);
    expect(p.shots[0].number).toBe(1);
    expect(p.shots.filter((x) => x.sceneId !== sc.id)).toHaveLength(4);
  });
});

describe('characters, settings, attention', () => {
  it('deleting a character removes them from every cast list', () => {
    const s = deleteCharacter(seed(), 'layla');
    expect(s.characters.some((c) => c.id === 'layla')).toBe(false);
    expect(s.shows.every((sh) => !sh.castIds.includes('layla'))).toBe(true);
    expect(s.productions.every((p) => !p.castIds.includes('layla') && p.shots.every((sh) => !sh.characterIds.includes('layla')) && p.scenes.every((sc) => !sc.characterIds.includes('layla')))).toBe(true);
  });
  it('settings merge defaults', () => {
    const s = updateSettings(seed(), { reducedMotion: true, defaults: { style: 'ANIME' } as never });
    expect(s.settings.reducedMotion).toBe(true);
    expect(s.settings.defaults.style).toBe('ANIME');
    expect(s.settings.defaults.aspect).toBe('WIDE_16_9');
  });
});

describe('empty studio and assets', () => {
  it('an empty studio keeps only the settings', () => {
    const s = emptyStudio({ ...seed().settings, reducedMotion: true });
    expect(s.shows).toEqual([]); expect(s.productions).toEqual([]); expect(s.characters).toEqual([]); expect(s.locations).toEqual([]); expect(s.assets).toEqual([]);
    expect(s.settings.reducedMotion).toBe(true);
  });
  it('an uploaded asset is never sample and is served from the library', () => {
    const r = addAsset(seed(), { kind: 'IMAGE', src: '/api/media/up-1', label: 'me.png', tags: ['added'], mimeType: 'image/png', bytes: 12, sample: false, origin: 'UPLOAD', id: 'up-1' });
    expect(r.asset.sample).toBe(false); expect(r.asset.src).toBe('/api/media/up-1');
    expect(() => addAsset(r.state, { kind: 'IMAGE', src: '/api/media/up-1', label: 'again', tags: [], sample: false, origin: 'UPLOAD', id: 'up-1' })).toThrow(StudioError);
  });
});

/** THE CONTINUITY RULE — see src/domain/rules.ts and docs/CHARACTER-CONTINUITY.md. */
describe('character continuity', () => {
  const ch = (s: StudioState, id: string) => s.characters.find((c) => c.id === id)!;
  const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof StudioError ? e.code : 'OTHER'; } };

  it('usage comes from takes: characters in a filmed shot are used; cast alone is not; unknown history counts as used', () => {
    const s = seed();
    expect(appearanceLock(ch(s, 'layla'))).toMatchObject({ locked: true, reason: 'USED' });
    expect(ch(s, 'layla').usage!.videos.length).toBeGreaterThan(0);
    expect(s.productions.find((p) => p.id === 'river-lights')!.castIds).toContain('nour');
    expect(appearanceLock(ch(s, 'nour'))).toMatchObject({ locked: false });
    expect(appearanceLock(ch(s, 'um-hassan'))).toMatchObject({ locked: true, reason: 'UNKNOWN' });
    expect(appearanceLock({ usage: undefined }).locked).toBe(true);
  });

  it('an appearance change on a used character is refused; profile and voice changes are kept', () => {
    const s = seed();
    const before = ch(s, 'layla');
    expect(codeOf(() => updateCharacter(s, 'layla', { hair: 'Bleached' }))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => updateCharacter(s, 'layla', { portraitAssetId: 'ref-nour-front' }))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => updateCharacter(s, 'layla', { refs: [] }))).toBe('APPEARANCE_LOCKED');
    // the same values again are not a change
    const same = updateCharacter(s, 'layla', { hair: before.hair, style: before.style, notes: 'Hums when counting.', role: 'Runs the café now' });
    const after = ch(same, 'layla');
    expect(after.hair).toBe(before.hair);
    expect(after.notes).toBe('Hums when counting.');
    expect(after.role).toBe('Runs the café now');
    expect(after.voice).toEqual(before.voice);
  });

  it('an unused character can take a pending reference and a new appearance; a used one cannot', () => {
    const upload = { id: 'up-face', kind: 'IMAGE' as const, src: '/api/media/up-face', label: 'face.jpg', tags: [], sample: false, origin: 'UPLOAD' as const, width: 1024, height: 1280 };
    let s = addAsset(seed(), upload).state;
    s = setPendingReference(s, 'nour', 'up-face');
    expect(ch(s, 'nour').pendingReference?.assetId).toBe('up-face');
    s = updateCharacter(s, 'nour', { portraitAssetId: 'ref-nour-side' });
    expect(ch(s, 'nour').portraitAssetId).toBe('ref-nour-side');
    s = setPendingReference(s, 'nour', undefined);
    expect(ch(s, 'nour').pendingReference).toBeUndefined();
    // a bundled sample picture is a placeholder, not a reference to draw from
    expect(codeOf(() => setPendingReference(seed(), 'nour', 'ref-nour-side'))).toBe('INVALID');
    expect(codeOf(() => setPendingReference(addAsset(seed(), upload).state, 'layla', 'up-face'))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => setPendingReference(addAsset(seed(), upload).state, 'um-hassan', 'up-face'))).toBe('APPEARANCE_LOCKED');
  });

  it('a new take records usage for the shot’s characters, and removing the take keeps the record, marked', () => {
    let s = seed();
    expect(appearanceLock(ch(s, 'nour')).locked).toBe(false);
    const r = addTake(s, 'river-lights', 'rl-2', { assetId: 'take-01', provider: 'MINIMAX', model: 'MiniMax-H3', requestId: 'req-1' });
    s = r.state;
    expect(r.take.status).toBe('READY');
    const lock = appearanceLock(ch(s, 'nour'));
    expect(lock).toMatchObject({ locked: true, reason: 'USED' });
    expect(lock.videos[0]).toMatchObject({ productionId: 'river-lights', shotId: 'rl-2', takeId: r.take.id, status: 'IN_TAKE' });
    s = removeTake(s, 'river-lights', 'rl-2', r.take.id);
    expect(s.productions.find((p) => p.id === 'river-lights')!.shots.find((x) => x.id === 'rl-2')!.takes).toHaveLength(0);
    const kept = appearanceLock(ch(s, 'nour'));
    expect(kept.locked).toBe(true);
    expect(kept.videos[0].status).toBe('TAKE_REMOVED');
  });

  it('a picture a used character’s appearance rests on cannot be deleted; an unused character’s can', () => {
    const s = seed();
    const portrait = ch(s, 'layla').portraitAssetId!;
    expect(codeOf(() => deleteAsset(s, portrait))).toBe('ASSET_PROTECTED');
    const nourView = ch(s, 'nour').refs[0].assetId;
    const after = deleteAsset(s, nourView);
    expect(after.assets.some((a) => a.id === nourView)).toBe(false);
    expect(ch(after, 'nour').refs.some((r) => r.assetId === nourView)).toBe(false);
  });

  it('a new character starts with a known, empty history and a voice recording never touches the appearance', () => {
    const r = addCharacter(seed(), { name: 'Zeina', role: 'x', style: 'CARTOON', sex: 'FEMALE', ageYears: 20, build: '', face: '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: '', language: 'EN' });
    expect(r.character.usage).toEqual({ known: true, videos: [] });
    const withUpload = addAsset(seed(), { id: 'up-rec', kind: 'AUDIO', src: '/api/media/up-rec', label: 'counter.wav', tags: [], sample: false, origin: 'UPLOAD' }).state;
    const s = addVoiceRecording(withUpload, 'layla', 'up-rec', 'Take at the counter');
    expect(ch(s, 'layla').voice.samples.at(-1)).toMatchObject({ source: 'UPLOADED', assetId: 'up-rec' });
    expect(ch(s, 'layla').portraitAssetId).toBe(ch(seed(), 'layla').portraitAssetId);
    // a bundled sample voice is not a recording of the character
    expect(() => addVoiceRecording(seed(), 'layla', 'voice-mid', 'nope')).toThrow(StudioError);
  });
});

describe('Auto Idea', () => {
  it('works with no preferences at all', () => {
    for (const kind of ['SHOW', 'SHORT', 'MUSIC_VIDEO'] as const) {
      const p = sampleProposal(seed(), { kind, preferences: {} });
      expect(p.sample).toBe(true);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.cast.length).toBeGreaterThan(0);
      expect(p.locations.length).toBeGreaterThan(0);
    }
  });
  it('explicit preferences win', () => {
    const p = sampleProposal(seed(), { kind: 'SHORT', preferences: { style: 'ANIME', language: 'EN', durationSeconds: 90, mood: 'Hushed', castIds: ['karim'], locationIds: ['rooftop'] } });
    expect(p).toMatchObject({ style: 'ANIME', language: 'EN', dialect: undefined, durationSeconds: 90, mood: 'Hushed' });
    expect(p.cast[0]).toMatchObject({ characterId: 'karim', fromPreference: true });
    expect(p.locations[0]).toMatchObject({ locationId: 'rooftop', fromPreference: true });
  });
  it('an episode uses the show’s world: its style, language, returning cast and places, plus a proposed newcomer', () => {
    const s = seed();
    const show = s.shows.find((x) => x.id === 'last-sip')!;
    const p = sampleProposal(s, { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', preferences: {} });
    expect(p.style).toBe(show.style);
    expect(p.language).toBe(show.language);
    expect(p.dialect).toBe(show.dialect);
    for (const id of show.castIds) expect(p.cast.some((c) => c.characterId === id)).toBe(true);
    for (const id of show.locationIds) expect(p.locations.some((l) => l.locationId === id)).toBe(true);
    expect(p.cast.some((c) => c.isNew)).toBe(true);
  });
  it('accepting creates only what was kept: existing characters linked, new ones added without an appearance, scenes from the structure', () => {
    const s = seed();
    const p = sampleProposal(s, { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', preferences: {} });
    const keepCast = p.cast.filter((c) => c.characterId === 'layla' || c.isNew).map((c) => c.key);
    const r = acceptProposal(s, { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', aspect: 'WIDE_16_9', proposal: p, keepCast, keepLocations: [], preferences: {} });
    expect(r.production).toMatchObject({ kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', episodeNumber: 2, title: p.title });
    expect(r.production.brief).toMatchObject({ mode: 'AUTO_IDEA', fromSampleProposal: true });
    expect(r.production.scenes.map((x) => x.title)).toEqual(p.structure.map((x) => x.title));
    const newcomer = r.state.characters.find((c) => c.name === p.cast.find((x) => x.isNew)!.name)!;
    expect(r.production.castIds).toEqual(['layla', newcomer.id]);
    expect(newcomer.portraitAssetId).toBeUndefined();
    expect(appearanceLock(newcomer).locked).toBe(false);
    expect(r.state.characters).toHaveLength(s.characters.length + 1);
  });
  it('a music video proposal carries its song into timed sections', () => {
    const s = seed();
    const p = sampleProposal(s, { kind: 'MUSIC_VIDEO', preferences: {} });
    const r = acceptProposal(s, { kind: 'MUSIC_VIDEO', aspect: 'WIDE_16_9', proposal: p, keepCast: p.cast.map((c) => c.key), keepLocations: p.locations.map((l) => l.key), preferences: {} });
    expect(r.production.song?.sections.length).toBeGreaterThan(0);
    expect(r.production.song?.sections.every((x) => x.singerIds.length > 0)).toBe(true);
  });
  it('an accepted Auto Idea carries its development intent in the brief (later story calls build within it)', () => {
    const s = seed();
    const base = sampleProposal(s, { kind: 'SHORT', preferences: {} });
    const p = { ...base, mood: 'quiet, bittersweet', development: { ideaJobId: 'job-idea', audience: 'families', strategy: 'SHORT_FOCUSED', hook: 'a kite snaps loose in the first second', ending: 'she lets it go' } } as unknown as typeof base;
    const r = acceptProposal(s, { kind: 'SHORT', aspect: 'WIDE_16_9', proposal: p, keepCast: [], keepLocations: [], preferences: {} });
    expect(r.production.brief.development).toMatchObject({ ideaJobId: 'job-idea', audience: 'families', tone: 'quiet, bittersweet', hook: 'a kite snaps loose in the first second', ending: 'she lets it go', strategy: 'SHORT_FOCUSED' });
    // a proposal without a development record (a written example) carries none
    const plain = acceptProposal(s, { kind: 'SHORT', aspect: 'WIDE_16_9', proposal: base, keepCast: [], keepLocations: [], preferences: {} });
    expect(plain.production.brief.development).toBeUndefined();
  });
  it('D22: each scene gets the one place, the people its words name and the time of day a word states', () => {
    const s = seed();
    const base = sampleProposal(s, { kind: 'SHORT', preferences: {} });
    const p = { ...base, premise: 'During a meteor shower, two old men repair a radio.', cast: [{ key: 'n', name: 'Najm Haddad', role: 'librarian', reason: 'r', isNew: true, fromPreference: false, sex: 'MALE', ageYears: 65 }], locations: [{ key: 'w', name: 'The Workshop', description: 'a seaside workshop', kind: 'INTERIOR' }], structure: [{ title: 'Arrival', summary: 'Najm enters with the radio.' }, { title: 'At dawn', summary: 'The sun rises over the sea.' }] } as unknown as typeof base;
    const r = acceptProposal(s, { kind: 'SHORT', aspect: 'WIDE_16_9', proposal: p, keepCast: ['n'], keepLocations: ['w'], preferences: {} });
    const [a, b] = r.production.scenes;
    const najm = r.state.characters.find((c) => c.name === 'Najm Haddad')!;
    const place = r.state.locations.find((l) => l.name === 'The Workshop')!;
    expect(a).toMatchObject({ locationId: place.id, timeOfDay: 'NIGHT', characterIds: [najm.id] }); // night from the premise
    expect(b).toMatchObject({ locationId: place.id, timeOfDay: 'DAWN', characterIds: [] }); // the scene's own word wins
  });
});

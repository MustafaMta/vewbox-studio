import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { COMMANDS, runCommand, type Command, type CommandName } from '@/domain/commands';
import { canonical, hashState } from '@/domain/hash';
import { StudioError } from '@/domain/errors';
import { CALIBRATION_TEXT } from '@/domain/voice-identity';
import type { StudioState } from '@/domain/types';
import { COMMAND_SCOPES, batchScope, expandScope, isScopeMiss, mergeScoped, poisoned, restrictState, widen, type Scope } from '@/server/studio/scope';

/** SCOPED PERSISTENCE, PART A (docs/BACKEND-AUDIT-2026-10.md step 13a): every command is classified by what it
 *  touches, and running it on ONLY that part of the studio — then putting the result back — gives exactly what
 *  running it on the whole studio gives. The corpus runs every command (most of them several ways, refusals
 *  included) in sequence on the sample studio. A command whose scope left out a collection its reducer touched is
 *  caught by the poisoned collection (ScopeMiss) and counted: the classification must need none. */

const AT = '2026-10-04T09:00:00.000Z';
let n = 0;
const c = <K extends CommandName>(name: K, ...args: unknown[]): Command => ({ name, args, seed: `scope-${++n}`, at: AT } as unknown as Command);
const sha = (k: number) => k.toString(16).padStart(64, '0');
const CONSENT = { statement: 'MY_VOICE', by: 'PRODUCER', at: '2026-10-03T00:00:00.000Z' };
const audio = (id: string, origin = 'UPLOAD') => c('addAsset', { id, kind: 'AUDIO', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin, provenance: { path: `audio/${id}.wav` } });
const image = (id: string) => c('addAsset', { id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', width: 1024, height: 1536, provenance: { path: `image/${id}.png` } });
const video = (id: string) => c('addAsset', { id, kind: 'VIDEO', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', durationSeconds: 5, provenance: { path: `video/${id}.mp4` } });
const blank = { role: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] };
const shotInput = (sceneId: string) => ({ sceneId, purpose: 'p', action: 'a', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: ['layla'], dialogue: [], transition: 'CUT' });
const candidates = [1, 2, 3].map((k) => ({ index: k, seed: 100 + k, assetId: `gen-seed-${k}`, sha256: sha(k), durationSeconds: 9, measured: { durationSeconds: 9, lufs: -20, truePeakDbtp: -1, clippedSamples: 0 }, gate: { ok: false, reasons: ['not measured yet'] } }));
const design = { id: 'vd-1', characterId: 'nour', mode: 'AUTOMATIC', engine: 'voxcpm2', model: 'openbmb/VoxCPM2', engineVersion: 'voxcpm 2.0.3', description: 'A warm, low female voice, about 31', descriptionSource: 'PROFILE', language: 'EN', text: CALIBRATION_TEXT.EN, seed: 100, seeds: [100, 101, 102], params: { cfg_value: 2 }, lineEngine: 'indextts', lineParams: { speed: 1, emotionAlpha: 1, seed: 77 }, candidates, jobId: 'job-d' };
const proposal = { sample: false, title: 'Lanterns', logline: 'l', premise: 'At night, Layla carries a lantern across the cafe.', genre: 'drama', mood: 'calm', style: 'ANIME', language: 'EN', durationSeconds: 60, structure: [{ title: 'Lantern', summary: 'Layla lights it in the cafe.' }], cast: [{ key: 'a', characterId: 'layla', name: 'Layla', role: 'r', reason: 'r', isNew: false, fromPreference: true }, { key: 'b', name: 'Karim', role: 'r', reason: 'r', isNew: false, fromPreference: false }, { key: 'c', name: 'Samia', role: 'r', reason: 'r', isNew: true, fromPreference: false, sex: 'FEMALE', ageYears: 40 }], locations: [{ key: 'x', name: 'Cafe', description: 'the cafe', isNew: false, fromPreference: false }] };

/** The corpus, in order (each command runs on the studio the previous ones produced). */
function corpus(): Command[] {
  return [
    // assets the later commands need (uploads, a generated proof line, pictures, a take's video)
    audio('up-ref'), audio('gen-proof', 'GENERATED'), audio('up-line'), image('img-1'), image('img-2'), video('vid-1'), video('vid-2'), video('vid-cut'),
    ...[1, 2, 3].map((k) => c('addAsset', { id: `gen-seed-${k}`, kind: 'AUDIO', src: `/api/media/gen-seed-${k}`, label: 'seed', tags: [], sample: false, origin: 'GENERATED', sha256: sha(k), tier: 'RAW', provenance: { designId: 'vd-1' } })),
    c('addAsset', { kind: 'IMAGE', src: '/api/media/x', label: 'no id', tags: [], sample: false, origin: 'UPLOAD' }),
    c('addAsset', { id: 'img-1', kind: 'IMAGE', src: '/api/media/img-1', label: 'again', tags: [], sample: false, origin: 'UPLOAD' }), // CONFLICT
    c('updateAsset', 'img-2', { label: 'renamed', tags: ['x'] }), c('updateAsset', 'missing', { label: 'x' }),
    c('setAssetTier', 'img-2', 'SECONDARY'), c('setAssetTier', 'vid-1', 'RAW'),
    // shows and seasons
    c('addShow', { title: 'Paper Lanterns', logline: 'l', genre: 'drama', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' }),
    c('updateShow', 'last-sip', { logline: 'a new logline' }), c('updateShow', 'nope', { logline: 'x' }),
    c('updateShowBible', 'last-sip', { timeline: { add: ['Ep 1: they meet'] }, unresolved: { add: ['the letter'] } }),
    c('finishEpisode', 's1e1', { events: ['Layla opened early'], unresolved: ['the stranger'] }), c('finishEpisode', 'night-tray', {}), // a short has no show: INVALID
    c('addSeason', 'paper-kites', 'Season 2'), c('updateSeason', 'last-sip-s2', { arc: 'the arc' }),
    // productions
    c('addProduction', { kind: 'SHORT', title: 'Quick one', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 30, brief: { mode: 'MANUAL', text: 'x' }, castIds: ['hana'], locationIds: [] }),
    c('addProduction', { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s1', title: 'Episode 3', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }),
    c('addProduction', { kind: 'EPISODE', title: 'no show', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }),
    c('updateProduction', 'night-tray', { logline: 'edited' }), c('setStage', 's1e2', 'STORYBOARD'), c('markStepDone', 's1e2', 'STORYBOARD'), c('markStepDone', 'nope', 'STORY'),
    c('fillProductionFields', 'night-tray', { synopsis: 'filled', logline: 'not mine' }, { synopsis: '', logline: 'old' }),
    c('addCastMember', { productionId: 'night-tray', showId: 'last-sip' }, ['nour']), c('addCastMember', { productionId: 'night-tray' }, ['ghost']),
    c('addLocationMember', { productionId: 'night-tray' }, ['cafe', 'rooftop']),
    c('duplicateProduction', 's1e2'),
    // scenes and shots
    c('addScene', 'night-tray', { title: 'Second scene', timeOfDay: 'NIGHT' }), c('updateScene', 's1e2', 's1e2-sc1', { title: 'Renamed' }),
    c('addShot', 'night-tray', shotInput('nt-sc1')), c('updateShot', 's1e1', 's1e1-2', { action: 'they talk', durationSeconds: 5 }),
    c('updateShot', 'nope', 'x', { action: 'x' }), c('duplicateShot', 'paper-boats', 'pb-2'), c('moveShot', 'paper-boats', 'pb-3', -1), c('reorderShot', 'paper-boats', 'pb-1', null),
    c('setShotContinuity', 'night-tray', 'nt-2', { characters: [{ characterId: 'hana' }], props: [], environment: {}, camera: {} }),
    c('setShotFrames', 'night-tray', 'nt-2', { openingFrameAssetId: 'img-2' }),
    c('replaceSceneShots', 'river-lights', 'rl-sc1', [shotInput('rl-sc1'), shotInput('rl-sc1')]),
    c('replaceScript', 'rooftop-radio', [{ title: 'One', timeOfDay: 'DAY', characterIds: [], beats: [] }, { title: 'Two', timeOfDay: 'NIGHT', characterIds: [], beats: [] }]),
    // takes (usage records of the shot's characters)
    c('addTake', 's1e2', 's1e2-3', { assetId: 'vid-1', provider: 'MINIMAX', label: 'Take 1', jobId: 'job-t1', id: 'take-job-t1', select: 'IF_UNCHOSEN' }),
    c('addTake', 's1e2', 's1e2-3', { assetId: 'vid-2', provider: 'UPLOAD' }), c('addTake', 's1e2', 's1e2-3', { assetId: 'missing', provider: 'UPLOAD' }),
    c('addTake', 's1e2', 's1e2-4', { assetId: 'vid-1', provider: 'MINIMAX', id: 'take-job-t1' }), // CONFLICT: the id exists in another shot
    c('selectTake', 's1e2', 's1e2-2', 's1e2-2-t2'), c('rateTake', 's1e1', 's1e1-3', 's1e1-3-t1', 'REJECTED', { reason: 'soft', by: 'producer' }), c('rateTake', 's1e1', 's1e1-3', 's1e1-3-t2', 'GOOD'),
    c('noteTake', 's1e1', 's1e1-1', 's1e1-1-t1', 'keep the light'), c('recordTakeEndState', 's1e1', 's1e1-1', 's1e1-1-t1', { characters: [] }, { approve: true }), c('rejectTake', 's1e1', 's1e1-1', 's1e1-1-t1', 'blurred'),
    c('setCut', 's1e2', 'vid-cut', { inputs: 'x' }), c('recordExport', 's1e1', { assetId: 'vid-cut', format: 'mp4-h264', resolution: '1080', subtitles: 'none' }),
    c('selectTake', 's1e1', 's1e1-4', 's1e1-4-t1'), // the cut goes stale on a change
    c('removeTake', 's1e1', 's1e1-3', 's1e1-3-t1'), c('removeTake', 's1e1', 's1e1-3', 'gone'),
    c('setDialogueAudio', 's1e1', 's1e1-2', 'd1', { audioAssetId: 'up-line', durationSeconds: 2.1 }),
    c('keepLineRecordings', 's1e1', [{ shotId: 's1e1-2', lineId: 'd1' }], { by: 'producer' }), c('keepLineRecordings', 's1e1', [{ shotId: 's1e1-3', lineId: 'd2' }]),
    c('setSong', 'rooftop-radio', { id: 'song-1', title: 'Radio', source: 'UPLOADED', assetId: 'song-uploaded', durationSeconds: 30, caption: 'c', sections: [], singerIds: [] }), c('updateSong', 'rooftop-radio', { caption: 'new caption' }), c('recordSongListening', 'rooftop-radio', { verdict: 'ACCEPTED', note: 'heard it all' }),
    c('deleteShot', 'paper-boats', 'pb-3'), c('deleteScene', 's1e2', 's1e2-sc2'),
    // characters and voices
    c('addCharacter', { ...blank, name: 'Samia', style: 'ANIME', sex: 'FEMALE', ageYears: 40, language: 'AR' }),
    c('updateCharacter', 'nour', { notes: 'a note', voice: { timbre: 'warm' } }), c('updateCharacter', 'layla', { face: 'changed' }), // layla is in takes: APPEARANCE_LOCKED
    c('setPendingReference', 'nour', 'img-1'), c('setPendingReference', 'nour', 'voice-low'),
    c('updateCharacter', 'nour', { language: 'EN' }),
    c('addVoiceRecording', 'nour', 'up-ref', 'Studio take', { text: 'hello there, this is my voice', consent: CONSENT }),
    c('addVoiceSample', 'nour', { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED', text: 'Hello. My name is Nour.' }),
    c('updateVoiceSample', 'nour', 'proof-1', { text: 'Hello. My name is Nour.' }),
    c('confirmVoiceConsent', 'nour', 'v-low', 'MY_VOICE'),
    c('addVoiceDesign', 'nour', design), c('updateVoiceDesign', 'nour', 'vd-1', { candidates: candidates.map((x) => ({ index: x.index, measured: x.measured, gate: { ok: true, reasons: [] } })), ranking: [2, 1, 3], rankedBy: 'similarity' }),
    c('setVoiceIdentity', 'nour', { provider: 'LOCAL_TTS', model: 'indextts', mode: 'AUTOMATIC', origin: 'DESIGNED', designId: 'vd-1', seedSha256: sha(2), referenceAssetId: 'gen-seed-2', language: 'EN', params: { speed: 1, emotionAlpha: 1, seed: 77 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'Hello. My name is Nour.' } }),
    c('recordVoiceListening', 'nour', { natural: 4 }),
    c('setSpokenLanguages', 'nour', [{ language: 'EN' }, { language: 'AR', dialect: 'IRAQI_BAGHDADI' }]),
    c('addVoiceLanguageProfiles', 'nour', [{ language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi', comparisonEngines: ['moss'], status: 'REVIEW' }]),
    c('selectVoiceSample', 'um-hassan', undefined), c('removeVoiceSample', 'um-hassan', 'v-warm'),
    c('setCanonicalImage', 'nour', { assetId: 'img-1', jobId: 'job-c1', seed: 1, check: { ok: true } }), c('approveCanonicalImage', 'nour', 1),
    c('setCanonicalImage', 'um-hassan', { assetId: 'img-1' }), // another character's canonical image: INVALID
    c('setAssetTier', 'img-1', 'RAW'), // a canonical image cannot be moved off it
    // locations
    c('addLocation', { name: 'Harbour', kind: 'EXTERIOR', description: 'd', style: 'ANIME', lighting: [], landmarks: [], props: [] }),
    c('updateLocation', 'cafe', { description: 'warmer' }), c('addLocationRefs', 'cafe', [{ id: 'ref-1', role: 'MASTER', assetId: 'img-2', label: 'master' }]),
    c('setLocationAmbience', 'cafe', { assetId: 'voice-low', description: 'Room tone inside a café at night', seconds: 30, model: 'MOSS-SoundEffect v2', seed: 1, createdAt: '2026-10-08T00:00:00.000Z' }),
    c('setLocationAmbience', 'alley', { assetId: 'img-2', description: 'not audio', seconds: 30, model: 'm', seed: 1, createdAt: '2026-10-08T00:00:00.000Z' }), // a picture is not a bed: INVALID
    c('setLocationAmbience', 'cafe', null),
    c('duplicateLocationInStyle', 'cafe', 'REALISTIC'), c('duplicateLocationInStyle', 'cafe', 'CARTOON'), // already cartoon: INVALID
    // settings and cross-cutting commands
    c('updateSettings', { reducedMotion: true }),
    c('proposePronunciation', { word: 'باچر', say: 'باچِر', language: 'AR', dialect: 'IRAQI_BAGHDADI', proposedBy: 'producer' }),
    c('reviewPronunciation', 'pron-missing', { by: 'reviewer', native: true, verdict: 'APPROVED' }), // not found: refused
    c('removePronunciation', 'pron-missing'), // not found: refused
    c('acceptProposal', { kind: 'SHORT', aspect: 'WIDE_16_9', proposal, keepCast: ['a', 'b', 'c'], keepLocations: ['x'], preferences: {} }),
    c('deleteAsset', 'img-2'), c('deleteLocation', 'alley'), c('deleteCharacter', 'um-hassan'),
    c('deleteSeason', 'paper-kites-s1'), c('deleteProduction', 'paper-boats'), c('deleteShow', 'paper-kites'),
  ];
}

type Outcome = { ok: true; state: StudioState; result: unknown } | { ok: false; code: string };
const outcome = (fn: () => { state: StudioState; result: unknown }): Outcome => { try { const r = fn(); return { ok: true, state: r.state, result: r.result }; } catch (e) { if (isScopeMiss(e)) throw e; return { ok: false, code: e instanceof StudioError ? e.code : `THROWN ${(e as Error).message}` }; } };

/** The engine's scoped run, in memory: classify, load the scope's part, expand it from what was loaded, run, and on a
 *  ScopeMiss widen and run again. */
function scopedRun(full: StudioState, cmd: Command): { out: Outcome; misses: string[]; scope: Scope; merged?: StudioState } {
  let sc = batchScope([cmd]);
  const misses: string[] = [];
  for (;;) {
    const first = restrictState(full, sc);
    const expanded = expandScope(sc, first.loaded.productions === null ? [] : first.state.productions, (takeIds) => full.characters.filter((x) => x.usage?.videos.some((v) => takeIds.includes(v.takeId))).map((x) => x.id));
    const { state, loaded } = restrictState(full, expanded);
    try {
      const out = outcome(() => runCommand(state, cmd));
      return { out, misses, scope: expanded, merged: out.ok ? mergeScoped(full, out.state, loaded) : undefined };
    } catch (e) {
      if (!isScopeMiss(e) || misses.length > 8) throw e;
      misses.push(`${cmd.name}: ${e.collection}`);
      sc = widen(sc, e.collection);
    }
  }
}

describe('command scopes (step 13a)', () => {
  it('every command has a classification', () => {
    expect(Object.keys(COMMAND_SCOPES).sort()).toEqual(Object.keys(COMMANDS).sort());
  });

  it('the corpus runs every command', () => {
    const names = new Set(corpus().map((x) => x.name));
    expect([...Object.keys(COMMANDS)].filter((k) => !names.has(k as CommandName))).toEqual([]);
  });

  it('running a command on its scope and merging the result back equals running it on the whole studio — for every command of the corpus, with no scope misses', () => {
    let full = seed();
    const misses: string[] = []; let accepted = 0; let refused = 0; let scoped = 0;
    for (const cmd of corpus()) {
      const ref = outcome(() => runCommand(full, cmd));
      const s = scopedRun(full, cmd);
      misses.push(...s.misses);
      if (!s.scope.full) scoped++;
      if (!ref.ok) {
        refused++; if (process.env.SCOPE_DEBUG) console.log('REFUSED', cmd.name, ref.code, JSON.stringify(cmd.args).slice(0, 100));
        // a refusal on the scope is confirmed on the whole studio by the engine; a scoped SUCCESS where the whole studio
        // refuses would be a wrong classification
        expect(s.out.ok, `${cmd.name} ${JSON.stringify(cmd.args).slice(0, 120)}: refused on the whole studio (${ref.code}) but accepted on its scope`).toBe(false);
        continue;
      }
      accepted++;
      expect(s.out.ok, `${cmd.name} ${JSON.stringify(cmd.args).slice(0, 120)}: accepted on the whole studio, refused on its scope (${!s.out.ok && s.out.code})`).toBe(true);
      expect(hashState(s.merged), `${cmd.name} ${JSON.stringify(cmd.args).slice(0, 120)}: merged scoped result differs`).toBe(hashState(ref.state));
      expect(canonical(s.out.ok ? s.out.result : null)).toBe(canonical(ref.result));
      full = ref.state;
    }
    expect(misses).toEqual([]);
    // the corpus is meaningful: most commands are accepted, and most run on a scope (not the whole studio)
    expect(accepted).toBeGreaterThan(80);
    expect(refused).toBeGreaterThan(10);
    expect(scoped).toBeGreaterThan(90);
  });

  it('a reducer that touches a collection its scope did not load is caught (ScopeMiss) and run again wider', () => {
    const full = seed();
    // pretend addTake's scope forgot the characters: its usage records need them
    const cmd = c('addTake', 's1e2', 's1e2-3', { assetId: 'take-01', provider: 'UPLOAD' });
    const narrow = { ...batchScope([cmd]), characters: null, charactersOfShots: [] } as Scope;
    const { state } = restrictState(full, narrow);
    let miss: unknown;
    try { runCommand(state, cmd); } catch (e) { miss = e; }
    expect(isScopeMiss(miss) && miss.collection).toBe('characters');
    expect(() => poisoned('assets', []).length).toThrow(/scope miss: assets/);
  });

  it('the scope of a production edit is that production alone: nothing else is loaded or locked', () => {
    const sc = batchScope([c('updateShot', 's1e1', 's1e1-2', { action: 'x' })]);
    expect(sc.full).toBe(false);
    expect([...(sc.productions as Set<string>)]).toEqual(['s1e1']);
    expect([sc.characters, sc.assets, sc.shows, sc.locations, sc.settings]).toEqual([null, null, false, false, false]);
    expect([...sc.locks]).toEqual(['studio:production:s1e1']);
    // a batch is the union; a cascading command makes it the whole studio
    const both = batchScope([c('updateShot', 's1e1', 's1e1-2', {}), c('updateCharacter', 'nour', {})]);
    expect([...both.locks].sort()).toEqual(['studio:character:nour', 'studio:production:s1e1']);
    expect(batchScope([c('updateShot', 's1e1', 's1e1-2', {}), c('deleteAsset', 'x')]).full).toBe(true);
  });
});

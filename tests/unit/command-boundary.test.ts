import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ARG_SCHEMAS, CLIENT_COMMANDS, COMMANDS, SYSTEM_COMMANDS, isClientCommand, isSystemCommand, runCommand, validateClientCommand, type Command, type CommandName } from '@/domain/commands';
import { seed as sampleState } from '@/domain/sample';
import { sampleProposal } from '@/domain/proposals';

/** THE COMMAND BOUNDARY (docs/BACKEND-AUDIT-2026-10.md H1, step 2): pages send client commands only, each validated
 *  by its schema; the worker's results (system commands) are never accepted from a page. */

const wire = (args: unknown[]) => JSON.parse(JSON.stringify(args)) as unknown[];
const ok = (name: CommandName, ...args: unknown[]) => expect(() => validateClientCommand(name, wire(args)), `${name} ${JSON.stringify(args).slice(0, 200)}`).not.toThrow();
const bad = (name: CommandName, args: unknown[], field?: RegExp) => {
  let err: unknown;
  try { validateClientCommand(name, wire(args)); } catch (e) { err = e; }
  expect(err, `${name} should be refused`).toMatchObject({ code: 'INVALID' });
  if (field) expect((err as Error).message).toMatch(field);
};

describe('every command is classified', () => {
  it('client and system commands partition the command set; every client command has a schema', () => {
    const all = Object.keys(COMMANDS).sort();
    expect([...CLIENT_COMMANDS, ...SYSTEM_COMMANDS].sort()).toEqual(all);
    for (const n of SYSTEM_COMMANDS) expect(CLIENT_COMMANDS).not.toContain(n);
    expect(Object.keys(CLIENT_ARG_SCHEMAS).sort()).toEqual([...CLIENT_COMMANDS].sort());
  });

  it('the worker-only results are system commands', () => {
    for (const n of ['addAsset', 'updateAsset', 'setCut', 'recordExport', 'setVoiceIdentity', 'setCanonicalImage', 'addVoiceDesign', 'replaceScript', 'replaceSceneShots', 'setDialogueAudio', 'setShotFrames'] as CommandName[]) {
      expect(isSystemCommand(n), n).toBe(true);
      expect(isClientCommand(n), n).toBe(false);
    }
    expect(isClientCommand('explode')).toBe(false);
  });
});

describe('every command the current frontend sends is browser-allowed', () => {
  // the pages and the store: src/components, src/app (not its API routes), src/studio, src/lib
  const roots = ['src/components', 'src/app', 'src/studio', 'src/lib'].map((r) => path.resolve(r));
  const files: string[] = [];
  const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (p.includes(`${path.sep}app${path.sep}api`)) continue; walk(p); } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p); } };
  roots.forEach(walk);
  const names = Object.keys(COMMANDS) as CommandName[];
  const sent = new Map<CommandName, string[]>();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const n of names) if (new RegExp(`['"\`]${n}['"\`]`).test(src)) sent.set(n, [...(sent.get(n) ?? []), path.relative(process.cwd(), f)]);
  }

  it('finds the commands the pages post (sanity)', () => {
    for (const n of ['addTake', 'updateSettings', 'deleteAsset', 'acceptProposal', 'updateShot', 'approveCanonicalImage'] as CommandName[]) expect(sent.has(n), n).toBe(true);
  });

  it('each of them is a client command', () => {
    const refused = [...sent.entries()].filter(([n]) => !isClientCommand(n)).map(([n, where]) => `${n} (${where.join(', ')})`);
    expect(refused).toEqual([]);
  });
});

describe('the shapes the pages send pass their schemas', () => {
  const s = sampleState();
  const p = s.productions.find((x) => x.shots.length > 0 && x.shots.some((sh) => sh.takes.length))!;
  const shot = p.shots.find((sh) => sh.takes.length)!;
  const take = shot.takes[0];
  const show = s.shows[0];
  const c = s.characters[0];
  const loc = s.locations[0];

  it('shows, seasons, productions (CreateWizard, ShowWorkspace, OverviewTab, StoryTab, FilmWorkspace, PerformersTab)', () => {
    const brief = { mode: 'MANUAL', text: 'A brief' };
    const common = { title: 'T', titleAr: undefined, logline: 'L', style: 'ANIME', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 60, brief, castIds: [c.id], locationIds: [loc.id] };
    ok('addShow', { ...common, logline: 'L', genre: 'Drama', castIds: [c.id], locationIds: [loc.id] });
    ok('addProduction', { ...common, kind: 'SHORT', showId: undefined, seasonId: undefined, song: undefined });
    ok('updateProduction', p.id, { genre: 'Drama', concept: 'PERFORMANCE', artist: 'Layla' });
    ok('updateProduction', p.id, { title: 'X', titleAr: undefined, logline: 'l', style: 'ANIME', language: 'EN', dialect: undefined, aspect: 'WIDE_16_9', targetSeconds: 90, artist: undefined, genre: undefined });
    ok('updateProduction', p.id, { logline: 'l', synopsis: 's', brief: { ...p.brief, text: 'b' } });
    ok('updateProduction', p.id, { castIds: [c.id] });
    ok('updateShow', show.id, { title: 'S', titleAr: undefined, logline: 'l', synopsis: '', genre: 'g', style: 'CARTOON', language: 'EN', dialect: undefined, aspect: 'WIDE_16_9' });
    ok('updateShow', show.id, { bible: { worldRules: ['a'], relationships: [], timeline: [], unresolved: [], styleNotes: undefined } });
    ok('updateShow', show.id, { castIds: [c.id], locationIds: [] });
    ok('addSeason', show.id, 'Season 2', 'arc');
    ok('updateSeason', s.seasons[0].id, { title: 'S2', arc: 'a' });
    ok('deleteShow', show.id); ok('deleteSeason', s.seasons[0].id); ok('deleteProduction', p.id); ok('duplicateProduction', p.id);
    ok('markStepDone', p.id, 'STORY'); ok('setStage', p.id, 'PRODUCE');
  });

  it('scenes, shots and takes (StoryTab, StoryboardTab, ShotEditor, ProduceTab)', () => {
    const sc = p.scenes[0];
    ok('addScene', p.id, { title: 'Scene', locationId: undefined, timeOfDay: 'NIGHT' });
    ok('updateScene', p.id, sc.id, { beats: [...sc.beats, { id: 'beat-x', action: '', lines: [] }] });
    ok('updateScene', p.id, sc.id, { locationId: undefined });
    ok('deleteScene', p.id, sc.id);
    ok('addShot', p.id, { sceneId: sc.id, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' });
    const draft = { sceneId: shot.sceneId, purpose: shot.purpose, action: shot.action, framing: shot.framing, cameraMove: shot.cameraMove, durationSeconds: shot.durationSeconds, characterIds: shot.characterIds, dialogue: shot.dialogue.map((d) => ({ ...d, audioAssetId: 'asset-line', durationSeconds: 2.5, voiceRevision: 1 })), transition: shot.transition, openingFrameAssetId: shot.openingFrameAssetId, endingFrameAssetId: shot.endingFrameAssetId, songWindow: shot.songWindow, notes: shot.notes };
    ok('updateShot', p.id, shot.id, draft);
    ok('deleteShot', p.id, shot.id); ok('duplicateShot', p.id, shot.id);
    ok('moveShot', p.id, shot.id, -1); ok('moveShot', p.id, shot.id, 1);
    ok('reorderShot', p.id, shot.id, null); ok('reorderShot', p.id, shot.id, p.shots[0].id);
    ok('setShotContinuity', p.id, shot.id, { characters: [{ characterId: c.id, wardrobe: 'coat' }], props: [], environment: { timeOfDay: 'NIGHT' }, camera: { framing: 'WIDE' } });
    ok('selectTake', p.id, shot.id, take.id); ok('selectTake', p.id, shot.id, undefined);
    ok('noteTake', p.id, shot.id, take.id, 'a note'); ok('rejectTake', p.id, shot.id, take.id, 'soft'); ok('removeTake', p.id, shot.id, take.id);
    ok('rateTake', p.id, shot.id, take.id, 'GOOD', { reason: 'nice' });
    ok('addTake', p.id, shot.id, { assetId: 'up-1', provider: 'UPLOAD', label: 'clip', width: 1280, height: 720, durationSeconds: 5, fps: 24 });
  });

  it('songs (ReplaceSong, SongLyricsTab, PerformersTab)', () => {
    const song = { id: 'song-1', title: 'T', source: 'GENERATED_EXAMPLE', durationSeconds: 60, caption: '', sections: [{ id: 'sec-1', kind: 'VERSE', text: '', singerIds: [c.id], from: 0, to: 16 }], singerIds: [c.id] };
    ok('setSong', p.id, song); ok('setSong', p.id, { ...song, source: 'UPLOADED', assetId: 'up-2' });
    ok('updateSong', p.id, { sections: song.sections }); ok('updateSong', p.id, { singerIds: [c.id] });
  });

  it('characters, voices and the canonical image (CharacterForm, ImagePanel, VoiceSection, ConsentChoice)', () => {
    ok('addCharacter', { name: 'Noor', role: 'lead', style: 'ANIME', sex: 'FEMALE', ageYears: 30, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [], language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    ok('updateCharacter', c.id, { notes: 'n' });
    ok('setPendingReference', c.id, 'up-3', { ok: true, width: 1024, height: 1024, reasons: [] }); ok('setPendingReference', c.id, undefined);
    ok('selectVoiceSample', c.id, 'voice-1'); ok('confirmVoiceConsent', c.id, 'voice-1', 'MY_VOICE');
    ok('recordVoiceListening', c.id, { natural: 4, dialectAuthentic: true }); ok('approveCanonicalImage', c.id, 2, { override: true, reason: 'fine' }); ok('approveCanonicalImage', c.id, 1, {});
    ok('addVoiceRecording', c.id, 'up-4', 'take one', { consent: { statement: 'MY_VOICE', by: 'PRODUCER', at: new Date().toISOString() } });
    ok('removeVoiceSample', c.id, 'voice-1'); ok('deleteCharacter', c.id);
  });

  it('locations, assets, settings, Auto Idea (LocationForm, LocationPage, store, Settings, CommandPalette, CreateWizard)', () => {
    ok('addLocation', { name: 'Souq', nameAr: undefined, kind: 'EXTERIOR', style: 'ANIME', description: 'd', landmarks: ['gate'], props: [], lighting: ['MORNING', 'NIGHT'] });
    ok('updateLocation', loc.id, { lighting: ['DUSK'] });
    ok('updateLocation', loc.id, { refs: [...loc.refs, { id: 'ref-up-5', role: 'VIEW', assetId: 'up-5', label: 'View' }], masterAssetId: loc.masterAssetId ?? 'up-5' });
    ok('updateLocation', loc.id, { props: ['cup'] }); ok('deleteLocation', loc.id);
    ok('deleteAsset', 'up-5'); ok('setAssetTier', 'up-5', 'SECONDARY'); ok('setAssetTier', 'up-5', null);
    ok('updateSettings', { reducedMotion: true }); ok('updateSettings', { generation: { llmProvider: undefined } }); ok('updateSettings', { defaults: { style: 'ANIME' }, research: { enabled: true, platforms: { YOUTUBE: false } } });
    const proposal = sampleProposal(s, { kind: 'SHORT', preferences: {} });
    ok('acceptProposal', { kind: 'SHORT', showId: undefined, seasonId: undefined, aspect: 'WIDE_16_9', proposal, keepCast: proposal.cast.map((x) => x.key), keepLocations: proposal.locations.map((x) => x.key), preferences: {}, proposalJobId: undefined });
  });

  it('a validated command still runs as the browser ran it (the boundary changes no reducer)', () => {
    const cmd = { name: 'updateProduction', args: wire([p.id, { genre: 'Noir' }]), seed: 'seed-1', at: new Date().toISOString() } as Command;
    validateClientCommand(cmd.name, cmd.args);
    expect(runCommand(s, cmd).state.productions.find((x) => x.id === p.id)?.genre).toBe('Noir');
  });
});

describe('what a page may not send', () => {
  const now = new Date().toISOString();
  it('a generated take: only the producer\'s upload is a client take', () => {
    bad('addTake', ['p', 's', { assetId: 'a', provider: 'MINIMAX', model: 'H3' }], /provider/);
    bad('addTake', ['p', 's', { assetId: 'a', provider: 'UPLOAD', qa: { ok: true, checks: [] } }], /qa|Unrecognized/i);
    bad('addTake', ['p', 's', { assetId: 'a' }], /provider/);
  });
  it('worker results inside a patch: the cut, exports, the frame poster, takes and the chosen take', () => {
    bad('updateProduction', ['p', { cutAssetId: 'asset-x' }], /cutAssetId/);
    bad('updateProduction', ['p', { exports: [{ id: 'e', assetId: 'a', format: 'mp4', resolution: '1080', subtitles: 'none', createdAt: now }] }], /exports/);
    bad('updateProduction', ['p', { shots: [] }], /shots/);
    bad('updateProduction', ['p', { framePosterAssetId: 'a' }], /framePosterAssetId/);
    bad('updateShot', ['p', 's', { takes: [] }], /takes/);
    bad('updateShot', ['p', 's', { selectedTakeId: 't' }], /selectedTakeId/);
    bad('addShot', ['p', { sceneId: 'sc', selectedTakeId: 't' }], /selectedTakeId/);
    bad('updateShow', ['sh', { id: 'other' }], /id/);
    bad('updateSeason', ['se', { showId: 'other' }]);
  });
  it('wrong arity, wrong types, wrong vocabulary', () => {
    bad('deleteShow', [], /arguments/);
    bad('deleteShow', ['a', 'b'], /at most/);
    bad('moveShot', ['p', 's', 2]);
    bad('markStepDone', ['p', 'DONE']);
    bad('updateSettings', [{ reducedMotion: 'yes' }], /reducedMotion/);
    bad('addLocation', [{ name: '', kind: 'INTERIOR', style: 'ANIME' }], /name/);
    bad('selectTake', ['p', 's', 42]);
  });
  it('a system command is refused by validateClientCommand unless the rollback allows it', () => {
    bad('setCut', ['p', 'asset-x'], /workers/);
    expect(() => validateClientCommand('setCut', ['p', 'asset-x'], { allowSystem: true })).not.toThrow();
  });
});

// ------------------------------------------------------------------------------------------- the HTTP route

const applied = vi.hoisted(() => ({ batches: [] as unknown[] }));
vi.mock('@/server/studio/engine', () => ({ applyCommands: async (cmds: unknown[]) => { applied.batches.push(cmds); return { ok: true, version: 2, hash: 'h', results: [] }; } }));
import { POST } from '@/app/api/commands/route';

const post = (commands: Array<{ name: string; args: unknown[] }>) => POST(new Request('http://studio.test/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'unit', commands: commands.map((c, i) => ({ ...c, seed: `seed-${i}-unit`, at: new Date().toISOString() })) }) }), undefined);

describe('POST /api/commands', () => {
  beforeEach(() => { applied.batches = []; vi.unstubAllEnvs(); });

  it('refuses a system command with 403 FORBIDDEN and applies nothing of the batch', async () => {
    for (const name of ['addAsset', 'setCut', 'recordExport', 'setVoiceIdentity', 'setCanonicalImage']) {
      const res = await post([{ name: 'updateSettings', args: [{ reducedMotion: true }] }, { name, args: ['x', {}] }]);
      expect(res.status, name).toBe(403);
      expect(((await res.json()) as { error: { code: string; details: { failedAt: number } } }).error).toMatchObject({ code: 'FORBIDDEN', details: { failedAt: 1 } });
    }
    expect(applied.batches).toEqual([]);
  });

  it('applies valid client commands, and answers 400 with the field named for malformed ones', async () => {
    expect((await post([{ name: 'updateSettings', args: [{ reducedMotion: true }] }])).status).toBe(200);
    expect(applied.batches).toHaveLength(1);
    const res = await post([{ name: 'updateProduction', args: ['p', { cutAssetId: 'forged' }] }]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string; details: { failedAt: number } } }).error).toMatchObject({ message: expect.stringMatching(/cutAssetId/), details: { failedAt: 0 } });
    expect(applied.batches).toHaveLength(1);
  });

  it('the one-release rollback (STUDIO_LEGACY_COMMANDS=1) accepts system commands again', async () => {
    vi.stubEnv('STUDIO_LEGACY_COMMANDS', '1');
    expect((await post([{ name: 'setCut', args: ['p', 'asset-x'] }])).status).toBe(200);
    expect(applied.batches).toHaveLength(1);
  });
});

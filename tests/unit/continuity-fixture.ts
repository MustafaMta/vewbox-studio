import { seed } from '@/domain/sample';
import type { Asset, Character, ContinuityState, Location, Production, Shot, StudioState, Take } from '@/domain/types';

/** A small production for the continuity tests: one scene at a pharmacy at dusk (a MASTER and a DUSK plate), a second
 *  scene elsewhere, two characters with canonical images. Shot 1.1 has a chosen generated take; 1.2 continues it and
 *  speaks one recorded line; 1.3 is a cut; 2.1 opens the next scene. Built on the sample studio's characters. */

const now = '2026-10-03T00:00:00.000Z';
const img = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', mimeType: 'image/png', width: 1024, height: 1024, provenance: { path: `img/${id}.png` }, createdAt: now, ...extra });
const vid = (id: string): Asset => ({ id, kind: 'VIDEO', src: `/api/media/${id}`, label: id, tags: ['take'], sample: false, origin: 'GENERATED', mimeType: 'video/mp4', durationSeconds: 5.17, provenance: { path: `vid/${id}.mp4`, probe: { hasAudio: true } }, createdAt: now });
const aud = (id: string): Asset => ({ id, kind: 'AUDIO', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', mimeType: 'audio/wav', durationSeconds: 1.8, provenance: { path: `aud/${id}.wav` }, createdAt: now });
const continuity = (relation: ContinuityState['relationToPrevious'], characterIds: string[]): ContinuityState => ({ version: 1, characters: characterIds.map((characterId) => ({ characterId, position: 'behind the counter', screenDirection: 'TOWARD' })), props: [], environment: { timeOfDay: 'DUSK', lighting: 'cool fluorescent light' }, camera: {}, relationToPrevious: relation });

export const TAKE_A: Take = { id: 'take-a', label: 'Take 1', assetId: 'vid-a', createdAt: now, status: 'READY', provider: 'MINIMAX', qa: { ok: true, checks: [{ name: 'decodable', ok: true }] }, durationSeconds: 5.17 };

export function fixture(over: { shots?: (shots: Shot[]) => Shot[]; characters?: (cs: Character[]) => Character[] } = {}): { state: StudioState; p: Production } {
  const base = seed();
  const [a, b] = base.characters.slice(0, 2);
  const characters = base.characters.map((c) => (c.id === a.id ? { ...c, canonicalImage: { assetId: 'canon-a', status: 'APPROVED' as const, version: 2, generatedAt: now, approvedAt: now }, voice: { ...c.voice, samples: c.voice.samples.slice(0, 1).map((s) => ({ ...s, assetId: 'voice-a' })) } } : c.id === b.id ? { ...c, canonicalImage: { assetId: 'canon-b', status: 'DRAFT' as const, version: 1, generatedAt: now } } : c));
  const pharmacy: Location = { id: 'loc-pharmacy', name: 'Corner Pharmacy', kind: 'INTERIOR', description: 'a small pharmacy with a white counter and wooden shelves', style: base.locations[0].style, lighting: ['DUSK'], landmarks: ['a green cross sign'], props: ['a cash register'], refs: [{ id: 'r1', role: 'MASTER', assetId: 'plate-master', label: 'Master plate', timeOfDay: 'MORNING' }, { id: 'r2', role: 'STATE', assetId: 'plate-dusk', label: 'dusk', timeOfDay: 'DUSK' }], masterAssetId: 'plate-master', createdAt: now, updatedAt: now };
  const street: Location = { ...pharmacy, id: 'loc-street', name: 'Street', kind: 'EXTERIOR', refs: [{ id: 'r3', role: 'MASTER', assetId: 'plate-street', label: 'Master plate' }], masterAssetId: 'plate-street' };
  const shot = (id: string, sceneId: string, number: number, extra: Partial<Shot>): Shot => ({ id, sceneId, number, purpose: 'p', action: 'She sets a box on the counter', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [a.id], dialogue: [], transition: 'CUT', takes: [], ...extra });
  let shots: Shot[] = [
    shot('s11', 'sc1', 1, { characterIds: [a.id, b.id], takes: [TAKE_A], selectedTakeId: 'take-a', openingFrameAssetId: 'open-11', continuity: continuity('STORY_TRANSITION', [a.id, b.id]) }),
    shot('s12', 'sc1', 2, { characterIds: [a.id, b.id], openingFrameAssetId: 'open-12', dialogue: [{ id: 'l1', characterId: a.id, text: 'We close in ten minutes.', audioAssetId: 'line-1', durationSeconds: 1.8 }], continuity: continuity('CONTINUATION', [a.id, b.id]) }),
    shot('s13', 'sc1', 3, { openingFrameAssetId: 'open-13', endingFrameAssetId: 'end-13', continuity: continuity('CUT', [a.id]) }),
    shot('s21', 'sc2', 1, { openingFrameAssetId: 'open-21', continuity: continuity('CONTINUATION', [a.id]) }),
  ];
  if (over.shots) shots = over.shots(shots);
  const p: Production = { ...base.productions.find((x) => x.kind !== 'MUSIC_VIDEO')!, id: 'prod-cont', kind: 'SHORT', showId: undefined, seasonId: undefined, language: 'EN', aspect: 'WIDE_16_9', castIds: [a.id, b.id], locationIds: [pharmacy.id, street.id], scenes: [{ id: 'sc1', number: 1, title: 'Closing', locationId: pharmacy.id, timeOfDay: 'DUSK', characterIds: [a.id, b.id], beats: [] }, { id: 'sc2', number: 2, title: 'Outside', locationId: street.id, timeOfDay: 'NIGHT', characterIds: [a.id], beats: [] }], shots, song: undefined, cutAssetId: undefined };
  const assets = [...base.assets, img('canon-a', { tier: 'CANONICAL' }), img('canon-b', { tier: 'CANONICAL' }), img('plate-master'), img('plate-dusk'), img('plate-street'), img('open-11'), img('open-12'), img('open-13'), img('end-13'), img('open-21'), vid('vid-a'), aud('line-1'), aud('voice-a')];
  const state: StudioState = { ...base, characters: over.characters ? over.characters(characters) : characters, locations: [...base.locations, pharmacy, street], productions: [...base.productions, p], assets };
  return { state, p };
}

export const shotOf = (p: Production, id: string) => p.shots.find((s) => s.id === id)!;

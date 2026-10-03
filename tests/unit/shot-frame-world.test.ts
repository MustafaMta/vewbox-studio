import { describe, expect, it, vi } from 'vitest';
import type { Asset, StudioState, WorldBible } from '@/domain/types';

/** STORYBOARD FRAMES read the World Bible like takes do (src/worker/handlers/images.ts frameReferences): the place is
 *  the plate `choosePlate` picks from the production's revision laid over the studio (an established frame at the
 *  scene's time of day, else the drawn plate for that time, an established frame of another time, the master), and
 *  each character is its pinned canonical image. Without a bible read, the location's own plate for the time of day. */

vi.mock('@/server/studio/engine', () => ({ readState: async () => { throw new Error('unused'); }, command: async () => { throw new Error('unused'); } }));
vi.mock('@/server/providers/comfy', () => ({}));
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {} }));
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h' }));
vi.mock('@/server/world', () => ({ worldOfProduction: async () => { throw new Error('unused'); } }));

import { deriveWorld, overlayWorld, withEstablished, worldScopeOf } from '@/domain/world';
import { frameReferences, peopleExpected } from '@/worker/handlers/images';
import { fixture, shotOf } from './continuity-fixture';

const NOW = '2026-10-03T00:00:00.000Z';
const img = (id: string): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'DERIVED', mimeType: 'image/png', provenance: { path: `img/${id}.png` }, createdAt: NOW });
const established = (bible: WorldBible, assetId: string, timeOfDay: 'DUSK' | 'MORNING') => withEstablished(bible, [{ candidate: { locationId: 'loc-pharmacy', sceneId: 'sc1', shotId: 's11', takeId: `take-${assetId}`, videoAssetId: 'vid-a', frame: 6, timeOfDay, framing: 'WIDE' }, imageAssetId: assetId, productionId: 'prod-cont', label: `established ${assetId}`, approvalId: 'appr-1', approvedAt: NOW }], NOW);
const read = (state: StudioState, bible: WorldBible, shotId: string) => {
  const { p } = fixture();
  return overlayWorld(state, bible, p, shotOf(p, shotId), { id: 'rev-1', number: 1, pinned: true });
};

describe('storyboard frames read the World Bible', () => {
  it('without a bible read: the location’s own plate for the scene’s time of day', () => {
    const { state, p } = fixture();
    const r = frameReferences(state, p, shotOf(p, 's13'));
    expect(r.plate).toMatchObject({ assetId: 'plate-dusk', why: expect.stringMatching(/no World Bible read/) });
    expect(r.refs[0].id).toBe('plate-dusk');
  });
  it('from the bible: the drawn plate for the time of day; an established frame at that time comes first; one of another time does not beat the drawn plate', () => {
    const { state, p } = fixture();
    const bible = deriveWorld(state, worldScopeOf(p), undefined, NOW);
    let w = read(state, bible, 's13');
    expect(frameReferences(w.state, p, shotOf(p, 's13'), w.read).plate).toMatchObject({ assetId: 'plate-dusk', why: expect.stringMatching(/drawn plate/) });
    // an approved take of this place at dusk established a frame: the frame is drawn against what the audience saw
    const withDusk: StudioState = { ...state, assets: [...state.assets, img('est-dusk'), img('est-morning')] };
    w = read(withDusk, established(bible, 'est-dusk', 'DUSK'), 's13');
    const r = frameReferences(w.state, p, shotOf(p, 's13'), w.read);
    expect(r.plate).toMatchObject({ assetId: 'est-dusk', why: expect.stringMatching(/established frame/) });
    expect(r.refs[0].id).toBe('est-dusk');
    // established only in the morning: the drawn dusk plate still wins for a dusk scene
    w = read(withDusk, established(bible, 'est-morning', 'MORNING'), 's13');
    expect(frameReferences(w.state, p, shotOf(p, 's13'), w.read).plate?.assetId).toBe('plate-dusk');
  });
  it('D29/D30: a two-shot names how many people it holds and keeps the cast order as the screen order', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    const withImages: StudioState = { ...state, assets: [...state.assets, { ...img('canon-a'), tier: 'CANONICAL' }, { ...img('canon-b'), tier: 'CANONICAL' }] };
    const forward = frameReferences(withImages, p, { ...shotOf(p, 's11'), characterIds: [a!, b!] });
    const reversed = frameReferences(withImages, p, { ...shotOf(p, 's11'), characterIds: [b!, a!] });
    expect(reversed.refs.map((x) => x.id)).toEqual(forward.refs.map((x) => x.id)); // the same way round in every shot
    expect(forward.notes.at(-1)).toBe('exactly two people are in the picture: the person of image 2 on the left and the person of image 3 on the right, and nobody else');
    const alone = frameReferences(withImages, p, { ...shotOf(p, 's11'), characterIds: [a!] });
    expect(alone.notes.join(' ')).toContain('exactly one person is in the picture, the person of image 2, and nobody else');
  });
  it('D30: a frame is counted against the shot’s people unless its action brings in others', () => {
    expect(peopleExpected({ action: 'Najm steps into frame and gestures toward the photo.' }, ['a', 'b'])).toBe(2);
    expect(peopleExpected({ action: 'Elias squints at the radio.' }, ['a'])).toBe(1);
    expect(peopleExpected({ action: 'The market fills with customers as she sets up.' }, ['a'])).toBeUndefined();
    expect(peopleExpected({ action: 'An empty workshop at night.' }, [])).toBeUndefined();
  });
  it('each character is its pinned canonical image (a redraw after the pin does not reach the frame)', () => {
    const { state, p } = fixture();
    const a = p.castIds[0];
    const bible = deriveWorld(state, worldScopeOf(p), undefined, NOW); // pinned with canon-a v2
    const redrawn: StudioState = { ...state, assets: [...state.assets, { ...img('canon-a3'), tier: 'CANONICAL' }], characters: state.characters.map((c) => (c.id === a ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: 'canon-a3', version: 3, status: 'DRAFT' as const } } : c)) };
    const w = read(redrawn, bible, 's13');
    const r = frameReferences(w.state, p, shotOf(p, 's13'), w.read);
    expect(r.refs.map((x) => x.id)).toEqual(['plate-dusk', 'canon-a']);
    expect(w.read.conflicts.join(' ')).toMatch(/pinned to v2/);
    // without the bible the current (unpinned) image would have been used
    expect(frameReferences(redrawn, p, shotOf(p, 's13')).refs.map((x) => x.id)).toEqual(['plate-dusk', 'canon-a3']);
  });
});

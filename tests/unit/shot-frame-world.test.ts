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
import { frameReferences } from '@/worker/handlers/images';
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

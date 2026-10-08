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
const established = (bible: WorldBible, assetId: string, timeOfDay: 'DUSK' | 'MORNING') => withEstablished(bible, [{ candidate: { locationId: 'loc-pharmacy', sceneId: 'sc1', shotId: 's13', takeId: `take-${assetId}`, videoAssetId: 'vid-a', frame: 6, timeOfDay, framing: 'WIDE' }, imageAssetId: assetId, productionId: 'prod-cont', label: `established ${assetId}`, approvalId: 'appr-1', approvedAt: NOW }], NOW);
const read = (state: StudioState, bible: WorldBible, shotId: string) => {
  const { p } = fixture();
  return overlayWorld(state, bible, p, shotOf(p, shotId), { id: 'rev-1', number: 1, pinned: true });
};

describe('storyboard frames read the World Bible', () => {
  it('without a bible read: the location’s own plate for the scene’s time of day', () => {
    const { state, p } = fixture();
    const r = frameReferences(state, p, shotOf(p, 's13'));
    expect(r.plate).toMatchObject({ assetId: 'plate-dusk', why: expect.stringMatching(/no World Bible read/) });
    // a MEDIUM shot is composed from its person: the plate is the last picture, cut to the shot's distance
    expect(r.composition).toBe('PEOPLE');
    expect(r.refs.at(-1)!.id).toBe('plate-dusk');
    // a WIDE shot keeps the whole plate as image 1
    const wide = frameReferences(state, p, { ...shotOf(p, 's13'), framing: 'WIDE' });
    expect(wide.composition).toBe('PLATE');
    expect(wide.refs[0].id).toBe('plate-dusk');
    expect(wide.crops.every((c) => c === undefined)).toBe(true);
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
    expect(r.refs.at(-1)!.id).toBe('est-dusk');
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
    expect(forward.notes.at(-1)).toBe('exactly two people are in the picture: the person of image 1 on the left and the person of image 2 on the right, and nobody else');
    const alone = frameReferences(withImages, p, { ...shotOf(p, 's11'), characterIds: [a!] });
    expect(alone.notes.join(' ')).toContain('exactly one person is in the picture, the person of image 1, and nobody else');
    const wideTwo = frameReferences(withImages, p, { ...shotOf(p, 's11'), characterIds: [a!, b!], framing: 'WIDE' });
    expect(wideTwo.notes.at(-1)).toBe('exactly two people are in the picture: the person of image 2 on the left and the person of image 3 on the right, and nobody else');
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
    expect(r.refs.map((x) => x.id)).toEqual(['canon-a', 'plate-dusk']);
    expect(w.read.conflicts.join(' ')).toMatch(/pinned to v2/);
    // without the bible the current (unpinned) image would have been used
    expect(frameReferences(redrawn, p, shotOf(p, 's13')).refs.map((x) => x.id)).toEqual(['canon-a3', 'plate-dusk']);
  });
it('Tea 1.3: a close shot is composed from its person — the canonical image first, cut to the framing, the plate last, cut to the shot’s distance', () => {
    const { state, p } = fixture();
    const a = p.castIds[0]!;
    const sized: StudioState = { ...state, assets: state.assets.map((x) => (x.id === 'plate-dusk' ? { ...x, width: 1344, height: 768 } : x.id === 'canon-a' ? { ...x, width: 928, height: 1664 } : x)) };
    const r = frameReferences(sized, p, { ...shotOf(p, 's13'), characterIds: [a], framing: 'MEDIUM_CLOSE_UP' });
    expect(r.composition).toBe('PEOPLE');
    expect(r.refs.map((x) => x.id)).toEqual(['canon-a', 'plate-dusk']);
    expect(r.crops[0]).toEqual({ x: 0, y: 0, width: 928, height: Math.round(1664 * 0.45) });
    expect(r.crops[1]).toMatchObject({ width: Math.round(1344 * 0.5), height: Math.round(768 * 0.5) });
    expect(r.notes[0]).toMatch(/^image 1 is the person .*framed as this shot frames them/);
    expect(r.notes[1]).toMatch(/^image 2 is the place right behind them .*not its framing/);
    expect(r.notes.at(-1)).toBe('exactly one person is in the picture, the person of image 1, and nobody else');
    // a close shot without a pictured person keeps the plate first (nothing to compose from)
    const empty = frameReferences(sized, p, { ...shotOf(p, 's13'), characterIds: [], framing: 'CLOSE_UP' });
    expect(empty.composition).toBe('PLATE');
  });
});

describe('continuity recovery 2026-10-08: the previous shot’s actual end and the insert as a detail', () => {
  const sized = () => {
    const { state, p } = fixture();
    const s: StudioState = { ...state, assets: [...state.assets.map((x) => (x.id === 'plate-dusk' ? { ...x, width: 1344, height: 768 } : x.id === 'canon-a' ? { ...x, width: 928, height: 1664 } : x)), { ...img('canon-b'), tier: 'CANONICAL' as const }, img('end-prev')] };
    return { state: s, p, end: img('end-prev') };
  };
  it('a close shot of one person: the person, the previous end (the state as filmed), then the plate', () => {
    const { state, p, end } = sized();
    const r = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!], framing: 'MEDIUM_CLOSE_UP' }, undefined, end);
    expect(r.refs.map((x) => x.id)).toEqual(['canon-a', 'end-prev', 'plate-dusk']);
    expect(r.usedPreviousEnd).toBe(true);
    expect(r.notes[1]).toMatch(/^image 2 is the moment just before this shot.*wet or dry.*what each hand holds.*the faces come from the people’s own pictures/);
    expect(r.crops[1]).toBeUndefined();
  });
  it('a close two-shot keeps both people and the previous end; the plate gives way (three pictures at most)', () => {
    const { state, p, end } = sized();
    const r = frameReferences(state, p, { ...shotOf(p, 's11'), characterIds: [p.castIds[0]!, p.castIds[1]!], framing: 'MEDIUM' }, undefined, end);
    expect(r.refs.map((x) => x.id)).toEqual(['canon-a', 'canon-b', 'end-prev']);
    expect(r.plate).toBeUndefined();
  });
  it('a wide shot of one person: the plate, the person, the previous end in place of the face crop', () => {
    const { state, p, end } = sized();
    const r = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!], framing: 'WIDE' }, undefined, end);
    expect(r.refs.map((x) => x.id)).toEqual(['plate-dusk', 'canon-a', 'end-prev']);
  });
  it('without a previous end nothing changes', () => {
    const { state, p } = sized();
    const r = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!], framing: 'MEDIUM_CLOSE_UP' });
    expect(r.refs.map((x) => x.id)).toEqual(['canon-a', 'plate-dusk']);
    expect(r.usedPreviousEnd).toBe(false);
  });
  it('an insert is a DETAIL: from the previous end and the plate, never the full-figure portrait, and no face', () => {
    const { state, p, end } = sized();
    const r = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!], framing: 'INSERT' }, undefined, { ...end, width: 1344, height: 768 }, [p.castIds[0]!]);
    expect(r.composition).toBe('DETAIL');
    expect(r.refs.map((x) => x.id)).toEqual(['end-prev', 'plate-dusk']);
    // the previous end cut to its lower half (hands and what they hold): whole, a face close-up stayed one (1.6)
    expect(r.crops[0]).toEqual({ x: 0, y: 384, width: 1344, height: 384 });
    // a handover: the other person's clothes and hands join from their canonical image
    const both = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!, p.castIds[1]!], framing: 'INSERT' }, undefined, { ...end, width: 1344, height: 768 }, [p.castIds[0]!]);
    expect(both.refs.map((x) => x.id)).toEqual(['end-prev', 'canon-b', 'plate-dusk']);
    expect(r.notes.at(-1)).toBe('only the hand or object detail fills the picture: no face and no whole person');
    // without a previous end: the clothes and hands cut from the canonical image (chest to below the hips)
    const alone = frameReferences(state, p, { ...shotOf(p, 's13'), characterIds: [p.castIds[0]!], framing: 'INSERT' });
    expect(alone.refs.map((x) => x.id)).toEqual(['canon-a', 'plate-dusk']);
    expect(alone.crops[0]).toEqual({ x: 0, y: Math.round(1664 * 0.3), width: 928, height: Math.round(1664 * 0.42) });
    expect(alone.notes[0]).toMatch(/the face is not in this shot/);
  });
});

describe('the frame realises its framing (judgeFrameFraming)', () => {
  it('measures the largest face against the plan: two steps off is FAIL, one is REVIEW, no face is not measured', async () => {
    const { judgeFrameFraming } = await import('@/domain/frames');
    expect(judgeFrameFraming('MEDIUM_CLOSE_UP', 260, 768)).toMatchObject({ measured: 'MEDIUM_CLOSE_UP', verdict: 'PASS' });
    expect(judgeFrameFraming('CLOSE_UP', 140, 768)).toMatchObject({ measured: 'MEDIUM', verdict: 'FAIL' });
    expect(judgeFrameFraming('MEDIUM', 230, 768)).toMatchObject({ measured: 'MEDIUM_CLOSE_UP', verdict: 'REVIEW' });
    expect(judgeFrameFraming('CLOSE_UP', undefined, 768)).toMatchObject({ measured: 'NO_FACE', verdict: 'NOT_MEASURED' });
    expect(judgeFrameFraming('TWO_SHOT', 140, 768).verdict).toBe('PASS');
  });
  it('an insert with a whole face in it (2.1, 2.5: drawn as a medium shot of the man) is FAIL; a hand or no face passes', async () => {
    const { judgeFrameFraming } = await import('@/domain/frames');
    expect(judgeFrameFraming('INSERT', 140, 768)).toMatchObject({ verdict: 'FAIL', note: expect.stringMatching(/an insert shows a hand or an object/) });
    expect(judgeFrameFraming('INSERT', undefined, 768).verdict).toBe('PASS');
    expect(judgeFrameFraming('INSERT', 40, 768).verdict).toBe('PASS');
  });
  it('the preflight refuses a FAIL, warns on a REVIEW and on a frame drawn from another take of the previous shot', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/server/org/preflight.ts', 'utf8');
    expect(src).toMatch(/ff\.verdict === 'FAIL'\) add\(`\$\{which\}-frame-framing`, false/);
    expect(src).toMatch(/name: 'opening-frame-stale'/);
  });
});
describe('the previous end only when its people are all in this shot ("The Relief" 1.2)', () => {
  it('previousEndUsable: a person only in the previous end would be drawn into this frame', async () => {
    const { previousEndUsable } = await import('@/worker/handlers/images');
    expect(previousEndUsable({ characterIds: ['marcus'] }, { characterIds: ['elena'] })).toBe(false); // 1.1 → 1.2
    expect(previousEndUsable({ characterIds: ['elena'] }, { characterIds: ['marcus', 'elena'] })).toBe(true); // 1.2 → 1.3
    expect(previousEndUsable({ characterIds: ['marcus', 'elena'] }, { characterIds: ['elena'] })).toBe(false); // two-shot → her close-up
    expect(previousEndUsable({ characterIds: ['marcus'] }, { characterIds: ['marcus', 'elena'] })).toBe(true); // 1.5 → the insert
  });
});
describe('one person of several: the previous end cut to that person (personBand)', () => {
  it('maps faces left to right onto the screen order, only when every person shows one face', async () => {
    const { personBand } = await import('@/worker/handlers/images');
    const frame = { width: 1344, height: 768 };
    const faces: Array<[number, number, number, number]> = [[900, 200, 90, 110], [300, 210, 95, 115]];
    // screen order: index 0 is the left person (face at x 300), index 1 the right (x 900)
    expect(personBand(faces, 0, 2, frame)).toEqual({ x: 12, y: 0, width: 672, height: 768 });
    expect(personBand(faces, 1, 2, frame)).toEqual({ x: 609, y: 0, width: 672, height: 768 });
    expect(personBand([faces[0]], 0, 2, frame)).toBeUndefined(); // one face for two people: not told apart
    expect(personBand(faces, -1, 2, frame)).toBeUndefined();
  });
});
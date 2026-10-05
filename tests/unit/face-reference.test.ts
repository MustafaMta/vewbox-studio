import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Asset, Production, StudioState } from '@/domain/types';

/** THE DERIVED FACE REFERENCE (continuity gaps 2026-10-06, gap 8; research G13): the arithmetic of the node's reference
 *  scaling, the decision per shot, the pack and the prompt, and the worker's derivation on a real picture (ffmpeg). */

const fake = vi.hoisted(() => ({ commands: [] as Array<{ name: string; args: unknown[] }>, faces: undefined as unknown, events: [] as string[] }));
vi.mock('@/server/studio/engine', () => ({ commands: async (list: Array<{ name: string; args: unknown[] }>) => { fake.commands.push(...list); return list.map(() => ({})); } }));
vi.mock('@/server/providers/qa-service', async (orig) => ({ ...(await orig<typeof import('@/server/providers/qa-service')>()), detectFaces: async () => fake.faces }));
vi.mock('@/server/media', async (orig) => ({ ...(await orig<typeof import('@/server/media')>()), assetFile: (a: { provenance?: { path?: string } }) => a.provenance?.path ?? '' }));

import { canvasFor, derivedFaceReference, encodedFacePx, encodedRefSize, faceCropSquare, faceReferenceFor } from '@/domain/face-reference';
import { MINIMAX_H3_API, MINIMAX_H3_LOCAL } from '@/domain/video-capability';
import { resolveShotPack, bindingOf } from '@/server/production/shot-pack';
import { h3ReferencePrompt, lintH3Prompt } from '@/server/story/prompts';
import { identityConditioning } from '@/server/production/identity-rule';
import { withFaceReferences } from '@/worker/handlers/face-reference';
import { ffmpeg } from '@/server/media/ffmpeg';
import { ffprobe } from '@/server/media';
import { fixture, shotOf } from './continuity-fixture';

const CANVAS = canvasFor({ width: 1344, height: 768 });
const CANON = { id: 'canon-a', width: 928, height: 1664 };
const faceRef = (over: Partial<Asset> = {}): Asset => ({ id: 'face-a', kind: 'IMAGE', src: '/api/media/face-a', label: 'face', tags: ['face-reference'], sample: false, origin: 'DERIVED', mimeType: 'image/png', width: 768, height: 768, createdAt: '2026-10-06T00:00:00.000Z', provenance: { path: 'img/face-a.png', kind: 'FACE_REFERENCE', derivedFrom: 'canon-a', characterId: 'x', canonicalVersion: 2, canonicalSize: { width: 928, height: 1664 }, faceBox: { x: 0.42, y: 0.08, w: 0.1, h: 0.09 }, crop: { x: 330, y: 70, w: 330, h: 330 }, side: 768, detector: 'YuNet' }, ...over });

describe('the node’s reference scaling (the arithmetic)', () => {
  it('a 928x1664 canonical at 1344x768 is encoded at 768x1376; a face a tenth of its height keeps ~124 px', () => {
    expect(CANVAS).toEqual({ width: 1344, height: 768 });
    expect(encodedRefSize(MINIMAX_H3_LOCAL, CANVAS, CANON)).toMatchObject({ width: 768, height: 1376 });
    expect(encodedFacePx(MINIMAX_H3_LOCAL, CANVAS, CANON, { x: 0, y: 0, w: 0.1, h: 0.09 })).toBe(124);
    // the enlarged 768-px crop is under the canvas area: kept at its size
    expect(encodedRefSize(MINIMAX_H3_LOCAL, CANVAS, { width: 768, height: 768 })).toMatchObject({ width: 768, height: 768, scale: 1 });
  });
  it('the crop is a square around the face, a little below its middle, inside the picture', () => {
    expect(faceCropSquare({ x: 400, y: 150, w: 90, h: 120 }, { width: 928, height: 1664 })).toEqual({ x: 313, y: 84, w: 264, h: 264 });
    expect(faceCropSquare({ x: 0, y: 0, w: 90, h: 120 }, { width: 928, height: 1664 })).toMatchObject({ x: 0, y: 0 });
  });
});

describe('the decision per shot', () => {
  const base = { cap: MINIMAX_H3_LOCAL, canvas: CANVAS, characterId: 'x', canonical: CANON };
  it('OFF never; a wide framing never; no crop yet → derive; AUTO under the floor → use; AUTO over it → not; ON → use', () => {
    expect(faceReferenceFor({ ...base, mode: 'OFF', framing: 'CLOSE_UP', derived: faceRef() })).toMatchObject({ use: false, derive: false });
    expect(faceReferenceFor({ ...base, mode: 'AUTO', framing: 'WIDE', derived: faceRef() })).toMatchObject({ use: false, derive: false });
    expect(faceReferenceFor({ ...base, mode: 'AUTO', framing: 'CLOSE_UP' })).toMatchObject({ use: false, derive: true });
    expect(faceReferenceFor({ ...base, mode: 'AUTO', framing: 'MEDIUM_CLOSE_UP', derived: faceRef() })).toMatchObject({ use: true, assetId: 'face-a', facePx: 124 });
    const big = faceRef({ provenance: { ...faceRef().provenance, faceBox: { x: 0.3, y: 0.05, w: 0.3, h: 0.2 } } });
    expect(faceReferenceFor({ ...base, mode: 'AUTO', framing: 'CLOSE_UP', derived: big })).toMatchObject({ use: false, facePx: 275 });
    expect(faceReferenceFor({ ...base, mode: 'ON', framing: 'CLOSE_UP', derived: big })).toMatchObject({ use: true });
    expect(faceReferenceFor({ ...base, cap: MINIMAX_H3_API, mode: 'ON', framing: 'CLOSE_UP', derived: big })).toMatchObject({ use: false });
  });
  it('the derived crop is found by the canonical image it was cut from (a redrawn canonical has a new id: a new crop)', () => {
    expect(derivedFaceReference([faceRef()], 'canon-a')?.id).toBe('face-a');
    expect(derivedFaceReference([faceRef()], 'canon-a-v3')).toBeUndefined();
    expect(derivedFaceReference([faceRef({ unavailable: true })], 'canon-a')).toBeUndefined();
  });
});

function studio(mode: 'AUTO' | 'ON' | 'OFF', framing: 'CLOSE_UP' | 'WIDE' = 'CLOSE_UP') {
  const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's13' ? { ...s, framing } : s)) });
  const assets = state.assets.map((a) => (a.id === 'canon-a' ? { ...a, width: 928, height: 1664 } : a));
  const withRef: StudioState = { ...state, assets: [...assets, faceRef({ provenance: { ...faceRef().provenance, characterId: p.castIds[0] } })], settings: { ...state.settings, generation: { faceReference: mode } } };
  return { state: withRef, p };
}

describe('in the shot pack and the prompt', () => {
  it('AUTO on a close shot: the face crop rides after the plate, bound to the same subject, the prompt lints, the identity rule holds', () => {
    const { state, p } = studio('AUTO');
    const sh = shotOf(p, 's13');
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    expect(pack.pictures.map((x) => x.role)).toEqual(['SUBJECT', 'LOCATION', 'FACE_REFERENCE', 'OPENING_FRAME']);
    expect(pack.faceReferences).toMatchObject([{ characterId: p.castIds[0], use: true, facePx: 124 }]);
    const prompt = h3ReferencePrompt(p, sh, state.characters, state.locations.find((l) => l.id === 'loc-pharmacy'), p.scenes[0], bindingOf(pack), { relation: pack.relation, context: pack.context, sceneState: pack.sceneState });
    expect(prompt).toContain('<Picture 3> is a close-up of the face of <Subject 1>, cut from <Picture 1>: the same person, not another one.');
    expect(prompt).toContain('<Picture 3> (the face of <Subject 1>): fully_preserved');
    expect(prompt).not.toContain('<Subject 3>');
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: pack.pictures.length, audios: 0, lines: [] }).ok).toBe(true);
    expect(identityConditioning(pack, sh, state.characters, state.locations.find((l) => l.id === 'loc-pharmacy')).ok).toBe(true);
  });
  it('OFF (the default) and a wide framing send nothing extra', () => {
    for (const [mode, framing] of [['OFF', 'CLOSE_UP'], ['AUTO', 'WIDE']] as const) {
      const { state, p } = studio(mode, framing);
      expect(resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'local' }).pictures.some((x) => x.role === 'FACE_REFERENCE')).toBe(false);
    }
    const { state, p } = fixture();
    expect(state.settings.generation?.faceReference).toBeUndefined();
    expect(resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'local' }).faceReferences.every((f) => !f.use)).toBe(true);
  });
});

describe('the worker derives it once, from the canonical image (real ffmpeg)', () => {
  const ctx = { job: { id: 'job-x', attempts: 1 }, event: async (_l: string, m: string) => { fake.events.push(m); } } as never;
  it('detects the face, cuts and enlarges the crop to 768 px, stores a DERIVED asset traceable to the canonical image, commits it at once', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-face-'));
    const canonFile = path.join(dir, 'canon.png');
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=928x1664:rate=1', '-frames:v', '1', canonFile]);
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's13' ? { ...s, framing: 'CLOSE_UP' as const } : s)) });
    const s0: StudioState = { ...state, assets: state.assets.map((a) => (a.id === 'canon-a' ? { ...a, width: 928, height: 1664, provenance: { path: canonFile } } : a)), settings: { ...state.settings, generation: { faceReference: 'AUTO' } } };
    fake.faces = { available: true, width: 928, height: 1664, faces: [{ box: [400, 150, 90, 120], score: 0.95 }], detector: 'YuNet 2023mar' };
    fake.commands = [];
    let adopted = '';
    const out = { adopt: async (_n: string, file: string) => { adopted = file; return { id: 'face-new', stored: { relPath: 'x', absPath: file, bytes: 1, mime: 'image/png', kind: 'IMAGE' as const, ext: 'png', sha256: 'h' } }; } };
    const s1 = await withFaceReferences(ctx, s0, p as Production, shotOf(p, 's13'), { backend: 'local', out });
    const probe = await ffprobe(adopted);
    expect([probe.width, probe.height]).toEqual([768, 768]);
    const added = s1.assets.find((a) => a.id === 'face-new')!;
    expect(added).toMatchObject({ origin: 'DERIVED', tags: expect.arrayContaining(['face-reference']), provenance: { kind: 'FACE_REFERENCE', derivedFrom: 'canon-a', characterId: p.castIds[0], canonicalVersion: 2, canonicalSize: { width: 928, height: 1664 }, crop: { x: 313, y: 84, w: 264, h: 264 }, side: 768, faceBox: { h: 0.0721 } } });
    expect(fake.commands.map((c) => c.name)).toEqual(['addAsset']);
    // the character's own references are untouched (no profile clutter)
    expect(s1.characters.find((c) => c.id === p.castIds[0])!.refs).toEqual(state.characters.find((c) => c.id === p.castIds[0])!.refs);
    // a second take finds it and derives nothing
    fake.commands = [];
    expect(await withFaceReferences(ctx, s1, p as Production, shotOf(p, 's13'), { backend: 'local', out })).toBe(s1);
    expect(fake.commands).toEqual([]);
    // offline detector: an event, no asset, the take goes on
    fake.faces = { available: false, reason: 'offline (test)' };
    expect(await withFaceReferences(ctx, s0, p as Production, shotOf(p, 's13'), { backend: 'local', out })).toBe(s0);
    expect(fake.events.at(-1)).toMatch(/face detector is not available/);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);
});

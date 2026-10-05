import { describe, expect, it } from 'vitest';
import { engineReadiness, graphRequirements, h3Requirements, storageReadiness } from '@/server/production/readiness';
import { MODELS } from '@/server/workflows/index';
import { preflightTake } from '@/server/org/preflight';
import type { Character } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** First-attempt reliability (cloud directive §11): the machine and the plan are checked before MiniMax is asked. */

describe('what an H3 request needs from the machine', () => {
  it('the requirements are read from the graph builder: the H3 checkpoints, encoder, VAEs, LoRAs and the guide nodes', () => {
    const r = h3Requirements();
    expect(r.nodes).toEqual(expect.arrayContaining(['MiniMaxH3ReferenceToVideo', 'MiniMaxH3ImageToVideo', 'MiniMaxH3AddGuide', 'LoadVideo', 'GetVideoComponents', 'SaveVideo']));
    expect(r.models.map((m) => m.file)).toEqual(expect.arrayContaining([MODELS.h3Ref2va, MODELS.h3Fl2va, MODELS.h3Clip, MODELS.h3VideoVae, MODELS.h3AudioVae, MODELS.h3TurboRef2v4, MODELS.h3TurboFl2v8]));
    expect(graphRequirements({ a: { class_type: 'VAELoader', inputs: { vae_name: 'v.safetensors' } } })).toEqual({ nodes: ['VAELoader'], models: [{ folder: 'vae', file: 'v.safetensors' }] });
  });
  it('ready, missing, offline', async () => {
    const req = { nodes: ['A', 'B'], models: [{ folder: 'vae', file: 'v' }] };
    expect((await engineReadiness(req, { hasNodes: async () => ({ missing: [] }), listModels: async () => ['v'] })).ok).toBe(true);
    expect(await engineReadiness(req, { hasNodes: async () => ({ missing: ['B'] }), listModels: async () => [] })).toMatchObject({ ok: false, missingNodes: ['B'], missingModels: ['vae/v'], detail: 'missing nodes: B; missing models: vae/v' });
    expect(await engineReadiness(req, { hasNodes: async () => { throw new Error('connect ECONNREFUSED'); }, listModels: async () => [] })).toMatchObject({ ok: false, offline: true, detail: expect.stringMatching(/ComfyUI is offline \(connect ECONNREFUSED\)/) });
  });
  it('storage: free space against the floor', async () => {
    expect((await storageReadiness('/x', 2 * 1024 ** 3, async () => ({ bavail: 1024 ** 2, bsize: 4096 }))).ok).toBe(true);
    expect(await storageReadiness('/x', 2 * 1024 ** 3, async () => ({ bavail: 1000, bsize: 4096 }))).toMatchObject({ ok: false, detail: expect.stringMatching(/under the 2\.0 GB/) });
    expect((await storageReadiness('/x', 1, async () => { throw new Error('ENOENT'); })).ok).toBe(false);
  });
});

describe('the plan before the first attempt', () => {
  it('a DRAFT canonical image is approved before the character’s first take (the first take locks the look)', () => {
    const { state, p } = fixture({ characters: (cs) => cs.map((c, i) => (i === 1 ? { ...c, usage: { known: true, videos: [] } } as Character : c)) });
    const r = preflightTake(state, p, shotOf(p, 's12'), { backend: 'local', customPrompt: true });
    const c = r.checks.find((x) => x.name === 'canonical-approved-before-first-use')!;
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/approve the canonical image of .* first/);
    // a character already used (or with unknown history) is past that point
    const used = preflightTake(fixture().state, p, shotOf(p, 's12'), { backend: 'local', customPrompt: true });
    expect(used.checks.find((x) => x.name === 'canonical-approved-before-first-use')!.ok).toBe(true);
  });
  it('the dialogue must fit the new picture the clip can carry; recorded lengths are authoritative', () => {
    const { state, p } = fixture();
    const ok = preflightTake(state, p, shotOf(p, 's12'), { backend: 'local', customPrompt: true }).checks.find((x) => x.name === 'dialogue-fits-clip')!;
    expect(ok).toMatchObject({ ok: true, detail: expect.stringMatching(/2\.5 s of dialogue \(recorded\)/) });
    const long = { ...p, shots: p.shots.map((s) => (s.id === 's12' ? { ...s, dialogue: [...s.dialogue, { id: 'l2', characterId: s.dialogue[0].characterId, text: 'x', durationSeconds: 13 }] } : s)) };
    const bad = preflightTake(state, long, shotOf(long, 's12'), { backend: 'local', customPrompt: true }).checks.find((x) => x.name === 'dialogue-fits-clip')!;
    expect(bad).toMatchObject({ ok: false, detail: expect.stringMatching(/split the shot/) });
  });
  it('the production context’s gaps are warnings', () => {
    const { state, p } = fixture();
    const q = { ...p, shots: p.shots.map((s) => (s.id === 's11' ? { ...s, selectedTakeId: undefined } : s)) };
    const r = preflightTake(state, q, shotOf(q, 's12'), { backend: 'local', customPrompt: true });
    expect(r.warnings.filter((w) => w.name === 'context-gap').map((w) => w.detail).join(' ')).toMatch(/no chosen take/);
  });
});

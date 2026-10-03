import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandName } from '@/domain/commands';
import type { StudioState } from '@/domain/types';
import type { GrayImage } from '@/server/media/image-check';

/** CHARACTER_APPEARANCE draws the ONE canonical front full-body image (docs/CONTRACTS-IDENTITY-PACK.md v2), with the
 *  real reducers and a fake ComfyUI: the graph per creation method, the tool each call is recorded as, the framing
 *  check and its one redraw (the rejected picture kept as RAW), the Image Reference read (face box + description),
 *  setCanonicalImage instead of the old portrait pointers, no reference sheet queued; CHARACTER_REFS makes SECONDARY
 *  material from the canonical image. */

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
const fake = vi.hoisted(() => ({
  state: null as unknown as StudioState,
  runs: [] as Array<{ tool: string; graph: Graph }>,
  framing: [] as Array<'ok' | 'head-cut'>,
  text: {} as Record<string, string>,
  textEncoders: ['qwen_2.5_vl_7b_fp8_scaled.safetensors', 'qwen3.5_4b_bf16.safetensors'],
  events: [] as Array<{ level: string; message: string }>,
  tools: [] as string[],
}));

vi.mock('@/server/studio/engine', async () => {
  const { runCommand } = await import('@/domain/commands');
  const apply = async (name: CommandName, args: unknown[]) => { const r = runCommand(fake.state, { name, args, seed: `s-${Math.random()}`, at: new Date().toISOString() } as Command); fake.state = r.state; return r.result; };
  return { readState: async () => ({ state: fake.state, version: 1, hash: 'h' }), command: apply, commands: async (list: Array<{ name: CommandName; args: unknown[] }>) => { const out: unknown[] = []; for (const c of list) out.push(await apply(c.name, c.args)); return out; } };
});
vi.mock('@/server/media', () => ({
  assetFile: (a: { provenance?: Record<string, unknown> }) => `/lib/${String(a.provenance?.path ?? '')}`,
  ffprobe: async () => ({ width: 1024, height: 1280 }),
  adoptFile: async (_id: string, file: string) => ({ absPath: file, probe: { width: 928, height: 1664 } }),
  assetFromStored: (id: string, _stored: unknown, meta: { label: string; tags: string[]; origin: string; jobId?: string; provenance?: Record<string, unknown>; tier?: string }) => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: meta.label, tags: meta.tags, origin: meta.origin, sample: false, mimeType: 'image/png', width: 928, height: 1664, jobId: meta.jobId, provenance: { ...(meta.provenance ?? {}), path: `images/${id}.png` }, ...(meta.tier ? { tier: meta.tier } : {}) }),
}));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async () => fs.mkdtemp(path.join(os.tmpdir(), 'vb-test-')) }));
vi.mock('@/server/media/image-check', () => {
  const picture = (rows: [number, number]): GrayImage => {
    const w = 232, h = 416; const data = new Uint8Array(w * h).fill(128);
    for (let y = Math.floor(h * rows[0]); y < Math.floor(h * rows[1]); y++) for (let x = 80; x < 150; x++) data[y * w + x] = 30;
    return { data, width: w, height: h };
  };
  return { grayPixels: async () => picture(fake.framing.shift() === 'head-cut' ? [0, 0.94] : [0.06, 0.94]), validateReferenceImage: async () => ({ ok: true, width: 1024, height: 1280, sharpness: 80, reasons: [] }) };
});
vi.mock('@/server/providers/comfy', () => ({
  health: async () => ({ ok: true }),
  hasNodes: async () => ({ missing: [] }),
  listModels: async (folder: string) => (folder === 'diffusion_models' ? ['qwen_image_2512_fp8_e4m3fn.safetensors'] : folder === 'text_encoders' ? fake.textEncoders : []),
  uploadInput: async (file: string) => `vb-${path.basename(file)}`,
  run: async (graph: Graph) => {
    fake.runs.push({ tool: fake.tools.at(-1) ?? '?', graph });
    const outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }>; text?: string[] }> = {};
    for (const [id, n] of Object.entries(graph)) {
      if (n.class_type === 'SaveImage') outputs[id] = { images: [{ filename: `${id}-${fake.runs.length}.png`, subfolder: '', type: 'output' }] };
      if (n.class_type === 'PreviewAny' && fake.text[id] !== undefined) outputs[id] = { text: [fake.text[id]] };
    }
    return { promptId: `p-${fake.runs.length}`, outputs, ms: 1, engineMs: 1, workflowVersion: 'v' };
  },
  view: async () => Buffer.from('png'),
  textOutput: (outputs: Record<string, { text?: string[] }>, id: string) => outputs[id]?.text?.join('\n'),
  firstOutput: (outputs: Record<string, { images?: unknown[] }>) => Object.values(outputs).find((o) => o.images?.length)?.images?.[0],
}));
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {}, enqueue: async () => { throw new Error('nothing is queued by CHARACTER_APPEARANCE'); } }));
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h' }));

import { seed } from '@/domain/sample';
import { addAsset, setPendingReference } from '@/domain/actions';
import { identitySeedFor } from '@/server/workflows';
import { characterAppearance, characterRefs } from '@/worker/handlers/images';
import type { HandlerContext } from '@/worker/handlers';
import type { Job } from '@/domain/jobs';

const ctx = (type: string, payload: Record<string, unknown>): HandlerContext => ({
  job: { id: 'job-ap', type, status: 'PREPARING', priority: 0, payload, attempts: 1, maxAttempts: 2, cancelRequested: false, createdAt: 'x', updatedAt: 'x' } as Job,
  log: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as unknown as HandlerContext['log'], workerId: 'w', agent: { id: 'character-designer', name: 'Character Designer', department: 'CASTING', tools: [] } as unknown as HandlerContext['agent'], runId: 'run',
  tool: (id, fn) => { fake.tools.push(id); return fn(); }, activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async (level, message) => { fake.events.push({ level, message }); }, gpu: async (_f, _mb, fn) => fn(),
});
const asset = (id: string) => fake.state.assets.find((a) => a.id === id)!;
const freeChar = () => { const c = fake.state.characters.find((x) => x.id === 'nour')!; return c; };

beforeEach(() => {
  fake.state = seed();
  // a character not yet used in a video, so it may be drawn
  fake.state = { ...fake.state, characters: fake.state.characters.map((c) => (c.id === 'nour' ? { ...c, usage: { known: true, videos: [] }, canonicalImage: undefined } : c)) };
  fake.runs = []; fake.framing = []; fake.text = {}; fake.events = []; fake.tools = [];
  fake.textEncoders = ['qwen_2.5_vl_7b_fp8_scaled.safetensors', 'qwen3.5_4b_bf16.safetensors'];
});

describe('CHARACTER_APPEARANCE: the canonical image from text', () => {
  it('draws one front full-body image with Qwen-Image-2512 in quality mode and sets it as the DRAFT canonical image', async () => {
    const c = freeChar();
    const r = await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: c.id })) as Record<string, unknown>;
    expect(fake.runs).toHaveLength(1);
    const g = fake.runs[0].graph;
    expect(fake.runs[0].tool).toBe('image.generate');
    expect(g['1'].inputs.unet_name).toBe('qwen_image_2512_fp8_e4m3fn.safetensors');
    expect(g['4']).toBeUndefined(); // no Lightning: quality mode
    expect(g['8'].inputs).toMatchObject({ width: 928, height: 1664 });
    expect(g['9'].inputs.seed).toBe(identitySeedFor(c));
    const prompt = String(g['6'].inputs.text);
    expect(prompt).toMatch(/^(3D animated feature-film character design|2D anime character design|Photorealistic full-length studio photograph)/);
    expect(prompt).toContain('the whole figure from the top of the head to the soles of the feet');
    const img = fake.state.characters.find((x) => x.id === c.id)!.canonicalImage!;
    expect(img).toMatchObject({ status: 'DRAFT', version: 1, jobId: 'job-ap', seed: identitySeedFor(c), check: { ok: true } });
    expect(img.identityLine).toMatch(/^Identity: (stylized 3D animated character|2D anime character|photorealistic real person), /);
    expect(img.engine).toMatch(/Qwen-Image-2512/);
    expect(asset(img.assetId).tier).toBe('CANONICAL');
    expect(r).toMatchObject({ canonicalAssetId: img.assetId, status: 'DRAFT', version: 1, lookFrom: 'DESCRIPTION', message: expect.stringMatching(/awaiting your approval/) });
    // the old pointers are not written and no reference sheet follows
    expect(fake.state.characters.find((x) => x.id === c.id)!.portraitAssetId).toBe(c.portraitAssetId);
  });
  it('a picture whose figure is cut by the frame is redrawn once with the next seed; the first is kept as RAW', async () => {
    const c = freeChar();
    fake.framing = ['head-cut', 'ok'];
    const r = await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: c.id })) as { rejected: Array<{ assetId: string }>; canonicalAssetId: string };
    expect(fake.runs.map((x) => x.graph['9'].inputs.seed)).toEqual([identitySeedFor(c), identitySeedFor(c) + 1]);
    expect(r.rejected).toHaveLength(1);
    expect(asset(r.rejected[0].assetId).tier).toBe('RAW');
    const img = fake.state.characters.find((x) => x.id === c.id)!.canonicalImage!;
    expect(img).toMatchObject({ assetId: r.canonicalAssetId, seed: identitySeedFor(c) + 1, check: { ok: true } });
    expect(img.check!.notes!.join(' ')).toMatch(/redrawn once/);
    expect(fake.events.some((e) => e.level === 'warn' && /not whole in the frame/.test(e.message))).toBe(true);
  });
  it('when the redraw fails too, the image is left for the producer with the failed check (approval then needs an override)', async () => {
    fake.framing = ['head-cut', 'head-cut'];
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    const img = fake.state.characters.find((x) => x.id === 'nour')!.canonicalImage!;
    expect(img.check).toMatchObject({ ok: false });
    expect(img.check!.notes![0]).toMatch(/full body not in frame: the head touches or leaves the top edge/);
  });
  it('a redraw is a new version with the next seed; the replaced image becomes RAW', async () => {
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    const first = fake.state.characters.find((x) => x.id === 'nour')!.canonicalImage!;
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    const second = fake.state.characters.find((x) => x.id === 'nour')!.canonicalImage!;
    expect(second.version).toBe(2);
    expect(second.seed).toBe(first.seed! + 1);
    expect(asset(first.assetId).tier).toBe('RAW');
  });
});

describe('CHARACTER_APPEARANCE: the canonical image from the producer’s picture', () => {
  const upload = () => {
    fake.state = addAsset(fake.state, { id: 'up-face', kind: 'IMAGE', src: '/api/media/up-face', label: 'face', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, mimeType: 'image/png', provenance: { path: 'images/up-face.png' } }).state;
    fake.state = setPendingReference(fake.state, 'nour', 'up-face', { ok: true, width: 1024, height: 1280, faces: 1, reasons: [] });
  };
  it('reads the picture (face box + description), then redraws it with its face crop; the identity line is the description’s', async () => {
    upload();
    fake.text = {
      bboxes: '[[{"x": 320, "y": 245, "width": 357, "height": 408, "label": "face", "score": 0.96}]]',
      vlm_describe: '{"ageRange": "40-50", "sex": "female", "build": "medium", "hair": {"colour": "black", "length": "long"}, "eyes": {"colour": "brown"}, "facialHair": "none", "glasses": "none", "clothing": [{"item": "lab coat", "colour": "white"}], "footwear": "not visible", "accessories": [], "notVisible": ["shoes"], "confidence": {}}',
    };
    const r = await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' })) as Record<string, unknown>;
    expect(fake.runs.map((x) => x.tool)).toEqual(['image.describe_reference', 'image.edit_with_references']);
    expect(Object.values(fake.runs[0].graph).map((n) => n.class_type)).toEqual(expect.arrayContaining(['MediaPipeFaceLandmarker', 'TextGenerate']));
    const redraw = fake.runs[1].graph;
    expect(redraw.facecrop.inputs).toMatchObject({ image: ['img1', 0] });
    expect(redraw['6'].inputs).toMatchObject({ image1: ['img1s', 0], image2: ['img2s', 0] });
    expect(String(redraw['6'].inputs.prompt)).toMatch(/^Redraw the person in image 1, with the face exactly as in image 2, as /);
    const c = fake.state.characters.find((x) => x.id === 'nour')!;
    expect(c.pendingReference).toBeUndefined(); // consumed by setCanonicalImage
    expect(c.canonicalImage).toMatchObject({ referenceAssetId: 'up-face', status: 'DRAFT' });
    expect(c.canonicalImage!.identityLine).toMatch(/a woman aged about 40-50; medium build; long black hair; brown eyes; no facial hair; wearing white lab coat/);
    expect(c.canonicalImage!.engine).toMatch(/Qwen-Image-Edit-2511/);
    expect(r).toMatchObject({ lookFrom: 'REFERENCE' });
  });
  it('a redraw after a framing failure leaves the face crop out (it pulled the shot in to three-quarter length)', async () => {
    upload();
    fake.text = { bboxes: '[[{"x": 320, "y": 245, "width": 357, "height": 408}]]', vlm_describe: '{"sex": "male", "ageRange": "25-35", "clothing": [{"item": "shirt", "colour": "blue"}]}' };
    fake.framing = ['head-cut', 'ok'];
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    expect(fake.runs.map((x) => x.tool)).toEqual(['image.describe_reference', 'image.edit_with_references', 'image.edit_with_references']);
    expect(fake.runs[1].graph.facecrop).toBeDefined();
    expect(fake.runs[2].graph.facecrop).toBeUndefined();
    expect(String(fake.runs[2].graph['6'].inputs.prompt)).not.toContain('image 2');
    expect(fake.state.characters.find((x) => x.id === 'nour')!.canonicalImage!.check).toMatchObject({ ok: true });
  });
  it('without the vision model the look is the picture’s alone, said in the check notes; two faces → no separate face crop', async () => {
    // a character created from a picture: the look fields are the picture's (empty)
    fake.state = { ...fake.state, characters: fake.state.characters.map((c) => (c.id === 'nour' ? { ...c, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', distinguishing: [] } : c)) };
    upload();
    fake.textEncoders = ['qwen_2.5_vl_7b_fp8_scaled.safetensors'];
    fake.text = { bboxes: '[[{"x": 1, "y": 1, "width": 100, "height": 100}, {"x": 500, "y": 1, "width": 90, "height": 90}]]' };
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    expect(Object.values(fake.runs[0].graph).map((n) => n.class_type)).not.toContain('TextGenerate');
    expect(fake.runs[1].graph.facecrop).toBeUndefined();
    const img = fake.state.characters.find((x) => x.id === 'nour')!.canonicalImage!;
    expect(img.identityLine).toMatch(/exactly as in the reference picture/);
    expect(img.check!.notes!.join(' ')).toMatch(/2 faces found.*vision model \(Qwen3.5-4B\) is not installed/);
  });
});

describe('CHARACTER_REFS: secondary material only, one pass per kind from the canonical image', () => {
  const drawCanonical = async () => {
    await characterAppearance(ctx('CHARACTER_APPEARANCE', { characterId: 'nour' }));
    const c = fake.state.characters.find((x) => x.id === 'nour')!;
    fake.runs = []; fake.tools = [];
    return { canonical: c.canonicalImage!.assetId, before: new Set(fake.state.assets.map((a) => a.id)), line: c.canonicalImage!.identityLine! };
  };
  const madeSince = (before: Set<string>) => fake.state.assets.filter((a) => !before.has(a.id));

  it('an expression sheet is ONE Edit-2511 run with the canonical image as its only reference, stored as SECONDARY', async () => {
    const { canonical, before, line } = await drawCanonical();
    const r = await characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['EXPRESSION'] })) as Record<string, unknown>;
    expect(fake.runs).toHaveLength(1); // no sheet first, no views
    expect(fake.runs[0].tool).toBe('image.edit_with_references');
    const g = fake.runs[0].graph;
    expect(Object.values(g).filter((n) => n.class_type === 'LoadImage').map((n) => n.inputs.image)).toEqual([`vb-${canonical}.png`]);
    expect(g['1'].inputs.unet_name).toBe('qwen_image_edit_2511_fp8mixed.safetensors');
    expect(g['4']).toBeUndefined(); // quality mode
    expect(String(g['6'].inputs.prompt)).toMatch(/^An expression sheet: .*image 1/);
    expect(String(g['6'].inputs.prompt)).toContain(line.replace(/\.$/, '')); // the identity line recorded with the canonical image
    expect(Object.values(g).some((n) => /lora/i.test(String(n.inputs.lora_name ?? '')))).toBe(false);
    const made = madeSince(before);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ tier: 'SECONDARY', provenance: { view: 'EXPRESSION', references: [canonical], model: 'Qwen-Image-Edit-2511' } });
    const c = fake.state.characters.find((x) => x.id === 'nour')!;
    expect(c.refs.filter((x) => x.role === 'EXPRESSION').map((x) => x.assetId)).toEqual([made[0].id]);
    expect(c.canonicalImage!.assetId).toBe(canonical); // never the identity
    expect(r).toMatchObject({ assetId: made[0].id, references: [canonical], secondary: [{ kind: 'EXPRESSION', assetId: made[0].id }] });
  });
  it('a redraw of a kind replaces only that kind (the earlier picture stays in the library) with the next seed; the outfit is its own kind', async () => {
    const { before } = await drawCanonical();
    await characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['EXPRESSION'] }));
    await characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['OUTFIT'] }));
    await characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['EXPRESSION'] }));
    expect(fake.runs).toHaveLength(3);
    const seeds = fake.runs.map((x) => x.graph['9'].inputs.seed as number);
    expect(seeds[2]).toBe(seeds[0] + 1);
    expect(fake.runs[1].graph['8'].inputs).toMatchObject({ width: 928, height: 1664 }); // the outfit: the whole figure
    const made = madeSince(before);
    expect(made).toHaveLength(3);
    const c = fake.state.characters.find((x) => x.id === 'nour')!;
    expect(c.refs.filter((x) => x.role === 'EXPRESSION').map((x) => x.assetId)).toEqual([made[2].id]);
    expect(c.refs.filter((x) => x.role === 'OUTFIT').map((x) => x.assetId)).toEqual([made[1].id]);
    expect(fake.state.assets.some((a) => a.id === made[0].id)).toBe(true);
  });
  it('a close-up portrait is the secondary portrait beside the canonical image, never the primary image', async () => {
    const { canonical, before } = await drawCanonical();
    await characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['PORTRAIT'] }));
    const [portrait] = madeSince(before);
    expect(portrait).toMatchObject({ tier: 'SECONDARY', provenance: { view: 'PORTRAIT' } });
    expect(fake.runs[0].graph['8'].inputs).toMatchObject({ width: 1024, height: 1280 });
    const c = fake.state.characters.find((x) => x.id === 'nour')!;
    expect(c.portraitAssetId).toBe(portrait.id);
    expect(c.canonicalImage!.assetId).toBe(canonical);
  });
  it('views, the old pack and an empty request are refused before anything is drawn; a portrait needs a canonical image', async () => {
    // before the canonical image: a close-up portrait could only replace the (legacy) primary image — refused; the
    // bundled sample portrait is no reference for anything
    expect(fake.state.characters.find((x) => x.id === 'nour')!.portraitAssetId).toBeTruthy();
    await expect(characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['PORTRAIT'] }))).rejects.toMatchObject({ code: 'INVALID', failureClass: 'INVALID_INPUT' });
    await expect(characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', roles: ['EXPRESSION'] }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE' });
    await drawCanonical();
    for (const roles of [['FULL_BODY'], ['FRONT', 'SIDE', 'BACK'], ['EXPRESSION', 'FACE'], [], undefined]) {
      await expect(characterRefs(ctx('CHARACTER_REFS', { characterId: 'nour', ...(roles ? { roles } : {}) }))).rejects.toMatchObject({ code: 'INVALID', failureClass: 'INVALID_INPUT' });
    }
    expect(fake.runs).toHaveLength(0);
  });
});

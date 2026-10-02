import { describe, expect, it } from 'vitest';
import { DEFAULT_FACE_BOX, FACE_CHECK_OUTPUTS, MODELS, SHEET_OUTPUTS, SHEET_TILES, VIEW_SPEC, faceCheck, qwenEdit, qwenIdentitySheet, qwenView, workflowVersion, type Graph } from '@/server/workflows';

const inputs = (g: Graph, id: string) => g[id].inputs as Record<string, unknown>;
const nodesOf = (g: Graph, cls: string) => Object.entries(g).filter(([, n]) => n.class_type === cls).map(([id]) => id);
/** Every link must point at an existing node: ComfyUI rejects a dangling link before anything runs. */
const expectWired = (g: Graph) => {
  for (const [id, n] of Object.entries(g)) for (const [k, v] of Object.entries(n.inputs)) {
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'number') expect(g[v[0] as string], `${id}.${k} → ${v[0]}`).toBeDefined();
  }
};
const ANGLE_TOKEN = /^(front view|front-right quarter view|right side view|back-right quarter view|back view|back-left quarter view|left side view|front-left quarter view) (low-angle shot|eye-level shot|elevated shot|high-angle shot) (close-up|medium shot|wide shot)$/;

describe('qwenEdit', () => {
  it('keeps the draft shape (Lightning, 4 steps, cfg 1) and its version hash when nothing new is asked', () => {
    const g = qwenEdit({ prompt: 'x', references: ['a.png'] });
    expect(inputs(g, '4').lora_name).toBe(MODELS.qwenEditLightning);
    expect(inputs(g, '5').model).toEqual(['4', 0]);
    expect(inputs(g, '9')).toMatchObject({ steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', model: ['5', 0] });
    expect(inputs(g, '8').class_type).toBeUndefined();
    expect(g['8'].class_type).toBe('VAEEncode');
    expectWired(g);
    // the structural version ignores prompt/seed/files: two draft edits share it
    expect(workflowVersion(g)).toBe(workflowVersion(qwenEdit({ prompt: 'y', references: ['b.png'], seed: 7 })));
  });
  it('quality mode drops the Lightning LoRA and samples 24 steps at cfg 4', () => {
    const g = qwenEdit({ prompt: 'x', references: ['a.png', 'b.png'], quality: true, width: 1024, height: 1280 });
    expect(g['4']).toBeUndefined();
    expect(inputs(g, '5').model).toEqual(['1', 0]);
    expect(inputs(g, '9')).toMatchObject({ steps: 24, cfg: 4.0 });
    expect(g['8'].class_type).toBe('EmptySD3LatentImage');
    expect(workflowVersion(g)).not.toBe(workflowVersion(qwenEdit({ prompt: 'x', references: ['a.png', 'b.png'], width: 1024, height: 1280 })));
    expectWired(g);
  });
  it('chains extra LoRAs after Lightning in order, clamped to the node range', () => {
    const g = qwenEdit({ prompt: 'x', references: ['a.png'], extraLoras: [{ name: MODELS.qwenMultiAngleLora, strength: 0.9 }, { name: 'other.safetensors', strength: 1000 }] });
    expect(inputs(g, 'lora1')).toMatchObject({ model: ['4', 0], lora_name: MODELS.qwenMultiAngleLora, strength_model: 0.9 });
    expect(inputs(g, 'lora2')).toMatchObject({ model: ['lora1', 0], strength_model: 100 });
    expect(inputs(g, '5').model).toEqual(['lora2', 0]);
    expectWired(g);
  });
  it('wires the references in order into both encoders and refuses 0 or 4', () => {
    const g = qwenEdit({ prompt: 'x', negative: 'n', references: ['a.png', 'b.png', 'c.png'] });
    for (const id of ['6', '7']) expect(inputs(g, id)).toMatchObject({ image1: ['img1s', 0], image2: ['img2s', 0], image3: ['img3s', 0] });
    expect(inputs(g, 'img2').image).toBe('b.png');
    expect(inputs(g, 'img1s')).toMatchObject({ megapixels: 1.0, resolution_steps: 16, upscale_method: 'lanczos' });
    expect(() => qwenEdit({ prompt: 'x', references: [] })).toThrow();
    expect(() => qwenEdit({ prompt: 'x', references: ['1', '2', '3', '4'] })).toThrow();
  });
});

describe('qwenIdentitySheet', () => {
  it('draws the four views in one quality pass from the portrait and a face crop cut in the graph', () => {
    const g = qwenIdentitySheet({ portrait: 'p.png', prompt: 'sheet', seed: 42 });
    expect(g['4']).toBeUndefined(); // quality by default: no Lightning
    expect(inputs(g, '9')).toMatchObject({ steps: 24, cfg: 4.0, seed: 42, denoise: 1.0 });
    expect(inputs(g, '8')).toMatchObject({ width: 1664, height: 1216, batch_size: 1 });
    expect(inputs(g, '6')).toMatchObject({ prompt: 'sheet', image1: ['img1s', 0], image2: ['face', 0] });
    expect(inputs(g, '7')).toMatchObject({ image1: ['img1s', 0], image2: ['face', 0] });
    // the face crop: normalise to 1024×1280, cut the default box, upscale to 1024²
    expect(inputs(g, 'norm')).toMatchObject({ width: 1024, height: 1280, crop: 'center', upscale_method: 'lanczos' });
    expect(inputs(g, 'facecrop')).toEqual({ image: ['norm', 0], width: Math.round(DEFAULT_FACE_BOX.w * 1024), height: Math.round(DEFAULT_FACE_BOX.h * 1280), x: Math.round(DEFAULT_FACE_BOX.x * 1024), y: 0 });
    expect(inputs(g, 'face')).toMatchObject({ width: 1024, height: 1024, crop: 'disabled' });
    expectWired(g);
  });
  it('cuts equal tiles left to right and saves six files under known node ids', () => {
    const g = qwenIdentitySheet({ portrait: 'p.png', prompt: 'sheet' });
    const tile = 1664 / 4;
    SHEET_TILES.forEach((role, k) => {
      const crop = inputs(g, `crop_${role.toLowerCase()}`);
      expect(crop).toEqual({ image: ['10', 0], width: tile, height: 1216, x: k * tile, y: 0 });
      expect(inputs(g, SHEET_OUTPUTS[role]).images).toEqual([`crop_${role.toLowerCase()}`, 0]);
    });
    expect(inputs(g, SHEET_OUTPUTS.sheet).images).toEqual(['10', 0]);
    expect(inputs(g, SHEET_OUTPUTS.face).images).toEqual(['face', 0]);
    expect(nodesOf(g, 'SaveImage')).toHaveLength(6);
    expect(new Set(nodesOf(g, 'SaveImage').map((id) => inputs(g, id).filename_prefix)).size).toBe(6);
  });
  it('uses an uploaded face crop as image2 when given, and can run as a draft', () => {
    const g = qwenIdentitySheet({ portrait: 'p.png', faceCrop: 'f.png', prompt: 'sheet', quality: false });
    expect(inputs(g, 'img2').image).toBe('f.png');
    expect(inputs(g, 'face')).toMatchObject({ image: ['img2', 0], width: 1024, height: 1024, crop: 'center' });
    expect(g['norm']).toBeUndefined(); expect(g['facecrop']).toBeUndefined();
    expect(inputs(g, '4').lora_name).toBe(MODELS.qwenEditLightning);
    expect(inputs(g, '9')).toMatchObject({ steps: 4, cfg: 1.0 });
    expectWired(g);
  });
  it('keeps a custom face box inside the frame', () => {
    const g = qwenIdentitySheet({ portrait: 'p.png', prompt: 's', faceBox: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } });
    const c = inputs(g, 'facecrop') as { x: number; y: number; width: number; height: number };
    expect(c.x + c.width).toBeLessThanOrEqual(1024);
    expect(c.y + c.height).toBeLessThanOrEqual(1280);
    expect(c.width).toBeGreaterThanOrEqual(16); expect(c.height).toBeGreaterThanOrEqual(16);
  });
});

describe('qwenView', () => {
  it('needs exactly the three references in the fixed order and sizes the output per view', () => {
    const g = qwenView({ references: ['front.png', 'face.png', 'sheet.png'], view: 'FULL_BODY', prompt: 'v', seed: 5 });
    expect(inputs(g, 'img1').image).toBe('front.png');
    expect(inputs(g, 'img2').image).toBe('face.png');
    expect(inputs(g, 'img3').image).toBe('sheet.png');
    expect(inputs(g, '6')).toMatchObject({ image1: ['img1s', 0], image2: ['img2s', 0], image3: ['img3s', 0], prompt: 'v' });
    expect(inputs(g, '8')).toMatchObject({ width: 832, height: 1472 });
    expect(inputs(g, '9').seed).toBe(5);
    expect(inputs(g, '11').filename_prefix).toBe('vewbox/view-fullbody');
    expect(() => qwenView({ references: ['a.png'], view: 'FULL_BODY', prompt: 'v' })).toThrow();
    expect(() => qwenView({ references: ['a', 'b', 'c', 'd'], view: 'FULL_BODY', prompt: 'v' })).toThrow();
    expectWired(g);
  });
  it('adds the Multiple-Angles LoRA only when asked, after Lightning', () => {
    const plain = qwenView({ references: ['a', 'b', 'c'], view: 'SIDE', prompt: 'v' });
    expect(plain['lora1']).toBeUndefined();
    const g = qwenView({ references: ['a', 'b', 'c'], view: 'SIDE', prompt: 'v', angleLora: true });
    expect(inputs(g, 'lora1')).toMatchObject({ model: ['4', 0], lora_name: MODELS.qwenMultiAngleLora, strength_model: 1.0 });
    expect(inputs(g, '5').model).toEqual(['lora1', 0]);
    expectWired(g);
  });
  it('maps every view to a README camera descriptor (except the expression grid) and a 16-multiple size', () => {
    for (const [view, spec] of Object.entries(VIEW_SPEC)) {
      expect(spec.width % 16, view).toBe(0); expect(spec.height % 16, view).toBe(0);
      if (view === 'EXPRESSION') expect(spec.angle).toBeUndefined();
      else expect(spec.angle, view).toMatch(ANGLE_TOKEN);
    }
    expect(VIEW_SPEC.THREE_QUARTER.angle).toBe('front-left quarter view eye-level shot medium shot');
    expect(VIEW_SPEC.SIDE.angle).toBe('left side view eye-level shot medium shot');
    expect(VIEW_SPEC.FULL_BODY.angle).toBe('front view eye-level shot wide shot');
  });
});

describe('faceCheck', () => {
  it('loads the MediaPipe detector and returns the boxes as text; the mask is optional', () => {
    const g = faceCheck({ image: 'u.png' });
    expect(inputs(g, 'det').model_name).toBe(MODELS.mediapipeFace);
    expect(inputs(g, 'lm')).toEqual({ face_detection_model: ['det', 0], image: ['img', 0], detector_variant: 'both', num_faces: 5, min_confidence: 0.5, missing_frame_fallback: 'empty' });
    expect(g[FACE_CHECK_OUTPUTS.bboxes]).toMatchObject({ class_type: 'PreviewAny', inputs: { source: ['lm', 1] } });
    expect(g[FACE_CHECK_OUTPUTS.mask]).toBeUndefined();
    expectWired(g);
    const m = faceCheck({ image: 'u.png', mask: true, numFaces: 99, minConfidence: 2 });
    expect(inputs(m, 'lm')).toMatchObject({ num_faces: 16, min_confidence: 1 });
    expect(inputs(m, 'mask')).toEqual({ face_landmarks: ['lm', 0], regions: 'all' });
    expect(inputs(m, FACE_CHECK_OUTPUTS.mask).images).toEqual(['m2i', 0]);
    expectWired(m);
  });
});

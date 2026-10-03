import { describe, expect, it } from 'vitest';
import { FACE_CHECK_OUTPUTS, MODELS, SECONDARY_MATERIAL, SECONDARY_SPEC, faceCheck, isSecondaryMaterialKind, portraitCrop, qwenEdit, qwenSecondary, secondaryPrompt, workflowVersion, type Graph } from '@/server/workflows';

const inputs = (g: Graph, id: string) => g[id].inputs as Record<string, unknown>;
const nodesOf = (g: Graph, cls: string) => Object.entries(g).filter(([, n]) => n.class_type === cls).map(([id]) => id);
/** Every link must point at an existing node: ComfyUI rejects a dangling link before anything runs. */
const expectWired = (g: Graph) => {
  for (const [id, n] of Object.entries(g)) for (const [k, v] of Object.entries(n.inputs)) {
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'number') expect(g[v[0] as string], `${id}.${k} → ${v[0]}`).toBeDefined();
  }
};

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
    expect(nodesOf(g, 'LoraLoaderModelOnly')).toEqual([]);
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

describe('secondary material (contract v2: one pass from the canonical image, on request)', () => {
  it('draws each kind from the canonical image alone, in quality mode, at its own size', () => {
    for (const kind of SECONDARY_MATERIAL) {
      const g = qwenSecondary({ canonical: 'canon.png', kind, prompt: 'p', negative: 'n', seed: 5 });
      expect(nodesOf(g, 'LoadImage')).toEqual(['img1']);
      expect(inputs(g, 'img1').image).toBe('canon.png');
      expect(inputs(g, '6')).toMatchObject({ prompt: 'p', image1: ['img1s', 0] });
      expect(inputs(g, '6').image2).toBeUndefined();
      expect(g['4']).toBeUndefined(); // no Lightning: the negative (the style's "not this medium") takes effect
      expect(inputs(g, '9')).toMatchObject({ steps: 24, cfg: 4.0, seed: 5 });
      expect(inputs(g, '8')).toMatchObject({ width: SECONDARY_SPEC[kind].width, height: SECONDARY_SPEC[kind].height });
      expect(SECONDARY_SPEC[kind].width % 16).toBe(0); expect(SECONDARY_SPEC[kind].height % 16).toBe(0);
      expect(inputs(g, '11').filename_prefix).toBe(`vewbox/secondary-${kind.toLowerCase()}`);
      expect(nodesOf(g, 'SaveImage')).toHaveLength(1);
      expectWired(g);
    }
    // one structure for every kind: one registry template versions them all
    expect(new Set(SECONDARY_MATERIAL.map((kind) => workflowVersion(qwenSecondary({ canonical: 'a.png', kind, prompt: '' })))).size).toBe(1);
  });
  it('knows exactly three kinds: no views, no sheet', () => {
    expect([...SECONDARY_MATERIAL]).toEqual(['EXPRESSION', 'OUTFIT', 'PORTRAIT']);
    for (const k of ['EXPRESSION', 'OUTFIT', 'PORTRAIT']) expect(isSecondaryMaterialKind(k)).toBe(true);
    for (const k of ['FRONT', 'SIDE', 'BACK', 'THREE_QUARTER', 'FACE', 'FULL_BODY', 'SHEET', '']) expect(isSecondaryMaterialKind(k)).toBe(false);
    expect(() => qwenSecondary({ canonical: 'a.png', kind: 'SIDE' as never, prompt: '' })).toThrow();
  });
  it('the prompt says what the kind shows, keeps the person of image 1 in the production’s medium, then the identity line', () => {
    const p = secondaryPrompt({ kind: 'EXPRESSION', style: 'CARTOON', identityLine: 'Identity: stylized 3D animated character, a man of about 62.', visual: 'VISUAL' });
    expect(p.startsWith('An expression sheet: the same head-and-shoulders face four times in a 2x2 grid')).toBe(true);
    expect(p).toContain('of the same person as in image 1, drawn as a stylized 3D animated feature-film character');
    expect(p).toContain('facial hair, glasses and every garment');
    expect(p.indexOf('Identity: stylized 3D animated character')).toBeGreaterThan(p.indexOf('image 1'));
    expect(p.indexOf('VISUAL.')).toBeGreaterThan(p.indexOf('Identity'));
    expect(p).toMatch(/no text, no labels, no props\.$/);
    expect(secondaryPrompt({ kind: 'OUTFIT', style: 'ANIME', identityLine: '' })).toContain('every garment, accessory and the footwear');
  });
  it('the close-up portrait: from the head-and-shoulders crop of the canonical image, without the garments (GPU check: else a whole figure)', () => {
    const line = 'Identity: photorealistic real person, a man of about 62; wearing an ankle-length grey dishdasha; leather slippers.';
    const p = secondaryPrompt({ kind: 'PORTRAIT', style: 'REALISTIC', identityLine: line });
    expect(p).toMatch(/^A tight head-and-shoulders close-up portrait: the frame shows only the head, the neck and the top of the shoulders/);
    expect(p).not.toContain('dishdasha'); expect(p).not.toContain('slippers'); expect(p).not.toContain('every garment');
    const crop = portraitCrop({ width: 928, height: 1664 }, { x: 0.21910112359550563, y: 0.0328125, w: 0.5842696629213483, h: 0.9453125 });
    expect(crop).toEqual({ x: 215, y: 5, width: 519, height: 649 }); // the A3 canonical image, as drawn on the GPU
    expect(crop.width / crop.height).toBeCloseTo(0.8, 2);
    expect(portraitCrop({ width: 928, height: 1664 })).toMatchObject({ y: 0, height: Math.floor(0.4 * 1664) }); // no recorded box: the top 40 %
    const g = qwenSecondary({ canonical: 'canon.png', kind: 'PORTRAIT', prompt: p, seed: 1, crop });
    expect(inputs(g, 'img1c')).toEqual({ image: ['img1', 0], x: 215, y: 5, width: 519, height: 649 });
    expect(inputs(g, 'img1s').image).toEqual(['img1c', 0]);
    expectWired(g);
    expect(qwenSecondary({ canonical: 'canon.png', kind: 'EXPRESSION', prompt: '' }).img1c).toBeUndefined();
  });
});

describe('faceCheck', () => {
  it('loads the MediaPipe detector and returns the boxes as text (no mask)', () => {
    const g = faceCheck({ image: 'u.png' });
    expect(inputs(g, 'det').model_name).toBe(MODELS.mediapipeFace);
    expect(inputs(g, 'lm')).toEqual({ face_detection_model: ['det', 0], image: ['img', 0], detector_variant: 'both', num_faces: 5, min_confidence: 0.5, missing_frame_fallback: 'empty' });
    expect(g[FACE_CHECK_OUTPUTS.bboxes]).toMatchObject({ class_type: 'PreviewAny', inputs: { source: ['lm', 1] } });
    expect(nodesOf(g, 'SaveImage')).toEqual([]);
    expect(Object.keys(FACE_CHECK_OUTPUTS)).toEqual(['bboxes']);
    expectWired(g);
    expect(inputs(faceCheck({ image: 'u.png', numFaces: 99, minConfidence: 2 }), 'lm')).toMatchObject({ num_faces: 16, min_confidence: 1 });
  });
});

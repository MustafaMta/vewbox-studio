import { describe, expect, it } from 'vitest';
import { JOYAI_DEFAULTS, JOYAI_FILES, JOYAI_MAX_REFERENCES, MODELS, joyaiEdit, workflowVersion, type Graph } from '@/server/workflows';

/** JoyAI-Image-Edit, the 2026-10-06 candidate editor (docs/research/MODEL-EVAL-2026-10.md §7): the official template's
 *  wiring (comfyui_workflow_templates 0.11.73 `image_joyai_image_edit`), core ComfyUI 0.38.1 nodes only. */
const inputs = (g: Graph, id: string) => g[id].inputs as Record<string, unknown>;
const expectWired = (g: Graph) => {
  for (const [id, n] of Object.entries(g)) for (const [k, v] of Object.entries(n.inputs)) {
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'number') expect(g[v[0] as string], `${id}.${k} → ${v[0]}`).toBeDefined();
  }
};

describe('joyaiEdit', () => {
  it('follows the official template: CFGNorm(1, pre_cfg), 40 steps, cfg 4, euler/normal, joyimage encoder', () => {
    const g = joyaiEdit({ prompt: 'p', negative: 'n', references: ['plate.png', 'person.png'], width: 1344, height: 768, seed: 7 });
    expect(inputs(g, 'unet')).toMatchObject({ unet_name: JOYAI_FILES.dit, weight_dtype: 'default' });
    expect(inputs(g, 'clip')).toMatchObject({ clip_name: JOYAI_FILES.te, type: 'joyimage' });
    expect(inputs(g, 'vae')).toMatchObject({ vae_name: JOYAI_FILES.vae });
    expect(inputs(g, 'norm')).toMatchObject({ model: ['unet', 0], strength: 1, pre_cfg: true });
    expect(inputs(g, 'sample')).toMatchObject({ model: ['norm', 0], steps: JOYAI_DEFAULTS.steps, cfg: JOYAI_DEFAULTS.cfg, sampler_name: 'euler', scheduler: 'normal', seed: 7, denoise: 1 });
    expect(inputs(g, 'latent')).toMatchObject({ width: 1344, height: 768 });
    expectWired(g);
  });
  it('gives the prompt and the negative the same pictures through the 0-based autogrow keys', () => {
    const g = joyaiEdit({ prompt: 'p', references: ['a.png', 'b.png', 'c.png'], width: 928, height: 1664 });
    for (const id of ['pos', 'neg']) {
      expect(g[id].class_type).toBe('TextEncodeJoyImageEdit');
      expect(inputs(g, id)).toMatchObject({ 'images.image0': ['img1s', 0], 'images.image1': ['img2s', 0], 'images.image2': ['img3s', 0], vae: ['vae', 0] });
      expect(inputs(g, id)['images.image3']).toBeUndefined();
    }
    expect(inputs(g, 'neg').prompt).toBe('');
  });
  it('cuts a face crop in the graph and scales it square', () => {
    const g = joyaiEdit({ prompt: 'p', references: ['u.png', { image: 'u.png', crop: { x: 10.4, y: 20, width: 200, height: 240 }, square: 1024 }], width: 928, height: 1664 });
    expect(inputs(g, 'img2c')).toMatchObject({ image: ['img2', 0], x: 10, y: 20, width: 200, height: 240 });
    expect(g.img2s.class_type).toBe('ImageScale');
    expect(inputs(g, 'img2s')).toMatchObject({ image: ['img2c', 0], width: 1024, height: 1024 });
    expect(g.img1s.class_type).toBe('ImageScaleToTotalPixels');
    expectWired(g);
  });
  it('refuses more than six pictures and keeps a stable version', () => {
    expect(() => joyaiEdit({ prompt: 'p', references: Array.from({ length: JOYAI_MAX_REFERENCES + 1 }, (_, k) => `${k}.png`), width: 64, height: 64 })).toThrow();
    const a = joyaiEdit({ prompt: 'a', references: ['x.png'], width: 1344, height: 768, seed: 1 });
    const b = joyaiEdit({ prompt: 'b', references: ['y.png'], width: 1344, height: 768, seed: 2 });
    expect(workflowVersion(a)).toBe(workflowVersion(b));
  });
  it('is a candidate: its files stay out of MODELS (the registry lists MODELS as the weights the studio uses)', () => {
    expect(Object.values(MODELS)).not.toContain(JOYAI_FILES.dit);
    expect(Object.values(MODELS)).not.toContain(JOYAI_FILES.vae);
  });
});

import { describe, expect, it } from 'vitest';
import { H3_MAX_FRAMES, H3_MIN_FRAMES, h3AlignFrames, h3FrameCount, h3GuideClipFrames, h3GuideFits, minimaxH3Video } from '@/server/workflows/minimax-h3';
import { workflowVersion } from '@/server/workflows';

/** The MiniMax H3 graph builder against ComfyUI v0.38.1 `nodes_minimax_h3.py` and the official templates
 *  (docs/research/MINIMAX-CONTINUITY.md §1): frames snap UP to 17k+5 inside the trained range, guide clips snap DOWN
 *  to 5/22/39…, a continuation guide carries its clip's sound, and the reference graph never drops a first/last frame. */

/** Python's template expression `n + (5 - n % 17) % 17`, where % is never negative. */
const pyAlign = (n: number) => { const mod = (a: number, m: number) => ((a % m) + m) % m; return n + mod(5 - mod(n, 17), 17); };
/** ComfyUI's align_frame_count. */
const comfyAlign = (n: number) => { let m = n; while (m % 17 !== 5) m++; return m; };
/** the old port (JS % on a negative number): it snapped DOWN by up to 11 frames */
const oldCount = (s: number) => { const raw = Math.max(5, Math.round(s * 24)); return raw + ((5 - (raw % 17)) % 17); };

describe('frame count (P0.1)', () => {
  it('snaps up exactly like the node and the template, for every frame count', () => {
    for (let n = 5; n <= 400; n++) {
      expect(h3AlignFrames(n), `n=${n}`).toBe(pyAlign(n));
      expect(h3AlignFrames(n), `n=${n}`).toBe(comfyAlign(n));
    }
  });
  it('every duration 1–15 s gives a grid count inside the trained range, never fewer frames than asked', () => {
    for (let s = 1; s <= 15; s += 0.25) {
      const f = h3FrameCount(s);
      expect(f % 17, `${s} s`).toBe(5);
      expect(f).toBeGreaterThanOrEqual(H3_MIN_FRAMES);
      expect(f).toBeLessThanOrEqual(H3_MAX_FRAMES);
      expect(f).toBeGreaterThanOrEqual(Math.min(H3_MAX_FRAMES, Math.round(s * 24)));
    }
    expect(h3FrameCount(15)).toBe(362);
    expect(h3FrameCount(40)).toBe(362);
    expect(h3FrameCount(1)).toBe(124);
  });
  it('fixes the measured regressions: 4 s was 90 frames (below the trained range), 9 s came back 8.708 s, 11 s 10.833 s', () => {
    expect(oldCount(4)).toBe(90); expect(h3FrameCount(4)).toBe(124);
    expect(oldCount(9)).toBe(209); expect(h3FrameCount(9)).toBe(226); expect(h3FrameCount(9) / 24).toBeGreaterThanOrEqual(9);
    expect(oldCount(11)).toBe(260); expect(h3FrameCount(11)).toBe(277); expect(h3FrameCount(11) / 24).toBeGreaterThanOrEqual(11);
    for (const s of [4, 6, 7, 9, 11, 12, 13, 14]) expect(h3FrameCount(s), `${s} s`).toBeGreaterThan(oldCount(s));
  });
  it('guide clips snap down to 5, 22, 39 … and fewer than 5 frames is one still; a guide must fit the clip', () => {
    expect([1, 4, 5, 21, 22, 30, 38, 39, 60].map(h3GuideClipFrames)).toEqual([1, 1, 5, 5, 22, 22, 22, 39, 56]);
    expect(h3GuideFits(0, 22, 124)).toBe(true);
    expect(h3GuideFits(110, 22, 124)).toBe(false);
    expect(h3GuideFits(-1, 1, 124)).toBe(true);
    expect(h3GuideFits(-200, 1, 124)).toBe(false);
  });
});

describe('graph shapes', () => {
  it('FL2VA: first and last frame are the node inputs; 8-step turbo; 5 s is 124 frames', () => {
    const g = minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5, seed: 1, firstFrame: 'a.png', lastFrame: 'b.png' });
    expect(g['7'].class_type).toBe('MiniMaxH3ImageToVideo');
    expect(g['7'].inputs).toMatchObject({ first_frame: ['ff', 0], last_frame: ['lf', 0], length: 124 });
    expect(g['10'].inputs).toMatchObject({ steps: 8, scheduler: 'simple' });
    expect(Object.values(g).some((n) => n.class_type === 'MiniMaxH3AddGuide')).toBe(false);
  });

  it('Ref2VA: pictures in connection order; the opening frame is anchored at 0 and the ending frame at −1 (never dropped)', () => {
    const g = minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5, referenceImages: ['canon.png', 'plate.png', 'open.png'], firstFrame: 'open.png', lastFrame: 'end.png', scheduler: 'beta', refImageSize: 'max' });
    expect(g['7'].class_type).toBe('MiniMaxH3ReferenceToVideo');
    expect(g['7'].inputs).toMatchObject({ 'ref_images.ref_image_0': ['ri0', 0], 'ref_images.ref_image_1': ['ri1', 0], 'ref_images.ref_image_2': ['ri2', 0], ref_image_size: 'max' });
    expect(g['7'].inputs.first_frame).toBeUndefined();
    expect(g.ri0.inputs.image).toBe('canon.png');
    expect(g.g0).toMatchObject({ class_type: 'MiniMaxH3AddGuide', inputs: { frame_idx: 0, image: ['g0i', 0], vae: ['3', 0], positive: ['7', 0], latent: ['7', 1] } });
    expect(g.g0i.inputs.image).toBe('open.png');
    expect(g.g1).toMatchObject({ class_type: 'MiniMaxH3AddGuide', inputs: { frame_idx: -1, image: ['g1i', 0], positive: ['g0', 0] } });
    expect(g['11'].inputs.conditioning).toEqual(['g1', 0]);
    expect(g['10'].inputs).toMatchObject({ steps: 4, scheduler: 'beta' });
  });

  it('a continuation guide anchors the tail clip AND its own sound in one AddGuide (P0.2)', () => {
    const g = minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 6, referenceImages: ['canon.png', 'plate.png'], guides: [{ frameIdx: 0, image: 'tail.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audio: 'line.wav' }] });
    expect(g.g0v).toMatchObject({ class_type: 'LoadVideo', inputs: { file: 'tail.mov' } });
    expect(g.g0c).toMatchObject({ class_type: 'GetVideoComponents', inputs: { video: ['g0v', 0] } });
    // GetVideoComponents: output 0 = images, output 1 = audio
    expect(g.g0.inputs).toMatchObject({ frame_idx: 0, image: ['g0c', 0], audio: ['g0c', 1], vae: ['3', 0], audio_vae: ['4', 0] });
    expect(g.g1.inputs).toMatchObject({ frame_idx: 22, audio: ['g1a', 0], audio_vae: ['4', 0], positive: ['g0', 0] });
    expect(g.g1.inputs.image).toBeUndefined();
    // the old graph (frames only) is a different workflow version
    const framesOnly = minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 6, referenceImages: ['canon.png', 'plate.png'], guides: [{ frameIdx: 0, image: 'tail.mov', imageIsVideo: true }, { frameIdx: 22, audio: 'line.wav' }] });
    expect(framesOnly.g0.inputs.audio).toBeUndefined();
    expect(workflowVersion(framesOnly)).not.toBe(workflowVersion(g));
  });

  it('an explicit audio file on a clip guide wins over the clip’s own sound (a music video’s song under the tail)', () => {
    const g = minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 6, guides: [{ frameIdx: 0, image: 'tail.mov', imageIsVideo: true, audio: 'song-tail.wav', audioFromVideo: true }] });
    expect(g.g0.inputs.audio).toEqual(['g0a', 0]);
    expect(g.g0a).toMatchObject({ class_type: 'LoadAudio', inputs: { audio: 'song-tail.wav' } });
  });

  it('no turbo: 20 steps by default, or the steps asked for; the area cap holds', () => {
    const g = minimaxH3Video({ prompt: 'p', width: 1920, height: 1080, seconds: 5, turbo: false, referenceImages: ['a.png'] });
    expect(g['5']).toBeUndefined();
    expect(g['10'].inputs.steps).toBe(20);
    const w = g['7'].inputs.width as number; const h = g['7'].inputs.height as number;
    expect(w * h).toBeLessThanOrEqual(768 * 1344);
    expect(w % 32).toBe(0); expect(h % 32).toBe(0);
    expect(minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5, turbo: false, steps: 12, referenceImages: ['a.png'] })['10'].inputs.steps).toBe(12);
  });
});

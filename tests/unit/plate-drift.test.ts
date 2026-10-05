import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PLATE_DRIFT, centredMeanAbsDiff, identityAppliedChecks, judgePlateDrift, measurePlateDrift } from '@/server/media/plate-drift';
import { ffmpeg } from '@/server/media/ffmpeg';

/** THE PLACE DRIFT CHECK (src/server/media/plate-drift.ts): the take's first kept frame against its canonical plate,
 *  on the join QA's measure (64×36 grey, mean absolute luma difference), exposure-normalised. Proven here on synthetic
 *  pictures and on ffmpeg-made ones: the same place re-rendered (shifted exposure, a figure in front, compression)
 *  stays under the provisional threshold, another place goes over it. The numbers below are what the threshold's note
 *  cites; a real take's distribution needs a generation run. */

const flat = (v: number) => new Uint8Array(64 * 36).fill(v);
const ramp = (f: (x: number, y: number) => number) => { const a = new Uint8Array(64 * 36); for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) a[y * 64 + x] = Math.max(0, Math.min(255, Math.round(f(x, y)))); return a; };

describe('judgePlateDrift (pure)', () => {
  it('an exposure change alone is not drift; a different structure is', () => {
    const plate = ramp((x, y) => 40 + 2 * x + y);
    const brighter = ramp((x, y) => 70 + 2 * x + y);
    expect(centredMeanAbsDiff(plate, brighter)).toBeCloseTo(0, 5);
    const same = judgePlateDrift(brighter, plate, { plateAssetId: 'plate-dusk', frame: 22 });
    expect(same).toMatchObject({ matches: true, meanDiff: 0, rawMeanDiff: 30, threshold: PLATE_DRIFT.maxMeanDiff, frame: 22, plateAssetId: 'plate-dusk' });
    expect(same.detail).toMatch(/the take's frame 22 matches the plate plate-dusk: 0\.00 luma levels apart after exposure \(raw 30\.00\), allowed 36/);
    const mirrored = judgePlateDrift(ramp((x, y) => 40 + 2 * (63 - x) + y), plate, { plateAssetId: 'plate-dusk', frame: 0 });
    expect(mirrored.matches).toBe(false);
    expect(mirrored.meanDiff).toBeGreaterThan(PLATE_DRIFT.maxMeanDiff);
    expect(mirrored.detail).toMatch(/review, not rejected/);
    expect(judgePlateDrift(flat(10), flat(200), { plateAssetId: 'p', frame: 0 })).toMatchObject({ meanDiff: 0, rawMeanDiff: 190, matches: true });
  });

  it('the identity check reads the identity rule’s report on the request: applied, missing, waived', () => {
    expect(identityAppliedChecks({ ok: true, characters: [{ characterId: 'a', name: 'Ada', assetId: 'canon-a', picture: 1, ok: true }, { characterId: 'b', name: 'Bo', assetId: 'canon-b', picture: 2, ok: true }] })).toEqual({ ok: true, characters: [{ characterId: 'a', assetId: 'canon-a', picture: 1, applied: true, why: undefined }, { characterId: 'b', assetId: 'canon-b', picture: 2, applied: true, why: undefined }], detail: '2 of 2 present character(s) conditioned on their canonical image (a: <Picture 1> = canon-a; b: <Picture 2> = canon-b)' });
    expect(identityAppliedChecks({ ok: false, characters: [{ characterId: 'a', name: 'Ada', ok: false, why: 'Ada has no canonical image' }] })).toMatchObject({ ok: false, characters: [{ applied: false, why: 'Ada has no canonical image' }] });
    expect(identityAppliedChecks({ ok: true, lowered: 'hosted frame mode', characters: [{ characterId: 'a', name: 'Ada', ok: true }] })).toMatchObject({ ok: true, detail: 'waived: hosted frame mode' });
    expect(identityAppliedChecks({ ok: true, characters: [] }).detail).toBe('no character in the shot');
  });
});

describe('measurePlateDrift on ffmpeg-made pictures', () => {
  it('the same place re-rendered (exposure, blur, reframed, a figure in front, compressed) matches; other pictures do not — the ranges the threshold note cites', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-drift-'));
    // a take: 30 frames of a picture through a filter, H.264 CRF 23
    const takeOf = async (img: string, name: string, vf: string) => { const f = path.join(dir, `${name}.mp4`); await ffmpeg(['-y', '-v', 'error', '-loop', '1', '-i', img, '-t', '1.25', '-r', '24', '-vf', `${vf},format=yuv420p`, '-c:v', 'libx264', '-crf', '23', f]); return f; };
    const still = async (name: string, src: string) => { const f = path.join(dir, `${name}.png`); await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', src, '-frames:v', '1', f]); return f; };
    try {
      const plate = await still('plate', 'testsrc2=s=640x360:d=1');
      const same: Record<string, string> = {
        clean: 'null', exposure: 'eq=brightness=0.08', blur: 'gblur=sigma=4', reframed: 'crop=600:338:20:11,scale=640:360',
        'grey figure': 'drawbox=x=120:y=90:w=90:h=260:color=gray@1:t=fill',
        'all together': 'eq=brightness=0.08,crop=600:338:20:11,scale=640:360,drawbox=x=120:y=90:w=90:h=260:color=gray@1:t=fill',
        'black figure (hard case)': 'drawbox=x=120:y=90:w=90:h=260:color=black@1:t=fill',
      };
      const others: Record<string, string> = { mandelbrot: 'mandelbrot=s=640x360', 'smpte bars': 'smptehdbars=s=640x360', 'rgb test': 'rgbtestsrc=s=640x360' };
      const sameD: number[] = []; const otherD: number[] = [];
      for (const [k, vf] of Object.entries(same)) {
        const r = await measurePlateDrift(await takeOf(plate, `same-${sameD.length}`, vf), 22, plate, 'plate-1');
        console.log(`[plate-drift] same place, ${k}: ${r.meanDiff} (raw ${r.rawMeanDiff})`);
        expect(r, k).toMatchObject({ frame: 22, matches: true, plateAssetId: 'plate-1' });
        sameD.push(r.meanDiff);
      }
      for (const [k, src] of Object.entries(others)) {
        const r = await measurePlateDrift(await takeOf(await still(`o-${otherD.length}`, src), `other-${otherD.length}`, 'null'), 22, plate, 'plate-1');
        console.log(`[plate-drift] another picture, ${k}: ${r.meanDiff} (raw ${r.rawMeanDiff})`);
        expect(r.matches, k).toBe(false);
        otherD.push(r.meanDiff);
      }
      // the threshold sits between the two ranges, with room on both sides
      expect(Math.max(...sameD)).toBeLessThan(PLATE_DRIFT.maxMeanDiff - 5);
      expect(Math.min(...otherD)).toBeGreaterThan(PLATE_DRIFT.maxMeanDiff + 10);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});

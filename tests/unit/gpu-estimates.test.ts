import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCKER_VM_RAM_MB, IMAGE_VRAM_MB, VIDEO_H3_HOST_RAM_MB, VIDEO_H3_VRAM_MB } from '@/server/gpu/estimates';

/** THE IMAGE AND VIDEO LEASE ESTIMATES ARE THE MEASURED PEAKS (docs/research/GPU-STAGING-2026-10.md §6, MODEL-EVAL
 *  open item 8): read from the measured table itself, so an estimate below a recorded peak fails here. */

const ROOT = process.cwd();
const doc = fs.readFileSync(path.join(ROOT, 'docs/research/GPU-STAGING-2026-10.md'), 'utf8');
const section6 = doc.slice(doc.indexOf('## 6. Measured'));
/** the highest "**a–b GB**" card peak of the §6 rows whose label starts with `family`, in MB (the doc's GB = 1000 MB) */
function peakMb(rowPrefix: RegExp): number {
  const rows = section6.split('\n').filter((l) => rowPrefix.test(l));
  expect(rows.length).toBeGreaterThan(0);
  return Math.max(...rows.map((r) => { const m = /\*\*([\d.]+)(?:–([\d.]+))? GB\*\*/.exec(r.split('|')[2])!; return Math.round(Number(m[2] ?? m[1]) * 1000); }));
}

describe('lease estimates for ComfyUI image and H3 video', () => {
  it('IMAGE is the highest measured image peak (Qwen-Image-Edit-2511 30.4 GB; 2512 29.8; klein 20.1)', () => {
    const peak = peakMb(/^\| IMAGE — (Qwen-Image-2512|Qwen-Image-Edit-2511|FLUX\.2 klein)/);
    expect(peak).toBe(30400);
    expect(IMAGE_VRAM_MB).toBe(peak);
  });

  it('VIDEO (H3) is its measured peak, 31.9 GB, and fits the card', () => {
    const peak = peakMb(/^\| VIDEO — MiniMax H3/);
    expect(peak).toBe(31900);
    expect(VIDEO_H3_VRAM_MB).toBe(peak);
    expect(VIDEO_H3_VRAM_MB).toBeLessThanOrEqual(32607);
  });

  it('H3 host RAM: 46.5 GiB of the 78.5 GiB Docker VM (2026-10-06, both tiers) — ≈ 32 GiB of headroom', () => {
    expect(section6).toMatch(/46\.0–46\.5 GiB of 78\.5/);
    expect(VIDEO_H3_HOST_RAM_MB).toBe(Math.round(46.5 * 1024));
    const headroomGiB = (DOCKER_VM_RAM_MB - VIDEO_H3_HOST_RAM_MB) / 1024;
    expect(headroomGiB).toBeGreaterThan(31);
    expect(headroomGiB).toBeLessThan(33);
  });

  it('the handlers lease with these estimates (no literal left behind)', () => {
    const images = fs.readFileSync(path.join(ROOT, 'src/worker/handlers/images.ts'), 'utf8');
    const take = fs.readFileSync(path.join(ROOT, 'src/worker/handlers/take.ts'), 'utf8');
    expect(images).toMatch(/import \{ IMAGE_VRAM_MB \} from '@\/server\/gpu\/estimates'/);
    expect(images).toMatch(/ctx\.gpu\('IMAGE', IMAGE_VRAM_MB,/);
    expect(images).not.toMatch(/IMAGE_VRAM_MB = \d/);
    expect(take).toMatch(/ctx\.gpu\('VIDEO', VIDEO_H3_VRAM_MB,/);
    expect(take).not.toMatch(/ctx\.gpu\('VIDEO', \d/);
  });
});

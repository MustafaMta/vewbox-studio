/* The framing crop on drawn frames (offline check, Tea 1.3): MediaPipe face box in ComfyUI → framingCropFromFace →
 * ffmpeg crop + lanczos scale to 1344×768, exactly as images.ts framedToShot does it.
 *   scripts/gpu-hold.ts --priority normal IMAGE 30400 -- pnpm exec tsx … scripts/frame-crop-check.ts <png> [png …] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { faceCheck, FACE_CHECK_OUTPUTS, parseFaceBoxes } from '@/server/workflows';
import { framingCropFromFace } from '@/server/story/prompts';
import type { Framing } from '@/domain/vocabulary';
import { installHoldGuard, track, settled, cancelOurs } from './lib/comfy-hold-guard';

const run = promisify(execFile);
const framing = (process.env.FRAMING ?? 'MEDIUM_CLOSE_UP') as Framing;
const EVID = path.join(process.cwd(), 'docs/evidence/model-eval-2026-10/frame-close');

async function main() {
  installHoldGuard();
  const out: Record<string, unknown> = {};
  for (const file of process.argv.slice(2)) {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
    const [width, height] = stdout.trim().split(',').map(Number);
    const r = await comfy.run(faceCheck({ image: await comfy.uploadInput(file), numFaces: 3 }), { onSubmitted: track }); settled(r.promptId);
    const faces = parseFaceBoxes(comfy.textOutput(r.outputs, FACE_CHECK_OUTPUTS.bboxes));
    const crop = faces[0] ? framingCropFromFace(framing, faces[0], { width, height }) : undefined;
    const name = path.basename(file, '.png');
    if (crop) {
      const dst = file.replace(/\.png$/, '-framed.png');
      await run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1344:768:flags=lanczos`, '-frames:v', '1', dst]);
      await run('ffmpeg', ['-y', '-v', 'error', '-i', dst, '-vf', 'scale=-2:384', '-q:v', '4', path.join(EVID, `${name}-framed.jpg`)]);
    }
    out[name] = { size: { width, height }, faces, crop: crop ?? null };
    console.log(name, JSON.stringify(out[name]));
  }
  await fs.writeFile(path.join(EVID, 'framing-crop.json'), JSON.stringify({ framing, frames: out }, null, 2));
}
main().catch(async (e) => { console.error(e); await cancelOurs('error'); process.exit(1); });

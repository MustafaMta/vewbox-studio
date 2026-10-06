/* CLOSE-SHOT OPENING FRAME — offline proof (acceptance 2026-10-06, Tea 1.3: Qwen-Image-Edit-2511 kept the plate's WIDE
 * composition for a medium close-up and drew a vendor named off-screen). Same inputs as the failed frame (the plate
 * gen-02b5d1949e4d7c60a384, Clara's canonical image gen-45ec75f1d454ec2f36d9, the shot's prompt), the production's own
 * edit graph (`qwenEdit`, Lightning 4 steps as `draw()` runs it), three arms, two seeds:
 *   V0  as shipped: image 1 = the whole plate, image 2 = the canonical image (prompt with the off-screen phrase cut);
 *   VB  image 1 = the canonical image cut to the framing (`personCropFor`), image 2 = the whole plate as the place;
 *   VC  as VB with the plate cut to the shot's distance (`plateCropFor`) as image 2.
 * Measured: SFace against the canonical image (asr /qa/identity), the people count by eye, the framing by eye.
 *   scripts/gpu-hold.ts IMAGE 30400 -- pnpm exec tsx … scripts/frame-close-eval.ts
 * Originals var/model-eval/frame-close/ (gitignored); results docs/evidence/model-eval-2026-10/frame-close/results.json. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { qwenEdit } from '@/server/workflows';
import { plateCropFor, personCropFor, stillFrameAction } from '@/server/story/prompts';
import { installHoldGuard, track, settled, cancelOurs, assertIdle } from './lib/comfy-hold-guard';

const run = promisify(execFile);
const ROOT = process.cwd();
const LIB = 'D:/volexar-studio/volexar-studio/var/library/image/2026/10';
const PLATE = path.join(LIB, 'gen-02b5d1949e4d7c60a384.a1.png');
const CANON = path.join(LIB, 'gen-45ec75f1d454ec2f36d9.a1.png');
const OUT = path.join(ROOT, 'var/model-eval/frame-close');
const EVID = path.join(ROOT, 'docs/evidence/model-eval-2026-10/frame-close');
const NEG = 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head';
const PROMPT_FILE = process.env.FRAME_PROMPT_FILE ?? '';

async function size(file: string) { const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]); const [w, h] = stdout.trim().split(',').map(Number); return { width: w, height: h }; }
async function sface(picture: string): Promise<number | null | string> {
  const clip = picture.replace(/\.png$/, '.still.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', picture, '-t', '1', '-r', '2', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '12', clip]);
  const form = new FormData();
  form.append('video', new Blob([await fs.readFile(clip)]), 'still.mp4');
  form.append('references', new Blob([await fs.readFile(CANON)]), 'canon.png');
  form.append('characters', JSON.stringify(['clara'])); form.append('sample_fps', '1');
  const r = await fetch(`${process.env.ASR_URL ?? 'http://127.0.0.1:8030'}/qa/identity`, { method: 'POST', body: form });
  await fs.rm(clip, { force: true });
  if (!r.ok) return `error ${r.status}`;
  const j = await r.json() as { characters: { clara: { summary: { median: number | null } | null } } };
  return j.characters.clara.summary?.median ?? null;
}

async function main() {
  installHoldGuard();
  await fs.mkdir(OUT, { recursive: true }); await fs.mkdir(EVID, { recursive: true });
  for (let k = 0; ; k++) { try { await assertIdle(); break; } catch (e) { if (k >= 30) throw e; await new Promise((r) => setTimeout(r, 10_000)); } }
  const original = (await fs.readFile(PROMPT_FILE, 'utf8')).replace(/^\uFEFF/, '').trim();
  // the moment without the off-screen vendor; the reference notes are written per arm
  const head = original.slice(0, original.indexOf('Moment:'));
  const tail = original.slice(original.indexOf('Light:'), original.indexOf(' Use the reference pictures:'));
  const momentOld = original.slice(original.indexOf('Moment:') + 8, original.indexOf('Light:')).trim().replace(/\.+$/, '');
  const moment = stillFrameAction(momentOld, ['Abu Haidar']).replace(/[.;]\s*$/, '');
  const person = original.slice(original.indexOf('image 2 is the person') + 'image 2 is the person'.length, original.indexOf(' — keep the face')).trim();
  const plateSize = await size(PLATE); const canonSize = await size(CANON);
  const plateUp = await comfy.uploadInput(PLATE); const canonUp = await comfy.uploadInput(CANON);
  const framing = 'MEDIUM_CLOSE_UP' as const;
  const personNote = `image 1 is the person ${person}, framed as this shot frames them — keep the face, hair, skin and wardrobe exactly`;
  const arms = {
    V0: { refs: [plateUp, canonUp], crops: [undefined, undefined], notes: `image 1 is the place (keep its architecture, materials, colours and light) seen from much further away than this shot: do not copy its framing; image 2 is the person ${person} — keep the face, hair, skin and wardrobe exactly; exactly one person is in the picture, the person of image 2, and nobody else` },
    VB: { refs: [canonUp, plateUp], crops: [personCropFor(framing, canonSize), undefined], notes: `${personNote}; image 2 is the place behind them (keep its architecture, materials, colours and light, soft in the background; not its framing); exactly one person is in the picture, the person of image 1, and nobody else` },
    VC: { refs: [canonUp, plateUp], crops: [personCropFor(framing, canonSize), plateCropFor(framing, plateSize)], notes: `${personNote}; image 2 is the place right behind them (keep its architecture, materials, colours and light, soft in the background); exactly one person is in the picture, the person of image 1, and nobody else` },
  } as const;
  const results: Record<string, unknown> = { inputs: { plate: PLATE, canonical: CANON, framing, plateSize, canonSize, momentOld, moment } };
  for (const seed of [353358090, 353358091]) for (const [arm, a] of Object.entries(arms).filter(([k]) => !process.env.FRAME_ARMS || process.env.FRAME_ARMS.split(',').includes(k))) {
    const tag = process.env.FRAME_TAG ?? '';
    const id = `${arm}${tag}-s${seed}`;
    const prompt = `${head}Moment: ${moment}. ${tail} Use the reference pictures: ${a.notes}.`.replace(/\s+/g, ' ');
    const g = qwenEdit({ prompt, negative: NEG, references: [...a.refs], width: 1344, height: 768, seed, quality: false, crops: [...a.crops], filenamePrefix: `vewbox/eval/frame-close-${id}` });
    const t0 = Date.now();
    try {
      const r = await comfy.run(g, { timeoutMs: 20 * 60_000, onSubmitted: track }); settled(r.promptId);
      const out = comfy.firstOutput(r.outputs, 'images'); if (!out) throw new Error('no image');
      const file = path.join(OUT, `${id}.png`); await fs.writeFile(file, await comfy.view(out));
      await run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', 'scale=-2:384', '-q:v', '4', path.join(EVID, `${id}.jpg`)]);
      results[id] = { arm, seed, crops: a.crops, engineMs: r.engineMs, wallMs: Date.now() - t0, sface: await sface(file), prompt };
      console.log(id, JSON.stringify({ engineMs: r.engineMs, sface: (results[id] as { sface: unknown }).sface }));
    } catch (e) { await cancelOurs('item failed'); results[id] = { arm, seed, error: String((e as Error).message ?? e) }; console.log(id, 'ERROR', (e as Error).message); }
    await fs.writeFile(path.join(EVID, 'results.json'), JSON.stringify(results, null, 2));
  }
}
main().catch(async (e) => { console.error(e); await cancelOurs('error'); process.exit(1); });

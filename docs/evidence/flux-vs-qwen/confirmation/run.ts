/** FLUX.2 [klein] 4B for Image Reference — the confirmation before the default flips (docs/research/FLUX-VS-QWEN.md
 *  §6.7). Straight through ComfyUI, not through the shared worker (no studio job active, ComfyUI queue empty, the voice
 *  / ASR / voice-design services unloaded first). The SHIPPING builders are used (src/server/workflows/canonical-image.ts:
 *  referenceReadGraph, identityLineFromDescription, kleinReferenceCanonical + kleinReferencePrompt, and for comparison
 *  qwenReferenceCanonical + referenceCanonicalPrompt), so what is confirmed is what the handler runs.
 *
 *  Uploads (all generated stand-ins, no real people): the six of the A/B (var/flux-vs-qwen/fixtures) and six more drawn
 *  here (phase `prep`, Qwen-Image-2512 Lightning): a head-scarf head shot, a waist-up man with a moustache only and
 *  glasses, a full-length teenager, a CG cartoon girl (a drawing input), a curly head shot with a short beard, a bust
 *  with red glasses. Phases:
 *    prep    draw the six new stand-ins
 *    read    MediaPipe face box + Qwen3.5-4B description → identity line, exactly as the worker reads an upload
 *    klein   klein redraw with the face crop (the handler's first attempt) and without it (its retry), seeds 970007/970008
 *    qwen    Edit-2511 with the face crop, seed 970007, for the six new uploads (the A/B has the first six)
 *    sheets  one contact sheet per upload (upload | klein face s0, s1 | klein upload-only s0, s1 | qwen)
 *  Results: results.json (+ JPEG sheets here); PNG originals in D:/volexar-studio/volexar-studio/var/flux-vs-qwen/confirmation.
 *
 *    pnpm exec tsx docs/evidence/flux-vs-qwen/confirmation/run.ts --phases prep,read,klein,qwen,sheets */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Style } from '@/domain/vocabulary';
import * as comfy from '@/server/providers/comfy';
import { grayPixels } from '@/server/media/image-check';
import { fullBodyInFrame } from '@/server/media/figure-check';
import { styleDirection } from '@/server/story/style';
import {
  CANONICAL_OUTPUT, REFERENCE_DESCRIBE_KEY, REFERENCE_FACE_OUTPUTS, faceCropRect, identityLineFromDescription, kleinReferenceCanonical, kleinReferencePrompt,
  negativeFor, parseCharacterDescription, parseFaceBoxes, qwenReferenceCanonical, qwenTextToImage, referenceCanonicalPrompt, referenceReadGraph, vlmOutput,
  type CharacterDescription, type PxRect,
} from '@/server/workflows';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL ??= 'http://127.0.0.1:8188';
const execFileP = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PHASES = new Set((arg('phases') ?? 'prep,read,klein,qwen,sheets').split(/[,\s]+/).filter(Boolean));
const HERE = path.resolve('docs/evidence/flux-vs-qwen/confirmation');
const ROOT = 'D:/volexar-studio/volexar-studio/var/flux-vs-qwen';
const PNG = `${ROOT}/confirmation`;
const SEEDS = [970007, 970008];

interface Upload { key: string; file: string; style: Style; kind: string; prompt?: string; size?: [number, number] }
const UPLOADS: Upload[] = [
  { key: 'ir1-headshot-to-cartoon', file: `${ROOT}/fixtures/upload-photo-headshot.png`, style: 'CARTOON', kind: 'photo head shot' },
  { key: 'ir2-photo-to-realistic', file: `${ROOT}/fixtures/upload-photo-fullbody.png`, style: 'REALISTIC', kind: 'photo bust' },
  { key: 'ir3-anime-to-anime', file: `${ROOT}/fixtures/upload-anime.png`, style: 'ANIME', kind: 'anime drawing' },
  { key: 'ix1-bust-photo-to-realistic', file: `${ROOT}/fixtures/ix1-bust-photo-to-realistic.png`, style: 'REALISTIC', kind: 'photo bust' },
  { key: 'ix2-waist-photo-to-cartoon', file: `${ROOT}/fixtures/ix2-waist-photo-to-cartoon.png`, style: 'CARTOON', kind: 'photo waist-up' },
  { key: 'ix3-bust-photo-to-anime', file: `${ROOT}/fixtures/ix3-bust-photo-to-anime.png`, style: 'ANIME', kind: 'photo bust' },
  { key: 'ic1-scarf-headshot-to-realistic', file: `${PNG}/fixtures/ic1.png`, style: 'REALISTIC', kind: 'photo head shot', size: [1024, 1280], prompt: 'Photograph, head-and-shoulders portrait of a woman of about 28 wearing a dark green head scarf that covers her hair and a cream blouse, no glasses, calm expression, soft window light, plain light grey background, natural skin texture.' },
  { key: 'ic2-moustache-waist-to-cartoon', file: `${PNG}/fixtures/ic2.png`, style: 'CARTOON', kind: 'photo waist-up', size: [1024, 1280], prompt: 'Photograph, waist-up portrait of a man of about 65 with a thick grey moustache and a clean-shaven chin, round tortoiseshell glasses, short grey hair, a navy cardigan over a white shirt, plain grey studio background, natural light.' },
  { key: 'ic3-fullbody-teen-to-anime', file: `${PNG}/fixtures/ic3.png`, style: 'ANIME', kind: 'photo full length', size: [832, 1472], prompt: 'Photograph, full-length photo of a teenage boy of about 16 standing, short black hair, a red hoodie, black track pants with white side stripes, white sneakers, plain white studio background, whole body from head to feet.' },
  { key: 'ic4-cg-girl-to-cartoon', file: `${PNG}/fixtures/ic4.png`, style: 'CARTOON', kind: '3D CG drawing, waist-up', size: [1024, 1280], prompt: '3D animated feature-film character render, waist-up, a girl of about 9 with two curly brown pigtails and freckles, a yellow raincoat over a striped shirt, big smile, plain pale blue background.' },
  { key: 'ic5-curly-headshot-to-anime', file: `${PNG}/fixtures/ic5.png`, style: 'ANIME', kind: 'photo head shot', size: [1024, 1024], prompt: 'Photograph, close head shot of a man of about 25 with curly brown hair and a short trimmed beard, no glasses, a grey t-shirt, plain beige background, soft light.' },
  { key: 'ic6-bob-bust-to-realistic', file: `${PNG}/fixtures/ic6.png`, style: 'REALISTIC', kind: 'photo bust', size: [1024, 1280], prompt: 'Photograph, chest-up portrait of a woman of about 55 with a grey bob haircut and red rectangular glasses, a black turtleneck, plain dark grey background, studio light.' },
];

interface Rec { phase: string; key: string; arm?: string; variant?: string; seed?: number; file?: string; wallMs?: number; engineMs?: number; framing?: { ok: boolean; reasons: string[]; heightPct: number | null }; prompt?: string; line?: string; description?: CharacterDescription; faceRect?: PxRect; faces?: number; error?: string }
type Report = { updatedAt: string; records: Rec[] };
const reportFile = path.join(HERE, 'results.json');
const report: Report = await fs.readFile(reportFile, 'utf8').then((t) => JSON.parse(t) as Report).catch(() => ({ updatedAt: '', records: [] }));
const keep = (phase: string, key: string, arm?: string, variant?: string, seed?: number) => { report.records = report.records.filter((r) => !(r.phase === phase && r.key === key && r.arm === arm && r.variant === variant && r.seed === seed)); };
const save = async () => { report.updatedAt = new Date().toISOString(); await fs.mkdir(HERE, { recursive: true }); await fs.writeFile(reportFile, JSON.stringify(report, null, 2)); };
const size = async (file: string) => { const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]); const [w, h] = stdout.trim().split(',').map(Number); return { width: w, height: h }; };
async function framing(file: string) { const r = fullBodyInFrame(await grayPixels(file, 640)); return { ok: r.ok, reasons: r.reasons, heightPct: r.box ? Math.round(r.box.h * 1000) / 10 : null }; }
async function run(graph: Record<string, unknown>, dest: string) {
  const t0 = Date.now();
  const r = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
  const out = r.outputs[CANONICAL_OUTPUT]?.images?.[0] ?? comfy.firstOutput(r.outputs, 'images');
  if (!out) throw new Error('no image');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, await comfy.view(out));
  return { wallMs: Date.now() - t0, engineMs: r.engineMs };
}

if (PHASES.has('prep')) {
  for (const u of UPLOADS.filter((x) => x.prompt)) {
    if (await fs.access(u.file).then(() => true).catch(() => false)) { console.log(`= ${u.key}: stand-in exists`); continue; }
    const [w, h] = u.size!;
    const t = await run(qwenTextToImage({ prompt: u.prompt!, negative: 'text, watermark, logo', width: w, height: h, seed: 4242, filenamePrefix: `vewbox/confirm/${u.key}` }), u.file);
    console.log(`✓ stand-in ${u.key} (${(t.wallMs / 1000).toFixed(1)} s)`);
  }
}

const reads = new Map<string, Rec>(report.records.filter((r) => r.phase === 'read').map((r) => [r.key, r]));
if (PHASES.has('read')) {
  for (const u of UPLOADS) {
    const upload = await comfy.uploadInput(u.file);
    const t0 = Date.now();
    const r = await comfy.run(referenceReadGraph({ image: upload, describe: true }), { timeoutMs: 30 * 60_000 });
    const boxes = parseFaceBoxes(comfy.textOutput(r.outputs, REFERENCE_FACE_OUTPUTS.bboxes));
    const sz = await size(u.file);
    const faceRect = boxes.length === 1 ? faceCropRect(boxes[0], sz) : undefined;
    let description: CharacterDescription | undefined; let error: string | undefined;
    try { description = parseCharacterDescription(comfy.textOutput(r.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? ''); } catch (e) { error = (e as Error).message; }
    const line = description ? identityLineFromDescription(description, { style: u.style }).line : '';
    keep('read', u.key);
    const rec: Rec = { phase: 'read', key: u.key, wallMs: Date.now() - t0, faces: boxes.length, faceRect, description, line, error };
    report.records.push(rec); reads.set(u.key, rec);
    console.log(`✓ read ${u.key}: ${boxes.length} face(s); ${line || error}`);
    await save();
  }
}

for (const arm of ['klein', 'qwen'] as const) {
  if (!PHASES.has(arm)) continue;
  for (const u of UPLOADS) {
    if (arm === 'qwen' && !u.key.startsWith('ic')) continue;
    const stored = reads.get(u.key);
    if (!stored?.description) { console.log(`! ${u.key}: no reading`); continue; }
    // the line is written from the stored description by the builder as it is now (a reading is not repeated)
    const rd = { ...stored, line: identityLineFromDescription(stored.description, { style: u.style }).line };
    const upload = await comfy.uploadInput(u.file);
    const d = styleDirection(u.style);
    const variants = arm === 'klein' ? (['face', 'noface'] as const) : (['face'] as const);
    for (const variant of variants) for (const seed of arm === 'klein' ? SEEDS : SEEDS.slice(0, 1)) {
      const faceRect = variant === 'face' ? rd.faceRect : undefined;
      const prompt = arm === 'klein'
        ? kleinReferencePrompt({ style: u.style, identityLine: rd.line, faceImage: Boolean(faceRect), character: d.character, visual: d.visual })
        : referenceCanonicalPrompt({ style: u.style, identityLine: rd.line, faceImage: Boolean(faceRect), character: d.character, visual: d.visual });
      const graph = arm === 'klein' ? kleinReferenceCanonical({ upload, faceRect, prompt, seed, filenamePrefix: `vewbox/confirm/${u.key}` }) : qwenReferenceCanonical({ upload, faceRect, prompt, negative: negativeFor(u.style), seed, filenamePrefix: `vewbox/confirm/${u.key}` });
      const file = `${PNG}/${arm}/${u.key}-${variant}-s${seed}.png`;
      keep(arm, u.key, arm, variant, seed);
      try {
        const t = await run(graph, file);
        const fr = await framing(file);
        report.records.push({ phase: arm, key: u.key, arm, variant, seed, file, wallMs: t.wallMs, engineMs: t.engineMs, framing: fr, prompt, line: rd.line });
        console.log(`✓ ${arm} ${u.key} ${variant} s${seed}: ${(t.wallMs / 1000).toFixed(1)} s, framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
      } catch (e) {
        report.records.push({ phase: arm, key: u.key, arm, variant, seed, error: (e as Error).message, prompt });
        console.log(`✗ ${arm} ${u.key} ${variant} s${seed}: ${(e as Error).message}`);
      }
      await save();
    }
  }
}

if (PHASES.has('sheets')) {
  for (const u of UPLOADS) {
    const outs = report.records.filter((r) => r.key === u.key && r.file && (r.phase === 'klein' || r.phase === 'qwen'))
      .sort((a, b) => (a.phase === b.phase ? `${a.variant}${a.seed}`.localeCompare(`${b.variant}${b.seed}`) : a.phase === 'klein' ? -1 : 1));
    const files = [u.file, ...outs.map((r) => r.file!)];
    const inputs = files.flatMap((f) => ['-i', f]);
    const scale = files.map((_, k) => `[${k}:v]scale=-2:832,pad=ceil(iw/2)*2:832:(ow-iw)/2:0:color=white[v${k}]`).join(';');
    const stack = `${files.map((_, k) => `[v${k}]`).join('')}hstack=inputs=${files.length}`;
    await execFileP('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${scale};${stack}`, '-q:v', '4', path.join(HERE, `sheet-${u.key}.jpg`)]);
    console.log(`✓ sheet ${u.key}: ${files.length} pictures (upload, ${outs.map((r) => `${r.phase} ${r.variant} s${r.seed}`).join(', ')})`);
  }
}
console.log('done');

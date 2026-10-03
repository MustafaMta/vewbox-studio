/** CANONICAL CHARACTER IMAGE — GPU acceptance driver (docs/CONTRACTS-IDENTITY-PACK.md v2). Straight through ComfyUI,
 *  not through the worker. Phases:
 *    text       two characters per style from the English identity line, each with side-specific details; arms
 *               L0 = Lightning 8-step without the front-sides sentence, L1 = Lightning with it, Q1 = quality
 *               (30 steps, cfg 4) with it; two seeds each
 *    reference  Image Reference: upload → MediaPipe face box → face crop → Qwen3.5-4B description → identity line →
 *               Edit-2511 redraw into the production's style (with and without the face crop)
 *    style      Qwen3.5-4B medium / full-body judgement on every canonical image and on known failures (the wave-2
 *               photographic "cartoon" portraits, head-cut crops), to decide whether it may serve as a check
 *  Every output gets the CPU framing check. Results: docs/evidence/image-v2/canonical/report.json (+ PNGs in var/).
 *
 *    pnpm exec tsx tools/canonical-image-gpu.ts --phases text,reference,style [--styles cartoon,anime,realistic]
 *
 *  Unload the voice/ASR services first (POST /unload on :8020, :8021, :8030). */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Style } from '@/domain/vocabulary';
import * as comfy from '@/server/providers/comfy';
import { grayPixels } from '@/server/media/image-check';
import { fullBodyInFrame } from '@/server/media/figure-check';
import { ffprobe } from '@/server/media';
import { styleDirection } from '@/server/story/style';
import {
  CANONICAL_OUTPUT, EXPECTED_MEDIUM, FACE_CHECK_OUTPUTS, REFERENCE_DESCRIBE_KEY, STYLE_CHECK_PROMPT,
  canonicalIdentityLine, canonicalPrompt, faceCropRect, identityLineFromDescription, negativeFor, parseCharacterDescription,
  parseFaceBoxes, parseStyleJudgement, qwenCanonicalImage, qwenReferenceCanonical, qwenVlmText, referenceCanonicalPrompt, referenceReadGraph, vlmOutput,
  type IdentitySource,
} from '@/server/workflows';

const execFileP = promisify(execFile);
/** The front-view side sentence of arm L1/Q1 (tried and dropped from the builder: no measurable effect). */
const SIDE_HINT = "Seen from the front: the character's own right side is on the left of the picture and their own left side is on the right of the picture.";
process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL ??= 'http://127.0.0.1:8188';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PHASES = new Set((arg('phases') ?? 'text').split(/[,\s]+/).filter(Boolean));
const STYLES = (arg('styles') ?? 'cartoon,anime,realistic').split(/[,\s]+/).map((s) => s.trim().toUpperCase()) as Style[];
const EVIDENCE = path.resolve('docs/evidence/image-v2/canonical');
const PNG = path.resolve('var/image-v2/canonical');

type Person = IdentitySource & { key: string; seed: number; /** side-specific details and the picture side each must appear on in a front view */ sided: Array<{ detail: string; pictureSide: 'left' | 'right' }> };
const CAST: Record<Style, Person[]> = {
  CARTOON: [
    { key: 'c1-kite-maker', seed: 910001, sex: 'MALE', ageYears: 70, build: 'slim, slightly stooped', hair: 'short grey', eyes: 'dark brown', skin: 'warm tan', wardrobe: 'a patchwork jacket of brown, teal, ochre and brick-red squares over a beige T-shirt, olive trousers, tan leather sandals', distinguishing: ['full white beard', 'round wire glasses', 'a large brass wristwatch on his own left wrist', 'a bright red patch on his own right elbow only'], sided: [{ detail: 'brass watch, his left wrist', pictureSide: 'right' }, { detail: 'red patch, his right elbow', pictureSide: 'left' }] },
    { key: 'c2-girl', seed: 920002, sex: 'FEMALE', ageYears: 10, build: 'small', hair: 'black, in two long braids', eyes: 'amber', skin: 'light brown', wardrobe: 'an olive T-shirt, blue denim overalls, white sneakers with red laces', distinguishing: ['freckles', 'a red string bracelet on her own right wrist', 'the overalls torn open at her own left knee'], sided: [{ detail: 'red bracelet, her right wrist', pictureSide: 'left' }, { detail: 'torn knee, her left', pictureSide: 'right' }] },
  ],
  ANIME: [
    { key: 'a1-student', seed: 930003, sex: 'FEMALE', ageYears: 17, build: 'slender', hair: 'shoulder-length teal bob', eyes: 'violet', skin: 'fair', wardrobe: 'a navy sailor school uniform with a red neckerchief and a pleated navy skirt, black knee socks, brown loafers', distinguishing: ['a white hair clip on her own left side of the head', 'a black school bag on a strap over her own right shoulder'], sided: [{ detail: 'hair clip, her left', pictureSide: 'right' }, { detail: 'bag strap, her right shoulder', pictureSide: 'left' }] },
    { key: 'a2-courier', seed: 940004, sex: 'MALE', ageYears: 30, build: 'athletic', hair: 'spiky black', eyes: 'dark grey', skin: 'tan', wardrobe: 'an orange bomber jacket over a black T-shirt, grey cargo trousers, yellow sneakers', distinguishing: ['a scar through his own right eyebrow', 'a white star patch on the left sleeve of the jacket only'], sided: [{ detail: 'scar, his right eyebrow', pictureSide: 'left' }, { detail: 'star patch, his left sleeve', pictureSide: 'right' }] },
  ],
  REALISTIC: [
    { key: 'r1-pharmacist', seed: 950005, sex: 'FEMALE', ageYears: 45, build: 'medium', hair: 'greying black, tied in a low bun', eyes: 'brown', skin: 'light olive', wardrobe: 'a white lab coat over a burgundy blouse, black trousers, black flats', distinguishing: ['rectangular black glasses', 'a silver wristwatch on her own left wrist', 'a blue ID badge clipped to the lab coat over her own right chest'], sided: [{ detail: 'silver watch, her left wrist', pictureSide: 'right' }, { detail: 'blue badge, her right chest', pictureSide: 'left' }] },
    { key: 'r2-mechanic', seed: 960006, sex: 'MALE', ageYears: 28, build: 'stocky', hair: 'short curly dark-brown', eyes: 'hazel', skin: 'medium brown', wardrobe: 'faded blue coveralls, black work boots', distinguishing: ['trimmed stubble beard', 'a silver stud in his own left ear', 'a white name patch on the coveralls over his own left chest', 'a red rag hanging from his own right hip pocket'], sided: [{ detail: 'ear stud, his left ear', pictureSide: 'right' }, { detail: 'name patch, his left chest', pictureSide: 'right' }, { detail: 'red rag, his right hip', pictureSide: 'left' }] },
  ],
};

/** Image Reference inputs: generated test fixtures standing in for uploads (not real people). */
const UPLOADS: Array<{ key: string; file: string; style: Style; note: string }> = [
  { key: 'ir1-headshot-to-cartoon', file: 'var/image-v2/fixtures/upload-photo-headshot.png', style: 'CARTOON', note: 'a photographic head-and-shoulders picture: no body, no shoes visible' },
  { key: 'ir2-photo-to-realistic', file: 'var/image-v2/fixtures/upload-photo-fullbody.png', style: 'REALISTIC', note: 'a photographic full-length picture' },
  { key: 'ir3-anime-to-anime', file: 'var/image-v2/fixtures/upload-anime.png', style: 'ANIME', note: 'an anime drawing' },
];

interface Rec { phase: string; style?: string; key: string; arm?: string; seed?: number; file?: string; wallMs?: number; engineMs?: number; vramPeakMiB?: number; framing?: unknown; notes?: Record<string, unknown> }
const report: { startedAt: string; comfy?: unknown; records: Rec[] } = { startedAt: new Date().toISOString(), records: [] };
async function save() { await fs.mkdir(EVIDENCE, { recursive: true }); await fs.writeFile(path.join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2)); }
const relPng = (f: string) => path.relative(PNG, f).replace(/\\/g, '/');

async function vramSampler() {
  let peak = 0; let stop = false;
  const loop = (async () => { while (!stop) { const h = await comfy.health(); if (h.ok && h.vramTotal && h.vramFree !== undefined) peak = Math.max(peak, (h.vramTotal - h.vramFree) / 2 ** 20); await new Promise((r) => setTimeout(r, 1000)); } })();
  return async () => { stop = true; await loop; return Math.round(peak); };
}
async function framing(file: string) {
  const r = fullBodyInFrame(await grayPixels(file, 640));
  return { ok: r.ok, reasons: r.reasons, heightPct: r.box ? Math.round(r.box.h * 1000) / 10 : null, marginsPct: r.margins && Object.fromEntries(Object.entries(r.margins).map(([k, v]) => [k, Math.round(v * 1000) / 10])) };
}
async function draw(graph: Record<string, unknown>, node: string, dest: string) {
  const stop = await vramSampler();
  const t0 = Date.now();
  const run = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
  const vramPeakMiB = await stop();
  const out = run.outputs[node]?.images?.[0];
  if (!out) throw new Error(`no image from ${node}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, await comfy.view(out));
  return { wallMs: Date.now() - t0, engineMs: run.engineMs, vramPeakMiB };
}

async function textPhase() {
  for (const style of STYLES) {
    const d = styleDirection(style);
    for (const p of CAST[style]) {
      const line = canonicalIdentityLine(p, { style }).line;
      console.log(`\n=== ${style} ${p.key}: ${line}`);
      const arms = [
        { arm: 'L0', quality: false, sideHint: false },
        { arm: 'L1', quality: false, sideHint: true },
        { arm: 'Q1', quality: true, sideHint: true },
      ];
      for (const a of arms) for (const k of [0, 1]) {
        const seed = p.seed + k;
        const prompt = canonicalPrompt({ style, identityLine: line, character: d.character, visual: d.visual, avoid: d.avoid }) + (a.sideHint ? ` ${SIDE_HINT}` : '');
        const file = path.join(PNG, style.toLowerCase(), `${p.key}-${a.arm}-s${k}.png`);
        const t = await draw(qwenCanonicalImage({ prompt, negative: negativeFor(style), seed, quality: a.quality, filenamePrefix: `vewbox/canonical/${p.key}-${a.arm}` }), CANONICAL_OUTPUT, file);
        const fr = await framing(file);
        report.records.push({ phase: 'text', style, key: p.key, arm: a.arm, seed, file: relPng(file), ...t, framing: fr, notes: { prompt, sided: p.sided } });
        console.log(`✓ ${p.key} ${a.arm} s${k}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), VRAM peak ${t.vramPeakMiB} MiB, framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
        await save();
      }
      // framing control: the same picture with the head cut by the frame
      const src = path.join(PNG, style.toLowerCase(), `${p.key}-L1-s0.png`);
      const cut = path.join(PNG, 'controls', `${p.key}-head-cut.png`);
      await fs.mkdir(path.dirname(cut), { recursive: true });
      await execFileP('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'crop=iw:trunc(ih*0.88/2)*2:0:trunc(ih*0.12)', cut]);
      const feet = path.join(PNG, 'controls', `${p.key}-feet-cut.png`);
      await execFileP('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'crop=iw:trunc(ih*0.9/2)*2:0:0', feet]);
      report.records.push({ phase: 'control', style, key: `${p.key}-head-cut`, file: relPng(cut), framing: await framing(cut) });
      report.records.push({ phase: 'control', style, key: `${p.key}-feet-cut`, file: relPng(feet), framing: await framing(feet) });
      await save();
    }
  }
}

async function referencePhase() {
  const ups = UPLOADS.filter((u) => STYLES.includes(u.style));
  for (const u of ups) {
    const d = styleDirection(u.style);
    // exactly the handler's read: one prompt with the MediaPipe boxes and the Qwen3.5-4B description
    const upload = await comfy.uploadInput(u.file);
    const stop = await vramSampler();
    const t0 = Date.now();
    const read = await comfy.run(referenceReadGraph({ image: upload, describe: true }), { timeoutMs: 30 * 60_000 });
    const readT = { wallMs: Date.now() - t0, engineMs: read.engineMs, vramPeakMiB: await stop() };
    const text = comfy.textOutput(read.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? '';
    const boxes = parseFaceBoxes(comfy.textOutput(read.outputs, FACE_CHECK_OUTPUTS.bboxes));
    let line = '', parsed: unknown, error: string | undefined, lowConfidence: string[] = [], notVisible: string[] = [];
    try { const dsc = parseCharacterDescription(text); parsed = dsc; ({ line, lowConfidence, notVisible } = identityLineFromDescription(dsc, { style: u.style })); } catch (e) { error = (e as Error).message; }
    report.records.push({ phase: 'reference-read', style: u.style, key: u.key, ...readT, notes: { vlmText: text, faceBoxes: boxes } });
    console.log(`✓ ${u.key} read: ${(readT.wallMs / 1000).toFixed(1)} s (engine ${((readT.engineMs ?? 0) / 1000).toFixed(1)} s), VRAM peak ${readT.vramPeakMiB} MiB, ${boxes.length} face(s)\n  ${line || `PARSE FAILED: ${error}`}`);
    const pr = await ffprobe(u.file);
    const faceRect = boxes.length === 1 ? faceCropRect(boxes[0], { width: Number(pr.width), height: Number(pr.height) }) : undefined;
    for (const withFace of faceRect ? [true, false] : [false]) {
      const prompt = referenceCanonicalPrompt({ style: u.style, identityLine: line, faceImage: withFace, character: d.character, visual: d.visual });
      const file = path.join(PNG, 'reference', `${u.key}-${withFace ? 'face' : 'noface'}.png`);
      const t = await draw(qwenReferenceCanonical({ upload, faceRect: withFace ? faceRect : undefined, prompt, negative: negativeFor(u.style), seed: 970007, filenamePrefix: `vewbox/canonical/${u.key}` }), CANONICAL_OUTPUT, file);
      const fr = await framing(file);
      report.records.push({ phase: 'reference', style: u.style, key: u.key, arm: withFace ? 'upload+face' : 'upload', file: relPng(file), ...t, framing: fr, notes: { upload: u.file, uploadNote: u.note, description: parsed, vlmText: text, identityLine: line, lowConfidence, notVisible, error, faceBoxes: boxes, prompt } });
      console.log(`✓ ${u.key} ${withFace ? 'upload+face' : 'upload'}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), VRAM peak ${t.vramPeakMiB} MiB, framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
      await save();
    }
  }
}

async function stylePhase() {
  const list: Array<{ key: string; file: string; expected?: string; expectFullBody?: boolean }> = [];
  for (const r of report.records.length ? report.records : (JSON.parse(await fs.readFile(path.join(EVIDENCE, 'report.json'), 'utf8')) as typeof report).records) {
    if (!r.file || !r.style) continue;
    if (r.phase === 'text' || r.phase === 'reference') list.push({ key: `${r.key}_${r.arm}_${r.seed ?? ''}`.replace(/[^a-z0-9_]/gi, '_'), file: path.join(PNG, r.file), expected: EXPECTED_MEDIUM[r.style as Style], expectFullBody: true });
    if (r.phase === 'control') list.push({ key: r.key.replace(/[^a-z0-9_]/gi, '_'), file: path.join(PNG, r.file), expected: EXPECTED_MEDIUM[r.style as Style], expectFullBody: false });
  }
  // the real wave-2 failure: Cartoon-production portraits that came out as studio photographs
  const backup = 'D:/volexar-studio/volexar-studio/var/backups/phase0-cleanup-20261002-2347/library/image/2026/10';
  for (const id of ['gen-36fad8a686', 'gen-8aa12b8831']) list.push({ key: `wave2_${id.replace(/-/g, '_')}`, file: `${backup}/${id}.png`, expected: '3d_render', expectFullBody: false });
  const items = await Promise.all(list.map(async (x) => ({ key: x.key, image: await comfy.uploadInput(x.file), prompt: STYLE_CHECK_PROMPT })));
  const stop = await vramSampler();
  const t0 = Date.now();
  const run = await comfy.run(qwenVlmText({ items, maxLength: 120 }), { timeoutMs: 60 * 60_000 });
  const vramPeakMiB = await stop();
  const rows = list.map((x) => {
    const text = comfy.textOutput(run.outputs, vlmOutput(x.key)) ?? '';
    let j: ReturnType<typeof parseStyleJudgement> | undefined;
    try { j = parseStyleJudgement(text); } catch { j = undefined; }
    return { key: x.key, file: x.file.replace(/\\/g, '/'), expectedMedium: x.expected, judgedMedium: j?.medium, mediumOk: j?.medium === x.expected, expectFullBody: x.expectFullBody, judgedFullBody: j?.fullBody, fullBodyOk: j?.fullBody === x.expectFullBody, figures: j?.figures, text };
  });
  report.records.push({ phase: 'style-check', key: 'vlm', wallMs: Date.now() - t0, engineMs: run.engineMs, vramPeakMiB, notes: { rows, mediumAccuracy: `${rows.filter((r) => r.mediumOk).length}/${rows.length}`, fullBodyAccuracy: `${rows.filter((r) => r.fullBodyOk).length}/${rows.length}` } });
  await save();
  console.log(`✓ style check on ${rows.length} pictures: medium ${rows.filter((r) => r.mediumOk).length}/${rows.length}, full body ${rows.filter((r) => r.fullBodyOk).length}/${rows.length} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const r of rows.filter((x) => !x.mediumOk || !x.fullBodyOk)) console.log(`  ✗ ${r.key}: medium ${r.judgedMedium} (expected ${r.expectedMedium}), full body ${r.judgedFullBody} (expected ${r.expectFullBody})`);
}

async function main() {
  const h = await comfy.health();
  if (!h.ok) throw new Error('ComfyUI is not reachable');
  report.comfy = h;
  const prev = await fs.readFile(path.join(EVIDENCE, 'report.json'), 'utf8').then((t) => JSON.parse(t) as typeof report, () => undefined);
  if (prev && !PHASES.has('text')) report.records.push(...prev.records.filter((r) => !PHASES.has(r.phase.split('-')[0])));
  if (PHASES.has('text')) await textPhase();
  if (PHASES.has('reference')) await referencePhase();
  if (PHASES.has('style')) await stylePhase();
  await save();
}

main().catch(async (e) => { console.error('FAILED', e); report.records.push({ phase: 'FAILED', key: String((e as Error).message ?? e), notes: { kind: (e as { kind?: string }).kind } }); await save(); process.exit(1); });

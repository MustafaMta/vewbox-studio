/** D13 (and C1) GPU check — straight through ComfyUI, not through the shared worker (no worker job running, ComfyUI
 *  queue empty, TTS/ASR/design services unloaded with POST /unload first). Phases:
 *    lines      the A3 character (أبو سلام, char-bc112248bf, read from the database into a3-record.json) drawn
 *               twice with the OLD identity line (the one stored with its approved canonical image v2) and twice with
 *               the NEW line (canonicalIdentityLine on the same record), same prompt builder, same graph (Qwen-Image-2512
 *               quality, 30 steps, cfg 4, 928×1664), same seeds (the image's seed and the next)
 *    secondary  C1: an expression sheet, the outfit and a close-up portrait from the approved canonical image
 *               (gen-655c17f72b), one Edit-2511 pass each, exactly as CHARACTER_REFS builds them
 *    judge      Qwen3.5-4B reads every output for the two D13 details (facial hair, robe length)
 *  Results: results.json + JPEG copies here; PNG originals in var/image-v2/d13 of the main checkout.
 *
 *    pnpm exec tsx docs/evidence/image-v2/d13/run.ts [--phases lines,secondary,judge] */

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
  CANONICAL_OUTPUT, SECONDARY_MATERIAL, canonicalIdentityLine, canonicalPrompt, firstJsonObject, identitySeedFor, negativeFor, portraitCrop,
  qwenCanonicalImage, qwenSecondary, qwenVlmText, secondaryPrompt, vlmOutput, type SecondaryMaterialKind,
} from '@/server/workflows';

/** Tried in the variants (not shipped: no measured effect on the beard or the robe): negative words implied by the
 *  identity line. The first version also listed "kurta", which made the face look European in 4/4 draws. */
function identityNegative(identityLine: string, withKurta = false): string {
  const out: string[] = [];
  if (/\bmo?ustache only\b/i.test(identityLine)) out.push('beard', 'full beard', 'chin beard', 'goatee', 'stubble');
  if (/\bankle-length\b/i.test(identityLine)) out.push('short tunic', 'knee-length tunic', 'thigh-length tunic', ...(withKurta ? ['kurta'] : []));
  return out.join(', ');
}

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL ??= 'http://127.0.0.1:8188';
const execFileP = promisify(execFile);

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PHASES = new Set((arg('phases') ?? 'lines,secondary,judge').split(/[,\s]+/).filter(Boolean));
const HERE = path.resolve('docs/evidence/image-v2/d13');
const PNG = path.resolve(process.env.D13_PNG_DIR ?? 'var/image-v2/d13');
const LIBRARY = path.resolve(process.env.D13_LIBRARY ?? 'D:/volexar-studio/volexar-studio/var/library');

interface Rec { phase: string; key: string; seed?: number; file?: string; jpeg?: string; wallMs?: number; engineMs?: number; vramPeakMiB?: number; framing?: unknown; prompt?: string; negative?: string; judged?: unknown }
type Report = { startedAt: string; record?: unknown; lines?: { old: string; new: string }; records: Rec[] };
// a later run of some phases keeps the records of the others
const earlier = await fs.readFile(path.join(HERE, 'results.json'), 'utf8').then((t) => JSON.parse(t) as Report).catch(() => undefined);
const report: Report = { startedAt: new Date().toISOString(), records: (earlier?.records ?? []).filter((r) => !PHASES.has(r.phase)) };
const save = async () => fs.writeFile(path.join(HERE, 'results.json'), JSON.stringify(report, null, 2));

async function vramSampler() {
  let peak = 0; let stop = false;
  const loop = (async () => { while (!stop) { const h = await comfy.health(); if (h.ok && h.vramTotal && h.vramFree !== undefined) peak = Math.max(peak, (h.vramTotal - h.vramFree) / 2 ** 20); await new Promise((r) => setTimeout(r, 1000)); } })();
  return async () => { stop = true; await loop; return Math.round(peak); };
}
async function draw(graph: Record<string, unknown>, node: string | undefined, key: string) {
  const stop = await vramSampler();
  const t0 = Date.now();
  const run = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
  const vramPeakMiB = await stop();
  const out = node ? run.outputs[node]?.images?.[0] : comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new Error(`no image for ${key}`);
  const file = path.join(PNG, `${key}.png`);
  await fs.mkdir(PNG, { recursive: true });
  await fs.writeFile(file, await comfy.view(out));
  const jpeg = path.join(HERE, `${key}.jpg`);
  await execFileP('ffmpeg', ['-v', 'error', '-y', '-i', file, '-q:v', '3', jpeg]);
  return { file, jpeg: path.relative(HERE, jpeg).replace(/\\/g, '/'), wallMs: Date.now() - t0, engineMs: run.engineMs, vramPeakMiB };
}
async function framing(file: string) { const r = fullBodyInFrame(await grayPixels(file, 640)); return { ok: r.ok, reasons: r.reasons }; }

const raw = JSON.parse(await fs.readFile(path.join(HERE, 'a3-record.json'), 'utf8')) as Record<string, unknown>;
const style = String(raw.style) as Style;
const a3 = { id: String(raw.id), sex: raw.sex as 'MALE', ageYears: Number(raw.ageyears ?? raw.ageYears), build: String(raw.build), face: String(raw.face), hair: String(raw.hair), skin: String(raw.skin), eyes: String(raw.eyes), distinguishing: raw.distinguishing as string[], wardrobe: String(raw.wardrobe), canon: (raw.canon ?? undefined) as undefined };
const stored = String(raw.storedline ?? raw.storedLine);
const seed = Number(raw.seed);
report.record = { id: a3.id, style, seed, canonicalAssetId: raw.canonicalassetid ?? raw.canonicalAssetId };
report.lines = { old: stored, new: canonicalIdentityLine(a3, { style }).line };
await save();
console.log(`OLD: ${report.lines.old}\n\nNEW: ${report.lines.new}\n`);

if (PHASES.has('lines')) {
  const d = styleDirection(style);
  for (const arm of ['old', 'new'] as const) for (const k of [0, 1]) {
    const prompt = canonicalPrompt({ style, identityLine: report.lines[arm], character: d.character, visual: d.visual, avoid: d.avoid });
    const key = `${arm}-line-s${k}`;
    const t = await draw(qwenCanonicalImage({ prompt, negative: negativeFor(style), seed: seed + k, filenamePrefix: `vewbox/d13/${key}` }), CANONICAL_OUTPUT, key);
    const fr = await framing(t.file);
    report.records.push({ phase: 'lines', key, seed: seed + k, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, framing: fr, prompt });
    console.log(`✓ ${key}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), VRAM peak ${t.vramPeakMiB} MiB, framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
    await save();
  }
}

if (PHASES.has('secondary')) {
  const canonicalId = String(report.record && (report.record as { canonicalAssetId: string }).canonicalAssetId);
  const upload = await comfy.uploadInput(path.join(LIBRARY, 'image/2026/10', `${canonicalId}.png`));
  const offsets: Record<SecondaryMaterialKind, number> = { EXPRESSION: 17, OUTFIT: 19, PORTRAIT: 23 };
  for (const kind of SECONDARY_MATERIAL) {
    const prompt = secondaryPrompt({ kind, style, identityLine: stored, visual: styleDirection(style).visual });
    const s = (identitySeedFor(a3) + offsets[kind]) % 2 ** 31;
    const key = `secondary-${kind.toLowerCase()}`;
    const t = await draw(qwenSecondary({ canonical: upload, kind, prompt, negative: negativeFor(style), seed: s }), undefined, key);
    report.records.push({ phase: 'secondary', key, seed: s, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, prompt });
    console.log(`✓ ${key}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), VRAM peak ${t.vramPeakMiB} MiB`);
    await save();
  }
}

if (PHASES.has('variants')) {
  // after the first look (the new line alone: robe longer, beard still drawn): the same new line with the negative
  // words it implies (identityNegative), and the same with the facial-hair and robe statements moved right after
  // the age; the close-up portrait from the head-and-shoulders crop of the canonical image
  const d = styleDirection(style);
  const line = report.lines!.new;
  const pieces = line.replace(/^Identity:\s*/, '').replace(/\.$/, '').split('; ');
  const early = pieces.filter((p) => /^facial hair:|ankle-length|^the trousers are worn under/.test(p));
  const front = `Identity: ${[pieces[0], ...early, ...pieces.slice(1).filter((p) => !early.includes(p))].join('; ')}.`;
  const negative = [negativeFor(style), identityNegative(line, true)].filter(Boolean).join(', ');
  for (const [arm, identityLine] of [['new-neg', line], ['front-neg', front]] as const) for (const k of [0, 1]) {
    const prompt = canonicalPrompt({ style, identityLine, character: d.character, visual: d.visual, avoid: d.avoid });
    const key = `${arm}-s${k}`;
    const t = await draw(qwenCanonicalImage({ prompt, negative, seed: seed + k, filenamePrefix: `vewbox/d13/${key}` }), CANONICAL_OUTPUT, key);
    const fr = await framing(t.file);
    report.records.push({ phase: 'variants', key, seed: seed + k, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, framing: fr, prompt, negative });
    console.log(`✓ ${key}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
    await save();
  }
  const canonical = JSON.parse(await fs.readFile(path.join(HERE, 'a3-canonical.json'), 'utf8')) as { id: string; width: number; height: number; box: { x: number; y: number; w: number; h: number } | null };
  const upload = await comfy.uploadInput(path.join(LIBRARY, 'image/2026/10', `${canonical.id}.png`));
  const crop = portraitCrop(canonical, canonical.box);
  const prompt = secondaryPrompt({ kind: 'PORTRAIT', style, identityLine: stored, visual: styleDirection(style).visual });
  const s = (identitySeedFor(a3) + 23) % 2 ** 31;
  const t = await draw(qwenSecondary({ canonical: upload, kind: 'PORTRAIT', prompt, negative: negativeFor(style), seed: s, crop }), undefined, 'secondary-portrait-crop');
  report.records.push({ phase: 'variants', key: 'secondary-portrait-crop', seed: s, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, prompt, judged: { crop } });
  console.log(`✓ secondary-portrait-crop: ${(t.wallMs / 1000).toFixed(1)} s, crop ${JSON.stringify(crop)}`);
  await save();
}

if (PHASES.has('variants2')) {
  // the second look: the beard stayed with the negative and with the statements moved forward; the negative also
  // lightened the face (it listed "kurta"); the portrait stayed a whole figure. Now: the builder as shipped (the
  // facial hair said without the word "beard", "shaved smooth"; identityNegative without "kurta"), and the close-up
  // prompt without the garments, from the head-and-shoulders crop
  const d = styleDirection(style);
  const line = canonicalIdentityLine(a3, { style }).line;
  report.lines = { ...report.lines!, new: line };
  const negative = [negativeFor(style), identityNegative(line)].filter(Boolean).join(', ');
  for (const k of [0, 1]) {
    const prompt = canonicalPrompt({ style, identityLine: line, character: d.character, visual: d.visual, avoid: d.avoid });
    const key = `final-s${k}`;
    const t = await draw(qwenCanonicalImage({ prompt, negative, seed: seed + k, filenamePrefix: `vewbox/d13/${key}` }), CANONICAL_OUTPUT, key);
    const fr = await framing(t.file);
    report.records.push({ phase: 'variants2', key, seed: seed + k, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, framing: fr, prompt, negative });
    console.log(`✓ ${key}: ${(t.wallMs / 1000).toFixed(1)} s (engine ${((t.engineMs ?? 0) / 1000).toFixed(1)} s), framing ${fr.ok ? 'ok' : fr.reasons.join('; ')}`);
    await save();
  }
  const canonical = JSON.parse(await fs.readFile(path.join(HERE, 'a3-canonical.json'), 'utf8')) as { id: string; width: number; height: number; box: { x: number; y: number; w: number; h: number } | null };
  const upload = await comfy.uploadInput(path.join(LIBRARY, 'image/2026/10', `${canonical.id}.png`));
  const crop = portraitCrop(canonical, canonical.box);
  const prompt = secondaryPrompt({ kind: 'PORTRAIT', style, identityLine: stored, visual: styleDirection(style).visual });
  const s = (identitySeedFor(a3) + 23) % 2 ** 31;
  const t = await draw(qwenSecondary({ canonical: upload, kind: 'PORTRAIT', prompt, negative: negativeFor(style), seed: s, crop }), undefined, 'secondary-portrait-final');
  report.records.push({ phase: 'variants2', key: 'secondary-portrait-final', seed: s, file: t.file, jpeg: t.jpeg, wallMs: t.wallMs, engineMs: t.engineMs, vramPeakMiB: t.vramPeakMiB, prompt, judged: { crop } });
  console.log(`✓ secondary-portrait-final: ${(t.wallMs / 1000).toFixed(1)} s`);
  await save();
}

if (PHASES.has('judge')) {
  const QUESTION = 'Look at the person in the picture. Answer with JSON only: {"facialHair": "none | moustache only | beard only | beard and moustache | stubble", "chinCleanShaven": true or false, "robe": "none | above the knee | at the knee | mid-calf | at the ankles or floor", "trousersVisibleBelowRobe": "none | only at the ankles | the lower leg | most of the leg", "glasses": true or false}.';
  const targets = report.records.filter((r) => r.file && (r.phase === 'lines' || r.key === 'secondary-outfit' || (r.phase.startsWith('variants') && !r.key.startsWith('secondary'))));
  const items = await Promise.all(targets.map(async (r, i) => ({ key: `j${i}`, image: await comfy.uploadInput(r.file!), prompt: QUESTION })));
  const run = await comfy.run(qwenVlmText({ items, maxLength: 200 }), { timeoutMs: 30 * 60_000 });
  targets.forEach((r, i) => {
    const text = comfy.textOutput(run.outputs, vlmOutput(`j${i}`)) ?? '';
    try { r.judged = firstJsonObject(text); } catch { r.judged = { unreadable: text.slice(0, 300) }; }
    console.log(`${r.key}: ${JSON.stringify(r.judged)}`);
  });
  await save();
}
console.log('done');

/** D10 — why "anime" comes out as a western flat cartoon (the FLUX-vs-Qwen A/B: photo → Anime in 8/8 redraws, both
 *  engines; Qwen's text courier as a western comic), and which wording measurably changes it. Straight through ComfyUI
 *  (no studio job, empty queue, voice/ASR/design services unloaded). Phases:
 *    calibrate  Qwen3.5-4B's style verdict on pictures whose style is known from the A/B (anime: the anime upload, the
 *               clean anime text draws; western: the ix3 photo → anime redraws, the courier comic) — is it a measure?
 *    reference  klein redraws of three photos (bust, full length, head shot) → Anime, face crop, 2 seeds, per wording
 *    text       Qwen-Image-2512 for the two anime characters of the A/B, 2 seeds, per wording
 *    judge      the verdict on every picture of this run; sheets per arm
 *  Wordings: W0 = shipping; W1 = "Japanese anime" named with what makes it anime (large expressive anime eyes, small
 *  simple nose and mouth, thin clean line art, hard-edged two-tone cel shadows, flat colours); W2 = W1 and, for Qwen
 *  (cfg 4), "western cartoon, American comic book, vector flat illustration" in the negative.
 *  Results: results.json + sheets here; PNGs in D:/volexar-studio/volexar-studio/var/flux-vs-qwen/anime.
 *
 *    pnpm exec tsx docs/evidence/flux-vs-qwen/anime/run.ts --phases calibrate,reference,text,judge */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { grayPixels } from '@/server/media/image-check';
import { fullBodyInFrame } from '@/server/media/figure-check';
import { styleDirection } from '@/server/story/style';
import {
  CANONICAL_OUTPUT, KLEIN_MEDIUM, STYLE_MEDIUM, canonicalIdentityLine, canonicalPrompt, firstJsonObject, identityLineFromDescription, kleinReferenceCanonical,
  kleinReferencePrompt, negativeFor, qwenCanonicalImage, qwenVlmText, vlmOutput, type CharacterDescription, type PxRect,
} from '@/server/workflows';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL ??= 'http://127.0.0.1:8188';
const execFileP = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PHASES = new Set((arg('phases') ?? 'calibrate,reference,text,judge').split(/[,\s]+/).filter(Boolean));
const HERE = path.resolve('docs/evidence/flux-vs-qwen/anime');
const FVQ = 'D:/volexar-studio/volexar-studio/var/flux-vs-qwen';
const PNG = `${FVQ}/anime`;
const CONFIRM = path.resolve('docs/evidence/flux-vs-qwen/confirmation/results.json');

/** The verdict: medium and tradition, with the cues it rests on. */
export const STYLE_QUESTION = 'Look at the drawing style of the picture. Answer with JSON only: {"tradition": "japanese anime | western cartoon | american comic book | 3d render | photograph", "eyes": "large anime eyes | small realistic eyes | cartoon dot or oval eyes", "shading": "cel shading with hard-edged shadows | flat colour without shadows | soft gradients | photographic"}. "japanese anime" = drawn like a Japanese TV anime or anime film (anime face construction, large expressive eyes with highlights, small nose and mouth, thin clean line art, cel shading). "western cartoon" = an American or European flat vector or TV cartoon style. "american comic book" = heavy ink outlines and comic-book rendering.';

const W1_NOUN = 'a Japanese anime character, drawn like a modern Japanese TV anime (anime character design: large expressive anime eyes with highlights, small simple nose and mouth, thin clean line art, cel shading with hard-edged two-tone shadows, flat colours)';
const W1_LEAD = 'Japanese anime character design, drawn like a modern Japanese TV anime: large expressive anime eyes with highlights, small simple nose and mouth, thin clean line art, cel shading with hard-edged two-tone shadows, flat colours, not a photograph, not 3D:';
const W2_NEGATIVE = 'western cartoon, American comic book, heavy ink outlines, vector flat illustration';
const WORDINGS = ['W0', 'W1', 'W2'] as const;
type Wording = (typeof WORDINGS)[number];

interface Rec { phase: string; key: string; wording?: Wording; seed?: number; file: string; known?: string; prompt?: string; negative?: string; wallMs?: number; framing?: { ok: boolean; reasons: string[] }; verdict?: unknown }
type Report = { updatedAt: string; records: Rec[] };
const reportFile = path.join(HERE, 'results.json');
const report: Report = await fs.readFile(reportFile, 'utf8').then((t) => JSON.parse(t) as Report).catch(() => ({ updatedAt: '', records: [] }));
const save = async () => { report.updatedAt = new Date().toISOString(); await fs.mkdir(HERE, { recursive: true }); await fs.writeFile(reportFile, JSON.stringify(report, null, 2)); };
const drop = (phase: string) => { report.records = report.records.filter((r) => r.phase !== phase); };
async function draw(graph: Record<string, unknown>, file: string) {
  const t0 = Date.now();
  const r = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
  const out = r.outputs[CANONICAL_OUTPUT]?.images?.[0];
  if (!out) throw new Error('no image');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, await comfy.view(out));
  const fr = fullBodyInFrame(await grayPixels(file, 640));
  return { wallMs: Date.now() - t0, framing: { ok: fr.ok, reasons: fr.reasons } };
}
async function judge(recs: Rec[]) {
  for (let k = 0; k < recs.length; k += 8) {
    const batch = recs.slice(k, k + 8);
    const items = await Promise.all(batch.map(async (r, i) => ({ key: `s${i}`, image: await comfy.uploadInput(r.file), prompt: STYLE_QUESTION })));
    const run = await comfy.run(qwenVlmText({ items, maxLength: 160 }), { timeoutMs: 30 * 60_000 });
    batch.forEach((r, i) => { const t = comfy.textOutput(run.outputs, vlmOutput(`s${i}`)) ?? ''; try { r.verdict = firstJsonObject(t); } catch { r.verdict = { unreadable: t.slice(0, 200) }; } console.log(`${r.phase} ${r.key} ${r.wording ?? r.known ?? ''} s${r.seed ?? ''}: ${JSON.stringify(r.verdict)}`); });
  }
}

if (PHASES.has('calibrate')) {
  drop('calibrate');
  const known: Array<[string, string, string]> = [
    ['anime upload (drawing)', `${FVQ}/fixtures/upload-anime.png`, 'anime'],
    ['a1 student, Qwen text s0', `${FVQ}/text/a1-student-QWEN-s0.png`, 'anime'],
    ['a1 student, klein text s0', `${FVQ}/text/a1-student-K4D-s0.png`, 'anime'],
    ['a2 courier, klein text s0', `${FVQ}/text/a2-courier-K4D-s0.png`, 'anime'],
    ['ir3 anime → anime, klein face s0', `${FVQ}/reference/ir3-anime-to-anime-K4D-T-face-s0.png`, 'anime'],
    ['a2 courier, Qwen text s0', `${FVQ}/text/a2-courier-QWEN-s0.png`, 'western (comic)'],
    ['a2 courier, Qwen text s1', `${FVQ}/text/a2-courier-QWEN-s1.png`, 'western (comic)'],
    ['ix3 photo → anime, klein face s0', `${FVQ}/reference/ix3-bust-photo-to-anime-K4D-T-face-s0.png`, 'western (flat)'],
    ['ix3 photo → anime, klein noface s1', `${FVQ}/reference/ix3-bust-photo-to-anime-K4D-T-noface-s1.png`, 'western (flat)'],
    ['ix3 photo → anime, Qwen face s0', `${FVQ}/reference/ix3-bust-photo-to-anime-QWEN-face-s0.png`, 'western (flat)'],
  ];
  for (const [key, file, k] of known) report.records.push({ phase: 'calibrate', key, file, known: k });
  await judge(report.records.filter((r) => r.phase === 'calibrate'));
  await save();
}

if (PHASES.has('reference')) {
  drop('reference');
  const confirm = JSON.parse(await fs.readFile(CONFIRM, 'utf8')) as { records: Array<{ phase: string; key: string; description?: CharacterDescription; faceRect?: PxRect }> };
  const uploads: Array<[string, string]> = [['ix3-bust-photo-to-anime', `${FVQ}/fixtures/ix3-bust-photo-to-anime.png`], ['ic3-fullbody-teen-to-anime', `${FVQ}/confirmation/fixtures/ic3.png`], ['ic5-curly-headshot-to-anime', `${FVQ}/confirmation/fixtures/ic5.png`]];
  const d = styleDirection('ANIME');
  for (const [key, file] of uploads) {
    const rd = confirm.records.find((r) => r.phase === 'read' && r.key === key);
    if (!rd?.description) { console.log(`! ${key}: no reading in the confirmation`); continue; }
    const line = identityLineFromDescription(rd.description, { style: 'ANIME' }).line;
    const upload = await comfy.uploadInput(file);
    for (const wording of ['W0', 'W1'] as const) for (const seed of [970007, 970008]) {
      let prompt = kleinReferencePrompt({ style: 'ANIME', identityLine: line, faceImage: Boolean(rd.faceRect), character: d.character, visual: d.visual });
      if (wording !== 'W0') prompt = prompt.replace(KLEIN_MEDIUM.ANIME, W1_NOUN).replace(`${STYLE_MEDIUM.ANIME.identity},`, 'Japanese anime character,');
      const out = `${PNG}/reference/${key}-${wording}-s${seed}.png`;
      const t = await draw(kleinReferenceCanonical({ upload, faceRect: rd.faceRect, prompt, seed, filenamePrefix: 'vewbox/anime' }), out);
      report.records.push({ phase: 'reference', key, wording, seed, file: out, prompt, ...t });
      console.log(`✓ reference ${key} ${wording} s${seed}: ${(t.wallMs / 1000).toFixed(1)} s, framing ${t.framing.ok ? 'ok' : t.framing.reasons.join('; ')}`);
      await save();
    }
  }
}

if (PHASES.has('text')) {
  drop('text');
  // the two anime characters of tools/canonical-image-gpu.ts (same fields and seeds as the A/B)
  const cast = [
    { key: 'a1-student', seed: 930003, sex: 'FEMALE' as const, ageYears: 17, build: 'slender', hair: 'shoulder-length teal bob', eyes: 'violet', skin: 'fair', wardrobe: 'a navy sailor school uniform with a red neckerchief and a pleated navy skirt, black knee socks, brown loafers', distinguishing: ['a white hair clip on her own left side of the head', 'a black school bag on a strap over her own right shoulder'] },
    { key: 'a2-courier', seed: 940004, sex: 'MALE' as const, ageYears: 30, build: 'athletic', hair: 'spiky black', eyes: 'dark grey', skin: 'tan', wardrobe: 'an orange bomber jacket over a black T-shirt, grey cargo trousers, yellow sneakers', distinguishing: ['a scar through his own right eyebrow', 'a white star patch on the left sleeve of the jacket only'] },
  ];
  const d = styleDirection('ANIME');
  for (const p of cast) for (const wording of WORDINGS) for (const k of [0, 1]) {
    const line = canonicalIdentityLine(p, { style: 'ANIME' }).line;
    let prompt = canonicalPrompt({ style: 'ANIME', identityLine: line, character: d.character, visual: d.visual, avoid: d.avoid });
    if (wording !== 'W0') prompt = prompt.replace(STYLE_MEDIUM.ANIME.lead, W1_LEAD).replace(`${STYLE_MEDIUM.ANIME.identity},`, 'Japanese anime character,');
    const negative = wording === 'W2' ? `${negativeFor('ANIME')}, ${W2_NEGATIVE}` : negativeFor('ANIME');
    const out = `${PNG}/text/${p.key}-${wording}-s${k}.png`;
    const t = await draw(qwenCanonicalImage({ prompt, negative, seed: p.seed + k, filenamePrefix: 'vewbox/anime' }), out);
    report.records.push({ phase: 'text', key: p.key, wording, seed: p.seed + k, file: out, prompt, negative, ...t });
    console.log(`✓ text ${p.key} ${wording} s${k}: ${(t.wallMs / 1000).toFixed(1)} s, framing ${t.framing.ok ? 'ok' : t.framing.reasons.join('; ')}`);
    await save();
  }
}

if (PHASES.has('judge')) {
  await judge(report.records.filter((r) => r.phase === 'reference' || r.phase === 'text'));
  await save();
  for (const phase of ['reference', 'text']) for (const key of [...new Set(report.records.filter((r) => r.phase === phase).map((r) => r.key))]) {
    const recs = report.records.filter((r) => r.phase === phase && r.key === key);
    const inputs = recs.flatMap((r) => ['-i', r.file]);
    const filter = `${recs.map((_, i) => `[${i}:v]scale=-2:640[v${i}]`).join(';')};${recs.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${recs.length}`;
    await execFileP('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-q:v', '4', path.join(HERE, `sheet-${phase}-${key}.jpg`)]);
  }
}
console.log('done');

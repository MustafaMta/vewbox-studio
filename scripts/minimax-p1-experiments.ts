/* MiniMax P1 experiments (docs/research/MINIMAX-CONTINUITY.md §3.10, subset of E4 / E6 + a P0.2 continuation smoke
 * test), run straight through ComfyUI with the studio's own graph and prompt builders.
 *
 *   tsx --env-file=../../.env --env-file=../../.env.local scripts/minimax-p1-experiments.ts [ids…]
 *
 * Preconditions (checked): ComfyUI answers, its queue is empty. Unload the speech/design services first
 * (POST /unload on :8020 :8021 :8030 :8022) and make sure no worker job is running. Inputs: a canonical front
 * full-body image (EXP_CHARACTER, default the pharmacist test image) — the plate and the opening frame are drawn here
 * with the studio's Qwen graphs. Every clip is 5 s (124 frames). Outputs: docs/evidence/minimax-p1/ (proxies, stills,
 * contact sheets, results.json); full-size originals in EXP_OUT (default var/exp/minimax-p1). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { minimaxH3Video, qwenEdit, qwenTextToImage, h3FrameCount, type Graph } from '@/server/workflows';
import type { H3Guide } from '@/server/workflows/minimax-h3';
import { framePrompt, h3ReferencePrompt, locationPrompt, takePrompt, lintH3Prompt, type H3Binding } from '@/server/story/prompts';
import type { Character, Location, Production, Shot } from '@/domain/types';

const run = promisify(execFile);
const ROOT = process.cwd();
const EVID = path.join(ROOT, 'docs/evidence/minimax-p1');
const OUT = process.env.EXP_OUT ?? path.join(ROOT, 'var/exp/minimax-p1');
const CHARACTER = process.env.EXP_CHARACTER ?? path.join(OUT, 'inputs/character.png');
const SEED = Number(process.env.EXP_SEED ?? 1164088642);
const W = 1280, H = 720;

// --- the test production, as studio records (so the real builders write the prompts) --------------------------
const now = '2026-10-03T00:00:00.000Z';
const character = { id: 'exp-pharmacist', name: 'Salwa Haddad', sex: 'FEMALE', ageYears: 45, build: 'medium build', face: 'oval face with rectangular black glasses', hair: 'greying black, tied in a low bun', skin: 'light olive', eyes: 'brown', wardrobe: 'a white lab coat over a burgundy blouse, black trousers and black flats', distinguishing: ['a silver wristwatch on her left wrist', 'a blue ID badge clipped to the lab coat'], style: 'REALISTIC' } as unknown as Character;
const location = { id: 'exp-pharmacy', name: 'Corner Pharmacy', kind: 'INTERIOR', style: 'REALISTIC', description: 'a small neighbourhood pharmacy with a white counter across the front and wooden shelves of medicine boxes behind it', lighting: ['DUSK'], landmarks: ['a green cross sign on the back wall', 'wooden shelves of medicine boxes'], props: ['a cash register on the counter', 'paper bags'], refs: [], createdAt: now, updatedAt: now } as unknown as Location;
const shot1 = { id: 'exp-s1', sceneId: 'exp-sc1', number: 1, purpose: 'Closing time', action: 'Behind the counter she takes a small white box from the shelf, turns and sets it on the counter, then looks up at the customer and speaks', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [character.id], dialogue: [{ id: 'l1', characterId: character.id, text: 'We close in ten minutes, so take what you need.' }], transition: 'CUT', takes: [], continuity: { version: 1, characters: [{ characterId: character.id, position: 'behind the counter, centre of frame', screenDirection: 'TOWARD', holding: ['a small white box'] }], props: [], environment: { timeOfDay: 'DUSK', lighting: 'cool fluorescent ceiling light, dark street outside' }, camera: {}, relationToPrevious: 'STORY_TRANSITION' } } as unknown as Shot;
const shot2 = { ...shot1, id: 'exp-s2', number: 2, action: 'She slides the box across the counter toward the customer, smiles and nods', dialogue: [], continuity: { ...shot1.continuity!, relationToPrevious: 'CONTINUATION' } } as Shot;
const production = { id: 'exp-p', kind: 'SHORT', title: 'Exp', language: 'EN', style: 'REALISTIC', aspect: 'WIDE_16_9', scenes: [{ id: 'exp-sc1', number: 1, title: 'Closing', locationId: location.id, timeOfDay: 'DUSK', characterIds: [character.id], beats: [] }], shots: [shot1, shot2], castIds: [character.id], locationIds: [location.id] } as unknown as Production;
const scene = { timeOfDay: 'DUSK' };

interface Variant { id: string; question: string; shot: Shot; graph: () => Promise<{ graph: Graph; prompt: string; inputs: Record<string, string> }> }

async function upload(file: string) { return comfy.uploadInput(file); }
async function saveOutput(r: Awaited<ReturnType<typeof comfy.run>>, kind: 'images' | 'video', file: string) {
  const out = comfy.firstOutput(r.outputs, kind) ?? comfy.firstOutput(r.outputs, 'gifs') ?? comfy.firstOutput(r.outputs, 'images');
  if (!out) throw new Error('no output');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, await comfy.view(out));
  return file;
}
const exists = (f: string) => fs.access(f).then(() => true, () => false);

async function inputs() {
  const plate = path.join(OUT, 'inputs/plate.png');
  if (!(await exists(plate))) {
    const g = qwenTextToImage({ prompt: locationPrompt(location, 'MASTER', 'DUSK'), negative: 'people, person, text, watermark', width: 1344, height: 768, seed: SEED, filenamePrefix: 'vewbox/exp-p1/plate' });
    await saveOutput(await comfy.run(g, { timeoutMs: 20 * 60_000 }), 'images', plate);
  }
  const opening = path.join(OUT, 'inputs/opening.png');
  if (!(await exists(opening))) {
    const prompt = `${framePrompt(production, shot1, [character], location, scene)} Use the reference pictures: image 1 is the exact place (keep its architecture, layout and props); image 2 is the person — keep the face, hair, skin and wardrobe exactly.`;
    const g = qwenEdit({ prompt, references: [await upload(plate), await upload(CHARACTER)], width: W, height: H, seed: SEED, filenamePrefix: 'vewbox/exp-p1/opening' });
    await saveOutput(await comfy.run(g, { timeoutMs: 20 * 60_000 }), 'images', opening);
  }
  return { plate, opening };
}

function variants(io: { plate: string; opening: string }): Variant[] {
  const refPrompt = (b: H3Binding, relation: 'CUT' | 'STORY_TRANSITION' | 'CONTINUATION', sh: Shot) => h3ReferencePrompt(production, sh, [character], location, scene, b, { relation });
  const ref2va = async (o: { refs: string[]; binding: H3Binding; relation: 'CUT' | 'STORY_TRANSITION' | 'CONTINUATION'; sh: Shot; firstFrame?: string; guides?: H3Guide[]; scheduler?: 'simple' | 'beta'; steps?: number; turbo?: boolean; refImageSize?: 'match' | 'max' }) => {
    const prompt = refPrompt(o.binding, o.relation, o.sh);
    const lint = lintH3Prompt(prompt, { labels: 'LOCAL', pictures: o.refs.length, audios: 0, lines: o.sh.dialogue.map((d) => d.text), names: [character.name] });
    if (!lint.ok) throw new Error(`lint: ${JSON.stringify(lint.checks.filter((c) => !c.ok))}`);
    const refs = await Promise.all(o.refs.map(upload));
    const graph = minimaxH3Video({ prompt, width: W, height: H, seconds: 5, seed: SEED, referenceImages: refs, firstFrame: o.firstFrame ? await upload(o.firstFrame) : undefined, guides: o.guides, scheduler: o.scheduler, steps: o.steps, turbo: o.turbo, refImageSize: o.refImageSize, filenamePrefix: 'vewbox/exp-p1/h3' });
    return { graph, prompt, inputs: Object.fromEntries(o.refs.map((r, i) => [`<Picture ${i + 1}>`, path.basename(r)])) };
  };
  const withOpening: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: character.id, picture: 1 }], location: { picture: 2 }, opening: { kind: 'FRAME', picture: 3 } };
  const refsOnly: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: character.id, picture: 1 }], location: { picture: 2 } };
  return [
    { id: 'E4a-fl2va-first-frame', question: 'today’s path for a drawn frame: FL2VA, first frame only, no identity reference', shot: shot1, graph: async () => {
      const prompt = takePrompt(production, shot1, [character], location, scene);
      return { graph: minimaxH3Video({ prompt, width: W, height: H, seconds: 5, seed: SEED, firstFrame: await upload(io.opening), filenamePrefix: 'vewbox/exp-p1/h3' }), prompt, inputs: { first_frame: 'opening.png' } };
    } },
    { id: 'E4b-ref2va-bound-opening', question: 'P1 default: REF2VA, canonical image + plate bound as subjects, opening frame bound as <Picture 3> AND anchored at 0; 4-step turbo, simple', shot: shot1, graph: () => ref2va({ refs: [CHARACTER, io.plate, io.opening], binding: withOpening, relation: 'STORY_TRANSITION', sh: shot1, firstFrame: io.opening }) },
    { id: 'E4c-ref2va-refs-only', question: 'REF2VA with the canonical image and plate only (no opening frame anywhere): identity and place from references alone', shot: shot1, graph: () => ref2va({ refs: [CHARACTER, io.plate], binding: refsOnly, relation: 'STORY_TRANSITION', sh: shot1 }) },
    { id: 'E6a-ref2va-beta', question: 'E4b with the beta scheduler (r2v template note: beta/normal outperform simple for reference-heavy prompts)', shot: shot1, graph: () => ref2va({ refs: [CHARACTER, io.plate, io.opening], binding: withOpening, relation: 'STORY_TRANSITION', sh: shot1, firstFrame: io.opening, scheduler: 'beta' }) },
    { id: 'E6b-ref2va-12step-beta', question: 'E4b without the turbo LoRA, 12 steps, beta', shot: shot1, graph: () => ref2va({ refs: [CHARACTER, io.plate, io.opening], binding: withOpening, relation: 'STORY_TRANSITION', sh: shot1, firstFrame: io.opening, scheduler: 'beta', turbo: false, steps: 12 }) },
  ];
}

async function continuation(io: { plate: string }, prevClip: string, id = 'C1-continuation-tail-audio'): Promise<Variant> {
  const tail = path.join(OUT, 'inputs/tail.mov');
  const { tailClip } = await import('@/server/media/ffmpeg');
  await tailClip(prevClip, tail.replace(/\.mov$/, '.mp4'), 22);
  const binding: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: character.id, picture: 1 }], location: { picture: 2 }, opening: { kind: 'TAIL', seconds: 22 / 24 } };
  return { id, question: id === 'C1-continuation-tail-audio' ? 'P0.2 smoke test: REF2VA continuation, the previous clip’s last 22 frames AND their sound in one AddGuide at 0, references re-applied' : id.includes('frames-only') ? 'E3 subset: C1b (silent-shot prompt, same seed) with the tail FRAMES only, no tail sound in the guide' : 'C1 again (same seed) with the silent-shot statement the builder now writes (Nobody speaks in this shot; no dialogue and no voices)', shot: shot2, graph: async () => {
    const prompt = h3ReferencePrompt(production, shot2, [character], location, scene, binding, { relation: 'CONTINUATION' });
    const refs = await Promise.all([CHARACTER, io.plate].map(upload));
    const graph = minimaxH3Video({ prompt, width: W, height: H, seconds: 5 + 22 / 24, seed: SEED + 1, referenceImages: refs, guides: [{ frameIdx: 0, image: await upload(tail), imageIsVideo: true, audioFromVideo: !id.includes('frames-only') }], filenamePrefix: 'vewbox/exp-p1/h3' });
    return { graph, prompt, inputs: { '<Picture 1>': 'character.png', '<Picture 2>': 'plate.png', 'guide@0': 'tail.mov (22 frames + audio of the previous clip)' } };
  } };
}

async function stills(id: string, clip: string) {
  const dir = path.join(EVID, 'stills');
  await fs.mkdir(dir, { recursive: true });
  const { stdout } = await run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-show_entries', 'format=duration', '-of', 'json', clip]);
  const probe = JSON.parse(stdout) as { streams: Array<{ nb_read_frames: string; width: number; height: number }>; format: { duration: string } };
  const frames = Number(probe.streams[0].nb_read_frames);
  const picks = [0, 12, 21, 22, 23, 48, 72, 96, frames - 1].filter((f, i, a) => f < frames && a.indexOf(f) === i);
  for (const f of picks) await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', `select=eq(n\\,${f}),scale=640:-2`, '-frames:v', '1', '-q:v', '3', path.join(dir, `${id}-f${String(f).padStart(3, '0')}.jpg`)]);
  // a contact sheet of every 6th frame (≈ 4 per second), 6 columns
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'select=not(mod(n\\,6)),scale=320:-2,tile=6x4', '-frames:v', '1', '-q:v', '4', path.join(EVID, `${id}-sheet.jpg`)]);
  // a small proxy for review
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'scale=640:-2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', path.join(EVID, `${id}.mp4`)]);
  return { frames, duration: Number(probe.format.duration), width: probe.streams[0].width, height: probe.streams[0].height, stills: picks };
}

/** `asr` mode: every clip heard back by the studio's transcription (after ComfyUI's models are freed), judged with the
 *  take gate; the continuation also from its first new frame (what the speech check now hears). */
async function asr() {
  const { transcribe } = await import('@/server/providers/speech');
  const { judgeHeard } = await import('@/worker/handlers/voice');
  const { speechAudioArgs, ffmpeg } = await import('@/server/media/ffmpeg');
  await comfy.free().catch(() => {});
  const resultsFile = path.join(EVID, 'results.json');
  const results = JSON.parse(await fs.readFile(resultsFile, 'utf8')) as Record<string, Record<string, unknown>>;
  const line = shot1.dialogue[0].text;
  const only = process.argv.slice(3);
  for (const id of Object.keys(results).filter((k) => !only.length || only.includes(k))) {
    const clip = path.join(OUT, `${id}.mp4`);
    const heads = id.startsWith('C1') ? [0, 22 / 24] : [0];
    const heard: Array<Record<string, unknown>> = [];
    for (const from of heads) {
      const wav = path.join(OUT, `${id}-from${Math.round(from * 24)}.wav`);
      await ffmpeg(speechAudioArgs(clip, wav, from));
      const t = await transcribe(wav, { language: 'en' });
      const expected = id.startsWith('C1') ? '' : line;
      heard.push({ fromFrame: Math.round(from * 24), text: t.text.trim(), words: t.segments.flatMap((s) => s.words ?? []).map((w) => ({ w: w.word.trim(), s: Number(w.start.toFixed(2)), e: Number(w.end.toFixed(2)) })), ...(expected ? { judged: judgeHeard(expected, t.text, 'EN', 'take') } : {}) });
    }
    results[id].asr = heard;
    console.log(id, JSON.stringify(heard.map((h) => ({ from: h.fromFrame, text: h.text, ok: (h.judged as { ok?: boolean } | undefined)?.ok, cer: (h.judged as { cer?: number } | undefined)?.cer }))));
  }
  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
}

async function main() {
  if (process.argv[2] === 'asr') return asr();
  const h = await comfy.health();
  if (!h.ok) throw new Error('ComfyUI is not reachable');
  // ComfyUI is shared: start only after its queue has been empty for EXP_IDLE_S seconds (other sessions submit
  // batches with short gaps), giving up after an hour
  const idleFor = Number(process.env.EXP_IDLE_S ?? 180) * 1000;
  const busy = async () => { const q = await fetch(`${process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'}/queue`).then((r) => r.json() as Promise<{ queue_running: unknown[]; queue_pending: unknown[] }>); return q.queue_running.length + q.queue_pending.length; };
  const deadline = Date.now() + 60 * 60_000;
  let quietSince = Date.now();
  for (;;) {
    if (await busy()) quietSince = Date.now();
    else if (Date.now() - quietSince >= idleFor) break;
    if (Date.now() > deadline) throw new Error('ComfyUI never stayed idle long enough');
    await new Promise((r) => setTimeout(r, 15_000));
  }
  console.log(`ComfyUI idle for ${Math.round(idleFor / 1000)} s; starting`);
  await fs.mkdir(EVID, { recursive: true }); await fs.mkdir(path.join(OUT, 'inputs'), { recursive: true });
  if (!(await exists(CHARACTER))) throw new Error(`no test character image at ${CHARACTER}`);
  const io = await inputs();
  const only = process.argv.slice(2);
  const resultsFile = path.join(EVID, 'results.json');
  const results: Record<string, unknown> = await fs.readFile(resultsFile, 'utf8').then((t) => JSON.parse(t) as Record<string, unknown>, () => ({}));
  const all = variants(io);
  const todo = only.length ? all.filter((v) => only.includes(v.id)) : all;
  // switching between the FL2VA and Ref2VA checkpoints (19.5 GB each, plus the 14.6 GB text encoder) with the
  // speech services still holding ~22 GB of host RAM after their GPU unload got ComfyUI OOM-killed (2026-10-03,
  // exit 137): ComfyUI's models are freed before a run on the other checkpoint
  let lastKind: string | undefined;
  const doRun = async (v: Variant) => {
    const t0 = Date.now();
    const { graph, prompt, inputs } = await v.graph();
    const kind = String(graph['1']?.inputs?.unet_name ?? '');
    if (lastKind !== kind) { await comfy.free(); lastKind = kind; }
    const r = await comfy.run(graph, { timeoutMs: 60 * 60_000 });
    const clip = await saveOutput(r, 'video', path.join(OUT, `${v.id}.mp4`));
    const s = await stills(v.id, clip);
    results[v.id] = { ...(results[v.id] as object | undefined), question: v.question, seed: v.id.startsWith('C1') ? SEED + 1 : SEED, frames: h3FrameCount(v.id.startsWith('C1') ? 5 + 22 / 24 : 5), wallMs: Date.now() - t0, engineMs: r.engineMs, workflowVersion: r.workflowVersion, inputs, prompt, output: s };
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    await fs.writeFile(path.join(EVID, `${v.id}.graph.json`), JSON.stringify(graph, null, 2));
    console.log(`${v.id}: ${s.frames} frames, engine ${Math.round((r.engineMs ?? 0) / 1000)} s`);
    return clip;
  };
  // in the order asked (default: every variant, then the continuation of E4b)
  const order = only.length ? only : [...todo.map((v) => v.id), 'C1-continuation-tail-audio'];
  for (const id of order) {
    if (id.startsWith('C1')) {
      const prev = path.join(OUT, 'E4b-ref2va-bound-opening.mp4');
      if (await exists(prev)) await doRun(await continuation(io, prev, id)); else console.log('C1 skipped: E4b has not run');
      continue;
    }
    const v = todo.find((x) => x.id === id);
    if (v) await doRun(v); else console.log(`unknown variant ${id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

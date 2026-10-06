/* LOCAL MINIMAX H3 — CONFIGURATION BENCHMARK (docs/research/MODEL-EVAL-2026-10.md §8.3–8.4): the shipping speed
 * configuration (Ref2VA 4-step turbo LoRA, scheduler `simple`, `ref_image_size: match`) against the official templates'
 * quality settings, ONE change per arm, on two real shots of The Static Sky conditioned exactly as the take handler
 * conditions them (resolveShotPack → bindingOf → h3ReferencePrompt → minimaxH3Video), same seed:
 *   SPK = the speaking shot of §5 (V1: Elias, one English line, the drawn opening frame anchored at 0);
 *   SIL = the first silent shot with a person of the same production.
 * Arms: T (shipping: turbo 4 steps, simple, match) · A (no LoRA, 20 steps — the template default) · B (scheduler beta) ·
 * C (ref_image_size max) · D (A + ref max) · E (A + beta) · X (`--best k=v,…`: the winners combined, e.g. turbo=false,scheduler=beta,ref=max).
 *
 *   generate (VIDEO lease):  scripts/gpu-hold.ts VIDEO 31900 -- pnpm exec tsx … scripts/model-eval-h3-config.ts gen SPK-T SPK-A …
 *   qa (CPU, any time):      … scripts/model-eval-h3-config.ts qa      (SFace per character, mouth activity on SPK)
 *   asr (ASR lease):         … scripts/model-eval-h3-config.ts asr     (the line heard back, the take gate's judge)
 *
 * State is read from the copy database vewbox_modeleval (DATABASE_URL must name vewbox; it is rewritten). Library files
 * are read only. A clip that reached the engine is never generated again (first attempts only). Originals:
 * var/model-eval/h3-config/ (gitignored); evidence: docs/evidence/model-eval-2026-10/h3-config/ (JSON in git; stills,
 * sheets and 640-px proxies gitignored). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { installHoldGuard, track, settled, cancelOurs, assertIdle } from './lib/comfy-hold-guard';

const live = process.env.DATABASE_URL ?? '';
if (!/\/vewbox(\?|$)/.test(live)) { console.error('DATABASE_URL does not name the vewbox database'); process.exit(2); }
process.env.DATABASE_URL = live.replace(/\/vewbox(\?|$)/, `/${process.env.EVAL_DB ?? 'vewbox_modeleval'}$1`);

// the library is the MAIN checkout's (LIBRARY_ROOT in .env.local is relative to it, not to this worktree): read only
const MAIN_ROOT = process.env.EVAL_MAIN_ROOT ?? 'D:/vewbox';
process.env.LIBRARY_ROOT = path.resolve(MAIN_ROOT, process.env.LIBRARY_ROOT ?? 'var/library');

const run = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'var/model-eval/h3-config');
const EVID = path.join(ROOT, 'docs/evidence/model-eval-2026-10/h3-config');
const SEED = 970007;
const argv = process.argv.slice(2);
const mode = argv[0] ?? 'gen';
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

interface ArmConfig { turbo?: boolean; steps?: number; scheduler?: 'simple' | 'beta' | 'normal'; refImageSize?: 'match' | 'max' }
const ARMS: Record<string, { what: string; cfg: ArmConfig }> = {
  T: { what: 'shipping until 2026-10-06 (now the draft tier): Ref2VA turbo 4-step LoRA v0.1, scheduler simple, ref_image_size match', cfg: { turbo: true } },
  A: { what: 'no LoRA, 20 steps (the official template default)', cfg: { turbo: false } },
  B: { what: 'turbo, scheduler beta (r2v template note)', cfg: { turbo: true, scheduler: 'beta' } },
  C: { what: 'turbo, ref_image_size max (2048-px short edge references)', cfg: { turbo: true, refImageSize: 'max' } },
  // the final tier (A) with each refinement: beta under the turbo LoRA broke the picture (SPK-B smear and blow-out), which
  // says nothing about the base model the template note is about; ref max was neutral-to-positive under turbo
  D: { what: 'final (no LoRA, 20 steps) + ref_image_size max', cfg: { turbo: false, steps: 20, refImageSize: 'max' } },
  E: { what: 'final (no LoRA, 20 steps) + scheduler beta', cfg: { turbo: false, steps: 20, scheduler: 'beta' } },
};
/** --best turbo=false,scheduler=beta,ref=max,steps=20 */
function bestConfig(spec: string): ArmConfig {
  const c: ArmConfig = {};
  for (const kv of spec.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k === 'turbo') c.turbo = v !== 'false';
    else if (k === 'steps') c.steps = Number(v);
    else if (k === 'scheduler') c.scheduler = v as ArmConfig['scheduler'];
    else if (k === 'ref') c.refImageSize = v as ArmConfig['refImageSize'];
    else throw new Error(`--best: unknown key ${k}`);
  }
  return c;
}
if (argv.includes('--best')) ARMS.X = { what: `combined: ${opt('best', '')}`, cfg: bestConfig(opt('best', '')) };

class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (line.trim() && Number.isFinite(v)) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  stop() { this.proc?.kill(); }
}
/** the comfyui container's memory, streamed from docker stats (MiB) */
class RamMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('docker', ['stats', process.env.COMFY_CONTAINER ?? 'vewbox-comfyui-1', '--format', '{{.MemUsage}}']); this.proc.stdout!.on('data', (d: Buffer) => { for (const m of d.toString().matchAll(/([\d.]+)\s*(KiB|MiB|GiB)\s*\//g)) this.samples.push([Date.now(), Number(m[1]) * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024 } as Record<string, number>)[m[2]]]); }); this.proc.on('error', () => {}); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.round(Math.max(...xs)) : NaN; }
  stop() { this.proc?.kill(); }
}

async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,width,height,sample_rate,channels,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file]);
  const j = JSON.parse(stdout) as { streams: Array<Record<string, string>>; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === 'video'); const a = j.streams.find((s) => s.codec_type === 'audio');
  return { frames: Number(v?.nb_read_frames), width: Number(v?.width), height: Number(v?.height), fps: v?.r_frame_rate, duration: Number(j.format.duration), audio: a ? { sampleRate: Number(a.sample_rate), channels: Number(a.channels) } : null };
}
async function evidence(id: string, clip: string) {
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'select=not(mod(n\\,6)),scale=320:-2,tile=6x4', '-frames:v', '1', '-q:v', '4', path.join(EVID, `${id}-sheet.jpg`)]);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'scale=640:-2', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', path.join(EVID, `${id}.mp4`)]);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true }); await fs.mkdir(EVID, { recursive: true });
  const resultsFile = path.join(EVID, 'results.json');
  const results: Record<string, Record<string, unknown>> = await fs.readFile(resultsFile, 'utf8').then((t) => JSON.parse(t) as Record<string, Record<string, unknown>>, () => ({}));
  const save = () => fs.writeFile(resultsFile, JSON.stringify(results, null, 2));

  const comfy = await import('@/server/providers/comfy');
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const { resolveShotPack, bindingOf } = await import('@/server/production/shot-pack');
  const { h3ReferencePrompt, lintH3Prompt } = await import('@/server/story/prompts');
  const { minimaxH3Video, h3FrameCount } = await import('@/server/workflows');
  const { ASPECT_INFO } = await import('@/domain/vocabulary');
  const { orderedShots } = await import('@/domain/timeline');
  const { assetFile } = await import('@/server/media');

  const { state } = await readState();
  const p = state.productions.find((x) => x.title === 'The Static Sky') ?? state.productions[0];
  const cast = castOf(state, p); const world = worldOf(state, p);
  const shots = orderedShots(p);
  // SPK: the same selection as §5's V1; SIL: the first shot with a person and no line
  const spk = shots.find((s) => s.dialogue.length > 0 && s.characterIds.length === 1) ?? shots[1];
  const sil = shots.find((s) => s.dialogue.length === 0 && s.characterIds.length >= 1);
  if (!sil) throw new Error('no silent shot with a person in this production');
  const SHOTS = { SPK: spk, SIL: sil } as const;
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const fileOf = (id: string) => { const a = byId(id); if (!a) throw new Error(`asset ${id} missing`); return assetFile(a); };
  const info = ASPECT_INFO[p.aspect];
  const describe = (k: keyof typeof SHOTS) => { const s = SHOTS[k]; const sc = p.scenes.find((x) => x.id === s.sceneId); return `${k}: scene ${sc?.number} shot ${s.number} (${s.framing}, ${s.characterIds.length} person, ${s.dialogue.length} line)`; };
  console.log(`production "${p.title}" (${p.style}), frame ${info.width}×${info.height}; ${describe('SPK')}; ${describe('SIL')}`);

  /** the canonical image of each person in a shot (the identity reference for SFace) */
  const subjectsOf = (k: keyof typeof SHOTS) => { const pack = resolveShotPack(state, p, SHOTS[k], { backend: 'local' }); return pack.subjects.map((s) => ({ characterId: s.characterId, image: fileOf(s.assetId) })); };

  if (mode === 'qa') {
    const { faceIdentity, mouthActivity, isQaUnavailable } = await import('@/server/providers/qa-service');
    for (const id of Object.keys(results).filter((k) => results[k].file)) {
      const clip = path.join(ROOT, String(results[id].file));
      const k = id.split('-')[0] as keyof typeof SHOTS;
      const ident = await faceIdentity(clip, subjectsOf(k), { sampleFps: 4 });
      results[id].identity = isQaUnavailable(ident) ? ident : Object.fromEntries(Object.entries(ident.characters).map(([c, v]) => [c, { reference: v.reference.available, ...v.summary }]));
      if (k === 'SPK') {
        const m = await mouthActivity(clip, { speakers: 1 });
        results[id].mouth = isQaUnavailable(m) ? m : { speechFrames: m.speechFrames, windowsSource: m.windowsSource, facesPerFrameMax: m.facesPerFrameMax, speakerTracks: m.speakerTracks, tracks: m.tracks.map((t) => ({ id: t.id, frames: t.frames, scored: t.scored, isSpeaker: t.isSpeaker, activityRatio: t.activityRatio, corrBest: t.corrBest, bestLagMs: t.bestLagMs, flags: t.flags })) };
      }
      console.log(id, JSON.stringify({ identity: results[id].identity, mouth: results[id].mouth }));
      await save();
    }
    return;
  }
  if (mode === 'asr') {
    const { transcribe } = await import('@/server/providers/speech');
    const { judgeHeard } = await import('@/worker/handlers/voice');
    const { speechAudioArgs, ffmpeg } = await import('@/server/media/ffmpeg');
    for (const id of Object.keys(results).filter((k) => k.startsWith('SPK-') && results[k].file)) {
      const clip = path.join(ROOT, String(results[id].file));
      const wav = path.join(OUT, `${id}-speech.wav`);
      await ffmpeg(speechAudioArgs(clip, wav, 0));
      const t = await transcribe(wav, { language: 'en' });
      const expected = String(results[id].line ?? '');
      results[id].asr = { model: t.model, text: t.text.trim(), judged: judgeHeard(expected, t.text, 'EN', 'take') };
      console.log(id, JSON.stringify(results[id].asr));
      await save();
    }
    return;
  }

  // ---------------------------------------------------------------------------------------------- generate
  const wanted = argv.slice(1).filter((a) => /^(SPK|SIL)-[A-Z]$/.test(a));
  const dry = argv.includes('--dry');
  installHoldGuard();
  const h = await comfy.health(); if (!h.ok) throw new Error('ComfyUI is not reachable');
  if (!dry) await assertIdle();
  const vram = new VramMeter(); const ram = new RamMeter(); vram.start(); ram.start();
  const deadline = Date.now() + Number(opt('limit-min', '0')) * 60_000;
  for (const id of wanted) {
    if (Number(opt('limit-min', '0')) > 0 && Date.now() > deadline) { console.log(`time limit reached before ${id}`); break; }
    const [k, arm] = id.split('-') as [keyof typeof SHOTS, string];
    const a = ARMS[arm]; if (!a) { console.log(`${id}: unknown arm`); continue; }
    const prior = results[id];
    if (prior && (prior.file || (prior.error && prior.submitted !== false))) { console.log(`${id}: already attempted, kept`); continue; }
    const t0 = Date.now(); let submitted = false;
    process.stdout.write(`${id} (${a.what}) … `);
    try {
      const sh = SHOTS[k]; const scene = p.scenes.find((x) => x.id === sh.sceneId); const loc = world.find((l) => l.id === scene?.locationId);
      const pack = resolveShotPack(state, p, sh, { backend: 'local' }); const binding = bindingOf(pack);
      const prompt = h3ReferencePrompt(p, sh, cast, loc, scene, binding, { relation: pack.relation, locations: world });
      const lint = lintH3Prompt(prompt, { labels: 'LOCAL', pictures: pack.pictures.length, audios: 0, lines: sh.dialogue.map((d) => d.text), names: cast.map((c) => c.name) });
      if (!lint.ok) throw new Error(`lint: ${JSON.stringify(lint.checks.filter((c) => !c.ok))}`);
      const seconds = 5;
      if (dry) { for (const pic of pack.pictures) await fs.access(fileOf(pic.assetId)); console.log(`dry: ${pack.pictures.length} picture(s) [${pack.pictures.map((x) => x.role).join(', ')}], opening ${pack.opening.kind}, relation ${pack.relation}`); continue; }
      const refs = await Promise.all(pack.pictures.map((pic) => comfy.uploadInput(fileOf(pic.assetId))));
      const firstFrame = pack.opening.kind === 'FRAME' ? await comfy.uploadInput(fileOf(pack.opening.assetId)) : undefined;
      const graph = minimaxH3Video({ prompt, width: info.width, height: info.height, seconds, seed: SEED, referenceImages: refs, firstFrame, filenamePrefix: `vewbox/eval/h3cfg-${id}`, ...a.cfg });
      submitted = true;
      const r = await comfy.run(graph, { timeoutMs: 90 * 60_000, onSubmitted: track }); settled(r.promptId);
      const out = comfy.firstOutput(r.outputs, 'video') ?? comfy.firstOutput(r.outputs, 'gifs') ?? comfy.firstOutput(r.outputs, 'images');
      if (!out) throw new Error('no output');
      const file = path.join(OUT, `${id}.mp4`);
      await fs.writeFile(file, await comfy.view(out));
      const pr = await probe(file);
      await evidence(id, file);
      await fs.writeFile(path.join(EVID, `${id}.graph.json`), JSON.stringify(graph, null, 2));
      results[id] = { arm, what: a.what, config: a.cfg, shot: { key: k, scene: scene?.number, number: sh.number, framing: sh.framing, characters: sh.characterIds }, line: sh.dialogue[0]?.text ?? '', seed: SEED, seconds, expectedFrames: h3FrameCount(seconds), engineMs: r.engineMs, wallMs: Date.now() - t0, vramPeakMiB: vram.peak(t0), ramPeakMiB: ram.peak(t0), output: pr, prompt, pictures: pack.pictures.map((x, i) => `<Picture ${i + 1}> ${x.role} ${x.assetId}`), opening: pack.opening.kind, workflowVersion: r.workflowVersion, file: path.relative(ROOT, file), at: new Date().toISOString() };
      console.log(`${pr.frames} frames, audio ${pr.audio ? 'yes' : 'NONE'}, engine ${Math.round((r.engineMs ?? 0) / 1000)} s, wall ${Math.round((Date.now() - t0) / 1000)} s, VRAM ${vram.peak(t0)} MiB, RAM ${ram.peak(t0)} MiB`);
    } catch (e) {
      await cancelOurs('item failed'); // a timed-out prompt must not keep running after this item
      results[id] = { arm, what: a.what, submitted, error: String((e as Error).message ?? e), wallMs: Date.now() - t0, vramPeakMiB: vram.peak(t0), ramPeakMiB: ram.peak(t0), at: new Date().toISOString() };
      console.log(`${submitted ? 'ENGINE ERROR' : 'HARNESS ERROR (not an attempt)'} ${(e as Error).message}`);
    }
    await save();
  }
  vram.stop(); ram.stop();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await cancelOurs('error'); process.exit(1); });

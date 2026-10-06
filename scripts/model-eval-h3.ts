/* LOCAL MINIMAX H3 CAPABILITY CHECK (docs/research/MODEL-STACK-2026-10.md §5.8 V1/V2/V4, run as
 * docs/research/MODEL-EVAL-2026-10.md §5): one real shot of the studio's own film, conditioned exactly as the take
 * handler conditions it (resolveShotPack → bindingOf → h3ReferencePrompt → minimaxH3Video: the approved canonical image
 * and the plate as bound pictures, the drawn opening frame bound and anchored at 0), then the next shot as a forced
 * CONTINUATION of that clip (its last 22 frames and their sound in one AddGuide at 0, the continuity code's assumption),
 * then the same shot with an Iraqi Arabic <d> line. Straight through ComfyUI; the studio is never touched (the state is
 * read from the copy database vewbox_modeleval).
 *
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/model-eval-h3.ts [V1 V4 V2]
 *   pnpm exec tsx ... scripts/model-eval-h3.ts asr        # later, with the asr service up and ComfyUI freed
 *
 * Per clip: engine time, wall time, card peak (nvidia-smi every 250 ms), the ComfyUI container's RAM, frame count
 * (must be h3FrameCount), audio stream and level, stills and a contact sheet; the continuation's head is measured
 * against the previous tail (scripts/minimax-join-metrics.mjs). Originals: var/model-eval/h3/ (gitignored);
 * evidence: docs/evidence/model-eval-2026-10/h3/. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const live = process.env.DATABASE_URL ?? '';
if (!/\/vewbox(\?|$)/.test(live)) { console.error('DATABASE_URL does not name the vewbox database'); process.exit(2); }
process.env.DATABASE_URL = live.replace(/\/vewbox(\?|$)/, '/vewbox_modeleval$1');

const run = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'var/model-eval/h3');
const EVID = path.join(ROOT, 'docs/evidence/model-eval-2026-10/h3');
const LIBRARY = process.env.LIBRARY_ROOT ?? 'D:/vewbox/var/library';
const SEED = 970007;

class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (line.trim() && Number.isFinite(v)) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  stop() { this.proc?.kill(); }
}
const dockerStats = () => new Promise<string>((resolve) => { const p = spawn('docker', ['stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}}', 'vewbox-comfyui-1']); let out = ''; p.stdout.on('data', (d: Buffer) => { out += d.toString(); }); p.on('close', () => resolve(out.trim())); p.on('error', () => resolve('')); });

async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,width,height,sample_rate,channels,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file]);
  const j = JSON.parse(stdout) as { streams: Array<Record<string, string>>; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === 'video'); const a = j.streams.find((s) => s.codec_type === 'audio');
  let rms = NaN;
  if (a) { const r = await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-']).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' })); const m = [...(r.stderr ?? '').matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)]; if (m.length) rms = m[m.length - 1][1] === '-inf' ? -120 : Number(m[m.length - 1][1]); }
  return { frames: Number(v?.nb_read_frames), width: Number(v?.width), height: Number(v?.height), fps: v?.r_frame_rate, duration: Number(j.format.duration), audio: a ? { sampleRate: Number(a.sample_rate), channels: Number(a.channels), rmsDb: rms } : null };
}
async function stills(id: string, clip: string, frames: number) {
  const dir = path.join(EVID, 'stills'); await fs.mkdir(dir, { recursive: true });
  const picks = [0, 12, 21, 22, 23, 48, 72, 96, 110, frames - 1].filter((f, i, a) => f < frames && a.indexOf(f) === i);
  for (const f of picks) await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', `select=eq(n\\,${f}),scale=640:-2`, '-frames:v', '1', '-q:v', '3', path.join(dir, `${id}-f${String(f).padStart(3, '0')}.jpg`)]);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'select=not(mod(n\\,6)),scale=320:-2,tile=6x4', '-frames:v', '1', '-q:v', '4', path.join(EVID, `${id}-sheet.jpg`)]);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-vf', 'scale=640:-2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', path.join(EVID, `${id}.mp4`)]);
  return picks;
}

async function main() {
  const mode = process.argv[2] === 'asr' ? 'asr' : 'generate';
  const only = process.argv.slice(2).filter((a) => /^V\d/.test(a));
  await fs.mkdir(OUT, { recursive: true }); await fs.mkdir(EVID, { recursive: true });
  const resultsFile = path.join(EVID, 'results.json');
  const results: Record<string, Record<string, unknown>> = await fs.readFile(resultsFile, 'utf8').then((t) => JSON.parse(t) as Record<string, Record<string, unknown>>, () => ({}));
  const save = () => fs.writeFile(resultsFile, JSON.stringify(results, null, 2));

  const comfy = await import('@/server/providers/comfy');
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const { resolveShotPack, bindingOf, clipSecondsFor } = await import('@/server/production/shot-pack');
  const { h3ReferencePrompt, lintH3Prompt } = await import('@/server/story/prompts');
  const { minimaxH3Video, h3FrameCount } = await import('@/server/workflows');
  const { ASPECT_INFO } = await import('@/domain/vocabulary');
  const { orderedShots } = await import('@/domain/timeline');
  const { tailClip } = await import('@/server/media/ffmpeg');

  const { state } = await readState();
  const p = state.productions.find((x) => x.title === 'The Static Sky') ?? state.productions[0];
  const cast = castOf(state, p); const world = worldOf(state, p);
  const shots = orderedShots(p);
  const shot1 = shots.find((s) => s.dialogue.length > 0 && s.characterIds.length === 1) ?? shots[1];
  const shot2 = shots[shots.indexOf(shot1) + 1];
  const scene = p.scenes.find((sc) => sc.id === shot1.sceneId);
  const loc = world.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  // the studio's own resolver (run 1 read `a.path`, which the state's assets do not carry: a harness error before any
  // graph was sent); LIBRARY_ROOT comes from .env.local, read-only here
  const { assetFile } = await import('@/server/media');
  const fileOf = (id: string) => { const a = byId(id); if (!a) throw new Error(`asset ${id} missing`); return assetFile(a); };
  void LIBRARY;
  const info = ASPECT_INFO[p.aspect];
  console.log(`production "${p.title}" (${p.style}); shot ${shot1.number} of scene ${scene?.number} (${shot1.framing}, ${shot1.dialogue.length} line) → V1/V2; shot ${shot2.number} → V4 continuation; frame ${info.width}×${info.height}`);

  if (mode === 'asr') {
    const { transcribe } = await import('@/server/providers/speech');
    const { judgeHeard } = await import('@/worker/handlers/voice');
    const { speechAudioArgs, ffmpeg } = await import('@/server/media/ffmpeg');
    await comfy.free().catch(() => {});
    for (const id of Object.keys(results).filter((k) => /^V/.test(k) && results[k].file)) {
      const clip = path.join(ROOT, String(results[id].file));
      const lang = id === 'V2' ? 'ar' : 'en';
      const from = id === 'V4' ? 22 / 24 : 0;
      const wav = path.join(OUT, `${id}-speech.wav`);
      await ffmpeg(speechAudioArgs(clip, wav, from));
      const t = await transcribe(wav, { language: lang });
      const expected = String(results[id].line ?? '');
      results[id].asr = { fromFrame: Math.round(from * 24), language: lang, model: t.model, text: t.text.trim(), words: t.segments.flatMap((s) => s.words ?? []).map((w) => ({ w: w.word.trim(), s: Number(w.start.toFixed(2)), e: Number(w.end.toFixed(2)) })), ...(expected ? { judged: judgeHeard(expected, t.text, lang === 'ar' ? 'AR' : 'EN', 'take') } : {}) };
      console.log(id, JSON.stringify({ text: t.text.trim(), judged: (results[id].asr as { judged?: unknown }).judged }));
    }
    await save(); return;
  }

  const h = await comfy.health(); if (!h.ok) throw new Error('ComfyUI is not reachable');
  const meter = new VramMeter(); meter.start();
  const upload = (f: string) => comfy.uploadInput(f);

  type Variant = { id: string; question: string; line: string; build: () => Promise<{ graph: Record<string, unknown>; prompt: string; seconds: number; inputs: Record<string, string>; pack: unknown }> };
  const packed = (sh: typeof shot1, prod: typeof p) => { const pack = resolveShotPack(state, prod, sh, { backend: 'local' }); return pack; };
  const pictures = async (pack: ReturnType<typeof resolveShotPack>) => Promise.all(pack.pictures.map((pic) => upload(fileOf(pic.assetId))));
  const variants: Variant[] = [
    { id: 'V1', question: 'the shot as the take handler sends it: Ref2VA, canonical image + plate + drawn opening frame bound, the frame anchored at 0, 4-step turbo, simple; 5 s; the English line', line: shot1.dialogue[0]?.text ?? '', build: async () => {
      const pack = packed(shot1, p); const binding = bindingOf(pack);
      const prompt = h3ReferencePrompt(p, shot1, cast, loc, scene, binding, { relation: pack.relation, locations: world });
      const lint = lintH3Prompt(prompt, { labels: 'LOCAL', pictures: pack.pictures.length, audios: 0, lines: shot1.dialogue.map((d) => d.text), names: cast.map((c) => c.name) });
      if (!lint.ok) throw new Error(`lint: ${JSON.stringify(lint.checks.filter((c) => !c.ok))}`);
      const refs = await pictures(pack);
      const firstFrame = pack.opening.kind === 'FRAME' ? await upload(fileOf(pack.opening.assetId)) : undefined;
      const seconds = 5;
      return { graph: minimaxH3Video({ prompt, width: info.width, height: info.height, seconds, seed: SEED, referenceImages: refs, firstFrame, filenamePrefix: 'vewbox/eval/h3' }), prompt, seconds, inputs: Object.fromEntries(pack.pictures.map((pic, i) => [`<Picture ${i + 1}>`, `${pic.role} ${pic.assetId}`])), pack };
    } },
    { id: 'V4', question: 'the next shot as a CONTINUATION of V1: V1’s last 22 frames AND their sound in one AddGuide at 0 (the continuity code’s assumption: the head re-renders the tail), the canonical images and the plate re-applied; 5 s of new picture', line: shot2.dialogue[0]?.text ?? '', build: async () => {
      const prev = path.join(OUT, 'V1.mp4');
      const tail = await tailClip(prev, path.join(OUT, 'V4-tail.mp4'), 22);
      const pack = packed(shot2, p);
      const binding = { ...bindingOf(pack), opening: { kind: 'TAIL' as const, seconds: 22 / 24 } };
      const prompt = h3ReferencePrompt(p, shot2, cast, loc, scene, binding, { relation: 'CONTINUATION', locations: world });
      // on a continuation the drawn opening frame is not connected (the tail opens the shot): subjects and the plate only
      const picsOnly = pack.pictures.filter((pic) => pic.role !== 'OPENING_FRAME');
      const lint = lintH3Prompt(prompt, { labels: 'LOCAL', pictures: picsOnly.length, audios: 0, lines: shot2.dialogue.map((d) => d.text), names: cast.map((c) => c.name) });
      if (!lint.ok) throw new Error(`lint: ${JSON.stringify(lint.checks.filter((c) => !c.ok))}`);
      const refs = await Promise.all(picsOnly.map((pic) => upload(fileOf(pic.assetId))));
      const clip = clipSecondsFor({ trimStartFrames: 22 }, 5);
      return { graph: minimaxH3Video({ prompt, width: info.width, height: info.height, seconds: clip.seconds, seed: SEED + 1, referenceImages: refs, guides: [{ frameIdx: 0, image: await upload(tail.file), imageIsVideo: true, audioFromVideo: true }], filenamePrefix: 'vewbox/eval/h3' }), prompt, seconds: clip.seconds, inputs: { ...Object.fromEntries(picsOnly.map((pic, i) => [`<Picture ${i + 1}>`, `${pic.role} ${pic.assetId}`])), 'guide@0': `V1 tail: ${tail.frames} frames, ${tail.hasAudio ? `${tail.audioSeconds} s sound` : 'no sound'}` }, pack: { ...pack, tail: { ...tail, file: undefined } } };
    } },
    { id: 'V2', question: 'V1 with an Iraqi Arabic <d>[Arabic] …</d> line (the eval set’s Baghdadi rendering of the same line): does the local H3 speak the dialect (listening item) and the words (dialect ASR)?', line: 'عتيگ. كلشي يصير عتيگ.', build: async () => {
      const pAr = { ...p, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
      const shAr = { ...shot1, dialogue: [{ ...shot1.dialogue[0], text: 'Obsolescence. Always obsolescence.', textAr: 'عتيگ. كلشي يصير عتيگ.' }] };
      const pack = packed(shAr, pAr); const binding = bindingOf(pack);
      const prompt = h3ReferencePrompt(pAr, shAr, cast, loc, scene, binding, { relation: pack.relation, locations: world });
      const refs = await pictures(pack);
      const firstFrame = pack.opening.kind === 'FRAME' ? await upload(fileOf(pack.opening.assetId)) : undefined;
      return { graph: minimaxH3Video({ prompt, width: info.width, height: info.height, seconds: 5, seed: SEED, referenceImages: refs, firstFrame, filenamePrefix: 'vewbox/eval/h3' }), prompt, seconds: 5, inputs: Object.fromEntries(pack.pictures.map((pic, i) => [`<Picture ${i + 1}>`, `${pic.role} ${pic.assetId}`])), pack };
    } },
  ];
  const order = only.length ? only : ['V1', 'V4', 'V2'];
  for (const id of order) {
    const v = variants.find((x) => x.id === id); if (!v) { console.log(`unknown ${id}`); continue; }
    // FIRST ATTEMPTS ONLY: a clip that reached the engine (a file, or an engine error) is never generated again
    const prior = results[id];
    if (prior && (prior.file || (prior.error && prior.submitted !== false))) { console.log(`${id}: already attempted, kept`); continue; }
    const t0 = Date.now();
    let submitted = false;
    process.stdout.write(`${id} … `);
    try {
      const { graph, prompt, seconds, inputs, pack } = await v.build();
      submitted = true;
      const r = await comfy.run(graph, { timeoutMs: 60 * 60_000 });
      const out = comfy.firstOutput(r.outputs, 'video') ?? comfy.firstOutput(r.outputs, 'gifs') ?? comfy.firstOutput(r.outputs, 'images');
      if (!out) throw new Error('no output');
      const file = path.join(OUT, `${id}.mp4`);
      await fs.writeFile(file, await comfy.view(out));
      const pr = await probe(file);
      const picks = await stills(id, file, pr.frames);
      await fs.writeFile(path.join(EVID, `${id}.graph.json`), JSON.stringify(graph, null, 2));
      results[id] = { question: v.question, line: v.line, seed: id === 'V4' ? SEED + 1 : SEED, seconds, expectedFrames: h3FrameCount(seconds), engineMs: r.engineMs, wallMs: Date.now() - t0, vramPeakMiB: meter.peak(t0), comfyRam: await dockerStats(), output: pr, stills: picks, inputs, prompt, pack, workflowVersion: r.workflowVersion, file: path.relative(ROOT, file), at: new Date().toISOString() };
      if (id === 'V4') {
        const { stdout } = await run('node', [path.join(ROOT, 'scripts/minimax-join-metrics.mjs'), path.join(OUT, 'V1.mp4'), file, '22'], { maxBuffer: 16 << 20 });
        results[id].join = JSON.parse(stdout);
        await fs.writeFile(path.join(EVID, 'V4-join-metrics.json'), stdout);
      }
      console.log(`${pr.frames} frames (${pr.width}×${pr.height}), audio ${pr.audio ? `${pr.audio.sampleRate} Hz ${pr.audio.channels} ch, RMS ${pr.audio.rmsDb} dB` : 'NONE'}, engine ${Math.round((r.engineMs ?? 0) / 1000)} s, wall ${Math.round((Date.now() - t0) / 1000)} s, peak ${meter.peak(t0)} MiB`);
    } catch (e) {
      results[id] = { question: v.question, submitted, error: String((e as Error).message ?? e), wallMs: Date.now() - t0, vramPeakMiB: meter.peak(t0), at: new Date().toISOString() };
      console.log(`${submitted ? 'ENGINE ERROR' : 'HARNESS ERROR (not an attempt)'} ${(e as Error).message}`);
    }
    await save();
  }
  meter.stop();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

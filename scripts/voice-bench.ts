/* ENGLISH VOICE BENCHMARK (docs/research/VOICE-BENCH-2026-10.md). One fixed corpus (tests/fixtures/voice/
 * english-bench-2026-10.json), the same single-clip references, every engine through the studio's /synthesize contract
 * (the live IndexTTS service docker/tts, or a bench container docker/tts-bench) — never the studio (:4200) and never
 * the database. Phases, so only one model is on the card at a time (each GPU phase runs under scripts/gpu-hold.ts):
 *
 *   refs   --cv <cv-candidates.json>                     build the speakers' reference clips (CPU, network: CC0 clips)
 *   synth  --engine <name> --base <url> [--session 1|2]  speak the corpus; attempt #1 only, every failure kept
 *   score  --asr <url> --ecapa <url>                     transcript (large-v3), WER/CER/coverage, ECAPA, level, silence
 *   report                                               report.json + index.html (players, spectrograms, tables)
 *
 * Common: --run <dir> (JSON; default docs/evidence/voice-eval-2026-10) --media <dir> (WAV/PNG, git-ignored; default
 * <run>/media) --speakers a,b --only id,id --limit n.
 * Session 1 speaks every line with seed 7 (+ the duration targets); session 2 — after the engine is unloaded and loaded
 * again — speaks the `session2` lines with seed 11 and repeats en-e1-calm with seed 7 (determinism). Nothing is retried:
 * a failed request is recorded as a failed attempt #1. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { charErrorRate, scriptCoverage, verdict, wordErrorRate, foldEnglishContractions, foldEnglishNumbers, normalizeLatin, normalizeIraqi } from '@/server/providers/speech';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { measureAudio, msaReadingFlags, lettersPerSecond } from './lib/voice-eval-metrics.mjs';

const execFileP = promisify(execFile);
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n: string, d = '') => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const RUN = path.resolve(opt('run', 'docs/evidence/voice-eval-2026-10'));
const MEDIA = path.resolve(opt('media', path.join(RUN, 'media')));
const SET_FILE = path.resolve(opt('set', 'tests/fixtures/voice/english-bench-2026-10.json'));
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const speakersOpt = opt('speakers') ? new Set(opt('speakers').split(',')) : null;
const limit = Number(opt('limit', '0')) || Infinity;
/** en: the English bench. ar: the Iraqi comparison (docs/voice/IRAQI-ENGINE-COMPARISON-2026-10.md) — every arm hears the
 *  same Baghdadi text as the studio prepares it for its Iraqi engine (`prepareLineText`, digits → Iraqi number words),
 *  the transcript comes from the dialect ASR (`language=ar`), the gate is the studio's Iraqi fold. */
const LANG = (opt('lang', 'en') === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
const L = LANG === 'ar' ? 'AR' : 'EN';
const refuseStudio = (u: string) => { if (/:4200\b|\/api(\/|$)/.test(u)) { console.error(`refusing the studio server: ${u}`); process.exit(2); } return u.replace(/\/$/, ''); };

export interface BenchLine { id: string; category: string; text: string; emotion?: string; features?: string[]; session2?: boolean; durationTargets?: number[] }
export interface Speaker { id: string; sex: 'M' | 'F'; age: string; label: string; source: string; licence: string; reference: string; referenceText: string; referenceSeconds: number; heldOut?: string; heldOutText?: string; clips: Array<{ idx: number; sentence: string; client: string }> }
export interface Take {
  key: string; engine: string; speaker: string; line: string; session: 1 | 2; seed: number; variant: 'natural' | 'duration' | 'repeat';
  durationTarget?: { multiplier: number; seconds: number; via: string };
  ok: boolean; error?: string; file?: string; seconds?: number; ms?: number; sampleRate?: number; model?: string; engineVersion?: string; params?: Record<string, number>; peakVramMb?: number; durationControl?: string;
  score?: Score;
}
export interface Score {
  heard: string; wer: number; werFolded: number; cer: number; coverage: number; verdict: 'PASS' | 'REVIEW' | 'FAIL'; reasons: string[];
  simRef?: number; simHeldOut?: number; lufs?: number; truePeakDbtp?: number; leadingSilence?: number; trailingSilence?: number; longestPause?: number; silenceRatio?: number;
  wordsPerSecond?: number; lettersPerSecond?: number | null; msa?: unknown; flags: string[]; spectrogram?: string;
}

const readJson = async <T>(f: string, d: T): Promise<T> => { try { return JSON.parse(await fs.readFile(f, 'utf8')) as T; } catch { return d; } };
const writeJson = (f: string, v: unknown) => fs.mkdir(path.dirname(f), { recursive: true }).then(() => fs.writeFile(f, JSON.stringify(v, null, 2), 'utf8'));
/** Media paths are stored as media/… — the WAV/PNG folder sits next to the committed JSON/HTML once merged (it may live in another checkout while the bench runs: --media). */
const rel = (f: string) => `media/${path.relative(MEDIA, f).replace(/\\/g, '/')}`;
const set = async () => (await readJson<{ lines: BenchLine[] }>(SET_FILE, { lines: [] })).lines;
const speakersFile = path.join(RUN, 'speakers.json');
const takesFile = (engine: string) => path.join(RUN, 'takes', `${engine}.json`);
const speakers = async () => (await readJson<{ speakers: Speaker[] }>(speakersFile, { speakers: [] })).speakers.filter((s) => !speakersOpt || speakersOpt.has(s.id));
const absMedia = (f: string) => (path.isAbsolute(f) ? f : f.startsWith('media/') ? path.join(MEDIA, f.slice(6)) : path.join(RUN, f));

// ------------------------------------------------------------------------------------------------ refs
/** The speakers: single Common Voice 17.0 clips (English, CC0-1.0; ungated mirror fixie-ai/common_voice_17_0 read
 *  through the HF datasets-server), picked by the contributor's own age/sex labels — `--pick id:row[:split],…` — plus
 *  the repository's English fixture. ONE clip is the whole reference, as Seed-TTS-eval does with Common Voice prompts:
 *  silence trimmed, loudness −20 LUFS, 24 kHz mono. The datasets-server could not list multi-clip speakers (index
 *  loading, then rate-limited, 2026-10-06), so there is no held-out real clip; `heldOut` stays for a later run. */
const DEFAULT_PICKS = 'cv-f-young:4542:test,cv-m-young:2104:test,cv-f-old:4852:test,cv-m-old:4369:test';
async function refs() {
  const picks = opt('pick', DEFAULT_PICKS).split(',').map((p) => { const [id, row, split] = p.split(':'); return { id, row: Number(row), split: split || 'test' }; });
  const out: Speaker[] = [];
  const dir = path.join(MEDIA, 'refs');
  await fs.mkdir(dir, { recursive: true });
  const dur = async (f: string) => Number((await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])).stdout);
  for (const p of picks) {
    const r = await fetch(`https://datasets-server.huggingface.co/rows?dataset=fixie-ai/common_voice_17_0&config=en&split=${p.split}&offset=${p.row}&length=1`);
    if (!r.ok) throw new Error(`datasets-server ${r.status} for ${p.id}`);
    const row = ((await r.json()) as { rows: Array<{ row: { client_id: string; age: string; gender: string; accent: string; sentence: string; up_votes: number; down_votes: number; audio: Array<{ src: string }> | { src: string } } }> }).rows[0].row;
    const src = Array.isArray(row.audio) ? row.audio[0].src : row.audio.src;
    const raw = path.join(dir, `${p.id}.src`);
    await fs.writeFile(raw, Buffer.from(await (await fetch(src)).arrayBuffer()));
    const ref = path.join(dir, `${p.id}.wav`);
    // CV clips carry click-to-speech gaps: trim both ends, then one loudness for every reference
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-ac', '1', '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,loudnorm=I=-20:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'pcm_s16le', ref]);
    await fs.unlink(raw);
    const sex = row.gender === 'male_masculine' ? 'M' : 'F';
    out.push({
      id: p.id, sex, age: row.age, label: `${sex === 'M' ? 'male' : 'female'}, ${row.age}${row.accent ? `, ${row.accent}` : ''}`,
      source: `Common Voice 17.0 en/${p.split} row ${p.row} (fixie-ai/common_voice_17_0), contributor ${row.client_id.slice(0, 12)}…, votes ${row.up_votes}/${row.down_votes}`, licence: 'CC0-1.0 (Mozilla Common Voice)',
      reference: rel(ref), referenceText: row.sentence, referenceSeconds: Math.round((await dur(ref)) * 100) / 100, clips: [{ idx: p.row, sentence: row.sentence, client: row.client_id.slice(0, 12) }],
    });
    console.log(`${p.id}: ${row.age} ${row.gender} "${row.sentence}" → ${ref}`);
  }
  const fx = path.resolve('tests/fixtures/speech-en.wav');
  const fxRef = path.join(dir, 'fixture-en.wav');
  await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', fx, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', fxRef]);
  out.push({ id: 'fixture-en', sex: 'M', age: 'adult (unlabelled)', label: 'tests/fixtures/speech-en.wav (the acceptance runs\' English recording)', source: 'repository fixture', licence: 'repository fixture', reference: rel(fxRef), referenceText: 'The last bus to Karada leaves at midnight, and the driver has decided it will be his final shift.' /* large-v3 transcript, docs/evidence/model-eval-2026-10/voice-en/report.json */, referenceSeconds: 6.3, clips: [] });
  await writeJson(speakersFile, { at: new Date().toISOString(), note: 'one reference clip per speaker (a single Common Voice clip, or the repository fixture); the reference transcript is sent to engines that take one', speakers: out });
}

// ------------------------------------------------------------------------------------------------ synth
/** What the engine is sent: English as written (the engines normalise English); Iraqi through the studio's own Iraqi
 *  preparation, the same text for every arm. */
const spokenText = (line: BenchLine) => (LANG === 'ar' ? prepareLineText(line.text, { engine: 'habibi', language: 'AR', dialect: 'IRAQI_BAGHDADI' }).text : line.text);
async function synthOne(base: string, sp: Speaker, line: BenchLine, seed: number, extra: Record<string, string>): Promise<Omit<Take, 'key' | 'engine' | 'speaker' | 'line' | 'session' | 'seed' | 'variant'>> {
  const fd = new FormData();
  fd.set('text', spokenText(line)); fd.set('language', LANG); fd.set('seed', String(seed));
  if (line.emotion) fd.set('emotion', line.emotion);
  if (sp.referenceText) fd.set('reference_text', sp.referenceText);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  fd.set('reference', new Blob([await fs.readFile(absMedia(sp.reference))]), path.basename(sp.reference));
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/synthesize`, { method: 'POST', body: fd, signal: AbortSignal.timeout(10 * 60_000) });
    if (!r.ok) return { ok: false, error: `${r.status} ${(await r.text()).slice(0, 300)}`, ms: Date.now() - t0 };
    const buf = Buffer.from(await r.arrayBuffer());
    const h = (n: string) => r.headers.get(n) ?? undefined;
    let params: Record<string, number> | undefined; try { params = JSON.parse(h('x-params') ?? '{}'); } catch { params = undefined; }
    return { ok: true, seconds: Number(h('x-duration')), ms: Number(h('x-ms') ?? Date.now() - t0), sampleRate: Number(h('x-sample-rate')), model: h('x-model'), engineVersion: h('x-engine-version'), params, peakVramMb: h('x-peak-vram-mb') ? Number(h('x-peak-vram-mb')) : undefined, durationControl: h('x-duration-control'), file: buf as unknown as string };
  } catch (e) { return { ok: false, error: (e as Error).message, ms: Date.now() - t0 }; }
}

async function synth() {
  const engine = opt('engine'); const base = refuseStudio(opt('base'));
  if (!engine || !base) throw new Error('--engine <name> --base <url>');
  const session = Number(opt('session', '1')) as 1 | 2;
  const durVia = opt('duration-via', engine === 'indextts' ? 'speed' : engine === 'moss' ? 'duration' : 'none');
  const lines = (await set()).filter((l) => !only || only.has(l.id));
  const sps = await speakers();
  const tf = takesFile(engine);
  const store = await readJson<{ takes: Take[] }>(tf, { takes: [] });
  const have = new Map(store.takes.map((t) => [t.key, t]));
  let n = 0;
  const save = () => writeJson(tf, store);
  const record = async (t: Take, res: Awaited<ReturnType<typeof synthOne>>) => {
    if (res.ok && res.file) {
      const f = path.join(MEDIA, engine, `${t.speaker}`, `${t.line}-s${t.session}-${t.variant}${t.durationTarget ? `-x${t.durationTarget.multiplier}` : ''}-seed${t.seed}.wav`);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, res.file as unknown as Buffer);
      res.file = rel(f);
    }
    const take = { ...t, ...res } as Take;
    store.takes = store.takes.filter((x) => x.key !== t.key).concat(take); have.set(t.key, take);
    await save();
    console.log(`${engine} ${t.speaker} ${t.line} s${t.session} ${t.variant}${t.durationTarget ? ` ×${t.durationTarget.multiplier}` : ''}: ${take.ok ? `${take.seconds?.toFixed(2)} s in ${take.ms} ms` : `FAILED ${take.error}`}`);
  };
  for (const sp of sps) for (const line of lines) {
    if (n >= limit) break;
    const lineSex = (line as BenchLine & { sex?: string }).sex;
    if (lineSex && lineSex !== 'ANY' && lineSex !== sp.sex) continue; // a line written for one sex (the Iraqi set's film lines)
    const plan: Array<{ seed: number; variant: Take['variant']; mult?: number }> = [];
    if (session === 1) { plan.push({ seed: 7, variant: 'natural' }); for (const m of line.durationTargets ?? []) if (durVia !== 'none') plan.push({ seed: 7, variant: 'duration', mult: m }); }
    else { if (line.session2) plan.push({ seed: 11, variant: 'natural' }); if (line.id === 'en-e1-calm') plan.push({ seed: 7, variant: 'repeat' }); }
    for (const p of plan) {
      const key = `${engine}|${sp.id}|${line.id}|s${session}|${p.variant}|${p.mult ?? ''}|${p.seed}`;
      if (have.has(key)) continue;
      const t: Take = { key, engine, speaker: sp.id, line: line.id, session, seed: p.seed, variant: p.variant, ok: false };
      // --form k=v,k=v: fixed extra fields for every request of this run (e.g. mode=continue for VoxCPM2's transcript mode)
      const extra: Record<string, string> = Object.fromEntries(opt('form').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
      if (p.mult) {
        const nat = have.get(`${engine}|${sp.id}|${line.id}|s1|natural||7`);
        if (!nat?.ok || !nat.seconds) continue;
        const target = nat.seconds * p.mult;
        t.durationTarget = { multiplier: p.mult, seconds: Math.round(target * 1000) / 1000, via: durVia };
        if (durVia === 'speed') extra.speed = String(Math.round((1 / p.mult) * 1000) / 1000);
        else extra.duration = String(Math.round(target * 1000) / 1000);
      }
      await record(t, await synthOne(base, sp, line, p.seed, extra));
      n++;
    }
  }
}

// ------------------------------------------------------------------------------------------------ score
const foldEn = (s: string) => foldEnglishNumbers(foldEnglishContractions(normalizeLatin(s.replace(/(\p{L})-(\p{L})/gu, '$1 $2'))));
const foldText = (s: string) => (LANG === 'ar' ? normalizeIraqi(s) : foldEn(s));
async function transcribe(asr: string, file: string): Promise<string> {
  const fd = new FormData();
  fd.set('file', new Blob([await fs.readFile(file)]), path.basename(file)); fd.set('language', LANG); fd.set('words', '0');
  const r = await fetch(`${asr}/transcribe`, { method: 'POST', body: fd, signal: AbortSignal.timeout(5 * 60_000) });
  if (!r.ok) throw new Error(`asr ${r.status} ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { text: string }).text.trim();
}
async function similarity(ecapa: string, a: string, b: string): Promise<number | undefined> {
  const fd = new FormData();
  fd.set('a', new Blob([await fs.readFile(a)]), path.basename(a)); fd.set('b', new Blob([await fs.readFile(b)]), path.basename(b));
  const r = await fetch(`${ecapa}/similarity`, { method: 'POST', body: fd, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) return undefined; // a clip under 0.5 s cannot be embedded: recorded as unmeasured
  return ((await r.json()) as { cosine: number }).cosine;
}
async function spectrogram(file: string): Promise<string> {
  const png = file.replace(/\.wav$/, '.png');
  await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', file, '-lavfi', 'showspectrumpic=s=640x200:legend=0:scale=log:fscale=lin:color=intensity', png]);
  return png;
}

/** What a reviewer should hear first: the machine's flags on one take. */
export function takeFlags(t: Pick<Take, 'seconds'>, s: Pick<Score, 'coverage' | 'cer' | 'leadingSilence' | 'trailingSilence' | 'longestPause' | 'wordsPerSecond' | 'heard' | 'truePeakDbtp'>, line: Pick<BenchLine, 'text' | 'category'>): string[] {
  const f: string[] = [];
  const words = foldText(line.text).split(' ').filter(Boolean).length;
  const heard = foldText(s.heard).split(' ').filter(Boolean).length;
  if (heard > words + Math.max(1, Math.round(words * 0.2))) f.push(`extra words heard (${heard} vs ${words}): hallucination or a repeated phrase`);
  if (s.coverage < 1) f.push(`words missing or wrong (coverage ${s.coverage.toFixed(2)})`);
  if ((s.leadingSilence ?? 0) > 0.6) f.push(`leading silence ${s.leadingSilence?.toFixed(2)} s`);
  if ((s.trailingSilence ?? 0) > 1.0) f.push(`trailing silence ${s.trailingSilence?.toFixed(2)} s`);
  if ((s.longestPause ?? 0) > 1.5) f.push(`pause of ${s.longestPause?.toFixed(2)} s inside the line`);
  if (s.wordsPerSecond !== undefined && (s.wordsPerSecond > 4.5 || (words > 3 && s.wordsPerSecond < 1.2))) f.push(`speaking rate ${s.wordsPerSecond} words/s`);
  if (line.category === 'short' && (t.seconds ?? 0) > 2.5) f.push(`a short line lasting ${t.seconds?.toFixed(2)} s (trailing syllable?)`);
  if ((s.truePeakDbtp ?? -99) > -0.9) f.push(`true peak ${s.truePeakDbtp} dBTP`);
  return f;
}

async function score() {
  const asr = refuseStudio(opt('asr')); const ecapa = refuseStudio(opt('ecapa'));
  const lines = new Map((await set()).map((l) => [l.id, l]));
  const sps = new Map((await speakers()).map((s) => [s.id, s]));
  const engines = opt('engine') ? [opt('engine')] : (await fs.readdir(path.join(RUN, 'takes')).catch(() => [])).map((f) => f.replace(/\.json$/, ''));
  for (const engine of engines) {
    const tf = takesFile(engine); const store = await readJson<{ takes: Take[] }>(tf, { takes: [] });
    let n = 0;
    for (const t of store.takes) {
      if (!t.ok || !t.file || (t.score && !argv.includes('--rescore')) || n >= limit) continue;
      if (only && !only.has(t.line)) continue;
      const sp = sps.get(t.speaker); const line = lines.get(t.line);
      if (!sp || !line) continue;
      const file = absMedia(t.file);
      const heard = await transcribe(asr, file);
      const coverage = scriptCoverage(line.text, heard, L); const cer = charErrorRate(line.text, heard, L);
      const v = verdict({ coverage, cer, context: 'line' });
      const m = await measureAudio(file);
      const speech = Math.max(0.05, (m.durationSeconds ?? 0) - (m.silence?.totalSeconds ?? 0));
      const s: Score = {
        heard, wer: Math.round(wordErrorRate(line.text, heard, L) * 1000) / 1000, werFolded: Math.round(wordErrorRate(foldText(line.text), foldText(heard), L) * 1000) / 1000,
        cer: Math.round(cer * 1000) / 1000, coverage: Math.round(coverage * 1000) / 1000, verdict: v.status, reasons: v.reasons,
        simRef: await similarity(ecapa, absMedia(sp.reference), file), simHeldOut: sp.heldOut ? await similarity(ecapa, absMedia(sp.heldOut), file) : undefined,
        lufs: m.lufs, truePeakDbtp: m.truePeakDbtp, leadingSilence: m.silence?.leadingSeconds, trailingSilence: m.silence?.trailingSeconds, longestPause: m.silence?.longestPauseSeconds, silenceRatio: m.silence?.ratio,
        wordsPerSecond: Math.round((foldText(line.text).split(' ').filter(Boolean).length / speech) * 100) / 100, flags: [],
        ...(LANG === 'ar' ? { lettersPerSecond: lettersPerSecond(line.text, m.durationSeconds ?? 0, m.silence?.totalSeconds ?? 0), msa: msaReadingFlags(line.text, heard) } : {}),
      };
      s.flags = takeFlags(t, s, line);
      if (LANG === 'ar' && (s as Score & { msa?: { msaLike?: boolean } }).msa?.msaLike) s.flags.push('MSA-like reading (heuristic: Iraqi markers heard as their MSA forms)');
      s.spectrogram = rel(await spectrogram(file));
      t.score = s; n++;
      console.log(`${engine} ${t.speaker} ${t.line} ${t.variant}: ${s.verdict} cov ${s.coverage} sim ${s.simRef} "${heard}"`);
      if (n % 10 === 0) await writeJson(tf, store);
    }
    await writeJson(tf, store);
  }
  // the speakers' own ceiling: reference vs held-out clip (two real recordings of one person)
  const spStore = await readJson<{ speakers: Array<Speaker & { realVsReal?: number }> }>(speakersFile, { speakers: [] });
  for (const sp of spStore.speakers) if (sp.heldOut && sp.realVsReal === undefined) sp.realVsReal = await similarity(ecapa, absMedia(sp.reference), absMedia(sp.heldOut));
  await writeJson(speakersFile, spStore);
}

// ------------------------------------------------------------------------------------------------ report
const mean = (xs: Array<number | undefined>) => { const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null; };
const median = (xs: Array<number | undefined>) => { const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };

export function summarize(takes: Take[], lines: Map<string, BenchLine>) {
  const nat = takes.filter((t) => t.session === 1 && t.variant === 'natural');
  const scored = nat.filter((t) => t.score);
  const cat = (c: string) => scored.filter((t) => lines.get(t.line)?.category === c);
  const pass = (ts: Take[]) => ({ pass: ts.filter((t) => t.score?.verdict === 'PASS').length, of: ts.length });
  const clean = (ts: Take[]) => ({ clean: ts.filter((t) => t.score && t.score.verdict === 'PASS' && t.score.flags.length === 0).length, of: ts.length });
  const dur = takes.filter((t) => t.variant === 'duration' && t.ok && t.durationTarget);
  const durErr = dur.map((t) => Math.abs((t.seconds ?? 0) - t.durationTarget!.seconds) / t.durationTarget!.seconds);
  const s2 = takes.filter((t) => t.session === 2 && t.variant === 'natural' && t.score);
  const rep = takes.filter((t) => t.variant === 'repeat' && t.ok);
  return {
    attempts: nat.length, requestFailures: nat.filter((t) => !t.ok).length,
    firstAttemptPass: pass(scored), firstAttemptClean: clean(scored),
    short: { ...pass(cat('short')), ...clean(cat('short')) }, long: { ...pass(cat('long')), coverageMean: mean(cat('long').map((t) => t.score?.coverage)) },
    numbersNames: pass([...cat('numbers'), ...cat('names')]), emotion: pass([...cat('emotion'), ...cat('exclamation')]),
    werFoldedMean: mean(scored.map((t) => t.score?.werFolded)), cerMean: mean(scored.map((t) => t.score?.cer)),
    simRefMean: mean(scored.map((t) => t.score?.simRef)), simRefMedian: median(scored.map((t) => t.score?.simRef)), simHeldOutMean: mean(scored.map((t) => t.score?.simHeldOut)),
    simRefShortMean: mean(cat('short').map((t) => t.score?.simRef)), simRefLongMean: mean(cat('long').map((t) => t.score?.simRef)),
    session2: { n: s2.length, simRefMean: mean(s2.map((t) => t.score?.simRef)), simSession1Mean: mean(s2.map((t) => (t as Take & { simSession1?: number }).simSession1)), pass: pass(s2) },
    determinism: { n: rep.length, identical: rep.filter((t) => (t as Take & { identicalToSession1?: boolean }).identicalToSession1).length, simSession1Mean: mean(rep.map((t) => (t as Take & { simSession1?: number }).simSession1)) },
    duration: { n: dur.length, meanAbsErrorPct: durErr.length ? Math.round(mean(durErr)! * 1000) / 10 : null, maxAbsErrorPct: durErr.length ? Math.round(Math.max(...durErr) * 1000) / 10 : null, via: dur[0]?.durationTarget?.via ?? 'none' },
    latency: { msMedian: median(nat.map((t) => t.ms)), rtfMedian: median(nat.filter((t) => t.ok && t.seconds).map((t) => (t.ms ?? 0) / 1000 / t.seconds!)) },
    peakVramMb: Math.max(0, ...takes.map((t) => t.peakVramMb ?? 0)) || null,
    flagged: scored.filter((t) => t.score!.flags.length).length,
    model: nat.find((t) => t.model)?.model, engineVersion: nat.find((t) => t.engineVersion)?.engineVersion,
  };
}

async function report() {
  const lineList = await set(); const lines = new Map(lineList.map((l) => [l.id, l]));
  const sps = (await readJson<{ speakers: Array<Speaker & { realVsReal?: number }> }>(speakersFile, { speakers: [] })).speakers;
  const engines = (await fs.readdir(path.join(RUN, 'takes')).catch(() => [])).map((f) => f.replace(/\.json$/, '')).sort();
  const all: Record<string, Take[]> = {};
  for (const e of engines) all[e] = (await readJson<{ takes: Take[] }>(takesFile(e), { takes: [] })).takes;
  const meta = await readJson<Record<string, unknown>>(path.join(RUN, 'engines.json'), {});
  const summary = Object.fromEntries(engines.map((e) => [e, summarize(all[e], lines)]));
  // cross-session ECAPA: session-1 vs session-2 take of the same speaker and line (needs the bench's /similarity)
  await writeJson(path.join(RUN, 'report.json'), { at: new Date().toISOString(), set: path.relative(process.cwd(), SET_FILE).replace(/\\/g, '/'), speakers: sps, engines: meta, summary, listening: 'PENDING — naturalness, emotion and same-voice need a human listener (index.html has the players)' });
  await fs.writeFile(path.join(RUN, 'index.html'), renderHtml(engines, all, summary, sps, lineList, meta), 'utf8');
  console.log(JSON.stringify(summary, null, 1));
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function renderHtml(engines: string[], all: Record<string, Take[]>, summary: Record<string, ReturnType<typeof summarize>>, sps: Array<Speaker & { realVsReal?: number }>, lineList: BenchLine[], meta: Record<string, unknown>): string {
  const fmt = (x: { pass?: number; clean?: number; of: number }, k: 'pass' | 'clean' = 'pass') => `${x[k] ?? 0}/${x.of}`;
  const rows = engines.map((e) => { const s = summary[e]; return `<tr><th>${esc(e)}</th><td>${fmt(s.firstAttemptPass)}</td><td>${fmt(s.firstAttemptClean, 'clean')}</td><td>${s.werFoldedMean ?? '—'}</td><td>${s.simRefMean ?? '—'}</td><td>${s.simHeldOutMean ?? '—'}</td><td>${fmt(s.short)} / ${fmt(s.short, 'clean')}</td><td>${fmt(s.long)} (cov ${s.long.coverageMean ?? '—'})</td><td>${fmt(s.numbersNames)}</td><td>${s.duration.n ? `${s.duration.meanAbsErrorPct}% (max ${s.duration.maxAbsErrorPct}%, ${esc(s.duration.via)})` : 'none'}</td><td>${s.session2.simRefMean ?? '—'} (s1↔s2 ${s.session2.simSession1Mean ?? '—'}; same-seed identical ${s.determinism.identical}/${s.determinism.n})</td><td>${s.latency.rtfMedian?.toFixed(2) ?? '—'}</td><td>${s.peakVramMb ?? '—'}</td></tr>`; }).join('');
  const spRows = sps.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.label)} (${esc(s.age)})</td><td>${s.referenceSeconds} s</td><td><audio controls preload="none" src="${esc(s.reference)}"></audio></td><td>${esc(s.referenceText)}</td><td>${s.realVsReal ?? '—'}</td><td>${esc(s.source)}; ${esc(s.licence)}</td></tr>`).join('');
  const take = (t?: Take) => !t ? '<td class="na">—</td>' : !t.ok ? `<td class="bad">FAILED<br><small>${esc(t.error)}</small></td>` : `<td class="${t.score?.verdict === 'PASS' ? (t.score.flags.length ? 'warn' : 'ok') : 'bad'}"><audio controls preload="none" src="${esc(t.file)}"></audio><br><small>${t.seconds?.toFixed(2)} s · sim ${t.score?.simRef ?? '—'} · ${esc(t.score?.verdict ?? 'unscored')}</small><br><small class="heard">“${esc(t.score?.heard)}”</small>${t.score?.flags.length ? `<br><small class="flag">${t.score.flags.map(esc).join('<br>')}</small>` : ''}${t.score?.spectrogram ? `<details><summary>spectrogram</summary><img loading="lazy" src="${esc(t.score.spectrogram)}" alt="spectrogram"></details>` : ''}<div class="rate" data-key="${esc(t.key)}"></div></td>`;
  const grids = sps.map((sp) => `<h3>${esc(sp.id)} — ${esc(sp.label)}</h3><table class="grid"><tr><th>line</th>${engines.map((e) => `<th>${esc(e)}</th>`).join('')}</tr>${lineList.map((l) => `<tr><th><b>${esc(l.id)}</b><br><small>${esc(l.text)}</small><br><small>emotion: ${esc(l.emotion)}</small></th>${engines.map((e) => take(all[e].find((t) => t.speaker === sp.id && t.line === l.id && t.session === 1 && t.variant === 'natural'))).join('')}</tr>`).join('')}</table>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice bench 2026-10</title><style>
:root{--bg:#111214;--fg:#e8e8ea;--mut:#9a9aa2;--line:#2a2b30;--ok:#1d3b2a;--warn:#3b351d;--bad:#3f1f22}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}h1,h2,h3{font-weight:600}table{border-collapse:collapse;margin:8px 0 24px;max-width:100%}
td,th{border:1px solid var(--line);padding:6px;vertical-align:top;text-align:left}small{color:var(--mut)}.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}.flag{color:#f0c674}
.grid audio{width:220px}.grid img{width:320px}.wrap{overflow-x:auto}.heard{font-style:italic}.note{max-width:900px;color:var(--mut)}</style></head><body>
<h1>English voice benchmark — 2026-10</h1>
<p class="note">One corpus (${lineList.length} lines), single-clip references, attempt #1 only (no engine-internal retries; failures kept). Metrics are machine checks: transcript by faster-whisper large-v3 (asr service), the studio's own gate (coverage ≥ 0.85 and CER ≤ 0.15 → PASS), ECAPA cosine (spkrec-ecapa-voxceleb) to the reference and to a held-out real clip of the same speaker. <b>Naturalness, emotion and same-voice are NOT measured here: a human listener must judge them</b> (listening status: PENDING). WAV and PNG files stay on the workstation (git-ignored).</p>
<h2>Summary</h2><div class="wrap"><table><tr><th>engine</th><th>attempt #1 PASS</th><th>PASS + no flag</th><th>WER (folded)</th><th>ECAPA vs ref</th><th>ECAPA vs held-out</th><th>one/two-word PASS / clean</th><th>long PASS</th><th>names+numbers PASS</th><th>duration control |err|</th><th>session 2: ECAPA vs ref (vs session 1; determinism)</th><th>RTF median</th><th>peak VRAM MB</th></tr>${rows}</table></div>
<h2>Engines</h2><pre>${esc(JSON.stringify(meta, null, 2))}</pre>
<h2>Speakers (one reference clip each)</h2><div class="wrap"><table><tr><th>id</th><th>who</th><th>length</th><th>reference</th><th>its words</th><th>real-vs-real ECAPA</th><th>source / licence</th></tr>${spRows}</table></div>
<h2>Every take (session 1, seed 7)</h2><div class="wrap">${grids}</div></body></html>`;
}

// ------------------------------------------------------------------------------------------------ consistency
/** Session 2 against session 1: ECAPA between the two takes of one speaker and line (cross-session timbre), and the
 *  same-seed repeat compared byte for byte (determinism) and by ECAPA. Stored on the session-2 takes. */
async function consistency() {
  const ecapa = refuseStudio(opt('ecapa'));
  for (const f of await fs.readdir(path.join(RUN, 'takes')).catch(() => [] as string[])) {
    const tf = path.join(RUN, 'takes', f); const store = await readJson<{ takes: Array<Take & { simSession1?: number; identicalToSession1?: boolean }> }>(tf, { takes: [] });
    for (const t of store.takes.filter((x) => x.session === 2 && x.ok && x.file)) {
      const s1 = store.takes.find((x) => x.session === 1 && x.variant === 'natural' && x.speaker === t.speaker && x.line === t.line && x.ok && x.file);
      if (!s1) continue;
      t.simSession1 = await similarity(ecapa, absMedia(s1.file!), absMedia(t.file!));
      if (t.variant === 'repeat') t.identicalToSession1 = Buffer.compare(await fs.readFile(absMedia(s1.file!)), await fs.readFile(absMedia(t.file!))) === 0;
      console.log(`${f} ${t.speaker} ${t.line} ${t.variant}: sim(s1,s2) ${t.simSession1}${t.variant === 'repeat' ? ` identical ${t.identicalToSession1}` : ''}`);
    }
    await writeJson(tf, store);
  }
}

// ------------------------------------------------------------------------------------------------ voices / import
/** Speakers from a voices file (the format of tests/fixtures/voice/iraqi-eval-voices.example.json: { voices: [{ id,
 *  sex, file, text, label, origin }] }, paths relative to the file), copied to 24 kHz mono as the references. For the
 *  Iraqi comparison these must be consented Iraqi recordings; a designed seed is the experiment path and is labelled. */
async function voices() {
  const vf = path.resolve(opt('voices'));
  const v = await readJson<{ voices: Array<{ id: string; sex: 'M' | 'F'; file: string; text?: string; label?: string; origin?: string; age?: string }> }>(vf, { voices: [] });
  if (!v.voices.length) throw new Error('--voices <file> with { voices: [...] }');
  const dir = path.join(MEDIA, 'refs'); await fs.mkdir(dir, { recursive: true });
  const out: Speaker[] = [];
  for (const x of v.voices) {
    const ref = path.join(dir, `${x.id}.wav`);
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', path.resolve(path.dirname(vf), x.file), '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', ref]);
    const seconds = Number((await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ref])).stdout);
    out.push({ id: x.id, sex: x.sex, age: x.age ?? 'unlabelled', label: x.label ?? x.id, source: `${path.basename(vf)} → ${x.file}`, licence: x.origin === 'DESIGNED' ? 'designed seed (VoxCPM2, Apache-2.0) — SYNTHETIC, not a recording' : 'consented recording (see the voices file)', reference: rel(ref), referenceText: x.text ?? '', referenceSeconds: Math.round(seconds * 100) / 100, clips: [] });
  }
  await writeJson(speakersFile, { at: new Date().toISOString(), note: `from ${path.basename(vf)}`, synthetic: v.voices.some((x) => x.origin === 'DESIGNED'), speakers: out });
}

/** Takes rendered elsewhere (an arm without a /synthesize service — e.g. MiniMax H3's native speech rendered by ComfyUI,
 *  audio extracted with ffmpeg): `--dir <folder>` holding <speaker>/<line>.wav (or .m4a/.mp4: the audio is extracted),
 *  recorded as attempt #1 of engine `--engine`. */
async function importTakes() {
  const engine = opt('engine'); const dir = path.resolve(opt('dir'));
  if (!engine || !opt('dir')) throw new Error('--engine <name> --dir <folder of <speaker>/<line>.(wav|m4a|mp4)>');
  const tf = takesFile(engine); const store = await readJson<{ takes: Take[] }>(tf, { takes: [] });
  for (const sp of await fs.readdir(dir)) for (const f of await fs.readdir(path.join(dir, sp)).catch(() => [] as string[])) {
    const m = /^(.+)\.(wav|m4a|mp4|mov|flac)$/i.exec(f); if (!m) continue;
    const line = m[1]; const key = `${engine}|${sp}|${line}|s1|natural||0`;
    const out = path.join(MEDIA, engine, sp, `${line}-s1-natural-imported.wav`); await fs.mkdir(path.dirname(out), { recursive: true });
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', path.join(dir, sp, f), '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out]);
    const seconds = Number((await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).stdout);
    store.takes = store.takes.filter((t) => t.key !== key).concat({ key, engine, speaker: sp, line, session: 1, seed: 0, variant: 'natural', ok: true, file: rel(out), seconds, model: `${engine} (imported from ${path.basename(dir)})` });
  }
  await writeJson(tf, store);
  console.log(`${engine}: ${store.takes.length} takes`);
}

// ------------------------------------------------------------------------------------------------ blind review
/** A BLIND listening page for the native reviewer (the Iraqi phase; usable for English too): per line and speaker the
 *  arms' takes in a shuffled order labelled A, B, C…, the reference first; the form asks naturalness (1–5), Baghdadi
 *  dialect (yes / partly / no — MSA), same voice as the reference (1–5), words wrong, and a note; "Save" downloads the
 *  ratings as JSON. The key (label → engine) is written to blind-key.json, NOT into the page. Arms marked
 *  researchReference (non-commercial licences, e.g. Fish Audio) are reviewed blind like the others and only labelled
 *  in the key and the report. */
async function review() {
  const arms = await readJson<{ arms: Array<{ engine: string; researchReference?: boolean; licence?: string }> }>(path.resolve(opt('arms', 'tests/fixtures/voice/iraqi-engine-arms.json')), { arms: [] });
  const lineList = await set(); const sps = (await readJson<{ speakers: Speaker[] }>(speakersFile, { speakers: [] })).speakers;
  const engines = (await fs.readdir(path.join(RUN, 'takes')).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')).filter((e) => !arms.arms.length || arms.arms.some((a) => a.engine === e));
  const all: Record<string, Take[]> = {};
  for (const e of engines) all[e] = (await readJson<{ takes: Take[] }>(takesFile(e), { takes: [] })).takes;
  // a fixed shuffle per (speaker, line): reproducible, different on every row
  let seed = Number(opt('shuffle-seed', '20261006'));
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const key: Record<string, Record<string, string>> = {};
  const items: string[] = [];
  for (const sp of sps) for (const l of lineList) {
    const takes = engines.map((e) => all[e].find((t) => t.speaker === sp.id && t.line === l.id && t.session === 1 && t.variant === 'natural' && t.ok && t.file)).filter((t): t is Take => Boolean(t));
    if (!takes.length) continue;
    const order = takes.map((t) => ({ t, r: rnd() })).sort((a, b) => a.r - b.r).map((x) => x.t);
    const row = `${sp.id}|${l.id}`; key[row] = {};
    const cells = order.map((t, i) => { const label = String.fromCharCode(65 + i); key[row][label] = t.engine; const n = `${row}|${label}`;
      return `<div class="take"><b>${label}</b> <audio controls preload="none" src="${esc(t.file)}"></audio>
<label>natural <select name="${esc(n)}|natural"><option></option>${[1, 2, 3, 4, 5].map((x) => `<option>${x}</option>`).join('')}</select></label>
${LANG === 'ar' ? `<label>Baghdadi <select name="${esc(n)}|dialect"><option></option><option>yes</option><option>partly</option><option>no (MSA / other)</option></select></label>` : ''}
<label>same voice as reference <select name="${esc(n)}|same"><option></option>${[1, 2, 3, 4, 5].map((x) => `<option>${x}</option>`).join('')}</select></label>
<label>emotion as asked <select name="${esc(n)}|emotion"><option></option><option>yes</option><option>partly</option><option>no</option></select></label>
<label>words wrong <input name="${esc(n)}|wrong" size="18"></label><label>note <input name="${esc(n)}|note" size="24"></label></div>`; }).join('');
    items.push(`<section><h3 dir="auto">${esc(l.text)}</h3><p><small>${esc(l.id)} · ${esc((l as BenchLine & { gloss?: string }).gloss ?? '')} · asked emotion: ${esc(l.emotion ?? '—')} · voice ${esc(sp.id)}</small> reference: <audio controls preload="none" src="${esc(sp.reference)}"></audio></p>${cells}</section>`);
  }
  await writeJson(path.join(RUN, 'blind-key.json'), { note: 'label → engine per speaker|line; do not show to the reviewer before the ratings are saved', arms: arms.arms, key });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind voice review</title><style>
:root{--bg:#111214;--fg:#e8e8ea;--mut:#9a9aa2;--line:#2a2b30}body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px}
section{border-top:1px solid var(--line);padding:12px 0}.take{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}small{color:var(--mut)}h3{font-weight:600;font-size:20px}
select,input{background:#1b1c20;color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:3px}button{padding:8px 16px;font-size:15px}</style></head><body>
<h1>Blind listening review${LANG === 'ar' ? ' — Iraqi (Baghdadi) Arabic' : ''}</h1>
<p>Each line is spoken by several engines in a <b>random order (A, B, C…)</b>; which engine is which is not on this page. Listen to the reference first, then rate every take. ${LANG === 'ar' ? 'The dialect question is the one no machine can answer: is this how a Baghdadi says it?' : ''} Your name: <input id="who" size="20"> <button onclick="save()">Save ratings (JSON)</button></p>
${items.join('\n')}
<p><button onclick="save()">Save ratings (JSON)</button></p>
<script>function save(){const r={};document.querySelectorAll('select,input[name]').forEach(e=>{if(e.value)r[e.name]=e.value});const b=new Blob([JSON.stringify({reviewer:document.getElementById('who').value,at:new Date().toISOString(),ratings:r},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='blind-review-'+(document.getElementById('who').value||'anon').replace(/\\W+/g,'-')+'.json';a.click()}</script></body></html>`;
  await fs.writeFile(path.join(RUN, 'review-blind.html'), html, 'utf8');
  console.log(`${items.length} rows; key → blind-key.json; page → review-blind.html`);
}

const run = { refs, voices, synth, import: importTakes, score, consistency, report, review }[mode as 'refs'];
if (!run) { console.error('usage: voice-bench.ts refs|voices|synth|import|score|consistency|report|review [options] (see the header)'); process.exit(2); }
await run();

/* VOICE ACTING EVALUATION (docs/VOICE-ENGINE.md §Evaluation). The producer's six tests (tests/fixtures/voice/
 * acting-eval-2026-10.json) through every arm — Habibi IRQ (Arabic only), Fish S2 Pro plain, Fish S2 Pro with its
 * inline [tags] — via each service's /synthesize contract, never the studio. ONE attempt per arm per test at a fixed
 * seed; a failed request is recorded as that attempt, never retried. Phases, so one model is on the card at a time:
 *
 *   refs                                   copy the references into the run (AR: the upstream Habibi IRQ demo clip —
 *                                          LAB TEST, no speaker permission; EN: Marcus Bell's designed voice, synthetic)
 *   synth  --arm <id> --base <url>         speak the tests (run under scripts/gpu-hold.ts TTS)
 *   score  --asr <url> --ecapa <url>       transcript, CER/coverage (the studio's folds), Iraqi phoneme gate, ECAPA
 *                                          similarity to the reference, level, pauses, RTF, VRAM (gpu-hold ASR)
 *   report                                 report.json + listen.html (blind: arms shuffled per test, keys withheld)
 *   grades --file <ratings.json>           import a native listener's ratings (the page's download) into report.json
 *
 * --run <dir> (default var/eval/voice-acting-2026-10). Machine numbers are supporting evidence only: the listener decides.
 * No score is ever written that a person did not give. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { charErrorRate, scriptCoverage, verdict, normalizeIraqi, normalizeLatin, foldEnglishContractions, foldEnglishNumbers } from '@/server/providers/speech';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { measureAudio } from './lib/voice-eval-metrics.mjs';

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n: string, d = '') => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const RUN = path.resolve(opt('run', 'var/eval/voice-acting-2026-10'));
// --set: the fixture (default the acting evaluation; the producer's Iraqi listening pack is iraqi-listening-2026-10)
const SET = path.resolve(opt('set', 'tests/fixtures/voice/acting-eval-2026-10.json'));
const refuseStudio = (u: string) => { if (!u || /:4200\b|\/api(\/|$)/.test(u)) { console.error(`refusing: ${u || '(no url)'}`); process.exit(2); } return u.replace(/\/$/, ''); };

interface Test { id: string; language: 'AR' | 'EN'; dialect?: string; intent: string; text: string; tagged: string; tagSource?: string; dialectWords?: string[] }
interface Arm { id: string; engine: string; base?: string; languages: Array<'AR' | 'EN'>; textField: 'text' | 'tagged'; acting: string; seed?: number }
interface Ref { language: 'AR' | 'EN'; file: string; text: string; source: string; licence: string; labOnly: boolean; sha256?: string }
interface Take {
  arm: string; test: string; engine: string; attempt: 1; seed: number; sent: string; ok: boolean; error?: string; file?: string;
  /** the engine's output as produced (32-bit float, no limiter) and the gain-only listening copy made from it */
  raw?: { file: string; sha256: string; peakDbfs?: number; lufs?: number }; listening?: { file: string; gainDb: number; targetLufs: number };
  referenceSha256?: string; at?: string;
  seconds?: number; ms?: number; rtf?: number; sampleRate?: number; model?: string; engineVersion?: string; params?: unknown; peakVramMb?: number; licence?: string;
  score?: Record<string, unknown>;
}

const readJson = async <T>(f: string, d: T): Promise<T> => { try { return JSON.parse(await fs.readFile(f, 'utf8')) as T; } catch { return d; } };
const writeJson = (f: string, v: unknown) => fs.mkdir(path.dirname(f), { recursive: true }).then(() => fs.writeFile(f, JSON.stringify(v, null, 2), 'utf8'));
const set = () => readJson<{ tests: Test[]; arms: Arm[]; seed?: number; scales?: string[] }>(SET, { tests: [], arms: [] });
const sha256File = async (f: string) => crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');

/** Integrated loudness (LUFS) and true peak (dBTP) of a file, by ffmpeg's EBU R128 meter. */
async function loudnessOf(file: string): Promise<{ lufs: number; truePeak: number }> {
  const { execFile } = await import('node:child_process');
  const out = await new Promise<string>((resolve, reject) => execFile('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: 1e7 }, (e, _o, err) => (e ? reject(e) : resolve(String(err)))));
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1] ?? NaN);
  const truePeak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1] ?? NaN);
  return { lufs, truePeak };
}

/** THE LISTENING COPY: the raw file with ONE gain to -20 LUFS (less when that would push the true peak over -1 dBTP) —
 *  no limiter, no compression, no denoise, nothing else; the raw file is never touched. */
async function listeningCopy(raw: string, out: string, targetLufs = -20): Promise<{ gainDb: number; lufs: number; truePeak: number }> {
  const m = await loudnessOf(raw);
  const gainDb = Number.isFinite(m.lufs) ? Math.min(targetLufs - m.lufs, Number.isFinite(m.truePeak) ? -1 - m.truePeak : 0) : 0;
  const { execFile } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => execFile('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `volume=${gainDb.toFixed(2)}dB`, '-c:a', 'pcm_s16le', out], (e) => (e ? reject(e) : resolve())));
  return { gainDb: Math.round(gainDb * 100) / 100, ...m };
}
const takesFile = path.join(RUN, 'takes.json');
const refsFile = path.join(RUN, 'refs.json');
const media = (f: string) => path.join(RUN, f);

async function refs() {
  const lab = 'var/eval/LAB-TEST-iraqi-raw-parity-20261008';
  const arText = (await fs.readFile(path.join(lab, '_ref_text.txt'), 'utf8')).trim();
  await fs.mkdir(path.join(RUN, 'media'), { recursive: true });
  await fs.copyFile('C:/Users/MTA/Downloads/src_habibi_tts_assets_IRQ.wav', media('media/ref-ar.wav'));
  const arRef: Ref = { language: 'AR', file: 'media/ref-ar.wav', text: arText, source: 'SWivid/Habibi-TTS assets IRQ demo clip (upstream)', licence: 'upstream demo — LAB TEST ONLY, no speaker permission', labOnly: true, sha256: await sha256File(media('media/ref-ar.wav')) };
  const { tests } = await set();
  if (!tests.some((t) => t.language === 'EN')) {
    await writeJson(refsFile, { refs: [arRef] });
    await fs.writeFile(path.join(RUN, 'LAB-TEST-NOT-PRODUCTION.txt'), 'The Arabic outputs clone the upstream Habibi demo speaker (no speaker permission): LAB TEST ONLY, never production, never published, never a Vewbox character.\n', 'utf8');
    console.log(JSON.stringify([{ ...arRef, text: arRef.text.slice(0, 60) }], null, 1));
    return;
  }
  const { readState } = await import('@/server/studio/engine');
  const { state } = await readState();
  const marcus = state.characters.find((c) => c.name === 'Marcus Bell');
  const id = marcus?.voice?.identity;
  const asset = state.assets.find((a) => a.id === id?.referenceAssetId);
  const rel = (asset?.provenance as { path?: string } | undefined)?.path;
  if (!id?.referenceText || !rel) throw new Error('Marcus Bell has no stored reference and transcript');
  const { libraryRoot } = await import('@/server/media');
  await fs.copyFile(path.join(libraryRoot(), rel), media('media/ref-en.wav'));
  const out: Ref[] = [
    { language: 'AR', file: 'media/ref-ar.wav', text: arText, source: 'SWivid/Habibi-TTS assets IRQ demo clip (upstream)', licence: 'upstream demo — LAB TEST ONLY, no speaker permission', labOnly: true },
    { language: 'EN', file: 'media/ref-en.wav', text: id.referenceText, source: `Marcus Bell's designed voice (${asset!.id}, VoxCPM2 design)`, licence: 'synthetic designed voice (studio-owned)', labOnly: false },
  ];
  await writeJson(refsFile, { refs: out });
  await fs.writeFile(path.join(RUN, 'LAB-TEST-NOT-PRODUCTION.txt'), 'The Arabic outputs clone the upstream Habibi demo speaker (no speaker permission): LAB TEST ONLY, never production, never published.\n', 'utf8');
  console.log(JSON.stringify(out.map((r) => ({ ...r, text: r.text.slice(0, 60) })), null, 1));
}

async function synth() {
  const s = await set();
  const { tests, arms } = s;
  const arm = arms.find((a) => a.id === opt('arm'));
  if (!arm) throw new Error(`--arm must be one of ${arms.map((a) => a.id).join(', ')}`);
  const base = refuseStudio(opt('base', arm.base ?? ''));
  const seed = s.seed ?? arm.seed ?? 20261008;
  // --as-prepared: the acting evaluation sent Habibi the studio's prepared text; the listening pack sends every engine
  // the line exactly as written (the producer: "do not rewrite these lines")
  const prepared = argv.includes('--as-prepared');
  const { refs: rs } = await readJson<{ refs: Ref[] }>(refsFile, { refs: [] });
  const store = await readJson<{ takes: Take[] }>(takesFile, { takes: [] });
  await fs.mkdir(media('media/raw'), { recursive: true });
  for (const t of tests) {
    if (store.takes.some((x) => x.arm === arm.id && x.test === t.id)) { console.log(`${arm.id}/${t.id}: already attempted (attempt 1 is final)`); continue; }
    if (!arm.languages.includes(t.language)) { store.takes.push({ arm: arm.id, test: t.id, engine: arm.engine, attempt: 1, seed, sent: '', ok: false, error: `NOT_SUPPORTED: ${arm.engine} does not speak ${t.language}` }); continue; }
    const ref = rs.find((r) => r.language === t.language)!;
    const line = t[arm.textField];
    const sent = prepared && arm.engine === 'habibi' ? prepareLineText(line, { engine: 'habibi', language: 'AR', dialect: 'IRAQI_BAGHDADI' }).text : line;
    const fd = new FormData();
    fd.set('text', sent); fd.set('language', t.language === 'AR' ? 'ar' : 'en'); fd.set('engine', arm.engine);
    if (t.language === 'AR') fd.set('dialect', 'IRQ');
    fd.set('reference', new Blob([await fs.readFile(media(ref.file))]), path.basename(ref.file));
    fd.set('reference_text', ref.text); fd.set('seed', String(seed)); fd.set('raw', '1');
    const take: Take = { arm: arm.id, test: t.id, engine: arm.engine, attempt: 1, seed, sent, ok: false, referenceSha256: ref.sha256 ?? await sha256File(media(ref.file)), at: new Date().toISOString() };
    const t0 = Date.now();
    try {
      const r = await fetch(`${base}/synthesize`, { method: 'POST', body: fd, signal: AbortSignal.timeout(15 * 60_000) });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
      const h = (k: string) => r.headers.get(k) ?? undefined;
      if (h('x-raw') !== '1') throw new Error('the service did not return its raw output (x-raw): restart it on the current code');
      const rawFile = `media/raw/${arm.id}-${t.id}.wav`;
      await fs.writeFile(media(rawFile), Buffer.from(await r.arrayBuffer()));
      const file = `media/${arm.id}-${t.id}.wav`;
      const copy = await listeningCopy(media(rawFile), media(file));
      const seconds = Number(h('x-duration') ?? 0); const ms = Number(h('x-ms') ?? Date.now() - t0);
      Object.assign(take, {
        ok: true, file, raw: { file: rawFile, sha256: await sha256File(media(rawFile)), peakDbfs: copy.truePeak, lufs: copy.lufs }, listening: { file, gainDb: copy.gainDb, targetLufs: -20 },
        seconds, ms, rtf: seconds ? Math.round((ms / 1000 / seconds) * 100) / 100 : undefined, sampleRate: Number(h('x-sample-rate') ?? 0), model: h('x-model'), engineVersion: h('x-engine-version'),
        params: JSON.parse(h('x-params') ?? '{}'), peakVramMb: h('x-peak-vram-mb') ? Number(h('x-peak-vram-mb')) : undefined, licence: h('x-license'),
      });
    } catch (e) { take.error = (e as Error).message; }
    store.takes.push(take);
    await writeJson(takesFile, store);
    console.log(`${arm.id}/${t.id}: ${take.ok ? `${take.seconds?.toFixed(2)} s in ${take.ms} ms (RTF ${take.rtf})` : `FAILED ${take.error}`}`);
  }
  await writeJson(takesFile, store);
}

const foldEn = (s: string) => foldEnglishNumbers(foldEnglishContractions(normalizeLatin(s)));
const stripTags = (s: string) => s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

async function score() {
  const asr = refuseStudio(opt('asr')); const ecapa = opt('ecapa') ? refuseStudio(opt('ecapa')) : '';
  const { tests } = await set();
  const { refs: rs } = await readJson<{ refs: Ref[] }>(refsFile, { refs: [] });
  const store = await readJson<{ takes: Take[] }>(takesFile, { takes: [] });
  const { dialectPhonemes, isQaUnavailable } = await import('@/server/providers/qa-service');
  const { judgeLine } = await import('@/server/media/iraqi-phonology');
  for (const tk of store.takes) {
    if (!tk.ok || !tk.file || (tk.score && !argv.includes('--rescore'))) continue;
    const t = tests.find((x) => x.id === tk.test)!;
    const L = t.language;
    // the machine measures what the engine produced (the raw file when there is one), never the listening copy
    const file = media(tk.raw?.file ?? tk.file);
    const fd = new FormData();
    fd.set('file', new Blob([await fs.readFile(file)]), path.basename(file)); fd.set('language', L === 'AR' ? 'ar' : 'en'); fd.set('words', '0');
    const r = await fetch(`${asr}/transcribe`, { method: 'POST', body: fd, signal: AbortSignal.timeout(5 * 60_000) });
    const heard = r.ok ? ((await r.json()) as { text: string }).text.trim() : '';
    // the second ear: Qwen3-ASR (the frozen stack's transcriber), beside the dialect Whisper
    const fq = new FormData();
    fq.set('file', new Blob([await fs.readFile(file)]), path.basename(file)); fq.set('language', L === 'AR' ? 'ar' : 'en');
    const rq = await fetch(`${asr}/transcribe_qwen`, { method: 'POST', body: fq, signal: AbortSignal.timeout(5 * 60_000) }).catch(() => undefined);
    const heardQwen = rq?.ok ? ((await rq.json()) as { text: string }).text.trim() : undefined;
    const coverage = scriptCoverage(t.text, heard, L); const cer = charErrorRate(t.text, heard, L);
    const v = verdict({ coverage, cer, context: 'line' });
    const m = await measureAudio(file);
    let phonology: unknown;
    if (L === 'AR') {
      try {
        const ph = await dialectPhonemes(file, stripTags(t.text));
        phonology = isQaUnavailable(ph) ? { verdict: 'NOT_MEASURED', why: ph } : judgeLine(ph.words);
      } catch (e) { phonology = { verdict: 'NOT_MEASURED', why: (e as Error).message }; }
    }
    let similarity: number | undefined;
    if (ecapa) {
      const ref = rs.find((x) => x.language === L)!;
      const f2 = new FormData();
      f2.set('a', new Blob([await fs.readFile(media(ref.file))]), 'ref.wav'); f2.set('b', new Blob([await fs.readFile(file)]), path.basename(file));
      const s = await fetch(`${ecapa}/similarity`, { method: 'POST', body: f2, signal: AbortSignal.timeout(120_000) }).catch(() => undefined);
      similarity = s?.ok ? Math.round(((await s.json()) as { cosine: number }).cosine * 1000) / 1000 : undefined;
    }
    const silences = (m.silence?.silences ?? []) as Array<{ start: number; end: number }>;
    const inner = silences.filter((s) => s.start > (m.silence?.leadingSeconds ?? 0) + 0.01 && s.end < (m.durationSeconds ?? 0) - (m.silence?.trailingSeconds ?? 0) - 0.01);
    tk.score = {
      heard, heardFolded: L === 'AR' ? normalizeIraqi(heard) : foldEn(heard), cer: Math.round(cer * 1000) / 1000, coverage: Math.round(coverage * 1000) / 1000, intelligibility: v.status, reasons: v.reasons,
      ...(heardQwen !== undefined ? { heardQwen, cerQwen: Math.round(charErrorRate(stripTags(t.text), heardQwen, L) * 1000) / 1000 } : {}),
      phonology, speakerSimilarity: similarity, lufs: m.lufs, truePeakDbtp: m.truePeakDbtp, leadingSilence: m.silence?.leadingSeconds, trailingSilence: m.silence?.trailingSeconds,
      innerPauses: inner.length, longestPause: m.silence?.longestPauseSeconds, silenceRatio: m.silence?.ratio,
    };
    await writeJson(takesFile, store);
    console.log(`${tk.arm}/${tk.test}: CER ${tk.score.cer} coverage ${tk.score.coverage} ${v.status}; pauses ${inner.length}; sim ${similarity ?? '-'}; phonology ${(phonology as { verdict?: string } | undefined)?.verdict ?? '-'} | heard: ${heard}`);
  }
}

/** PITCH (supporting evidence): pYIN F0 statistics of every raw take and of the reference, computed in the tts-habibi
 *  container (it has librosa); written into each take's score and into refs.json. */
async function pitch() {
  const { execFile } = await import('node:child_process');
  const sh = (cmd: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(cmd, args, { maxBuffer: 1e8 }, (e, o, err) => (e ? reject(new Error(`${e.message} ${err}`)) : resolve(String(o)))));
  const box = opt('container', 'vewbox-tts-habibi-1');
  const store = await readJson<{ takes: Take[] }>(takesFile, { takes: [] });
  const r = await readJson<{ refs: Ref[] }>(refsFile, { refs: [] });
  const files = [...store.takes.filter((t) => t.ok).map((t) => t.raw?.file ?? t.file!), ...r.refs.map((x) => x.file)];
  await sh('docker', ['exec', box, 'sh', '-c', 'rm -rf /tmp/pitch && mkdir -p /tmp/pitch']);
  await sh('docker', ['cp', path.resolve('scripts/pitch-stats.py'), `${box}:/tmp/pitch/pitch-stats.py`]);
  const inBox = files.map((f, i) => `/tmp/pitch/${i}.wav`);
  for (const [i, f] of files.entries()) await sh('docker', ['cp', media(f), `${box}:${inBox[i]}`]);
  const json = JSON.parse(await sh('docker', ['exec', box, '/opt/habibi/.venv/bin/python', '/tmp/pitch/pitch-stats.py', ...inBox])) as Record<string, unknown>;
  const of = (f: string) => json[inBox[files.indexOf(f)]];
  for (const t of store.takes) if (t.ok) t.score = { ...(t.score ?? {}), pitch: of(t.raw?.file ?? t.file!) };
  for (const x of r.refs) (x as Ref & { pitch?: unknown }).pitch = of(x.file);
  await writeJson(takesFile, store); await writeJson(refsFile, r);
  for (const t of store.takes.filter((x) => x.ok)) console.log(`${t.arm}/${t.test}: ${JSON.stringify((t.score as { pitch?: unknown }).pitch)}`);
  for (const x of r.refs) console.log(`reference ${x.language}: ${JSON.stringify((x as Ref & { pitch?: unknown }).pitch)}`);
}

async function report() {
  const { tests, arms, scales: setScales } = await set();
  const scales = setScales?.length ? setScales : ['natural', 'baghdadi', 'emotion', 'pronunciation', 'same_voice'];
  const store = await readJson<{ takes: Take[] }>(takesFile, { takes: [] });
  const { refs: rs } = await readJson<{ refs: Ref[] }>(refsFile, { refs: [] });
  const prev = await readJson<{ grades?: unknown }>(path.join(RUN, 'report.json'), {});
  const prevKey = await readJson<Record<string, Record<string, string>>>(path.join(RUN, 'blind-key.json'), {});
  // the blind order: per test, the arms' takes under letters, shuffled by a key kept out of the page. A test whose set
  // of engines has not changed keeps its letters (a listener may be part-way through it)
  const key: Record<string, Record<string, string>> = {};
  const items = tests.map((t) => {
    const takes = store.takes.filter((x) => x.test === t.id && x.ok && x.file);
    const kept = prevKey[t.id] && Object.values(prevKey[t.id]).sort().join() === takes.map((x) => x.arm).sort().join() ? prevKey[t.id] : undefined;
    const order = kept ? Object.keys(kept).sort().map((l) => takes.find((x) => x.arm === kept[l])!) : takes.map((x) => ({ x, r: crypto.randomInt(1_000_000) })).sort((a, b) => a.r - b.r).map((o) => o.x);
    key[t.id] = Object.fromEntries(order.map((x, i) => [String.fromCharCode(65 + i), x.arm]));
    return { test: t, clips: order.map((x, i) => ({ letter: String.fromCharCode(65 + i), file: x.file! })) };
  });
  await writeJson(path.join(RUN, 'blind-key.json'), key);
  await writeJson(path.join(RUN, 'report.json'), { set: SET, arms, refs: rs, takes: store.takes, grades: prev.grades ?? null, note: 'Machine numbers are supporting evidence; the native listener decides. grades is null until a listener grades.' });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const refAudio = (lang: string) => { const r = rs.find((x) => x.language === lang); return r ? `<p class="ref">Reference voice: <audio controls preload="none" src="${esc(r.file)}"></audio></p>` : ''; };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice Listening Test</title>
<style>:root{--bg:#141414;--card:#1e1e1e;--fg:#ececec;--mut:#9a9a9a;--acc:#8ab4f8;--line:#2c2c2c}@media (prefers-color-scheme:light){:root{--bg:#f6f6f6;--card:#fff;--fg:#1a1a1a;--mut:#666;--acc:#1a5fd0;--line:#ddd}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:900px;margin-inline:auto}h1{font-size:20px}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
.line{font-size:20px;margin:6px 0 2px}.line[dir=rtl]{font-family:'Noto Naskh Arabic','Segoe UI',serif;unicode-bidi:isolate}.intent,.ref,small{color:var(--mut)}.clip{border-top:1px solid var(--line);padding:10px 0;display:grid;gap:6px}
label{display:inline-flex;gap:6px;align-items:center;margin-right:12px}select,textarea{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px}textarea{width:100%;min-height:38px}
button{background:var(--acc);color:#000;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}audio{width:100%;max-width:520px}</style></head><body>
<h1>Voice listening test</h1><p>Blind: each line's versions are labelled A, B, C in a random order. Rate what you hear (1 = poor, 5 = natural, as a native speaker would say it). Leave a field empty when it does not apply. Nothing is scored until you rate it. <strong>Lab test: the Arabic voice is the upstream demo speaker, not for production.</strong></p>
${items.map(({ test: t, clips }) => `<section data-test="${t.id}"><div class="line" dir="${t.language === 'AR' ? 'rtl' : 'ltr'}" lang="${t.language === 'AR' ? 'ar-IQ' : 'en'}">${esc(t.text)}</div><div class="intent">Intended delivery: ${esc(t.intent)}</div>${refAudio(t.language)}
${clips.map((c) => `<div class="clip" data-letter="${c.letter}"><strong>${c.letter}</strong><audio controls preload="none" src="${esc(c.file)}"></audio>
<div>${scales.filter((k) => k !== 'baghdadi' || t.language === 'AR').map((k) => `<label>${({ natural: 'Naturalness', baghdadi: 'Iraqi / Baghdadi', emotion: 'Emotional performance', pronunciation: 'Pronunciation', same_voice: 'Same speaker as the reference', cinematic: 'Cinematic / acting quality' } as Record<string, string>)[k] ?? k} <select data-k="${k}"><option value=""></option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>`).join('')}</div>
<textarea data-k="note" placeholder="Words said wrong, robotic parts, anything you heard"></textarea></div>`).join('')}</section>`).join('')}
<p><label>Your name <input id="who" style="background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px"></label> <button id="dl">Download my ratings</button></p>
<script>document.getElementById('dl').onclick=()=>{const out={by:document.getElementById('who').value.trim(),at:new Date().toISOString(),ratings:[]};document.querySelectorAll('section').forEach(s=>s.querySelectorAll('.clip').forEach(c=>{const r={test:s.dataset.test,letter:c.dataset.letter};c.querySelectorAll('[data-k]').forEach(e=>{if(e.value!=='')r[e.dataset.k]=e.dataset.k==='note'?e.value:Number(e.value)});out.ratings.push(r)}));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='ratings.json';a.click()};</script></body></html>`;
  await fs.writeFile(path.join(RUN, 'listen.html'), html, 'utf8');
  console.log(`report.json, listen.html (${items.reduce((n, i) => n + i.clips.length, 0)} clips), blind-key.json in ${RUN}`);
}

async function grades() {
  const file = opt('file');
  const g = await readJson<{ by?: string; at?: string; ratings?: Array<Record<string, unknown>> }>(file, {});
  if (!g.by || !g.ratings?.length) throw new Error('the ratings file names no listener or holds no ratings');
  const key = await readJson<Record<string, Record<string, string>>>(path.join(RUN, 'blind-key.json'), {});
  const rep = await readJson<Record<string, unknown>>(path.join(RUN, 'report.json'), {});
  const unblinded = g.ratings.map((r) => ({ ...r, arm: key[String(r.test)]?.[String(r.letter)] }));
  const prior = Array.isArray(rep.grades) ? (rep.grades as unknown[]) : [];
  rep.grades = [...prior, { by: g.by, at: g.at, ratings: unblinded }];
  await writeJson(path.join(RUN, 'report.json'), rep);
  console.log(`${unblinded.length} ratings by ${g.by} imported`);
}

const modes: Record<string, () => Promise<void>> = { refs, synth, score, pitch, report, grades };
(modes[mode] ?? (async () => { console.error(`mode: ${Object.keys(modes).join(' | ')}`); process.exit(2); }))().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

#!/usr/bin/env -S pnpm exec tsx
// IRAQI ARABIC VOICE EVALUATION HARNESS (docs/voice/IRAQI-EVAL-SET-2026-10.md §4). Speaks every line of the evaluation
// set through the REAL voice service (Habibi-TTS IRQ; mixed Arabic/English lines through IndexTTS when --indextts is
// given, as the studio routes them), stores the WAVs with a manifest, reads each back with the ASR service (Arabic to the
// dialect-tuned Whisper), measures WER/CER (orthographic and dialect-folded), duration, loudness, true peak and
// silence, flags MSA-like readings (a documented heuristic), and writes report.json and review.html (a player per line
// with the reviewer form). Naturalness and dialect are NOT measured: the review page is for a native Iraqi listener.
//
//   pnpm exec tsx scripts/voice-eval.mjs --base http://127.0.0.1:8021 --asr http://127.0.0.1:8030 \
//       --voices tests/fixtures/voice/iraqi-eval-voices.example.json [--indextts http://127.0.0.1:8020] \
//       [--set tests/fixtures/voice/iraqi-eval-set.json] [--out docs/evidence/iraqi-eval/<run>] [--only id,id,...] \
//       [--seed 7] [--nfe 32] [--cfg 2.0] [--sway -1] [--speed 1.0] [--prepare studio|raw|both] [--allow-synthetic] [--dry-run]
//   pnpm exec tsx scripts/voice-eval.mjs --merge-review <run>/review-<name>-<date>.json --out <run>
//   pnpm exec tsx scripts/voice-eval.mjs --render --out <run>        (review.html again from report.json)
//
// --base      the Iraqi voice service (tts-habibi), given EXPLICITLY: there is no default, and the studio's own server
//             (:4200, anything under /api) is refused — this harness never touches the studio.
// --asr       the transcription service (asr), explicit too; --skip-asr measures without a transcript.
// --indextts  the bilingual engine for the code-switched lines (optional; without it those lines are skipped, not spoken
//             by the Iraqi engine, which has no English).
// --voices    a JSON file: { "voices": [ { "id", "sex": "M"|"F", "file", "text"?, "label"?, "origin"? } ] }; or
// --voice     sex=file (repeatable); the reference transcript is then taken from the ASR (language auto).
//             The contract (docs/CONTRACTS-VOICE-IDENTITY-V2.md §2) wants a CONSENTED IRAQI RECORDING; a designed seed
//             or any engine output is the experiment path and needs --allow-synthetic (the report is stamped).
// --prepare   studio (default): the studio's text preparation for the Iraqi engine (src/server/providers/iraqi-text.ts,
//             digits → Iraqi number words, tatweel, line breaks…); raw: the text as written; both: raw AND prepared for
//             lines whose text the preparation changes (the digit line), so the two can be heard side by side.
// --dry-run   validates the arguments, the set and the voices, writes plan.json, makes NO request.
// Nothing runs on the GPU from here but the services' own inference; do not run during a video batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { charErrorRateEval, coverageEval, engineOutputOf, lettersPerSecond, lineFlags, lineScriptOf, measureAudio, measuredSummary, mostlyArabic, msaReadingFlags, probeAudio, renderReviewHtml, round, summarizeReview, wordErrorRateEval } from './lib/voice-eval-metrics.mjs';

// ------------------------------------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const opts = (name) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []));
const fail = (msg, code = 2) => { console.error(`voice-eval: ${msg}`); process.exit(code); };

const dryRun = flag('dry-run');
const mergeReview = opt('merge-review', '');
const renderOnly = flag('render');
const outArg = opt('out', '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const OUT = path.resolve(outArg || path.join('docs', 'evidence', 'iraqi-eval', stamp));

// ------------------------------------------------------------------------------------------------ the two offline modes
if (mergeReview || renderOnly) {
  if (!outArg) fail('--out <run folder> is required with --merge-review / --render');
  const reportFile = path.join(OUT, 'report.json');
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  if (mergeReview) {
    const review = JSON.parse(await fs.readFile(mergeReview, 'utf8'));
    const summary = summarizeReview(report, review);
    report.listening = { ...summary, reviewFile: path.basename(mergeReview), mergedAt: new Date().toISOString() };
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
    const md = ['# Listening review', '', `Run ${report.run.id}. Reviewer: **${summary.reviewer || '(unnamed)'}**, ${summary.reviewedAt ?? '—'}. Status: **${summary.status}**. Verified: **${summary.verified ? 'yes' : 'no'}**.`, '',
      '| voice | spoken | rated | natural | understandable | wrong | natural ≥ 80 % | no film line wrong | dialect yes ≥ 80 % | emotion ≥ 3/4 | same voice ≥ 4 on 80 % | pass |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...Object.entries(summary.perVoice).map(([v, s]) => `| ${v} | ${s.spoken} | ${s.rated} | ${s.natural} | ${s.understandable} | ${s.wrong} | ${s.criteria.naturalShare.value ?? '—'} ${s.criteria.naturalShare.pass ? '✓' : '✗'} | ${s.criteria.noFilmLineWrong.value} ${s.criteria.noFilmLineWrong.pass ? '✓' : '✗'} | ${s.criteria.dialectYesShare.value ?? '—'} ${s.criteria.dialectYesShare.pass ? '✓' : '✗'} | ${s.criteria.emotionMatchedShare.value ?? '—'} ${s.criteria.emotionMatchedShare.pass ? '✓' : '✗'} | ${s.criteria.sameVoiceShare.value ?? '—'} ${s.criteria.sameVoiceShare.pass ? '✓' : '✗'} | **${s.pass ? 'PASS' : 'FAIL'}** |`), '',
      '## Lines rated wrong', '', ...Object.entries(summary.perVoice).flatMap(([v, s]) => s.wrongLines.map((w) => `- ${v} · ${w.id} (${w.key}): ${w.note || 'no note'}`)), '',
      '## Notes', '', ...Object.entries(summary.perVoice).flatMap(([v, s]) => s.notes.map((n) => `- ${v} · ${n.id} [${n.rating}]: ${n.note}`)), '',
      summary.verified ? 'Every voice passed the bar with a named reviewer: these voices may be labelled "Iraqi dialect: listener-approved" (the identity record is updated through the studio\'s listening record, never by this file).' : 'Not verified: a voice that fails the bar, or an unnamed or incomplete review, keeps "Iraqi dialect not yet verified by a native listener".'].join('\n');
    await fs.writeFile(path.join(OUT, 'REVIEW.md'), md, 'utf8');
    console.log(`merged ${path.basename(mergeReview)} → ${reportFile}\n${path.join(OUT, 'REVIEW.md')}\nstatus ${summary.status}, verified ${summary.verified}`);
  }
  await fs.writeFile(path.join(OUT, 'review.html'), renderReviewHtml(report), 'utf8');
  console.log(`review page: ${path.join(OUT, 'review.html')}`);
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------ services (explicit, never the studio)
function serviceUrl(name, raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { fail(`--${name} is not a URL: ${raw}`); }
  if (!/^https?:$/.test(u.protocol)) fail(`--${name} must be http(s): ${raw}`);
  if (u.port === '4200' || u.port === '3000' || /\/api(\/|$)/.test(u.pathname) || u.pathname.replace(/\/$/, '') !== '') fail(`--${name} must be a voice/ASR service origin (e.g. http://127.0.0.1:8021), not the studio: ${raw}`);
  return u.origin;
}
const BASE = opt('base', '') ? serviceUrl('base', opt('base', '')) : null;
const ASR = opt('asr', '') ? serviceUrl('asr', opt('asr', '')) : null;
const INDEXTTS = opt('indextts', '') ? serviceUrl('indextts', opt('indextts', '')) : null;
const skipAsr = flag('skip-asr');
if (!BASE) fail('refusing to run: give --base <the Iraqi voice service URL> explicitly (e.g. --base http://127.0.0.1:8021). This harness never runs against the studio.');
if (!ASR && !skipAsr) fail('give --asr <the transcription service URL> (e.g. --asr http://127.0.0.1:8030), or --skip-asr to measure without transcripts.');
if ([BASE, ASR, INDEXTTS].filter(Boolean).length !== new Set([BASE, ASR, INDEXTTS].filter(Boolean)).size) fail('--base, --asr and --indextts must be three different services.');

// ------------------------------------------------------------------------------------------------ the set, the voices, the parameters
const SET_FILE = path.resolve(opt('set', 'tests/fixtures/voice/iraqi-eval-set.json'));
const set = JSON.parse(await fs.readFile(SET_FILE, 'utf8'));
const only = opt('only', '') ? new Set(opt('only', '').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const lines = set.lines.filter((l) => !only || only.has(l.id));
if (!lines.length) fail('no lines selected');
const params = { seed: Number(opt('seed', '7')), nfe_step: Number(opt('nfe', '32')), cfg_strength: Number(opt('cfg', '2.0')), sway_sampling_coef: Number(opt('sway', '-1')), speed: Number(opt('speed', '1.0')) };
for (const [k, v] of Object.entries(params)) if (!Number.isFinite(v)) fail(`--${k} is not a number`);
const prepareMode = opt('prepare', 'studio');
if (!['studio', 'raw', 'both'].includes(prepareMode)) fail('--prepare must be studio, raw or both');
const allowSynthetic = flag('allow-synthetic');

const voices = [];
const voicesFile = opt('voices', '');
if (voicesFile) {
  const cfg = JSON.parse(await fs.readFile(voicesFile, 'utf8'));
  for (const v of cfg.voices ?? []) {
    if (!v.id || !v.file || !['M', 'F'].includes(v.sex)) fail(`voices config: every voice needs id, sex (M|F) and file: ${JSON.stringify(v)}`);
    voices.push({ id: String(v.id), sex: v.sex, file: path.resolve(path.dirname(voicesFile), v.file), text: v.text?.trim() || undefined, label: v.label ?? '', origin: v.origin ?? 'UNKNOWN' });
  }
}
for (const pair of opts('voice')) {
  const m = /^(male|female|m|f)=(.+)$/i.exec(pair);
  if (!m) fail(`--voice takes sex=file (male=... or female=...): ${pair}`);
  const sex = m[1].toLowerCase().startsWith('m') ? 'M' : 'F';
  voices.push({ id: sex === 'M' ? 'male' : 'female', sex, file: path.resolve(m[2]), label: '', origin: 'UNKNOWN' });
}
if (!voices.length) fail('give --voices <config.json> or --voice male=<wav> / --voice female=<wav> (consented Iraqi recordings; see the header).');
if (new Set(voices.map((v) => v.id)).size !== voices.length) fail('voice ids must be unique');

// ------------------------------------------------------------------------------------------------ the studio's own code (tsx), optional
let studio = null; let prepare = null; let studioNote = '';
try {
  process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused'; // the env schema wants one; nothing here touches a database
  process.env.LIBRARY_ROOT ??= path.join(OUT, '.unused');
  studio = await import(pathToFileURL(path.resolve('src/server/providers/speech.ts')).href);
  try { prepare = (await import(pathToFileURL(path.resolve('src/server/providers/iraqi-text.ts')).href)).prepareLineText; } catch (e) { studioNote = `text preparation unavailable (${(e.message ?? e).split('\n')[0]})`; }
} catch (e) { studioNote = `studio metrics unavailable; run with "pnpm exec tsx" for the studio fold (${(e.message ?? e).split('\n')[0]})`; }
if (prepareMode !== 'raw' && !prepare) { console.error(`voice-eval: --prepare ${prepareMode} needs src/server/providers/iraqi-text.ts under tsx; ${studioNote || 'not found'}. Falling back to raw text.`); }
const prepareText = (text, engine) => (prepare && prepareMode !== 'raw' ? prepare(text, { engine, language: 'AR', dialect: 'IRAQI_BAGHDADI' }) : { text, changes: [] });

// ------------------------------------------------------------------------------------------------ plan
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const routeOf = (text) => {
  const script = lineScriptOf(text);
  if (script === 'MIXED') return { script, engine: 'indextts', asrLanguage: mostlyArabic(text) ? 'ar' : 'en', url: INDEXTTS, fallback: 'mixed Arabic/Latin line: habibi has no English, spoken by indextts' };
  if (script === 'LATIN') return { script, engine: 'indextts', asrLanguage: 'en', url: INDEXTTS, fallback: 'Latin-script line: spoken by indextts' };
  return { script, engine: 'habibi', asrLanguage: 'ar', url: BASE };
};
const plan = [];
for (const l of lines) {
  const route = routeOf(l.text);
  if (!route.url) continue; // a code-switched line without --indextts is skipped (listed below), never spoken by the Iraqi engine
  const variants = [];
  if (route.engine === 'habibi' && prepareMode !== 'raw') {
    const p = prepareText(l.text, 'habibi');
    variants.push({ variant: 'prepared', spoken: p.text, changes: p.changes });
    if (prepareMode === 'both' && p.text !== l.text) variants.unshift({ variant: 'raw', spoken: l.text, changes: [] });
  } else variants.push({ variant: 'raw', spoken: l.text, changes: [] });
  for (const v of voices.filter((v) => l.sex === 'ANY' || v.sex === l.sex)) for (const va of variants) plan.push({ line: l, voice: v, route, ...va });
}
const skipped = [];
for (const l of lines) {
  const route = routeOf(l.text);
  if (route.engine === 'indextts' && !INDEXTTS) skipped.push({ id: l.id, why: 'code-switched line: give --indextts to speak it through the bilingual engine' });
  if (!voices.some((v) => l.sex === 'ANY' || v.sex === l.sex)) skipped.push({ id: l.id, why: `no ${l.sex === 'M' ? 'male' : 'female'} voice given` });
}
const runId = path.basename(OUT);
await fs.mkdir(path.join(OUT, 'wavs'), { recursive: true });
await fs.mkdir(path.join(OUT, 'asr'), { recursive: true });
await fs.mkdir(path.join(OUT, 'refs'), { recursive: true });

// ------------------------------------------------------------------------------------------------ references: measured, provenance-checked
let anySynthetic = false;
for (const v of voices) {
  let p;
  try { p = await probeAudio(v.file); } catch (e) { fail(`voice ${v.id}: ${v.file} cannot be read (${e.message})`); }
  const tag = engineOutputOf(p.tags);
  v.durationSeconds = round(p.durationSeconds); v.sampleRate = p.sampleRate; v.sha256 = await sha256(v.file); v.engineOutput = tag;
  v.synthetic = Boolean(tag) || v.origin === 'DESIGNED' || v.origin === 'GENERATED';
  if (v.synthetic) {
    anySynthetic = true;
    console.error(`!!! ${v.id}: this reference is ENGINE OUTPUT (${tag ? `tagged: ${tag}` : `origin ${v.origin}`}), not a consented recording. The contract clones Iraqi voices from a real Iraqi recording; a designed seed is the experiment path (dialectStatus UNVERIFIED, identity REVIEW).${allowSynthetic ? ' Continuing: --allow-synthetic; the report is stamped SYNTHETIC REFERENCES.' : ' Refusing (pass --allow-synthetic to run the experiment).'}`);
    if (!allowSynthetic) process.exit(3);
  }
  if (p.durationSeconds < 1 || p.durationSeconds > 60) fail(`voice ${v.id}: the reference is ${p.durationSeconds.toFixed(1)} s; the service takes 1–60 s (3–15 s works best)`);
  if (p.durationSeconds > 15) console.error(`voice ${v.id}: ${p.durationSeconds.toFixed(1)} s reference; the Iraqi engine keeps about 12 s of it`);
}

const planFile = path.join(OUT, 'plan.json');
await fs.writeFile(planFile, JSON.stringify({ runId, at: new Date().toISOString(), services: { base: BASE, asr: ASR, indextts: INDEXTTS }, set: path.relative(process.cwd(), SET_FILE), params, prepareMode, studioMetrics: Boolean(studio), textPreparation: Boolean(prepare), note: studioNote || undefined, voices: voices.map((v) => ({ ...v, file: path.relative(process.cwd(), v.file) })), lines: plan.map((p) => ({ id: p.line.id, voice: p.voice.id, variant: p.variant, engine: p.route.engine, spoken: p.spoken, changes: p.changes })), skipped }, null, 2), 'utf8');
console.log(`${plan.length} synthesis call(s) planned for ${lines.length} line(s) × ${voices.length} voice(s)${skipped.length ? `; ${skipped.length} skipped` : ''} → ${planFile}`);
if (dryRun) { for (const s of skipped) console.log(`  skipped ${s.id}: ${s.why}`); console.log('dry run: no request was made'); process.exit(0); }

// ------------------------------------------------------------------------------------------------ the services must be what we think they are
async function health(url) { const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) }); if (!r.ok) throw new Error(`${url}/health → ${r.status}`); return r.json(); }
const services = {};
try { services.base = await health(BASE); } catch (e) { fail(`--base ${BASE} is not answering (${e.message}); start tts-habibi first`, 4); }
if (services.base.engine !== 'habibi') fail(`--base ${BASE} runs "${services.base.engine}", not the Iraqi engine (habibi)`);
if (services.base.weights_present === false) fail(`--base ${BASE}: the Iraqi weights are not on the volume yet`, 4);
if (INDEXTTS) { try { services.indextts = await health(INDEXTTS); } catch (e) { fail(`--indextts ${INDEXTTS} is not answering (${e.message})`, 4); } if (services.indextts.engine !== 'indextts') fail(`--indextts ${INDEXTTS} runs "${services.indextts.engine}"`); }
if (ASR) {
  try { services.asr = await health(ASR); } catch (e) { fail(`--asr ${ASR} is not answering (${e.message}); start asr first`, 4); }
  const ar = services.asr.models?.ar;
  if (!ar) console.error('!!! the ASR service has no Arabic-dialect model configured (ASR_MODEL_DIR_AR): Arabic will be read back by plain large-v3, which charges dialect spelling as error.');
  else if (!ar.weights_present) console.error(`!!! the Arabic-dialect model is configured (${ar.dir}) but not converted yet (no model.bin): run "docker compose --profile models run --rm asr-convert". Arabic falls back to large-v3 for this run.`);
}

// ------------------------------------------------------------------------------------------------ HTTP helpers
async function post(url, fd, timeoutMs) {
  const r = await fetch(url, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) { const t = await r.text().catch(() => ''); let d = t; try { d = JSON.parse(t).detail ?? t; } catch { /* plain */ } throw new Error(`${url.replace(/^https?:\/\/[^/]+/, '')} ${r.status}: ${String(d).slice(0, 300)}`); }
  return r;
}
async function transcribe(file, language) {
  const fd = new FormData(); fd.set('file', new Blob([await fs.readFile(file)]), path.basename(file)); fd.set('language', language); fd.set('words', '1');
  return (await post(`${ASR}/transcribe`, fd, 10 * 60_000)).json();
}
async function speak(url, engine, text, voice) {
  const fd = new FormData();
  fd.set('text', text); fd.set('language', 'ar'); fd.set('dialect', 'IRAQI_BAGHDADI'); fd.set('engine', engine);
  fd.set('reference', new Blob([await fs.readFile(voice.file)]), path.basename(voice.file));
  if (engine === 'habibi' && voice.text) fd.set('reference_text', voice.text);
  fd.set('seed', String(params.seed)); fd.set('speed', String(params.speed));
  if (engine === 'habibi') { fd.set('nfe_step', String(params.nfe_step)); fd.set('cfg_strength', String(params.cfg_strength)); fd.set('sway_sampling_coef', String(params.sway_sampling_coef)); }
  const t0 = Date.now();
  const r = await post(`${url}/synthesize`, fd, 10 * 60_000);
  const h = (k) => r.headers.get(k);
  let echoed = {}; try { echoed = JSON.parse(h('x-params') ?? '{}'); } catch { /* older service */ }
  return { buf: Buffer.from(await r.arrayBuffer()), ms: Date.now() - t0, engine: h('x-engine') ?? engine, model: h('x-model') ?? engine, engineVersion: h('x-engine-version') ?? 'unknown', seed: h('x-seed') ?? String(params.seed), serviceDuration: Number(h('x-duration') ?? 0), serviceTruePeak: h('x-true-peak') ? Number(h('x-true-peak')) : undefined, gainReduction: h('x-gain-reduction') ? Number(h('x-gain-reduction')) : undefined, params: echoed };
}

// ------------------------------------------------------------------------------------------------ the reference transcript (Habibi conditions on it)
for (const v of voices) {
  if (v.text) continue;
  if (!ASR) fail(`voice ${v.id} has no reference text and --skip-asr was given: put "text" in the voices config (what the recording says).`);
  const t = await transcribe(v.file, 'auto');
  v.text = t.text.trim(); v.heardLanguage = t.language; v.heardLanguageProbability = t.language_probability; v.asrModel = t.model;
  if (t.language !== 'ar') console.error(`!!! ${v.id}: the ASR hears the reference as "${t.language}" (p=${t.language_probability}), not Arabic. The Iraqi engine would be conditioned on a foreign transcript (VOICE-STACK D2).`);
  if (!v.text) fail(`voice ${v.id}: no words heard in the reference`);
  console.log(`${v.id}: reference ${v.durationSeconds} s, heard (${t.language}) "${v.text}"`);
}

// ------------------------------------------------------------------------------------------------ speak, hear, measure
const results = [];
const versions = {};
let n = 0;
for (const p of plan) {
  n++;
  const { line: l, voice: v, route } = p;
  const key = `${v.id}/${l.id}/${p.variant}`;
  const base = { key, id: l.id, category: l.category, text: l.text, spoken: p.spoken, changes: p.changes, variant: p.variant, gloss: l.gloss, features: l.features, emotion: l.emotion, sex: l.sex, msaWouldSoundWrong: l.msaWouldSoundWrong, voice: v.id, voiceSex: v.sex, engine: route.engine, script: route.script, fallback: route.fallback, asrLanguage: route.asrLanguage };
  process.stdout.write(`[${n}/${plan.length}] ${key} (${route.engine}) `);
  try {
    const s = await speak(route.url, route.engine, p.spoken, v);
    versions[s.engine] = s.engineVersion;
    const name = `${v.id}-${l.id}${p.variant === 'raw' && prepareMode === 'both' ? '-raw' : ''}-${s.engine}-s${s.seed}.wav`;
    const file = path.join(OUT, 'wavs', name);
    await fs.writeFile(file, s.buf);
    const m = await measureAudio(file);
    const r = { ...base, file: `wavs/${name}`, sha256: await sha256(file), seed: Number(s.seed), engineVersion: s.engineVersion, model: s.model, params: s.params, synthMs: s.ms, serviceDuration: s.serviceDuration, serviceTruePeak: s.serviceTruePeak, gainReduction: s.gainReduction, durationSeconds: m.durationSeconds, sampleRate: m.sampleRate, lufs: m.lufs, truePeakDbtp: m.truePeakDbtp, lra: m.lra, silence: { leadingSeconds: m.silence.leadingSeconds, trailingSeconds: m.silence.trailingSeconds, totalSeconds: m.silence.totalSeconds, longestPauseSeconds: m.silence.longestPauseSeconds, ratio: m.silence.ratio }, lettersPerSecond: lettersPerSecond(l.text, m.durationSeconds, m.silence.totalSeconds), engineOutput: m.engineOutput };
    if (ASR) {
      const t = await transcribe(file, route.asrLanguage);
      await fs.writeFile(path.join(OUT, 'asr', name.replace(/\.wav$/, '.json')), JSON.stringify(t, null, 2), 'utf8');
      r.heard = t.text.trim(); r.asrModel = t.model; r.asrMs = t.ms; r.asrLanguageHeard = t.language;
      const lang = route.asrLanguage;
      r.wer = round(wordErrorRateEval(l.text, r.heard, lang)); r.cer = round(charErrorRateEval(l.text, r.heard, lang));
      r.cerFolded = round(charErrorRateEval(l.text, r.heard, lang, true)); r.coverage = round(coverageEval(l.text, r.heard, lang));
      if (studio && lang === 'ar') { r.cerStudio = round(studio.charErrorRate(l.text, r.heard, 'AR')); r.coverageStudio = round(studio.scriptCoverage(l.text, r.heard, 'AR')); r.verdictStudio = studio.verdict({ coverage: r.coverageStudio, cer: r.cerStudio, context: 'line' }).status; }
      if (lang === 'ar') r.msa = msaReadingFlags(l.text, r.heard);
    }
    r.flags = lineFlags(r);
    results.push(r);
    console.log(`${m.durationSeconds} s, ${m.lufs} LUFS, ${m.truePeakDbtp} dBTP${r.cerFolded !== undefined ? `, CER ${r.cerFolded}` : ''}${r.flags.length ? ` [${r.flags.join(' ')}]` : ''}${r.heard !== undefined ? ` ← ${r.heard}` : ''}`);
  } catch (e) {
    results.push({ ...base, error: String(e.message ?? e), flags: ['ERROR'] });
    console.log(`ERROR ${e.message ?? e}`);
  }
}

// ------------------------------------------------------------------------------------------------ report
const report = {
  run: { id: runId, at: new Date().toISOString(), script: 'scripts/voice-eval.mjs', set: { file: path.relative(process.cwd(), SET_FILE), name: set.name, lines: lines.length }, services: { base: BASE, asr: ASR, indextts: INDEXTTS, health: services }, engineVersions: versions, params, prepareMode, textPreparation: Boolean(prepare), studioMetrics: Boolean(studio), note: studioNote || undefined, syntheticReferences: anySynthetic, voices: voices.map((v) => ({ ...v, file: path.relative(process.cwd(), v.file) })), skipped },
  what: 'Measurements only: intelligibility against the intended text (ASR), level, timing, and a heuristic for MSA-like readings. Naturalness, dialect authenticity, emotional delivery and speaker consistency are rated by a native Iraqi listener on review.html; nothing here is verified until that review is merged (docs/voice/IRAQI-EVAL-SET-2026-10.md §6).',
  lines: results,
  summary: measuredSummary(results),
  listening: { status: 'PENDING', verified: false, protocol: 'docs/voice/IRAQI-EVAL-SET-2026-10.md §6', reviewPage: 'review.html' },
};
await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(path.join(OUT, 'review.html'), renderReviewHtml(report), 'utf8');
const s = report.summary.all;
console.log(`\n${results.length} line(s) spoken, ${report.summary.errors} error(s); intelligible (CER ≤ 0.15 folded) ${s.intelligible}/${s.lines}; MSA-like ${s.msaLike}; mean CER ${s.cerFoldedMean}, mean ${s.lufsMean} LUFS${anySynthetic ? '\nSYNTHETIC REFERENCES: the figures are a pipeline check, not a voice claim' : ''}\nreport: ${path.join(OUT, 'report.json')}\nreview page: ${path.join(OUT, 'review.html')} (open it from this folder; a native Iraqi listener rates every line; save the JSON and merge it with --merge-review)`);

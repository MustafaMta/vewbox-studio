#!/usr/bin/env -S pnpm exec tsx
// Iraqi Arabic voice suite, v2. Conversational, emotional, numeric, name and code-switched lines spoken from each
// reference voice, routed per line exactly as the worker routes them (Arabic script → Habibi-TTS IRQ; Latin or mixed →
// IndexTTS 2.5, and the row says so), read back by Whisper large-v3 and measured: duration, integrated loudness, true
// peak, clipping, raw WER, CER and coverage after the Iraqi dialect fold, and the contract verdict. Dialect authenticity
// stays a native listener's call: the run writes a listening sheet and marks the report "pending review".
//
// Run with tsx (it imports the studio's own metrics and measurement helpers):
//   pnpm exec tsx scripts/iraqi-voice-suite.mjs --references male=var/refs/male.wav,female=var/refs/female.wav \
//       [--out docs/evidence/iraqi-suite-v2.md] [--seed 7] [--nfe 32] [--cfg 2.0] [--sway -1] [--speed 1.0] \
//       [--only greet,where,...] [--allow-synthetic] [--force]
//   (--male F --female F is still accepted.)
//
// --references  label=file pairs. THE CLIPS MUST BE REAL, AUTHORISED RECORDINGS of a speaker who agreed to have their
//               voice cloned (own recording, commissioned voice actor, or a dataset whose licence allows synthesis).
//               Engine output is never a reference: cloning a clone flattens the timbre and the result proves nothing
//               about the engine. The suite refuses a reference that is itself synthetic — detected by the WAV's own
//               provenance tag (the voice service marks every file it writes), by the library record (origin or
//               provenance.engine) or by being byte-identical to a published evidence file — unless --allow-synthetic
//               is given, in which case the report is stamped as such on every page.
// --force       run even when a reference fails validation (the report keeps the refusal next to the results).
//
// Services: TTS_URL (IndexTTS, default http://127.0.0.1:8020), TTS_HABIBI_URL (default :8021), ASR_URL (default :8030).
// Do not run while the GPU is busy with a video batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
let speech, check;
try {
  speech = await import('../src/server/providers/speech.ts');
  check = await import('../src/server/media/voice-check.ts');
} catch (e) {
  console.error(`This suite imports the studio's TypeScript metrics; run it with tsx:\n  pnpm exec tsx scripts/iraqi-voice-suite.mjs ...\n(${e.message})`);
  process.exit(2);
}
const { routeLine, wordErrorRate, charErrorRate, scriptCoverage, verdict } = speech;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const TTS = (process.env.TTS_URL || 'http://127.0.0.1:8020').replace(/\/$/, '');
const HABIBI = (process.env.TTS_HABIBI_URL || 'http://127.0.0.1:8021').replace(/\/$/, '');
const ASR = (process.env.ASR_URL || 'http://127.0.0.1:8030').replace(/\/$/, '');
const out = opt('out', 'docs/evidence/iraqi-suite-v2.md');
const params = { seed: Number(opt('seed', '7')), nfe_step: Number(opt('nfe', '32')), cfg_strength: Number(opt('cfg', '2.0')), sway_sampling_coef: Number(opt('sway', '-1')), speed: Number(opt('speed', '1.0')) };
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const allowSynthetic = flag('allow-synthetic'), force = flag('force');

const refs = {};
for (const pair of (opt('references', '') || '').split(',').filter(Boolean)) { const [label, file] = pair.split('='); if (label && file) refs[label.trim()] = file.trim(); }
if (opt('male')) refs.male = opt('male');
if (opt('female')) refs.female = opt('female');
if (!Object.keys(refs).length) { console.error('give --references label=file[,label=file] (real authorised recordings; see the header of this script)'); process.exit(2); }

// ------------------------------------------------------------------------------------------------ the lines
const PHRASES = [
  { id: 'greet', text: 'شلونك حبيبي، شخبارك؟', kind: 'short / greeting' },
  { id: 'where', text: 'هسه وين نروح؟', kind: 'short / question' },
  { id: 'what', text: 'شنو السالفة؟', kind: 'short / question' },
  { id: 'nothing', text: 'ماكو شي، كلشي تمام.', kind: 'short / statement' },
  { id: 'lets-go', text: 'يلا خلينا نروح قبل ما يظلم.', kind: 'short / imperative' },
  { id: 'why', text: 'ليش ما گلتلي من البداية؟', kind: 'question with گ' },
  { id: 'tomorrow', text: 'باچر نروح للمكان نفسه.', kind: 'statement with چ' },
  { id: 'care', text: 'دير بالك على نفسك.', kind: 'short / warm' },
  { id: 'angry', text: 'گلتلك ميت مرة لا تلعب بالخيط! هسه انقطع وراح الطيارة!', kind: 'anger / long' },
  { id: 'happy', text: 'والله فرحت هواية لمن شفتها تطير فوق السطوح!', kind: 'happiness' },
  { id: 'sad', text: 'ما ظل أحد يسأل عني من راحت أمي.', kind: 'sadness' },
  { id: 'afraid', text: 'اسمع... أكو شي يتحرك ورة الباب، لا تفتحه.', kind: 'fear' },
  { id: 'tired', text: 'تعبت، خلي نكمل باچر.', kind: 'tiredness' },
  { id: 'excited', text: 'يلا يلا بسرعة، الهوا هسه زين، نطيّرها هسه!', kind: 'excitement' },
  { id: 'hesitant', text: 'يعني... ما أدري... يمكن أجرب مرة ثانية.', kind: 'hesitation' },
  { id: 'rising', text: 'انت جاي وياي، لو لا؟', kind: 'question / rising intonation' },
  { id: 'names', text: 'سمير وأمينة وسليم راحوا للأعظمية عند أم حسن.', kind: 'names / places' },
  { id: 'names-2', text: 'شيرين وآزاد وجورج ينتظرونا بالكرادة.', kind: 'Kurdish and Western names in Arabic script' },
  { id: 'numbers', text: 'عندي ثلاث طيارات وخمسة وعشرين خيط، والباص رقم اثنعش.', kind: 'numbers spelled' },
  { id: 'numbers-digits', text: 'الموعد الساعة 7 ونص، والسعر 250 ألف دينار.', kind: 'numbers as digits' },
  { id: 'numbers-arabic', text: 'عمري ٣٥ سنة وساكن بالشارع رقم ١٥.', kind: 'Arabic-Indic digits' },
  { id: 'consist-1', text: 'باچر گلتلي راح تجي، وهواية انتظرتك.', kind: 'consistency: باچر گلتلي هواية' },
  { id: 'consist-2', text: 'شلونك؟ هواية صار ما شفتك، باچر نلتقي بالأعظمية.', kind: 'consistency: شلونك هواية باچر الأعظمية' },
  { id: 'tech', text: 'شغّل الـ wifi وافتح الـ app، الـ battery خلصت.', kind: 'English technical words' },
  { id: 'switch', text: 'OK سمير، هسه نسوي test للخيط، ready?', kind: 'Arabic/English switching' },
  { id: 'tech-ar', text: 'شغّل الواي فاي وافتح التطبيق، البطارية خلصت.', kind: 'the same words transliterated (A/B for tech)' },
  { id: 'long', text: 'لمن كنت صغير، جدي علمني شلون أصلّح الطيارة بخيط واحد وشوية صبر، وگللي الهوا ما يسمعك إذا تصرخ عليه، بس يسمعك إذا تمشي وياه.', kind: 'long dialogue' },
].filter((p) => !only || only.has(p.id));

// ------------------------------------------------------------------------------------------------ helpers
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
async function ffprobeTags(file) {
  try { const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', file]); return JSON.parse(stdout).format?.tags ?? {}; } catch { return {}; }
}
async function libraryRecord(file) {
  const rel = file.replace(/\\/g, '/').match(/((?:audio|video|image)\/\d{4}\/\d{2}\/[^/]+)$/)?.[1];
  if (!rel) return null;
  try {
    const q = `select origin, coalesce(provenance->>'engine',''), coalesce(provenance->>'model',''), coalesce(provenance->>'reference','') from assets where path='${rel.replace(/'/g, "''")}' or provenance->>'path'='${rel.replace(/'/g, "''")}' limit 1`;
    const { stdout } = await execFileP('docker', ['exec', 'vewbox-db-1', 'psql', '-U', 'vewbox', '-d', 'vewbox', '-At', '-F', '|', '-c', q]);
    const [origin, engine, model, reference] = stdout.trim().split('|');
    return origin ? { origin, engine, model, reference } : null;
  } catch { return null; }
}
async function evidenceTwins(file) {
  const sha = await sha256(file);
  const twins = [];
  for (const dir of ['docs/evidence']) {
    const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else if (/\.(wav|mp3|m4a|flac)$/i.test(e.name) && path.resolve(p) !== path.resolve(file) && (await sha256(p)) === sha) twins.push(p); } };
    await walk(dir);
  }
  return twins;
}
/** Why a reference looks like engine output (empty = no sign of it). */
async function syntheticSigns(file) {
  const signs = [];
  const tags = await ffprobeTags(file);
  if (/synthetic/i.test(tags.comment ?? '') || /vewbox-tts/i.test(`${tags.encoder ?? ''} ${tags.software ?? ''}`)) signs.push(`the file is tagged by the voice service: "${tags.comment || tags.encoder}"`);
  const rec = await libraryRecord(file);
  if (rec && (rec.origin !== 'UPLOAD' || rec.engine)) signs.push(`library record: origin ${rec.origin}${rec.engine ? `, engine ${rec.engine}` : ''}${rec.reference ? `, cloned from ${rec.reference}` : ''}`);
  const twins = await evidenceTwins(file);
  if (twins.length) signs.push(`byte-identical to published engine output: ${twins.join(', ')}`);
  return signs;
}

async function transcribe(buf, name, language) {
  const fd = new FormData(); fd.set('file', new Blob([buf]), name); fd.set('language', language); fd.set('words', '0');
  const r = await fetch(`${ASR}/transcribe`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`asr ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function speak(engine, text, refFile, refText) {
  const fd = new FormData(); fd.set('text', text); fd.set('language', 'ar'); fd.set('dialect', 'IRAQI_BAGHDADI'); fd.set('engine', engine);
  fd.set('reference', new Blob([await fs.readFile(refFile)]), path.basename(refFile));
  if (engine === 'habibi' && refText) fd.set('reference_text', refText);
  fd.set('seed', String(params.seed)); fd.set('speed', String(params.speed));
  if (engine === 'habibi') { fd.set('nfe_step', String(params.nfe_step)); fd.set('cfg_strength', String(params.cfg_strength)); fd.set('sway_sampling_coef', String(params.sway_sampling_coef)); }
  const t0 = Date.now();
  const r = await fetch(`${engine === 'habibi' ? HABIBI : TTS}/synthesize`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`tts ${engine} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const h = (k) => r.headers.get(k);
  return { buf: Buffer.from(await r.arrayBuffer()), seconds: Number(h('x-duration') ?? 0), ms: Date.now() - t0, engine: h('x-engine') ?? engine, version: h('x-engine-version') ?? 'unknown', seed: h('x-seed'), truePeak: h('x-true-peak'), gainReduction: h('x-gain-reduction') };
}
const f2 = (v) => (v === undefined || v === null || Number.isNaN(v) ? '—' : Number(v).toFixed(2));
const f1 = (v) => (v === undefined || v === null || Number.isNaN(v) ? '—' : Number(v).toFixed(1));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ------------------------------------------------------------------------------------------------ references
const evidenceDir = path.join(path.dirname(out), path.basename(out, '.md'));
await fs.mkdir(path.join(evidenceDir, 'refs'), { recursive: true });
const references = {};
let anySynthetic = false;
for (const [voice, file] of Object.entries(refs)) {
  const v = await check.validateVoiceReference(file, { language: 'AR', allowEngineOutput: allowSynthetic });
  const signs = await syntheticSigns(file);
  if (signs.length) {
    anySynthetic = true;
    console.error(`\n!!! ${voice}: this reference is ENGINE OUTPUT, not a recording:\n    - ${signs.join('\n    - ')}\n    A clone of a clone proves nothing about the engine. ${allowSynthetic ? 'Continuing because --allow-synthetic was given; the report is stamped SYNTHETIC REFERENCES.' : 'Refusing (pass --allow-synthetic to run anyway).'}\n`);
    if (!allowSynthetic) process.exit(3);
  }
  if (!v.ok) { console.error(`${voice}: reference ${v.code} — ${v.message}${force ? ' (continuing: --force)' : ''}`); if (!force) process.exit(3); }
  let trimmed = null;
  if (v.window) trimmed = await check.trimReference(file, path.join(evidenceDir, 'refs', `${voice}-ref-${v.window.from.toFixed(1)}s-${v.window.to.toFixed(1)}s.wav`), v.window);
  const sent = trimmed?.file ?? file;
  const t = await transcribe(await fs.readFile(sent), path.basename(sent), 'auto');
  if (t.language !== 'ar') console.error(`${voice}: Whisper hears the reference as "${t.language}" (p=${f2(t.language_probability)}), not Arabic — Habibi would be conditioned on a foreign-language transcript.`);
  references[voice] = { file, sent, validation: v, signs, trimmed, transcript: t.text.trim(), language: t.language, languageProbability: t.language_probability };
  console.log(`${voice}: ${f1(v.durationSeconds)} s, ${v.sampleRate} Hz, ${f1(v.integratedLufs)} LUFS, TP ${f1(v.truePeakDbtp)} dBTP, clip ${(v.clipping.ratio * 100).toFixed(2)} %, window ${v.window ? `${v.window.from.toFixed(1)}–${v.window.to.toFixed(1)} s` : 'none'}; heard (${t.language} ${f2(t.language_probability)}): "${t.text.trim()}"`);
}

// ------------------------------------------------------------------------------------------------ lines
const rows = [];
const versions = {};
for (const [voice, ref] of Object.entries(references)) {
  for (const ph of PHRASES) {
    const route = routeLine(ph.text, 'AR', 'IRAQI_BAGHDADI');
    try {
      const s = await speak(route.engine, ph.text, ref.sent, ref.transcript);
      versions[s.engine] = s.version;
      const file = path.join(evidenceDir, `${voice}-${ph.id}-${s.engine}-seed${s.seed ?? params.seed}.wav`);
      await fs.writeFile(file, s.buf);
      const [loud, clip] = await Promise.all([check.loudness(file, undefined, { format: 'wav' }), check.clipping(file)]);
      const t = await transcribe(s.buf, `${ph.id}.wav`, route.asrLanguage);
      const wer = wordErrorRate(ph.text, t.text, 'AR'), cer = charErrorRate(ph.text, t.text, 'AR'), coverage = scriptCoverage(ph.text, t.text, 'AR');
      const vd = verdict({ coverage, cer, context: 'line' });
      rows.push({ voice, ...ph, script: route.script, engine: s.engine, fallback: route.fallback, seconds: s.seconds, ms: s.ms, lufs: loud.integratedLufs, truePeak: loud.truePeakDbtp, clip: clip.ratio, heard: t.text.trim(), wer, cer, coverage, verdict: vd.status, reasons: vd.reasons, file: path.relative(path.dirname(out), file) });
      console.log(`${voice} ${ph.id} [${s.engine}${route.fallback ? ' ←fallback' : ''}] ${f1(s.seconds)}s ${f1(loud.integratedLufs)} LUFS ${f1(loud.truePeakDbtp)} dBTP WER ${f2(wer)} CER ${f2(cer)} cov ${f2(coverage)} ${vd.status} ← ${t.text.trim()}`);
    } catch (err) { rows.push({ voice, ...ph, script: route.script, engine: route.engine, fallback: route.fallback, error: String(err.message) }); console.log(`${voice} ${ph.id}: ERROR ${err.message}`); }
  }
}

// ------------------------------------------------------------------------------------------------ report
const ok = rows.filter((r) => r.cer !== undefined);
const by = (pred) => ok.filter(pred);
const stat = (xs) => `WER ${f2(mean(xs.map((r) => r.wer)))} · CER ${f2(mean(xs.map((r) => r.cer)))} · coverage ${f2(mean(xs.map((r) => r.coverage)))} · ${xs.filter((r) => r.verdict === 'PASS').length} PASS / ${xs.filter((r) => r.verdict === 'REVIEW').length} REVIEW / ${xs.filter((r) => r.verdict === 'FAIL').length} FAIL (${xs.length} lines)`;
const stamp = anySynthetic ? '\n> **SYNTHETIC REFERENCES.** At least one reference clip is engine output, not a recording (see the references table). The figures below say nothing about how well a real voice is cloned; they are a smoke test of the pipeline only.\n' : '';
const md = [
  `# Iraqi Arabic voice suite (v2)`, '',
  `Run ${new Date().toISOString()}. Engines: ${Object.entries(versions).map(([e, v]) => `${e} (${v})`).join('; ') || 'none answered'}. Routing per line as the worker does it (\`routeLine\`): Arabic script → Habibi-TTS IRQ, Latin or mixed script → IndexTTS 2.5 (marked "fallback"). Transcription: faster-whisper large-v3, language per line script; the reference with \`auto\`. Parameters: seed ${params.seed}, nfe ${params.nfe_step}, cfg ${params.cfg_strength}, sway ${params.sway_sampling_coef}, speed ${params.speed}. Output limiter −1 dBTP in the voice service.`,
  stamp,
  `Metrics: WER is raw (orthographic normalisation only) and reported; the gate is **CER ≤ 0.15 and coverage ≥ 0.85** after the Iraqi dialect fold (\`normalizeIraqi\`: گ/ق/ك, چ/ج, hamza forms, ة/ه, ى/ي, diacritics, spelled numbers, Iraqi/MSA word table), as in CONTRACTS-CHARACTER-VOICE §1.4. Whisper's own dialect errors still count against the line, so every figure bounds intelligibility from above.`, '',
  `## References`, '',
  `| voice | file | provenance | duration | rate | LUFS | true peak | clipping | window sent | heard as | transcript |`, `|---|---|---|---|---|---|---|---|---|---|---|`,
  ...Object.entries(references).map(([voice, r]) => `| ${voice} | ${r.file} | ${r.signs.length ? `**ENGINE OUTPUT** — ${r.signs.join('; ')}` : 'no sign of synthesis (authorisation is the producer\'s record, not measurable here)'} | ${f1(r.validation.durationSeconds)} s | ${r.validation.sampleRate} Hz | ${f1(r.validation.integratedLufs)} | ${f1(r.validation.truePeakDbtp)} dBTP | ${(r.validation.clipping.ratio * 100).toFixed(2)} % | ${r.validation.window ? `${r.validation.window.from.toFixed(1)}–${r.validation.window.to.toFixed(1)} s, gain ${f1(r.trimmed?.gainDb)} dB → ${f1(r.trimmed?.integratedLufs)} LUFS` : 'none'}${r.validation.ok ? '' : ` — **${r.validation.code}**: ${r.validation.message}`} | ${r.language} (${f2(r.languageProbability)}) | ${r.transcript} |`), '',
  `## Results`, '',
  `| voice | id | kind | script | engine | line | heard | s | LUFS | dBTP | clip | WER | CER | cov | verdict |`, `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.voice} | ${r.id} | ${r.kind} | ${r.script} | ${r.engine}${r.fallback ? ' (fallback)' : ''} | ${r.text} | ${r.heard ?? `error: ${r.error}`} | ${f1(r.seconds)} | ${f1(r.lufs)} | ${f1(r.truePeak)} | ${r.clip === undefined ? '—' : `${(r.clip * 100).toFixed(2)} %`} | ${f2(r.wer)} | ${f2(r.cer)} | ${f2(r.coverage)} | ${r.verdict ?? 'ERROR'}${r.reasons?.length ? ` (${r.reasons.join('; ')})` : ''} |`), '',
  `## Summary`, '',
  `- all: ${stat(ok)}`,
  ...Object.keys(references).map((v) => `- ${v}: ${stat(by((r) => r.voice === v))}`),
  ...[...new Set(ok.map((r) => r.engine))].map((e) => `- ${e}: ${stat(by((r) => r.engine === e))}`),
  `- mixed/Latin lines (IndexTTS fallback): ${stat(by((r) => r.fallback))}`,
  `- errors: ${rows.length - ok.length}`, '',
  `Peak check: ${ok.filter((r) => r.truePeak > -1 + 0.05).length} of ${ok.length} files above −1 dBTP; ${ok.filter((r) => r.clip > 0).length} with any full-scale sample.`, '',
  `**Dialect authenticity, accent and naturalness are subjective quality pending review by a native Iraqi listener.** Files: \`${path.relative(path.dirname(out), evidenceDir)}/\`; the listening sheet \`listen.csv\` is next to them (1–5 for dialect authenticity, naturalness and same-voice-as-reference, plus a note; the file name carries the engine, so the review is not blind).`,
].join('\n');
await fs.writeFile(out, md, 'utf8');
await fs.writeFile(path.join(evidenceDir, 'listen.csv'), ['file,voice,id,engine,line,dialect_authenticity_1_5,naturalness_1_5,same_voice_as_reference_1_5,note', ...rows.filter((r) => r.file).map((r) => `${path.basename(r.file)},${r.voice},${r.id},${r.engine},"${r.text.replace(/"/g, '""')}",,,,`)].join('\n'), 'utf8');
console.log(`report: ${out}\nlistening sheet: ${path.join(evidenceDir, 'listen.csv')}`);

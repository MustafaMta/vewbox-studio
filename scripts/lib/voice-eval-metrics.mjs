// The measurement side of scripts/voice-eval.mjs (docs/voice/IRAQI-EVAL-SET-2026-10.md §4), plain ESM so that the
// vitest unit tests (tests/unit/voice-eval-metrics.test.ts) and the harness share one implementation without tsx:
//   - an Arabic-aware orthographic normaliser (hamza forms, taa marbuta, alef maksura, diacritics, tatweel, both digit
//     sets, Persian letter variants, punctuation) and a light dialect letter fold (گ ق ك → one class, چ ج → one class);
//   - WER and CER (Levenshtein over words / characters) on the normalised strings;
//   - the MSA-reading heuristic: dialect markers in the text whose MSA counterpart the ASR wrote instead (§4.3);
//   - the line script rule (parity with src/server/providers/speech.ts lineScript, proven by a test);
//   - ffmpeg/ffprobe measurements: duration, EBU R128 loudness and true peak, silence (leading, trailing, ratio);
//   - the review page (review.html) and the listening-review summary against the pass bar (§6).
// Nothing here judges naturalness or dialect: every number is intelligibility, level or timing.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// ------------------------------------------------------------------------------------------------ normalisation

/** Arabic-Indic (٠–٩) and Persian (۰–۹) digits as Western digits. */
export const westernDigits = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Orthographic normalisation for comparing a transcript with the intended line: NFC; diacritics (fatha… shadda,
 *  tanween, superscript alef), tatweel and zero-width marks removed; both digit sets → Western; hamza carriers
 *  unified (أ إ آ ٱ → ا, ؤ → و, ئ → ي, bare ء dropped); ة → ه; ى → ي; Persian ک/ی → ك/ي; every mark that is not a
 *  letter, digit or space → space; lower case; one space between words. Dialect letters (گ چ پ ڤ) are KEPT: this is
 *  the raw view WER reports on; `foldDialectLetters` is the lenient one. */
export function normalizeArabicEval(s) {
  return westernDigits(String(s).normalize('NFC'))
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ​-‏؜﻿]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/ة/g, 'ه').replace(/[ىیے]/g, 'ي').replace(/ک/g, 'ك')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The light dialect fold on top of `normalizeArabicEval`: the /g/ letters گ ق ك and the /tʃ/ letters چ ج become one
 *  class each, «تش» counts as چ, پ → ب, ڤ → ف. Lenient on purpose; the studio's `normalizeIraqi` (word table, spelled
 *  numbers) is the gate fold and is reported beside it when the harness runs under tsx. */
export function foldDialectLetters(normalized) {
  return normalized.replace(/تش/g, 'چ').replace(/[گقك]/g, 'ك').replace(/[چج]/g, 'ج').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف');
}

/** English words as the comparison sees them (typographic apostrophes folded, punctuation dropped). */
export const normalizeLatinEval = (s) => String(s).replace(/[‘’ʼ`´]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();

export const normalizeFor = (s, lang) => (lang === 'ar' ? normalizeArabicEval(s) : normalizeLatinEval(s));

// ------------------------------------------------------------------------------------------------ metrics

export function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const words = (s) => s.split(' ').filter(Boolean);

/** Word error rate on the normalised strings (orthographic view; 1 for an empty reference with a non-empty hypothesis). */
export function wordErrorRateEval(reference, hypothesis, lang = 'ar', fold = false) {
  const n = (x) => { const v = normalizeFor(x, lang); return fold && lang === 'ar' ? foldDialectLetters(v) : v; };
  const r = words(n(reference)); const h = words(n(hypothesis));
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return levenshtein(r, h) / r.length;
}

/** Character error rate on the normalised strings (spaces count, as in the studio's `charErrorRate`). */
export function charErrorRateEval(reference, hypothesis, lang = 'ar', fold = false) {
  const n = (x) => { const v = normalizeFor(x, lang); return fold && lang === 'ar' ? foldDialectLetters(v) : v; };
  const r = Array.from(n(reference)); const h = Array.from(n(hypothesis));
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return levenshtein(r, h) / r.length;
}

/** Share of the intended words heard in order (LCS over normalised, dialect-folded words). */
export function coverageEval(reference, hypothesis, lang = 'ar') {
  const n = (x) => { const v = normalizeFor(x, lang); return lang === 'ar' ? foldDialectLetters(v) : v; };
  const r = words(n(reference)); const h = words(n(hypothesis));
  if (r.length === 0) return 1;
  let prev = new Array(h.length + 1).fill(0);
  for (let i = 1; i <= r.length; i++) { const cur = new Array(h.length + 1).fill(0); for (let j = 1; j <= h.length; j++) cur[j] = r[i - 1] === h[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return prev[h.length] / r.length;
}

// ------------------------------------------------------------------------------------------------ line script

/** The studio's routing rule (src/server/providers/speech.ts `lineScript`), repeated here so the harness runs without
 *  tsx; tests/unit/voice-eval-metrics.test.ts proves parity. */
export function lineScriptOf(text) {
  const t = text.replace(/[\s\p{P}\p{S}]/gu, '');
  if (!t) return 'EMPTY';
  const arabic = /(?=\p{L})\p{Script=Arabic}/u.test(t);
  const latinWord = /[A-Za-zÀ-ɏ]{2,}/.test(t);
  const letters = /\p{L}/u.test(t);
  if (arabic && latinWord) return 'MIXED';
  if (arabic) return 'AR';
  if (letters) return 'LATIN';
  return 'NUMERIC';
}

export const mostlyArabic = (text) => (text.match(/(?=\p{L})\p{Script=Arabic}/gu)?.length ?? 0) >= (text.match(/[A-Za-zÀ-ɏ]/g)?.length ?? 0);

// ------------------------------------------------------------------------------------------------ MSA heuristic

/** Dialect markers and the MSA forms an ASR writes when it heard (or normalised toward) Modern Standard Arabic. Both
 *  sides are matched on `normalizeArabicEval` output, as whole words with an optional attached و/ب/ل/ف/ال. A marker
 *  counts only when the text has the Iraqi form, the transcript has the MSA form, and the transcript does NOT also
 *  have the Iraqi form (then the ASR simply added a word). */
export const MSA_MARKERS = [
  { iraqi: ['شلونك', 'شلونچ', 'شلونكم', 'شلون', 'اشلون'], msa: ['كيف حالك', 'كيف حالكم', 'كيف'] },
  { iraqi: ['شنو', 'شنهو', 'شني'], msa: ['ماذا', 'ما هو', 'ما هي', 'ما الذي'] },
  { iraqi: ['وين', 'وينك'], msa: ['اين'] },
  { iraqi: ['منو'], msa: ['من هو', 'من هذا', 'من الذي', 'من ذا'] },
  { iraqi: ['ليش', 'لويش'], msa: ['لماذا'] },
  { iraqi: ['شوكت', 'شوگت'], msa: ['متي'] },
  { iraqi: ['هسه', 'هسع', 'هسا'], msa: ['الان', 'حاليا'] },
  { iraqi: ['ماكو', 'ما كو', 'ماكه'], msa: ['لا يوجد', 'ليس هناك', 'لا شيء', 'لا توجد'] },
  { iraqi: ['اكو'], msa: ['يوجد', 'هناك', 'توجد'] },
  { iraqi: ['هوايه', 'هواي'], msa: ['كثيرا', 'كثير', 'جدا'] },
  { iraqi: ['باچر', 'باجر', 'بچر'], msa: ['غدا', 'غدن'] },
  { iraqi: ['مو'], msa: ['ليس', 'ليست', 'لست'] },
  { iraqi: ['اني'], msa: ['انا'] },
  { iraqi: ['احنا', 'احنه'], msa: ['نحن'] },
  { iraqi: ['زين'], msa: ['جيد', 'حسنا', 'جيدا'] },
  { iraqi: ['لعد'], msa: ['اذن', 'اذا', 'لذلك'] },
  { iraqi: ['شويه', 'شوي'], msa: ['قليلا', 'قليل'] },
  { iraqi: ['بس'], msa: ['فقط', 'لكن'] },
  { iraqi: ['راح'], msa: ['سوف'] },
  { iraqi: ['ويا', 'وياي', 'وياك', 'وياه', 'وياكم', 'وياچ'], msa: ['معي', 'معك', 'معه', 'معكم', 'مع'] },
  { iraqi: ['هيچ', 'هيچي', 'هيج', 'هيجي'], msa: ['هكذا'] },
  { iraqi: ['تدري', 'ادري'], msa: ['تعرف', 'تعلم', 'اعرف', 'اعلم'] },
  { iraqi: ['بعده', 'بعدها', 'بعدني'], msa: ['لا يزال', 'ما زال', 'لا تزال', 'ما زالت'] },
  { iraqi: ['تجي', 'يجي', 'اجي', 'نجي'], msa: ['تاتي', 'ياتي', 'اتي', 'ناتي'] },
  { iraqi: ['نسوي', 'شسوي', 'اسوي', 'تسوي', 'يسوي'], msa: ['نفعل', 'افعل', 'تفعل', 'يفعل', 'ماذا افعل'] },
  { iraqi: ['وره', 'ورا'], msa: ['وراء', 'خلف'] },
  { iraqi: ['يمعود'], msa: [] },
  { iraqi: ['چا', 'جا'], msa: [] },
  { iraqi: ['اثنعش', 'ثنعش'], msa: ['اثنا عشر', 'اثني عشر', 'اثنتا عشر', 'اثنتي عشر'] },
  { iraqi: ['خمسطعش', 'خمستعش'], msa: ['خمسه عشر', 'خمس عشره', 'خمسه عشره'] },
  { iraqi: ['اربعطعش', 'اربعتعش'], msa: ['اربعه عشر', 'اربع عشره', 'اربعه عشره'] },
  { iraqi: ['ميتين'], msa: ['مئتان', 'مائتان', 'مئتين', 'مائتين'] },
  { iraqi: ['تسعميه'], msa: ['تسعمائه', 'تسع مائه', 'تسعمئه'] },
  { iraqi: ['ميه', 'ميت'], msa: ['مائه', 'مئه'] },
  { iraqi: ['دير بالك', 'ديربالك'], msa: ['انتبه', 'احذر', 'خذ بالك'] },
  { iraqi: ['عفيه'], msa: ['احسنت', 'برافو'] },
  { iraqi: ['خوش'], msa: ['جميل', 'رائع'] },
];

/** MSA grammar the transcript may show that Baghdadi speech does not use: the negations لم / لن, the future سوف, the
 *  copula ليس — counted only when the intended text does not contain them. */
const MSA_GRAMMAR = ['لم', 'لن', 'سوف', 'ليس', 'ليست', 'لست', 'سيكون', 'ستكون'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PREFIX = '(?:و|ف|ب|ل|ال|وال|بال|لل|ولل|وب|ول)?';
const hasWord = (normalized, phrase) => new RegExp(`(?<=^|\\s)${PREFIX}${esc(phrase)}(?=\\s|$)`, 'u').test(normalized);

/** THE MSA-READING HEURISTIC (§4.3). Given the intended line and what the ASR wrote, returns the dialect markers found
 *  in the text, the markers whose MSA counterpart the ASR wrote instead (`substitutions`, strong evidence), MSA grammar
 *  words the ASR wrote that the text does not have (`grammar`), case endings the ASR wrote (`tanween`, weak), and the
 *  letter notes for گ/چ (`letters`: how the ASR spelled a گ or چ word — a transcription convention as much as a
 *  pronunciation, reported, not counted). `msaLike` is true with two or more substitutions, or one when the line has
 *  at most two markers, or any grammar word. What it means: either the engine read the line as MSA, or the ASR
 *  normalised dialect speech toward MSA spelling — the dialect-tuned Whisper does the latter less, and a listener
 *  decides which. A line with no markers cannot be flagged (`markers: 0`). */
export function msaReadingFlags(text, heard) {
  const t = normalizeArabicEval(text); const h = normalizeArabicEval(heard);
  const markers = []; const substitutions = [];
  for (const m of MSA_MARKERS) {
    const inText = m.iraqi.filter((w) => hasWord(t, w));
    if (!inText.length) continue;
    markers.push(inText[0]);
    const heardIraqi = m.iraqi.some((w) => hasWord(h, w));
    const heardMsa = m.msa.filter((w) => hasWord(h, w) && !hasWord(t, w));
    if (!heardIraqi && heardMsa.length) substitutions.push(`${inText[0]}→${heardMsa[0]}`);
  }
  const grammar = MSA_GRAMMAR.filter((w) => hasWord(h, w) && !hasWord(t, w));
  const tanween = (String(heard).normalize('NFC').match(/[ً-ٍ]/g) ?? []).length;
  const letters = [];
  const tWords = t.split(' '); const hFold = foldDialectLetters(h).split(' ');
  for (const w of tWords) {
    if (!/[گچ]/.test(w)) continue;
    const fw = foldDialectLetters(w);
    const j = hFold.indexOf(fw);
    const spelled = j >= 0 ? h.split(' ')[j] : null;
    letters.push(spelled === null ? `${w}: not found` : spelled === w ? `${w}: written as such` : `${w}: written ${spelled}`);
  }
  const msaLike = substitutions.length >= 2 || (substitutions.length === 1 && markers.length <= 2) || grammar.length > 0;
  return { markers: markers.length, markerWords: markers, substitutions, grammar, tanween, letters, msaLike };
}

// ------------------------------------------------------------------------------------------------ ffmpeg measurements

const num = (v) => { if (v === undefined || v === null) return NaN; const s = String(v).trim(); if (/^-?inf$/i.test(s)) return s.startsWith('-') ? -Infinity : Infinity; return Number(s); };

export async function probeAudio(file) {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { maxBuffer: 8 << 20, windowsHide: true });
  const j = JSON.parse(stdout);
  const a = (j.streams ?? []).find((s) => s.codec_type === 'audio');
  if (!a) throw new Error('no audio stream');
  const tags = Object.fromEntries(Object.entries(j.format?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { durationSeconds: Number(j.format?.duration ?? a.duration ?? 0), sampleRate: Number(a.sample_rate ?? 0), channels: Number(a.channels ?? 1), codec: a.codec_name, tags };
}

/** The studio's provenance tag (docker/tts writes it on every synthesised file): what it says, or null for a recording. */
export const engineOutputOf = (tags) => { const said = [tags.encoder, tags.software, tags.isft, tags.comment, tags.icmt].filter(Boolean).join(' · '); return /vewbox-tts|not a voice reference|synthetic speech/i.test(said) ? said.slice(0, 200) : null; };

/** EBU R128 integrated loudness, true peak and loudness range (ffmpeg loudnorm pass 1). Silence measures -Infinity. */
export async function loudnessOf(file) {
  const { stderr } = await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', 'loudnorm=I=-20:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'], { maxBuffer: 8 << 20, windowsHide: true });
  const m = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr);
  if (!m) throw new Error('ffmpeg did not report loudness');
  const j = JSON.parse(m[0]);
  return { lufs: num(j.input_i), truePeakDbtp: num(j.input_tp), lra: num(j.input_lra) };
}

/** Silence (below `noiseDb` for at least `minSilence` s): leading, trailing, total, the longest pause inside the
 *  speech, and the ratio to the duration. */
export async function silenceOf(file, durationSeconds, { noiseDb = -35, minSilence = 0.25 } = {}) {
  const { stderr } = await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', `silencedetect=n=${noiseDb}dB:d=${minSilence}`, '-f', 'null', '-'], { maxBuffer: 8 << 20, windowsHide: true });
  const silences = []; let open;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) { if (m[1] === 'start') open = Number(m[2]); else { silences.push({ from: Math.max(0, open ?? 0), to: Number(m[2]) }); open = undefined; } }
  if (open !== undefined) silences.push({ from: Math.max(0, open), to: durationSeconds });
  const d = durationSeconds || 0;
  const leading = silences.length && silences[0].from <= 0.02 ? silences[0].to : 0;
  const last = silences[silences.length - 1];
  const wholeSilent = silences.length === 1 && leading >= d - 0.05;
  const trailing = !wholeSilent && last && d - last.to <= 0.05 ? d - last.from : 0;
  const total = silences.reduce((a, s) => a + (s.to - s.from), 0);
  const inner = silences.filter((s) => s.from > 0.02 && d - s.to > 0.05).map((s) => s.to - s.from);
  return { leadingSeconds: round(leading, 3), trailingSeconds: round(trailing, 3), totalSeconds: round(Math.min(total, d), 3), longestPauseSeconds: round(inner.length ? Math.max(...inner) : 0, 3), ratio: d > 0 ? round(Math.min(total, d) / d, 4) : 1, silences };
}

export const round = (v, digits = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : v);

/** Everything the harness measures on one WAV (CPU, ffmpeg): duration, level, silence. */
export async function measureAudio(file) {
  const p = await probeAudio(file);
  const [l, s] = await Promise.all([loudnessOf(file), silenceOf(file, p.durationSeconds)]);
  return { durationSeconds: round(p.durationSeconds), sampleRate: p.sampleRate, channels: p.channels, lufs: round(l.lufs, 2), truePeakDbtp: round(l.truePeakDbtp, 2), lra: round(l.lra, 2), silence: s, engineOutput: engineOutputOf(p.tags) };
}

/** Speaking rate as Arabic letters per second of speech (letters of the normalised text / (duration − silence)). */
export const lettersPerSecond = (text, durationSeconds, silenceSeconds = 0) => { const n = normalizeArabicEval(text).replace(/\s/g, '').length; const t = durationSeconds - silenceSeconds; return t > 0.05 ? round(n / t, 2) : null; };

// ------------------------------------------------------------------------------------------------ per-line flags

/** The machine's pre-check on a spoken line: what would waste a reviewer's time or must be known before listening.
 *  Thresholds: loudness −23…−16 LUFS and true peak ≤ −1 dBTP (the model-stack §5.7 gates), CER ≤ 0.15 after the fold
 *  (the contract gate), silence ratio ≤ 0.5, a line shorter than 0.3 s or longer than 4 s per 10 letters. */
export function lineFlags(r) {
  const flags = [];
  if (r.error) return ['ERROR'];
  if (r.cerFolded !== undefined && r.cerFolded > 0.15) flags.push('CER_ABOVE_GATE');
  if (r.cerFolded !== undefined && r.cerFolded > 0.35) flags.push('UNINTELLIGIBLE');
  if (r.msa?.msaLike) flags.push('MSA_LIKE');
  if (r.asrModel && r.asrLanguage === 'ar' && !/dialect/i.test(r.asrModel)) flags.push('ASR_NOT_DIALECT_MODEL');
  if (Number.isFinite(r.lufs) && (r.lufs < -23 || r.lufs > -16)) flags.push('LOUDNESS_OUT_OF_RANGE');
  if (r.lufs === -Infinity) flags.push('SILENT');
  if (Number.isFinite(r.truePeakDbtp) && r.truePeakDbtp > -0.95) flags.push('PEAK_ABOVE_CEILING');
  if (r.silence && r.silence.ratio > 0.5) flags.push('MOSTLY_SILENCE');
  if (r.durationSeconds !== undefined && r.durationSeconds < 0.3) flags.push('TOO_SHORT');
  const letters = normalizeArabicEval(r.text).replace(/\s/g, '').length;
  if (r.durationSeconds !== undefined && letters > 0 && r.durationSeconds > 0.4 * letters + 2) flags.push('TOO_LONG_FOR_TEXT');
  if (r.engineOutput === null) flags.push('NO_PROVENANCE_TAG');
  return flags;
}

// ------------------------------------------------------------------------------------------------ summaries

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n, d) => (d ? round(n / d, 3) : null);

/** Measured summary per voice and per category (never a quality claim). */
export function measuredSummary(lines) {
  const ok = lines.filter((r) => !r.error);
  const stat = (xs) => ({ lines: xs.length, cerFoldedMean: round(mean(xs.map((r) => r.cerFolded).filter(Number.isFinite)) ?? NaN, 3), werMean: round(mean(xs.map((r) => r.wer).filter(Number.isFinite)) ?? NaN, 3), intelligible: xs.filter((r) => r.cerFolded !== undefined && r.cerFolded <= 0.15).length, msaLike: xs.filter((r) => r.msa?.msaLike).length, lufsMean: round(mean(xs.map((r) => r.lufs).filter(Number.isFinite)) ?? NaN, 2), peakMax: xs.length ? round(Math.max(...xs.map((r) => r.truePeakDbtp).filter(Number.isFinite), -Infinity), 2) : null, flags: countBy(xs.flatMap((r) => r.flags ?? [])) });
  const group = (key) => Object.fromEntries([...new Set(ok.map((r) => r[key]))].map((k) => [k, stat(ok.filter((r) => r[key] === k))]));
  return { all: stat(ok), errors: lines.length - ok.length, perVoice: group('voice'), perCategory: group('category'), perEngine: group('engine') };
}

const countBy = (xs) => xs.reduce((acc, x) => { acc[x] = (acc[x] ?? 0) + 1; return acc; }, {});

/** THE PASS BAR (§6) applied to a reviewer's saved form. `review.ratings[key] = { rating, dialect, emotion, sameVoice,
 *  note }` keyed by the line key the page uses (`voice/lineId/variant`). Per voice: natural ≥ 80 %, no film line
 *  wrong, dialect yes ≥ 80 % of msaWouldSoundWrong lines, emotion matched ≥ 3/4 of emotion lines, same voice ≥ 4 on
 *  ≥ 80 %. `verified` is true only when every criterion holds AND a reviewer is named. */
export function summarizeReview(report, review) {
  const ratings = review?.ratings ?? {};
  const voices = [...new Set(report.lines.filter((r) => !r.error).map((r) => r.voice))];
  const perVoice = {};
  for (const v of voices) {
    const spoken = report.lines.filter((r) => r.voice === v && !r.error);
    const rated = spoken.map((r) => ({ r, x: ratings[r.key] })).filter((p) => p.x && p.x.rating);
    const n = rated.length;
    const natural = rated.filter((p) => p.x.rating === 'natural').length;
    const understandable = rated.filter((p) => p.x.rating === 'understandable').length;
    const wrong = rated.filter((p) => p.x.rating === 'wrong');
    const filmWrong = wrong.filter((p) => p.r.category === 'film').length;
    const msaLines = rated.filter((p) => p.r.msaWouldSoundWrong);
    const dialectYes = msaLines.filter((p) => p.x.dialect === 'yes').length;
    const emoLines = rated.filter((p) => p.r.category === 'emotion');
    const emoMatched = emoLines.filter((p) => p.x.emotion === 'matched').length;
    const sameVoice = rated.filter((p) => Number(p.x.sameVoice) >= 4).length;
    const criteria = {
      naturalShare: { value: pct(natural, n), pass: n > 0 && natural / n >= 0.8 },
      noFilmLineWrong: { value: filmWrong, pass: n > 0 && filmWrong === 0 },
      dialectYesShare: { value: pct(dialectYes, msaLines.length), pass: msaLines.length > 0 && dialectYes / msaLines.length >= 0.8 },
      emotionMatchedShare: { value: pct(emoMatched, emoLines.length), pass: emoLines.length > 0 && emoMatched / emoLines.length >= 0.75 },
      sameVoiceShare: { value: pct(sameVoice, n), pass: n > 0 && sameVoice / n >= 0.8 },
    };
    const complete = n === spoken.length;
    const pass = complete && Object.values(criteria).every((c) => c.pass);
    perVoice[v] = { spoken: spoken.length, rated: n, complete, natural, understandable, wrong: wrong.length, criteria, pass, wrongLines: wrong.map((p) => ({ key: p.r.key, id: p.r.id, note: p.x.note ?? '' })), notes: rated.filter((p) => p.x.note).map((p) => ({ key: p.r.key, id: p.r.id, rating: p.x.rating, note: p.x.note })) };
  }
  const reviewer = (review?.reviewer ?? '').trim();
  return { reviewer, reviewedAt: review?.at ?? null, runId: review?.runId ?? null, perVoice, verified: Boolean(reviewer) && voices.length > 0 && voices.every((v) => perVoice[v].pass), status: reviewer ? (voices.every((v) => perVoice[v].complete) ? 'REVIEWED' : 'PARTIAL') : 'PENDING' };
}

// ------------------------------------------------------------------------------------------------ review page

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** review.html: one self-contained page per run — a player per line, the Iraqi text, the gloss, the features, the
 *  intended emotion, the expected sex, then (hidden until the line is rated, so the ear decides first) the transcript
 *  and the measurements — and the reviewer form (natural / understandable / wrong, dialect yes/no, emotion
 *  matched/weak/wrong, same voice 1–5, a note), saved as a JSON download and kept in the browser between sessions.
 *  Audio paths are relative to the page, so it plays from the run folder as a file. */
export function renderReviewHtml(report) {
  const json = JSON.stringify(report).replace(/<\/script/gi, '<\\/script');
  const runId = escapeHtml(report.run?.id ?? 'run');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iraqi voice review — ${runId}</title>
<style>
  :root { color-scheme: light dark; --bg: #faf8f4; --fg: #1c1a17; --muted: #6b6560; --line: #d9d3ca; --card: #ffffff; --accent: #8a4b2a; --ok: #2f7a3d; --warn: #b2641a; --bad: #a3332c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #16151a; --fg: #ece7df; --muted: #9a938a; --line: #3a373f; --card: #1f1e24; --accent: #d89a6a; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 15px/1.45 system-ui, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); }
  header { position: sticky; top: 0; background: var(--bg); padding: 8px 0 12px; border-bottom: 1px solid var(--line); z-index: 2; }
  header h1 { font-size: 18px; margin: 0 0 6px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 14px; }
  .bar label { display: inline-flex; gap: 6px; align-items: center; }
  input[type=text], select { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); }
  button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  main { max-width: 980px; margin: 0 auto; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 14px 0; }
  .card.rated { border-color: var(--ok); }
  .meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .ar { direction: rtl; text-align: right; font-size: 26px; line-height: 1.7; margin: 8px 0 4px; font-family: "Noto Naskh Arabic", "Segoe UI", "Arial", sans-serif; }
  .ar.small { font-size: 19px; color: var(--muted); }
  .gloss { color: var(--muted); font-style: italic; }
  audio { width: 100%; margin: 8px 0; }
  .form { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 8px; }
  .form fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; margin: 0; }
  .form legend { font-size: 13px; color: var(--muted); padding: 0 4px; }
  .form label { margin-right: 12px; white-space: nowrap; }
  .hidden { display: none; }
  .metrics { font-size: 13px; color: var(--muted); border-top: 1px dashed var(--line); margin-top: 8px; padding-top: 8px; }
  .metrics table { border-collapse: collapse; }
  .metrics td { padding: 1px 10px 1px 0; vertical-align: top; }
  .flag { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 12px; margin-right: 4px; background: var(--line); }
  .flag.bad { background: var(--bad); color: #fff; }
  .flag.warn { background: var(--warn); color: #fff; }
  textarea { width: 100%; font: inherit; min-height: 44px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); padding: 6px; }
  .note { font-size: 13px; color: var(--muted); }
  @media (min-width: 720px) { .form { grid-template-columns: 1fr 1fr; } .form .wide { grid-column: 1 / -1; } }
</style>
</head>
<body>
<header>
  <h1>Iraqi Arabic voice review — run ${runId}</h1>
  <div class="bar">
    <label>Reviewer <input type="text" id="reviewer" placeholder="your name (a native Iraqi listener)"></label>
    <label><input type="checkbox" id="blind" checked> hide transcript and numbers until rated</label>
    <label>Voice <select id="voiceFilter"><option value="">all</option></select></label>
    <label>Category <select id="catFilter"><option value="">all</option></select></label>
    <span id="progress"></span>
    <button class="primary" id="save">Save review JSON</button>
    <label class="note">Load <input type="file" id="load" accept="application/json"></label>
  </div>
  <p class="note">Rate the ear first: <b>natural</b> = a Baghdadi would say it this way; <b>understandable</b> = the words are there but it is read, MSA-coloured, flat or a sound is off; <b>wrong</b> = a word missing, garbled, replaced, or not Iraqi. Headphones. Nothing here is verified until this form is saved and merged.</p>
</header>
<main id="lines"></main>
<script id="report" type="application/json">${json}</script>
<script>
(() => {
  const report = JSON.parse(document.getElementById('report').textContent);
  const runId = report.run && report.run.id || 'run';
  const storeKey = 'iraqi-review:' + runId;
  let review = { runId, reviewer: '', at: null, ratings: {} };
  try { const s = localStorage.getItem(storeKey); if (s) review = Object.assign(review, JSON.parse(s)); } catch (e) {}
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lines = report.lines.filter((r) => !r.error);
  const voices = [...new Set(lines.map((r) => r.voice))]; const cats = [...new Set(lines.map((r) => r.category))];
  for (const v of voices) $('voiceFilter').insertAdjacentHTML('beforeend', '<option>' + esc(v) + '</option>');
  for (const c of cats) $('catFilter').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
  $('reviewer').value = review.reviewer || '';
  const persist = () => { review.at = new Date().toISOString(); try { localStorage.setItem(storeKey, JSON.stringify(review)); } catch (e) {} progress(); };
  const progress = () => { const n = lines.filter((r) => review.ratings[r.key] && review.ratings[r.key].rating).length; $('progress').textContent = n + ' / ' + lines.length + ' rated'; };
  const flagClass = (f) => /UNINTELLIGIBLE|SILENT|ERROR|PEAK|MOSTLY/.test(f) ? 'bad' : /MSA|CER|ASR|LOUD|TOO/.test(f) ? 'warn' : '';
  const fmt = (v, d) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : (typeof v === 'number' ? v.toFixed(d == null ? 2 : d) : String(v));
  const card = (r) => {
    const x = review.ratings[r.key] || {};
    const radio = (name, opts) => opts.map((o) => '<label><input type="radio" name="' + esc(name + ':' + r.key) + '" value="' + esc(o) + '"' + (x[name] === o ? ' checked' : '') + '> ' + esc(o) + '</label>').join('');
    const m = r.msa || {};
    return '<section class="card' + (x.rating ? ' rated' : '') + '" data-key="' + esc(r.key) + '" data-voice="' + esc(r.voice) + '" data-cat="' + esc(r.category) + '">'
      + '<div class="meta"><span><b>' + esc(r.id) + '</b> · ' + esc(r.category) + '</span><span>voice: ' + esc(r.voice) + ' (' + esc(r.voiceSex) + ')</span><span>expected: ' + esc(r.sex) + '</span><span>emotion: <b>' + esc(r.emotion) + '</b></span>' + (r.variant !== 'prepared' ? '<span>variant: ' + esc(r.variant) + '</span>' : '') + (r.engine !== 'habibi' ? '<span>engine: ' + esc(r.engine) + '</span>' : '') + (r.msaWouldSoundWrong ? '<span>an MSA reading would be wrong</span>' : '') + '</div>'
      + '<div class="ar">' + esc(r.text) + '</div>'
      + (r.spoken && r.spoken !== r.text ? '<div class="ar small">spoken as: ' + esc(r.spoken) + '</div>' : '')
      + '<div class="gloss">' + esc(r.gloss) + '</div>'
      + '<div class="meta"><span>listen for: ' + esc((r.features || []).join(', ')) + '</span></div>'
      + '<audio controls preload="none" src="' + esc(r.file) + '"></audio>'
      + '<div class="form">'
      + '<fieldset><legend>Rating</legend>' + radio('rating', ['natural', 'understandable', 'wrong']) + '</fieldset>'
      + '<fieldset><legend>Sounds authentically Baghdadi?</legend>' + radio('dialect', ['yes', 'no']) + '</fieldset>'
      + '<fieldset><legend>Intended emotion (' + esc(r.emotion) + ')</legend>' + radio('emotion', ['matched', 'weak', 'wrong']) + '</fieldset>'
      + '<fieldset><legend>Same voice as the other lines (1–5)</legend>' + radio('sameVoice', ['1', '2', '3', '4', '5']) + '</fieldset>'
      + '<fieldset class="wide"><legend>Note (which word, which sound)</legend><textarea data-note="' + esc(r.key) + '">' + esc(x.note || '') + '</textarea></fieldset>'
      + '</div>'
      + '<div class="metrics' + (x.rating ? '' : ' blind') + '"><table>'
      + '<tr><td>ASR heard</td><td class="ar small" style="font-size:17px">' + esc(r.heard || '—') + '</td></tr>'
      + '<tr><td>ASR model</td><td>' + esc(r.asrModel || '—') + '</td></tr>'
      + '<tr><td>CER raw / folded</td><td>' + fmt(r.cer) + ' / ' + fmt(r.cerFolded) + (r.cerStudio !== undefined ? ' (studio fold ' + fmt(r.cerStudio) + ', coverage ' + fmt(r.coverageStudio) + ')' : '') + '</td></tr>'
      + '<tr><td>WER raw</td><td>' + fmt(r.wer) + '</td></tr>'
      + '<tr><td>MSA heuristic</td><td>' + (m.markers ? (m.substitutions && m.substitutions.length ? esc(m.substitutions.join(', ')) : 'no MSA substitution') + (m.grammar && m.grammar.length ? '; grammar: ' + esc(m.grammar.join(', ')) : '') + ' · ' + m.markers + ' marker(s)' : 'no markers in text') + (m.letters && m.letters.length ? '<br>گ/چ: ' + esc(m.letters.join('; ')) : '') + '</td></tr>'
      + '<tr><td>Duration / rate</td><td>' + fmt(r.durationSeconds) + ' s · ' + fmt(r.lettersPerSecond, 1) + ' letters/s</td></tr>'
      + '<tr><td>Level</td><td>' + fmt(r.lufs, 1) + ' LUFS · peak ' + fmt(r.truePeakDbtp) + ' dBTP · LRA ' + fmt(r.lra, 1) + '</td></tr>'
      + '<tr><td>Silence</td><td>' + (r.silence ? 'lead ' + fmt(r.silence.leadingSeconds) + ' s · tail ' + fmt(r.silence.trailingSeconds) + ' s · longest pause ' + fmt(r.silence.longestPauseSeconds) + ' s · ratio ' + fmt(r.silence.ratio) : '—') + '</td></tr>'
      + '<tr><td>Flags</td><td>' + ((r.flags || []).length ? r.flags.map((f) => '<span class="flag ' + flagClass(f) + '">' + esc(f) + '</span>').join('') : 'none') + '</td></tr>'
      + '<tr><td>Seed</td><td>' + esc(r.seed) + ' · ' + esc(r.engineVersion || '') + '</td></tr>'
      + '</table></div></section>';
  };
  const render = () => { $('lines').innerHTML = lines.map(card).join(''); applyBlind(); applyFilter(); progress(); };
  const applyBlind = () => { const blind = $('blind').checked; for (const el of document.querySelectorAll('.metrics')) { const key = el.closest('.card').dataset.key; const rated = review.ratings[key] && review.ratings[key].rating; el.classList.toggle('hidden', blind && !rated); } };
  const applyFilter = () => { const v = $('voiceFilter').value, c = $('catFilter').value; for (const el of document.querySelectorAll('.card')) el.classList.toggle('hidden', (v && el.dataset.voice !== v) || (c && el.dataset.cat !== c)); };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'reviewer') { review.reviewer = t.value; persist(); return; }
    if (t.id === 'blind') { applyBlind(); return; }
    if (t.id === 'voiceFilter' || t.id === 'catFilter') { applyFilter(); return; }
    if (t.type === 'radio') { const [name, key] = t.name.split(/:(.+)/); review.ratings[key] = Object.assign(review.ratings[key] || {}, { [name]: t.value }); persist(); const c = t.closest('.card'); if (name === 'rating') { c.classList.add('rated'); c.querySelector('.metrics').classList.remove('hidden'); } }
  });
  document.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.note) { review.ratings[t.dataset.note] = Object.assign(review.ratings[t.dataset.note] || {}, { note: t.value }); persist(); } });
  $('save').addEventListener('click', () => {
    review.reviewer = $('reviewer').value; review.at = new Date().toISOString();
    const name = 'review-' + (review.reviewer || 'anonymous').replace(/[^\\w-]+/g, '_') + '-' + review.at.slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  });
  $('load').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (j.runId && j.runId !== runId && !confirm('This review is for run ' + j.runId + ', not ' + runId + '. Load anyway?')) return; review = Object.assign({ runId, reviewer: '', ratings: {} }, j, { runId }); $('reviewer').value = review.reviewer || ''; persist(); render(); } catch (err) { alert('Not a review file: ' + err.message); } });
  render();
})();
</script>
</body>
</html>
`;
}

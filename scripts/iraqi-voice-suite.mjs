#!/usr/bin/env node
// Iraqi Arabic pronunciation suite: the directive's conversational phrases plus longer, emotional, numeric and
// code-switched lines, spoken by the Iraqi engine (Habibi-TTS IRQ) from a male and a female reference, each read
// back by Whisper large-v3. It proves intelligibility and consistency (word error rate, duration, that the engine
// answered); dialect authenticity stays a native listener's call and is marked so in the report.
//
//   node scripts/iraqi-voice-suite.mjs --male var/ref-male.wav --female var/ref-female.wav [--out docs/evidence/iraqi-suite.md]
//
// Services: TTS_HABIBI_URL (default http://127.0.0.1:8021), ASR_URL (default http://127.0.0.1:8030).
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const TTS = (process.env.TTS_HABIBI_URL || 'http://127.0.0.1:8021').replace(/\/$/, '');
const ASR = (process.env.ASR_URL || 'http://127.0.0.1:8030').replace(/\/$/, '');
const out = args.out || 'docs/evidence/iraqi-suite.md';
const refs = { male: args.male, female: args.female };
if (!refs.male || !refs.female) { console.error('give --male and --female reference recordings'); process.exit(2); }

const PHRASES = [
  { id: 'greet', text: 'شلونك حبيبي، شخبارك؟', kind: 'short / greeting' },
  { id: 'where', text: 'هسه وين نروح؟', kind: 'short / question' },
  { id: 'what', text: 'شنو السالفة؟', kind: 'short / question' },
  { id: 'why', text: 'ليش ما گلتلي من البداية؟', kind: 'question with گ' },
  { id: 'tomorrow', text: 'باچر نروح للمكان نفسه.', kind: 'statement with چ' },
  { id: 'care', text: 'دير بالك على نفسك.', kind: 'short / warm' },
  { id: 'angry', text: 'گلتلك ميت مرة لا تلعب بالخيط! هسه انقطع وراح الطيارة!', kind: 'anger / long' },
  { id: 'happy', text: 'والله فرحت هواية لمن شفتها تطير فوق السطوح!', kind: 'happiness' },
  { id: 'sad', text: 'ما ظل أحد يسأل عني من راحت أمي.', kind: 'sadness' },
  { id: 'excited', text: 'يلا يلا بسرعة، الهوا هسه زين، نطيّرها هسه!', kind: 'excitement' },
  { id: 'hesitant', text: 'يعني... ما أدري... يمكن أجرب مرة ثانية.', kind: 'hesitation' },
  { id: 'names', text: 'سمير وأمينة وسليم راحوا للأعظمية عند أم حسن.', kind: 'names / places' },
  { id: 'numbers', text: 'عندي ثلاث طيارات وخمسة وعشرين خيط، والباص رقم اثنعش.', kind: 'numbers' },
  { id: 'tech', text: 'شغّل الـ wifi وافتح الـ app، الـ battery خلصت.', kind: 'English technical words' },
  { id: 'switch', text: 'OK سمير، هسه نسوي test للخيط، ready?', kind: 'Arabic/English switching' },
  { id: 'long', text: 'لمن كنت صغير، جدي علمني شلون أصلّح الطيارة بخيط واحد وشوية صبر، وگللي الهوا ما يسمعك إذا تصرخ عليه، بس يسمعك إذا تمشي وياه.', kind: 'long dialogue' },
];

const norm = (s) => s.replace(/[ً-ْٰـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
function wer(ref, hyp) {
  const r = norm(ref).split(' ').filter(Boolean), h = norm(hyp).split(' ').filter(Boolean);
  if (!r.length) return h.length ? 1 : 0;
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

async function transcribe(buf, name) {
  const fd = new FormData(); fd.set('file', new Blob([buf]), name); fd.set('language', 'ar'); fd.set('words', '0');
  const r = await fetch(`${ASR}/transcribe`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`asr ${r.status}`);
  return r.json();
}
async function speak(text, refFile, refText) {
  const fd = new FormData(); fd.set('text', text); fd.set('language', 'ar'); fd.set('dialect', 'IRAQI_BAGHDADI'); fd.set('engine', 'habibi');
  fd.set('reference', new Blob([await fs.readFile(refFile)]), path.basename(refFile)); if (refText) fd.set('reference_text', refText);
  const t0 = Date.now();
  const r = await fetch(`${TTS}/synthesize`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { buf: Buffer.from(await r.arrayBuffer()), seconds: Number(r.headers.get('x-duration') ?? 0), ms: Date.now() - t0 };
}

const evidenceDir = path.join(path.dirname(out), 'iraqi-suite');
await fs.mkdir(evidenceDir, { recursive: true });
const rows = [];
for (const [voice, refFile] of Object.entries(refs)) {
  const refText = (await transcribe(await fs.readFile(refFile), path.basename(refFile))).text;
  console.log(`${voice} reference: "${refText}"`);
  for (const ph of PHRASES) {
    try {
      const s = await speak(ph.text, refFile, refText);
      const file = path.join(evidenceDir, `${voice}-${ph.id}.wav`);
      await fs.writeFile(file, s.buf);
      const t = await transcribe(s.buf, `${ph.id}.wav`);
      const e = wer(ph.text, t.text);
      rows.push({ voice, ...ph, seconds: s.seconds, ms: s.ms, heard: t.text, wer: e, file });
      console.log(`${voice} ${ph.id}: ${s.seconds.toFixed(1)}s WER ${e.toFixed(2)} ← ${t.text}`);
    } catch (err) { rows.push({ voice, ...ph, error: String(err.message) }); console.log(`${voice} ${ph.id}: ERROR ${err.message}`); }
  }
}
const ok = rows.filter((r) => r.wer !== undefined);
const mean = ok.length ? ok.reduce((a, r) => a + r.wer, 0) / ok.length : NaN;
const md = [`# Iraqi Arabic pronunciation suite`, '', `Engine: Habibi-TTS IRQ (F5-TTS v1) via the studio's voice service; transcription: faster-whisper large-v3 (language forced to Arabic). Run ${new Date().toISOString()}.`, '',
  `Mean WER over ${ok.length} lines: **${mean.toFixed(2)}** (male ${(ok.filter((r) => r.voice === 'male').reduce((a, r) => a + r.wer, 0) / Math.max(1, ok.filter((r) => r.voice === 'male').length)).toFixed(2)}, female ${(ok.filter((r) => r.voice === 'female').reduce((a, r) => a + r.wer, 0) / Math.max(1, ok.filter((r) => r.voice === 'female').length)).toFixed(2)}). WER here counts Whisper's own Arabic errors too (it normalises dialect spellings such as گ/چ), so it bounds intelligibility from above.`, '',
  `**Dialect authenticity is subjective quality pending review by a native Iraqi listener.** The files are under \`docs/evidence/iraqi-suite/\`.`, '',
  '| voice | id | kind | line | seconds | heard | WER |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.voice} | ${r.id} | ${r.kind} | ${r.text} | ${r.seconds?.toFixed(1) ?? '—'} | ${r.heard ?? `error: ${r.error}`} | ${r.wer?.toFixed(2) ?? '—'} |`)].join('\n');
await fs.writeFile(out, md, 'utf8');
console.log(`report: ${out}`);

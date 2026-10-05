/* ONE-WORD ENGLISH LINES ON INDEXTTS, before and after the lead-in cut (docs/research/MODEL-EVAL-2026-10.md §4, open
 * item 7). Calls the services directly, as the evaluation harnesses do — never the studio. Two phases, so only one
 * inference service runs at a time:
 *
 *   pnpm exec tsx scripts/one-word-eval.ts synth --tts http://127.0.0.1:8020 [--out <dir>]   (tts up)
 *   pnpm exec tsx scripts/one-word-eval.ts asr   --asr http://127.0.0.1:8030 [--out <dir>]   (asr up)
 *
 * synth: each word × seed twice — the line ALONE (as before the fix) and as the studio now prepares it
 * (`prepareLineText`: the lead-in sentence + the word). asr: transcribes both; the prepared take is cut exactly as
 * `speakLine` cuts it (`leadInCutPoint` on the word timings → `quietestPoint` → `cutWavStart`) and the CUT file is
 * transcribed again: that transcript is the "after". results.json + the cut WAVs are the evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { cutWavStart, leadInCutPoint, quietestPoint, readPcm16, type TimedWord } from '@/server/media/lead-in';

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const mode = argv[0];
const OUT = path.resolve(opt('out', 'docs/evidence/model-eval-2026-10/voice-en/one-word'));
const REF = path.resolve('tests/fixtures/speech-en.wav');
const WORDS = ['Nothing.', 'Now?', 'Yes.', 'Run!', 'Why?', 'Okay.'];
const SEEDS = [7, 11, 23];
for (const u of [opt('tts', ''), opt('asr', '')]) if (/:4200\b|\/api\//.test(u)) { console.error('refusing the studio server'); process.exit(2); }

interface Take { word: string; seed: number; variant: 'alone' | 'prepared'; spoken: string; file: string; seconds: number; heard?: string; words?: TimedWord[]; cut?: { from: number; file: string; seconds: number; heard?: string; words?: TimedWord[] } | null }
const resultsFile = path.join(OUT, 'results.json');
const id = (w: string) => w.replace(/[^A-Za-z]/g, '').toLowerCase();

async function synth() {
  const tts = opt('tts', ''); if (!tts) throw new Error('--tts <url>');
  await fs.mkdir(path.join(OUT, 'raw'), { recursive: true });
  const takes: Take[] = [];
  for (const word of WORDS) for (const seed of SEEDS) for (const variant of ['alone', 'prepared'] as const) {
    const spoken = variant === 'alone' ? word : prepareLineText(word, { engine: 'indextts', language: 'EN' }).text;
    const fd = new FormData();
    fd.set('text', spoken); fd.set('language', 'en'); fd.set('engine', 'indextts'); fd.set('seed', String(seed)); fd.set('speed', '1');
    fd.set('reference', new Blob([await fs.readFile(REF)]), 'speech-en.wav');
    const r = await fetch(`${tts.replace(/\/$/, '')}/synthesize`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const file = path.join(OUT, 'raw', `${id(word)}-${variant}-s${seed}.wav`);
    await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
    takes.push({ word, seed, variant, spoken, file: path.relative(OUT, file).replace(/\\/g, '/'), seconds: Number(r.headers.get('x-duration')) });
    console.log(`${word} s${seed} ${variant}: "${spoken}" ${r.headers.get('x-duration')} s`);
  }
  await fs.writeFile(resultsFile, JSON.stringify({ at: new Date().toISOString(), engine: 'indextts (IndexTTS 2.5)', reference: 'tests/fixtures/speech-en.wav', takes }, null, 2));
}

async function transcribe(asr: string, file: string): Promise<{ text: string; words: TimedWord[] }> {
  const fd = new FormData();
  fd.set('file', new Blob([await fs.readFile(file)]), path.basename(file)); fd.set('language', 'en'); fd.set('words', '1');
  const r = await fetch(`${asr.replace(/\/$/, '')}/transcribe`, { method: 'POST', body: fd });
  const j = await r.json() as { text: string; segments: Array<{ words: Array<{ start: number; end: number; word: string }> }> };
  return { text: j.text.trim(), words: j.segments.flatMap((s) => s.words.map((w) => ({ start: w.start, end: w.end, word: w.word.trim() }))) };
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (word: string, heard?: string) => heard !== undefined && fold(heard) === fold(word);

async function asr() {
  const url = opt('asr', ''); if (!url) throw new Error('--asr <url>');
  const res = JSON.parse(await fs.readFile(resultsFile, 'utf8')) as { takes: Take[] } & Record<string, unknown>;
  await fs.mkdir(path.join(OUT, 'cut'), { recursive: true });
  for (const t of res.takes) {
    const h = await transcribe(url, path.join(OUT, t.file)); t.heard = h.text; t.words = h.words;
    if (t.variant === 'prepared') {
      const at = leadInCutPoint(h.words, t.word);
      if (!at) t.cut = null;
      else {
        const wav = await fs.readFile(path.join(OUT, t.file));
        const { samples, sampleRate } = readPcm16(wav);
        const from = quietestPoint(samples, sampleRate, at.from, at.to);
        const cut = cutWavStart(wav, from);
        const file = path.join(OUT, 'cut', `${id(t.word)}-s${t.seed}.wav`);
        await fs.writeFile(file, cut);
        const hc = await transcribe(url, file);
        t.cut = { from: Math.round(from * 1000) / 1000, file: path.relative(OUT, file).replace(/\\/g, '/'), seconds: Math.round((readPcm16(cut).samples.length / sampleRate) * 1000) / 1000, heard: hc.text, words: hc.words };
      }
    }
    console.log(`${t.word} s${t.seed} ${t.variant}: "${t.heard}"${t.cut ? ` → cut at ${t.cut.from} s: "${t.cut.heard}"` : t.variant === 'prepared' ? ' → NOT CUT (word not located)' : ''}`);
  }
  const alone = res.takes.filter((t) => t.variant === 'alone');
  const prepared = res.takes.filter((t) => t.variant === 'prepared');
  res.summary = {
    before_aloneClean: `${alone.filter((t) => clean(t.word, t.heard)).length}/${alone.length}`,
    after_located: `${prepared.filter((t) => t.cut).length}/${prepared.length}`,
    after_cutClean: `${prepared.filter((t) => clean(t.word, t.cut?.heard)).length}/${prepared.length}`,
    rule: 'clean = the transcript, folded (case, punctuation), is exactly the word',
  };
  await fs.writeFile(resultsFile, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res.summary));
}

(mode === 'synth' ? synth() : mode === 'asr' ? asr() : Promise.reject(new Error('synth | asr'))).catch((e) => { console.error(e); process.exit(1); });

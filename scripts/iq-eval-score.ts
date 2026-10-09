/* SCORING FOR THE VEWBOX-IQ EXPERIMENTS (the master directive §12, §22–§23 — supporting evidence only; the ear decides):
 * a folder of evaluation wavs written by docker/train-iq/train/eval_checkpoint.py (one wav per sentence, with its
 * metrics.json listing { id, language, text, file }) is heard back by Qwen3-ASR (CER / coverage after the dialect fold),
 * compared with the reference by ECAPA cosine (the tts-design service), measured for pitch (pYIN in the tts-habibi
 * container) and, for Iraqi, judged by the phoneme gate (dialectPhonemes → judgeLine on چ/گ words).
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iq-eval-score.ts <eval dir> [--reference <wav>] [--english-reference <wav>]
 *
 * Writes <eval dir>/scores.json and prints a compact table. Run under the GPU lease: gpu-hold.ts ASR 6000 -- … */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const sh = (cmd: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(cmd, args, { maxBuffer: 1e8 }, (e, o, err) => (e ? reject(new Error(`${e.message} ${err}`)) : resolve(String(o)))));
const r3 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? undefined : Math.round(v * 1000) / 1000);

interface Item { id: string; language: 'ar' | 'en' | 'AR' | 'EN'; text: string; file: string; seconds?: number; rtf?: number }

async function main() {
  const dir = path.resolve(process.argv[2] ?? '');
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'metrics.json'), 'utf8')) as { lines?: Item[]; checkpoint?: string; [k: string]: unknown };
  const items = (meta.lines ?? []) as Item[];
  if (!items.length) throw new Error(`${dir}/metrics.json lists no items`);
  const refAr = arg('reference'); const refEn = arg('english-reference') ?? refAr;
  const { transcribeQwen, dialectPhonemes, isQaUnavailable } = await import('@/server/providers/qa-service');
  const { heardMetrics } = await import('@/worker/handlers/voice-measure');
  const { embedVoice, cosine } = await import('@/server/providers/voice-design');
  const { judgeLine } = await import('@/server/media/iraqi-phonology');
  const { dialectWords } = await import('@/server/providers/iraqi-g2p');
  const embRef: Record<string, number[]> = {};
  if (refAr) embRef.ar = (await embedVoice(refAr)).embedding;
  if (refEn) embRef.en = (await embedVoice(refEn)).embedding;
  const rows: Array<Record<string, unknown>> = [];
  const files = items.map((i) => path.isAbsolute(i.file) ? i.file : path.join(dir, i.file));
  // pitch for every file in one container call
  const box = 'vewbox-tts-habibi-1';
  await sh('docker', ['exec', box, 'sh', '-c', 'rm -rf /tmp/iqe && mkdir -p /tmp/iqe']);
  await sh('docker', ['cp', path.resolve('scripts/pitch-stats.py'), `${box}:/tmp/iqe/pitch-stats.py`]);
  const inBox = files.map((_, i) => `/tmp/iqe/${i}.wav`);
  for (const [i, f] of files.entries()) await sh('docker', ['cp', f, `${box}:${inBox[i]}`]);
  const pitch = JSON.parse(await sh('docker', ['exec', box, '/opt/habibi/.venv/bin/python', '/tmp/iqe/pitch-stats.py', ...inBox])) as Record<string, { median_hz: number | null; range_semitones?: number; breaks?: number }>;
  for (const [i, it] of items.entries()) {
    const lang = it.language.toUpperCase() as 'AR' | 'EN';
    const file = files[i];
    const q = await transcribeQwen(file);
    const heard = isQaUnavailable(q) ? undefined : q.text;
    const m = heard !== undefined ? heardMetrics(it.text, heard, lang) : undefined;
    const emb = (await embedVoice(file)).embedding;
    const ref = embRef[lang === 'AR' ? 'ar' : 'en'];
    let phonology: unknown;
    if (lang === 'AR' && dialectWords(it.text).length) {
      try { const ph = await dialectPhonemes(file, it.text); phonology = isQaUnavailable(ph) ? { verdict: 'NOT_MEASURED' } : (() => { const j = judgeLine(ph.words); return { verdict: j.verdict, flags: j.words.filter((w) => w.verdict !== 'PASS').map((w) => `${w.text}: ${w.detail}`) }; })(); } catch (e) { phonology = { verdict: 'NOT_MEASURED', why: (e as Error).message.slice(0, 120) }; }
    }
    rows.push({ id: it.id, language: lang, text: it.text, heard, cer: r3(m?.cer), coverage: r3(m?.coverage), similarity: ref ? r3(cosine(ref, emb)) : undefined, pitch: pitch[inBox[i]], phonology, durationSeconds: it.seconds, rtf: it.rtf });
  }
  const out = { dir, checkpoint: meta.checkpoint, reference: { ar: refAr, en: refEn }, scoredAt: new Date().toISOString(), rows };
  await fs.writeFile(path.join(dir, 'scores.json'), JSON.stringify(out, null, 2), 'utf8');
  for (const r of rows) console.log(`${String(r.id).padEnd(10)} ${r.language} cer=${r.cer ?? '-'} cov=${r.coverage ?? '-'} sim=${r.similarity ?? '-'} pitch=${(r.pitch as { median_hz?: number } | undefined)?.median_hz ?? '-'} ph=${(r.phonology as { verdict?: string } | undefined)?.verdict ?? '-'} | ${r.heard ?? '(not heard)'}`);
  const ar = rows.filter((r) => r.language === 'AR'), en = rows.filter((r) => r.language === 'EN');
  const mean = (xs: Array<number | undefined>) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : undefined; };
  console.log(JSON.stringify({ iraqi: { cer: mean(ar.map((r) => r.cer as number)), similarity: mean(ar.map((r) => r.similarity as number)), phonologyPass: ar.filter((r) => (r.phonology as { verdict?: string } | undefined)?.verdict === 'PASS').length, phonologyJudged: ar.filter((r) => r.phonology).length }, english: { cer: mean(en.map((r) => r.cer as number)), similarity: mean(en.map((r) => r.similarity as number)) } }));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

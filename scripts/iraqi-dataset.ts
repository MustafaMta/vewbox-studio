/* THE VEWBOX IRAQI DATASET PIPELINE (the producer's master directive, 2026-10-10, §7–§10): reproducible preparation of
 * LICENSED Iraqi/Baghdadi speech for the Vewbox-IQ adaptation. Original source files are never modified; every prepared
 * sample keeps its provenance (source, licence, speaker, consent/licence state, original and normalised transcript,
 * phonetic form, duration, sample rate, loudness, quality flags, sha256). Layout under D:\vewbox-data\training\iraqi:
 *   raw/<source>/        the downloaded source exactly as obtained (read-only by convention)
 *   licensed/<source>.json   the licence record (name, URL, terms, attribution, verified date) — a source without one is refused
 *   prepared/<source>/   24 kHz mono WAV per accepted utterance + manifest.jsonl (one record per utterance)
 *   train/ validation/ test/   deterministic split manifests (seeded by utterance hash; speakers kept together per split policy)
 *   phonemes/            phoneme coverage tables
 *   reports/<source>.md  the dataset report (hours, speakers, quality, coverage, rejections)
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts prepare <source> [--limit N]
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts split  [--seed 7] [--validation 0.05] [--test 0.05]
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts report <source>
 *
 * A SOURCE ADAPTER (src/server/training/iraqi-sources.ts) lists a source's utterances (audio path, transcript, speaker);
 * this script measures, filters and writes. Rejections (§8): clipped, wrong sample content (music/no speech), too noisy,
 * multiple speakers (not handled yet), transcript mismatch flags, < 0.6 s or > 20 s, duplicate audio (sha256). */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const TRAINING_ROOT = process.env.VEWBOX_TRAINING_ROOT ?? 'D:\\vewbox-data\\training\\iraqi';
export const DIRS = ['raw', 'licensed', 'prepared', 'train', 'validation', 'test', 'phonemes', 'reports'] as const;

/** One prepared utterance: everything the directive asks a training sample to carry (§8). */
export interface PreparedUtterance {
  id: string;
  source: string; licence: string; attribution: string;
  speaker: string; consent: 'LICENSED_DATASET' | 'CONSENTED_RECORDING' | 'UNKNOWN';
  originalFile: string; originalSha256: string;
  file: string; sha256: string;
  transcript: string; normalised: string; phonetic?: string;
  durationSeconds: number; sampleRate: number; channels: number;
  lufs?: number; truePeakDbtp?: number; clippedSamples?: number; snrDb?: number;
  flags: string[];
  accepted: boolean; rejectedWhy?: string;
}

// maxSeconds: Chatterbox generates at most 40 s (max_new_tokens 1000); the Omnilingual rows run 15–40 s and lost 1,829 of
// 2,096 to a 20 s cap on the first pass (2026-10-10)
export const LIMITS = { minSeconds: 0.6, maxSeconds: 40, maxTruePeakDbtp: -0.1, minLufs: -35, maxLufs: -8, minSnrDb: 15 } as const;

const dir = (d: (typeof DIRS)[number], ...rest: string[]) => path.join(TRAINING_ROOT, d, ...rest);
const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };

async function ensureLayout() { for (const d of DIRS) await fs.mkdir(dir(d), { recursive: true }); }

async function licenceOf(source: string): Promise<{ licence: string; attribution: string }> {
  const f = dir('licensed', `${source}.json`);
  try {
    const j = JSON.parse(await fs.readFile(f, 'utf8')) as { licence?: string; attribution?: string; verifiedAt?: string; trainingAllowed?: boolean };
    if (!j.licence || !j.verifiedAt || j.trainingAllowed !== true) throw new Error('incomplete');
    return { licence: j.licence, attribution: j.attribution ?? '' };
  } catch {
    throw new Error(`no verified licence record for source "${source}" at ${f}: write { licence, attribution, url, verifiedAt, trainingAllowed: true } after reading the licence (publicly playable is not licensed for training)`);
  }
}

async function prepare(source: string) {
  await ensureLayout();
  const { licence, attribution } = await licenceOf(source);
  const { sourceAdapter } = await import('@/server/training/iraqi-sources');
  const { measureUtterance, toTraining } = await import('@/server/training/iraqi-audio');
  const { normaliseIraqi } = await import('@/server/training/iraqi-text-normalise');
  const { pronouncedSpelling } = await import('@/server/providers/iraqi-g2p');
  const adapter = sourceAdapter(source);
  const limit = Number(arg('limit', '0')) || 0;
  const out = dir('prepared', source);
  await fs.mkdir(out, { recursive: true });
  const seen = new Set<string>();
  const records: PreparedUtterance[] = [];
  let n = 0;
  for await (const u of adapter.utterances(dir('raw', source))) {
    if (limit && n >= limit) break;
    n++;
    const originalSha256 = await sha256File(u.audio);
    const id = `${source}-${originalSha256.slice(0, 16)}`;
    const flags: string[] = [...(u.flags ?? [])];
    let rejectedWhy: string | undefined;
    if (seen.has(originalSha256)) rejectedWhy = 'duplicate audio';
    seen.add(originalSha256);
    const m = await measureUtterance(u.audio);
    if (!rejectedWhy && m.durationSeconds < LIMITS.minSeconds) rejectedWhy = `too short (${m.durationSeconds.toFixed(2)} s)`;
    if (!rejectedWhy && m.durationSeconds > LIMITS.maxSeconds) rejectedWhy = `too long (${m.durationSeconds.toFixed(1)} s)`;
    if (!rejectedWhy && (m.clippedSamples ?? 0) > 0) rejectedWhy = `clipped (${m.clippedSamples} samples)`;
    if (!rejectedWhy && m.truePeakDbtp !== undefined && m.truePeakDbtp > LIMITS.maxTruePeakDbtp) rejectedWhy = `true peak ${m.truePeakDbtp.toFixed(2)} dBTP`;
    if (!rejectedWhy && m.lufs !== undefined && (m.lufs < LIMITS.minLufs || m.lufs > LIMITS.maxLufs)) rejectedWhy = `loudness ${m.lufs.toFixed(1)} LUFS`;
    if (!rejectedWhy && m.snrDb !== undefined && m.snrDb < LIMITS.minSnrDb) rejectedWhy = `noisy (SNR ${m.snrDb.toFixed(1)} dB)`;
    if (!rejectedWhy && !m.speech) rejectedWhy = 'no speech found';
    if (m.music) flags.push('music-suspected');
    if (!u.transcript.trim()) rejectedWhy = rejectedWhy ?? 'no transcript';
    // the engine-facing training transcript: normalised, then in PRONOUNCED Iraqi spelling (گ چ پ ڤ where the lexicon
    // knows the word is sounded that way) — one spelling per sound across sources; the original transcript stays on the record
    const spelled = pronouncedSpelling(normaliseIraqi(u.transcript));
    const normalised = spelled.text;
    if (spelled.changes.length) flags.push(`respelled:${spelled.changes.length}`);
    const file = path.join(out, `${id}.wav`);
    let sha256 = '', sampleRate = m.sampleRate, channels = m.channels;
    if (!rejectedWhy) { await toTraining(u.audio, file); sha256 = await sha256File(file); sampleRate = 24000; channels = 1; }
    records.push({ id, source, licence, attribution, speaker: u.speaker, consent: adapter.consent, originalFile: u.audio, originalSha256, file: rejectedWhy ? '' : file, sha256, transcript: u.transcript, normalised, durationSeconds: m.durationSeconds, sampleRate, channels, lufs: m.lufs, truePeakDbtp: m.truePeakDbtp, clippedSamples: m.clippedSamples, snrDb: m.snrDb, flags, accepted: !rejectedWhy, rejectedWhy });
    if (n % 100 === 0) console.log(`${n} utterances, ${records.filter((r) => r.accepted).length} accepted`);
  }
  await fs.writeFile(path.join(out, 'manifest.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  const acc = records.filter((r) => r.accepted);
  console.log(JSON.stringify({ source, utterances: records.length, accepted: acc.length, hours: Number((acc.reduce((s, r) => s + r.durationSeconds, 0) / 3600).toFixed(2)), speakers: new Set(acc.map((r) => r.speaker)).size, rejections: countBy(records.filter((r) => !r.accepted).map((r) => r.rejectedWhy!.replace(/\(.*\)/, '').trim())) }, null, 1));
}

/** Deterministic split by utterance hash (seeded): the same manifest always yields the same split; speakers of a
 *  multi-speaker source are split per utterance (identity is reference-conditioned, not learned per speaker). */
async function split() {
  await ensureLayout();
  const seed = arg('seed', '7')!; const v = Number(arg('validation', '0.05')); const t = Number(arg('test', '0.05'));
  // the IRAQI sources only (--sources a,b to name them); a replay source (…-msa, English) is never part of the Iraqi split
  const all0 = await fs.readdir(dir('prepared')).catch(() => [] as string[]);
  const named = arg('sources');
  const sources = named ? named.split(',') : all0.filter((s) => !/-msa$|-en$|english/i.test(s));
  const all: PreparedUtterance[] = [];
  for (const s of sources) { const f = dir('prepared', s, 'manifest.jsonl'); try { for (const line of (await fs.readFile(f, 'utf8')).split('\n')) if (line.trim()) { const r = JSON.parse(line) as PreparedUtterance; if (r.accepted) all.push(r); } } catch { /* no manifest */ } }
  const bucket = (r: PreparedUtterance) => parseInt(crypto.createHash('sha256').update(`${seed}:${r.sha256}`).digest('hex').slice(0, 8), 16) / 0xffffffff;
  const sets = { train: [] as PreparedUtterance[], validation: [] as PreparedUtterance[], test: [] as PreparedUtterance[] };
  for (const r of all) { const b = bucket(r); (b < t ? sets.test : b < t + v ? sets.validation : sets.train).push(r); }
  for (const [k, rs] of Object.entries(sets)) await fs.writeFile(dir(k as 'train', 'manifest.jsonl'), rs.map((r) => JSON.stringify(r)).join('\n') + (rs.length ? '\n' : ''), 'utf8');
  await fs.writeFile(dir('reports', 'split.json'), JSON.stringify({ seed, validation: v, test: t, at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(sets).map(([k, rs]) => [k, { utterances: rs.length, hours: Number((rs.reduce((s, r) => s + r.durationSeconds, 0) / 3600).toFixed(2)) }])) }, null, 2), 'utf8');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(sets).map(([k, rs]) => [k, rs.length]))));
}

async function report(source: string) {
  const f = dir('prepared', source, 'manifest.jsonl');
  const rs = (await fs.readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as PreparedUtterance);
  const acc = rs.filter((r) => r.accepted);
  const { phonemeCoverage } = await import('@/server/training/iraqi-phonemes');
  const cov = phonemeCoverage(acc.map((r) => r.normalised));
  const hours = (xs: PreparedUtterance[]) => Number((xs.reduce((s, r) => s + r.durationSeconds, 0) / 3600).toFixed(2));
  const drills = acc.filter((r) => r.flags.includes('phoneme-drill'));
  const md = `# Iraqi dataset report — ${source}\n\nGenerated ${new Date().toISOString()}\n\n| | |\n|---|---|\n| Licence | ${acc[0]?.licence ?? '—'} |\n| Attribution | ${acc[0]?.attribution ?? '—'} |\n| Utterances | ${rs.length} (accepted ${acc.length}) |\n| Hours (accepted) | ${hours(acc)} |\n| Natural speech vs phoneme drills (accepted) | ${hours(acc.filter((r) => !r.flags.includes('phoneme-drill')))} h natural · ${hours(drills)} h drills (${drills.length} utterances) |\n| Speakers | ${new Set(acc.map((r) => r.speaker)).size} |\n| Sample rate (source) | ${[...new Set(rs.map((r) => r.sampleRate))].join(', ')} |\n| Duration (s) min / median / max | ${min(acc.map((r) => r.durationSeconds))} / ${median(acc.map((r) => r.durationSeconds))} / ${max(acc.map((r) => r.durationSeconds))} |\n| Loudness (LUFS) median | ${median(acc.map((r) => r.lufs ?? NaN).filter(Number.isFinite))} |\n| SNR (dB) median | ${median(acc.map((r) => r.snrDb ?? NaN).filter(Number.isFinite))} |\n\n## Rejections\n\n${Object.entries(countBy(rs.filter((r) => !r.accepted).map((r) => r.rejectedWhy!.replace(/\(.*\)/, '').trim()))).map(([k, n]) => `- ${k}: ${n}`).join('\n') || '- none'}\n\n## Dialect letters and Iraqi phoneme coverage (accepted transcripts)\n\n| Unit | Utterances | Occurrences |\n|---|---|---|\n${cov.map((c) => `| ${c.unit} | ${c.utterances} | ${c.occurrences} |`).join('\n')}\n\nRare units (< 50 utterances) need deliberately collected natural sentences (§10).\n`;
  await fs.mkdir(dir('reports'), { recursive: true });
  await fs.writeFile(dir('reports', `${source}.md`), md, 'utf8');
  await fs.writeFile(dir('phonemes', `${source}.json`), JSON.stringify(cov, null, 2), 'utf8');
  console.log(md);
}

const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
const min = (xs: number[]) => (xs.length ? Math.min(...xs).toFixed(2) : '—');
const max = (xs: number[]) => (xs.length ? Math.max(...xs).toFixed(2) : '—');
const median = (xs: number[]) => { if (!xs.length) return '—'; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)].toFixed(2); };
async function sha256File(f: string) { const h = crypto.createHash('sha256'); h.update(await fs.readFile(f)); return h.digest('hex'); }

const [cmd, a1] = process.argv.slice(2);
const run = cmd === 'prepare' ? prepare(a1) : cmd === 'split' ? split() : cmd === 'report' ? report(a1) : Promise.reject(new Error('usage: iraqi-dataset.ts prepare <source> | split | report <source>'));
run.then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });

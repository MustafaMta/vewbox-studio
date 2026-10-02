#!/usr/bin/env -S pnpm exec tsx
// Iraqi A/B on Habibi IRQ with designed Arabic seeds (docs/evidence/voice-design/iraqi-ab/REPORT.md).
//
//   arm a "msa"   : VoxCPM2 seed speaking an MSA sentence, described as Modern Standard Arabic
//   arm b "iraqi" : VoxCPM2 seed speaking a Baghdadi sentence in Iraqi spelling (چ/گ), described with a Baghdadi accent
//   × 2 voices (female, male) × 2 seeds each (the first two of three candidates whose 24 kHz seed is ≤ 11.5 s)
//   → each seed is the Habibi IRQ reference (reference_text = the seed's own sentence) for the same 4 Iraqi lines.
//
// Every seed and every rendering is measured on the host: duration, EBU R128 loudness, true peak, clipped samples;
// faster-whisper large-v3 (forced ar) transcript; the studio's metrics from speech.ts (normalizeIraqi fold →
// charErrorRate, scriptCoverage, verdict); the space-insensitive view from src/server/media/arabic-align.ts (letter
// coverage / letter error rate and a per-word diff: SPACING vs SUBSTITUTION vs DELETION/INSERTION vs VARIANT); ECAPA
// seed ↔ rendering. A control row uses Habibi's own bundled IRQ benchmark clip as the reference (engineering anchor
// only: a real speaker of unknown consent, never a character voice; its renderings stay in var/, not in the repo).
// None of this measures dialect authenticity: only native Baghdadi listeners can (VOICE-IDENTITY-V2 §5.2).
//
//   pnpm exec tsx scripts/iraqi-ab.ts [--out docs/evidence/voice-design/iraqi-ab] [--work var/iraqi-ab] [--skip-anchor]
//
// GPU: one engine at a time (VoxCPM2, then Habibi, then Whisper), each unloaded afterwards if it was idle before; every
// phase waits for enough free VRAM (nvidia-smi) and gives up after 10 minutes rather than squeeze another job.
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.TTS_DESIGN_URL ??= 'http://127.0.0.1:8022';
process.env.TTS_URL ??= 'http://127.0.0.1:8020';
process.env.TTS_HABIBI_URL ??= 'http://127.0.0.1:8021';
process.env.ASR_URL ??= 'http://127.0.0.1:8030';

const vd = await import('../src/server/providers/voice-design.ts');
const speech = await import('../src/server/providers/speech.ts');
const check = await import('../src/server/media/voice-check.ts');
const align = await import('../src/server/media/arabic-align.ts');
const execFileP = promisify(execFile);

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name: string) => argv.includes(`--${name}`);
const OUT = opt('out', 'docs/evidence/voice-design/iraqi-ab');
const WORK = opt('work', 'var/iraqi-ab');
const HABIBI = process.env.TTS_HABIBI_URL!.replace(/\/$/, '');
const ASR = process.env.ASR_URL!.replace(/\/$/, '');
const WINDOW_S = 11.5;
// --habibi-seed N --reuse: a replication pass with another Habibi seed on the SAME designed seeds (read back from
// results.json); renders go to renders-hN/ and the record to results-hN.json, so the first pass stays untouched
const HABIBI_SEED = Number(opt('habibi-seed', '7'));
const REUSE = flag('reuse');
const SUFFIX = HABIBI_SEED === 7 ? '' : `-h${HABIBI_SEED}`;

const MSA_TEXT = 'أضاءت أنوار الميناء واحدًا تلو الآخر، ولم ينطق أحد بكلمة. هل ستبقى هنا حين تعود العبّارة؟';
const IRAQI_TEXT = 'شلونك؟ اليوم الجو حار هواية، خلي نروح للسوگ باچر الصبح ونشتري خضرة، وبعدين نرجع للبيت.';
const ARMS = [
  { id: 'msa', label: 'a: MSA seed text, MSA description', text: MSA_TEXT, describe: (sex: string, age: number) => `A warm, clear ${sex} voice, about ${age}, speaking formal Modern Standard Arabic at a calm, steady pace` },
  { id: 'iraqi', label: 'b: Baghdadi seed text (Iraqi spelling), Baghdadi-accent description', text: IRAQI_TEXT, describe: (sex: string, age: number) => `A warm, clear ${sex} voice, about ${age}, speaking colloquial Iraqi Arabic with a Baghdadi accent at a relaxed, everyday pace` },
] as const;
const VOICES = [{ id: 'female', sex: 'female', age: 35, seed: 4001 }, { id: 'male', sex: 'male', age: 40, seed: 5001 }] as const;
const LINES = [
  { id: 'L1', text: 'شكو ماكو؟ هسه وصلت من الشغل.', gloss: "What's up? I just got back from work.", targets: ['شكو', 'ماكو', 'هسه'] },
  { id: 'L2', text: 'گلتلك ماكو وقت، لازم نطلع هسه.', gloss: "I told you there's no time, we have to leave now.", targets: ['گلتلك', 'ماكو', 'هسه'] },
  { id: 'L3', text: 'الچاي حار هواية، انطيني شوية مي بارد.', gloss: 'The tea is very hot, give me a little cold water.', targets: ['الچاي', 'هواية', 'انطيني'] },
  { id: 'L4', text: 'باچر الصبح نگعد وياكم بالگهوة.', gloss: 'Tomorrow morning we sit with you at the café.', targets: ['باچر', 'نگعد', 'وياكم', 'بالگهوة'] },
];
const ANCHOR = { container: 'vewbox-tts-habibi-1', path: '/opt/habibi/.venv/lib/python3.11/site-packages/habibi_tts/assets/IRQ.wav', text: 'يعني ااا ما نقدر ناخذ وقت أكثر، ااا لأنه شروط كلش يحتاجلها وقت.' };

const round = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const rel = (f: string) => path.relative(OUT, f).replace(/\\/g, '/');
const health = async (url: string) => { try { return await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })).json() as Record<string, unknown>; } catch (e) { return { error: (e as Error).message }; } };
async function gpu(): Promise<{ usedMb: number; totalMb: number }> {
  const { stdout } = await execFileP('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits']);
  const [used, total] = stdout.trim().split(/\s*,\s*/).map(Number);
  return { usedMb: used, totalMb: total };
}
/** Wait (≤ 10 min) until `needMb` of VRAM is free; the card is shared and another job's memory is never taken. */
async function waitForVram(needMb: number, what: string) {
  for (let k = 0; k < 20; k++) {
    const g = await gpu();
    if (g.totalMb - g.usedMb >= needMb) { console.log(`[gpu] ${what}: ${g.usedMb}/${g.totalMb} MB used, ${g.totalMb - g.usedMb} free`); return g; }
    console.log(`[gpu] ${what}: only ${g.totalMb - g.usedMb} MB free, need ${needMb}; waiting`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error(`${what}: the GPU did not have ${needMb} MB free within 10 minutes`);
}

async function measure(file: string) {
  const facts = await check.audioFacts(file);
  const loud = await check.loudness(file);
  const clip = await check.clipping(file);
  return { durationSeconds: round(facts.durationSeconds, 3), sampleRate: facts.sampleRate, integratedLufs: round(loud.integratedLufs, 1), truePeakDbtp: round(loud.truePeakDbtp, 2), clippedSamples: clip.clippedSamples };
}

function score(intended: string, heard: string) {
  const cer = speech.charErrorRate(intended, heard, 'AR');
  const coverage = speech.scriptCoverage(intended, heard, 'AR');
  const diffs = align.wordDiff(intended, heard);
  return {
    heard,
    studio: { cer: round(cer), coverage: round(coverage), wer: round(speech.wordErrorRate(intended, heard, 'AR')), verdict: speech.verdict({ cer, coverage, context: 'line' }).status },
    spaceInsensitive: { letterCoverage: round(align.letterCoverage(intended, heard)), letterErrorRate: round(align.letterErrorRate(intended, heard)) },
    diffs,
    counts: { spacing: diffs.filter((d) => d.kind === 'SPACING').length, substitution: diffs.filter((d) => d.kind === 'SUBSTITUTION').length, deletion: diffs.filter((d) => d.kind === 'DELETION').length, insertion: diffs.filter((d) => d.kind === 'INSERTION').length, variant: diffs.filter((d) => d.kind === 'VARIANT').length },
  };
}
/** Target words not heard: inside a SUBSTITUTION or DELETION block (a SPACING or VARIANT block counts as heard). */
const missedTargets = (targets: string[], diffs: Array<{ kind: string; ref: string[] }>) => targets.filter((t) => diffs.some((d) => (d.kind === 'SUBSTITUTION' || d.kind === 'DELETION') && d.ref.includes(t)));

async function main() {
  await fsp.mkdir(path.join(OUT, 'seeds'), { recursive: true });
  await fsp.mkdir(path.join(OUT, `renders${SUFFIX}`), { recursive: true });
  await fsp.mkdir(path.join(WORK, 'candidates'), { recursive: true });
  const report: Record<string, unknown> = {
    createdAt: new Date().toISOString(), script: 'scripts/iraqi-ab.ts',
    note: 'Objective measures only (ASR is faster-whisper large-v3, not an Iraqi-tuned model). Dialect authenticity, accent and naturalness are NOT measured: native Baghdadi listeners decide those (VOICE-IDENTITY-V2 §5.2).',
    design: { engine: 'tts-design VoxCPM2', loudnessTarget: -20, candidatesPerDesign: 3, rule: `first two candidates whose 24 kHz seed is ≤ ${WINDOW_S} s` },
    habibi: { seed: HABIBI_SEED, params: 'service defaults (nfe 32, cfg 2.0, sway -1, speed 1.0, dialect_id None)', referenceText: 'the seed\'s own sentence as written' },
    lines: LINES,
  };

  // ------------------------------------------------------------------------------------------------ 1. design (VoxCPM2)
  type Seed = { arm: string; voice: string; candidate: number; seed: number; text: string; description: string; file: string; work48k: string; sha256: string; host: Awaited<ReturnType<typeof measure>>; designId: string; engineVersion: string };
  const seeds: Seed[] = [];
  const rejected: Array<Record<string, unknown>> = [];
  if (REUSE) {
    const prev = JSON.parse(await fsp.readFile(path.join(OUT, 'results.json'), 'utf8')) as { seeds: Array<Omit<Seed, 'work48k'>> };
    for (const s of prev.seeds) seeds.push({ ...s, file: path.join(OUT, s.file), work48k: '' });
    report.reusedSeedsFrom = 'results.json';
  }
  const g0 = REUSE ? await gpu() : await waitForVram(8000, 'design');
  for (const arm of REUSE ? [] : ARMS) {
    for (const v of VOICES) {
      const picked: Seed[] = [];
      for (let attempt = 0; attempt < 3 && picked.length < 2; attempt++) {
        const base = v.seed + attempt * 3;
        const description = arm.describe(v.sex, v.age);
        const r = await vd.designVoice({ description, text: arm.text, language: 'AR', seed: base, n: 3, designId: `irqab-${arm.id}-${v.id}-r${attempt}`, loudnessTarget: -20 }, path.join(WORK, 'candidates'));
        for (const c of r.candidates) {
          const dur = c.reference.durationSeconds;
          if (picked.length >= 2 || dur > WINDOW_S) { rejected.push({ arm: arm.id, voice: v.id, seed: c.seed, durationSeconds: dur, why: dur > WINDOW_S ? `longer than ${WINDOW_S} s` : 'two seeds already picked' }); continue; }
          const k = picked.length + 1;
          const dest = path.join(OUT, 'seeds', `${arm.id}-${v.id}-c${k}-s${c.seed}-24k.wav`);
          await fsp.copyFile(c.reference.file!, dest);
          picked.push({ arm: arm.id, voice: v.id, candidate: k, seed: c.seed, text: arm.text, description: r.description, file: dest, work48k: c.native.file!, sha256: c.reference.sha256, host: await measure(dest), designId: r.designId, engineVersion: r.engineVersion });
        }
      }
      if (picked.length < 2) throw new Error(`${arm.id}/${v.id}: fewer than two seeds ≤ ${WINDOW_S} s after three rounds`);
      seeds.push(...picked);
      console.log(`${arm.id}/${v.id}: seeds ${picked.map((s) => `${s.seed} (${s.host.durationSeconds}s)`).join(', ')}`);
    }
  }
  if (!REUSE) {
    const dh = await vd.designHealth(10_000);
    await vd.unloadDesign();
    report.designVram = { deviceBeforeMb: g0.usedMb, torchPeakReservedMb: dh.torch?.peak_reserved_mb ?? null, deviceAfterUnloadMb: (await gpu()).usedMb };
    report.rejectedCandidates = rejected;
  }

  // ------------------------------------------------------------------------------------------------ 2. Habibi IRQ
  const g1 = await waitForVram(4000, 'habibi');
  const habibiBefore = await health(HABIBI);
  type Render = { seed: Seed | null; line: typeof LINES[number]; file: string; ms: number; engineVersion: string; host: Awaited<ReturnType<typeof measure>>; anchor?: boolean };
  const renders: Render[] = [];
  const speak = async (ref: string, refText: string, line: typeof LINES[number], dest: string) => {
    const syn = await speech.synthesize({ text: line.text, language: 'AR', dialect: 'IRAQI_BAGHDADI', referenceWav: ref, referenceText: refText, seed: HABIBI_SEED, engine: 'habibi' }, path.dirname(dest));
    await fsp.rename(syn.file, dest);
    return syn;
  };
  for (const s of seeds) {
    for (const line of LINES) {
      const dest = path.join(OUT, `renders${SUFFIX}`, `${s.arm}-${s.voice}-c${s.candidate}-${line.id}.wav`);
      const syn = await speak(s.file, s.text, line, dest);
      renders.push({ seed: s, line, file: dest, ms: syn.ms, engineVersion: syn.engineVersion, host: await measure(dest) });
    }
    console.log(`habibi: ${s.arm}/${s.voice}/c${s.candidate} done`);
  }
  let anchorRef: string | null = null;
  if (!flag('skip-anchor')) {
    await fsp.mkdir(path.join(WORK, 'anchor'), { recursive: true });
    anchorRef = path.join(WORK, 'anchor', 'IRQ.wav');
    await execFileP('docker', ['cp', `${ANCHOR.container}:${ANCHOR.path}`, anchorRef]);
    for (const line of LINES) {
      const dest = path.join(WORK, 'anchor', `anchor-${line.id}${SUFFIX}.wav`);
      const syn = await speak(anchorRef, ANCHOR.text, line, dest);
      renders.push({ seed: null, line, file: dest, ms: syn.ms, engineVersion: syn.engineVersion, host: await measure(dest), anchor: true });
    }
    console.log('habibi: anchor done');
  }
  const habibiLoaded = await health(HABIBI);
  if (habibiBefore.loaded === false) { try { await fetch(`${HABIBI}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* reported */ } }
  report.habibiRun = { deviceBeforeMb: g1.usedMb, loadedBefore: habibiBefore.loaded ?? null, deviceWhileLoadedMb: (habibiLoaded.gpu as { used_mb?: number } | null)?.used_mb ?? null, loadedAtEnd: (await health(HABIBI)).loaded ?? null };

  // ------------------------------------------------------------------------------------------------ 3. ECAPA (CPU)
  const ecapa = new Map<string, number>();
  for (const r of renders) ecapa.set(r.file, (await vd.voiceSimilarity(r.anchor ? anchorRef! : r.seed!.file, r.file)).cosine);

  // ------------------------------------------------------------------------------------------------ 4. ASR (Whisper)
  await waitForVram(5000, 'asr');
  const asrBefore = await health(ASR);
  const heard = new Map<string, { text: string; languageProbability: number; model: string }>();
  for (const f of [...seeds.map((s) => s.file), ...renders.map((r) => r.file)]) {
    const t = await speech.transcribe(f, { language: 'ar' });
    heard.set(f, { text: t.text.trim(), languageProbability: t.languageProbability, model: t.model });
  }
  if (anchorRef) { const t = await speech.transcribe(anchorRef, { language: 'ar' }); heard.set(anchorRef, { text: t.text.trim(), languageProbability: t.languageProbability, model: t.model }); }
  if (asrBefore.loaded === false) { try { await fetch(`${ASR}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* reported */ } }
  report.asr = { model: [...heard.values()][0]?.model, language: 'ar (forced)', loadedBefore: asrBefore.loaded ?? null, loadedAtEnd: (await health(ASR)).loaded ?? null };

  // ------------------------------------------------------------------------------------------------ results
  report.seeds = seeds.map((s) => ({ arm: s.arm, voice: s.voice, candidate: s.candidate, seed: s.seed, description: s.description, text: s.text, file: rel(s.file), sha256: s.sha256, designId: s.designId, engineVersion: s.engineVersion, host: s.host, asr: score(s.text, heard.get(s.file)!.text) }));
  const rows = renders.map((r) => {
    const sc = score(r.line.text, heard.get(r.file)!.text);
    return {
      arm: r.anchor ? 'anchor' : r.seed!.arm, voice: r.anchor ? 'IRQ.wav' : r.seed!.voice, candidate: r.anchor ? 0 : r.seed!.candidate, line: r.line.id, intended: r.line.text,
      file: r.anchor ? `${WORK}/anchor/${path.basename(r.file)} (not committed)` : rel(r.file), habibiMs: r.ms, host: r.host, ecapaSeedToRendering: ecapa.get(r.file) ?? null,
      ...sc, missedTargets: missedTargets(r.line.targets, sc.diffs), targets: r.line.targets,
    };
  });
  report.renders = rows;
  if (anchorRef) report.anchor = { what: 'Habibi\'s bundled IRQ benchmark prompt (habibi_tts/assets/IRQ.wav, 5.5 s, a real speaker from the Habibi benchmark, consent unknown) used only as an engineering upper reference. Never a character voice; its renderings are not committed.', referenceText: ANCHOR.text, asrOfReference: score(ANCHOR.text, heard.get(anchorRef)!.text) };

  const mean = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x !== null); return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  const summarize = (sel: typeof rows) => ({
    n: sel.length,
    cer: mean(sel.map((r) => r.studio.cer)), coverage: mean(sel.map((r) => r.studio.coverage)),
    letterCoverage: mean(sel.map((r) => r.spaceInsensitive.letterCoverage)), letterErrorRate: mean(sel.map((r) => r.spaceInsensitive.letterErrorRate)),
    pass: sel.filter((r) => r.studio.verdict === 'PASS').length, review: sel.filter((r) => r.studio.verdict === 'REVIEW').length, fail: sel.filter((r) => r.studio.verdict === 'FAIL').length,
    targetsHeard: sel.reduce((s, r) => s + r.targets.length - r.missedTargets.length, 0), targets: sel.reduce((s, r) => s + r.targets.length, 0),
    substitutions: sel.reduce((s, r) => s + r.counts.substitution + r.counts.deletion, 0), spacing: sel.reduce((s, r) => s + r.counts.spacing, 0),
    ecapa: mean(sel.map((r) => r.ecapaSeedToRendering)),
  });
  const groups: Record<string, unknown> = {};
  for (const arm of [...ARMS.map((a) => a.id), 'anchor']) {
    groups[arm] = summarize(rows.filter((r) => r.arm === arm));
    for (const v of VOICES) { const sel = rows.filter((r) => r.arm === arm && r.voice === v.id); if (sel.length) groups[`${arm}/${v.id}`] = summarize(sel); }
  }
  for (const line of LINES) for (const arm of ARMS) groups[`${arm.id}/${line.id}`] = summarize(rows.filter((r) => r.arm === arm.id && r.line === line.id));
  report.summary = groups;
  await fsp.writeFile(path.join(OUT, `results${SUFFIX}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(groups, null, 1));
  console.log(`wrote ${path.join(OUT, `results${SUFFIX}.json`)}`);
}

main().catch(async (e) => { console.error(e); await vd.unloadDesign(); process.exit(1); });

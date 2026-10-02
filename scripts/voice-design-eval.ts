#!/usr/bin/env -S pnpm exec tsx
// Voice-design evaluation (docs/research/VOICE-IDENTITY-V2.md §3.3, §5.1): designs 3 candidates for each description
// through the studio's own client (src/server/providers/voice-design.ts), measures EVERY generated file again on the
// host with the studio's measurement helpers (duration, EBU R128 loudness, true peak, clipped samples) and reads every
// file back with the ASR service (transcript, CER, coverage, WER — intelligibility only), compares speakers with ECAPA
// (between seeds of one description, between the two English voices), then two clone hops:
//   1. design → IndexTTS: one English seed is the IndexTTS reference; ECAPA(seed, rendering) is reported;
//   2. experiment, design → Habibi IRQ: one designed Arabic (MSA) seed is the Habibi reference for a short Iraqi line
//      written with Iraqi spelling (چ/گ); transcript, CER and ECAPA are reported. Whether it sounds Iraqi is NOT known
//      from this: dialect authenticity needs native Baghdadi listeners (§5.2).
// Writes the WAVs and report.json to --out, with the list of files a listener should hear.
// Naturalness, accent and dialect are NOT measured here: those are a listener's call (§5.2).
//
//   pnpm exec tsx scripts/voice-design-eval.ts [--out docs/evidence/voice-design] [--skip-clone] [--skip-habibi] [--skip-asr]
//
// Services (host ports): TTS_DESIGN_URL (default http://127.0.0.1:8022), TTS_URL (:8020), TTS_HABIBI_URL (:8021),
// ASR_URL (:8030). GPU: VoxCPM2 is unloaded before a line engine loads; a line engine is unloaded afterwards when it
// was not loaded before.
import fsp from 'node:fs/promises';
import path from 'node:path';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused'; // the env schema wants one; nothing here touches the DB
process.env.TTS_DESIGN_URL ??= 'http://127.0.0.1:8022';
process.env.TTS_URL ??= 'http://127.0.0.1:8020';
process.env.TTS_HABIBI_URL ??= 'http://127.0.0.1:8021';
process.env.ASR_URL ??= 'http://127.0.0.1:8030';

const vd = await import('../src/server/providers/voice-design.ts');
const speech = await import('../src/server/providers/speech.ts');
const check = await import('../src/server/media/voice-check.ts');

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name: string) => argv.includes(`--${name}`);
const OUT = opt('out', 'docs/evidence/voice-design');
const TTS = process.env.TTS_URL!.replace(/\/$/, '');
const HABIBI = process.env.TTS_HABIBI_URL!.replace(/\/$/, '');

const EN_TEXT = 'The harbour lights came on one by one as the evening ferry pulled away from the quay. Nobody said a word. Will you still be here when it comes back?';
const AR_TEXT = 'أضاءت أنوار الميناء واحدًا تلو الآخر بينما كانت العبّارة المسائية تبتعد عن الرصيف. لم ينطق أحد بكلمة. هل ستبقى هنا حين تعود؟';
const DESIGNS = [
  { id: 'en-male-50', language: 'EN' as const, seed: 1001, description: 'A warm, low male voice, about 50, calm and measured', text: EN_TEXT },
  { id: 'en-female-25', language: 'EN' as const, seed: 2001, description: 'A bright, quick young woman, about 25, friendly', text: EN_TEXT },
  { id: 'ar-msa-female-35', language: 'AR' as const, seed: 3001, description: 'A clear, calm female voice, about 35, speaking formal Modern Standard Arabic at a steady news-reader pace', text: AR_TEXT },
];
const CLONE_TEXT = 'I told you the ferry would be late again, so we wait by the lights until it comes.';
// Iraqi (Baghdadi) spelling with چ and گ: "Tomorrow morning we go to the market together; I told you, don't be late."
const IRAQI_TEXT = 'باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.';

const round = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const health = async (url: string) => { try { return await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })).json() as Record<string, unknown>; } catch (e) { return { error: (e as Error).message }; } };
const gpuUsed = (h: Record<string, unknown>) => ((h.gpu as { used_mb?: number } | null)?.used_mb ?? null);

async function measure(file: string) {
  const facts = await check.audioFacts(file);
  const loud = await check.loudness(file);
  const clip = await check.clipping(file);
  return { durationSeconds: round(facts.durationSeconds, 3), sampleRate: facts.sampleRate, channels: facts.channels, integratedLufs: round(loud.integratedLufs, 1), truePeakDbtp: round(loud.truePeakDbtp, 2), clippedSamples: clip.clippedSamples, flatFactor: round(clip.flatFactor, 2), peakDbfs: round(clip.peakDbfs, 2) };
}

async function intelligibility(file: string, text: string, language: 'EN' | 'AR') {
  const t = await speech.transcribe(file, { language: language === 'AR' ? 'ar' : 'en' });
  return { asrModel: t.model, transcript: t.text.trim(), languageProbability: round(t.languageProbability, 3), cer: round(speech.charErrorRate(text, t.text, language), 3), coverage: round(speech.scriptCoverage(text, t.text, language), 3), wer: round(speech.wordErrorRate(text, t.text, language), 3) };
}

const pairs = (m: number[][]) => { const out: number[] = []; for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) out.push(m[i][j]); return out; };
const stats = (xs: number[]) => (xs.length ? { min: round(Math.min(...xs), 4), mean: round(xs.reduce((s, x) => s + x, 0) / xs.length, 4), max: round(Math.max(...xs), 4) } : null);

async function main() {
  await fsp.mkdir(OUT, { recursive: true });
  const report: Record<string, unknown> = { createdAt: new Date().toISOString(), script: 'scripts/voice-design-eval.ts', note: 'Objective measures only. Naturalness, accent and dialect quality are not claimed: they need listeners (VOICE-IDENTITY-V2 §5.2). ECAPA is VoxCeleb-trained: relative similarity, not identity proof.' };
  const h0 = await vd.designHealth(10_000);
  report.healthBefore = { design: h0, tts: await health(TTS), asr: await health(process.env.ASR_URL!.replace(/\/$/, '')) };
  console.log(`design service: ${h0.engine_version}; weights ${h0.weights_present}/${h0.ecapa_weights_present}; GPU ${h0.gpu?.used_mb}/${h0.gpu?.total_mb} MB`);
  if (!h0.weights_present || !h0.ecapa_weights_present) throw new Error('the design service has no weights yet');

  // One GPU engine at a time (VRAM): VoxCPM2 designs everything, then unloads; IndexTTS and Habibi each load, speak
  // once and unload; the ASR pass over EVERY file runs last. ECAPA runs on the CPU throughout.
  const asrJobs: Array<{ into: Record<string, unknown>; label: string; file: string; text: string; language: 'EN' | 'AR' }> = [];
  const queueAsr = (into: Record<string, unknown>, label: string, file: string, text: string, language: 'EN' | 'AR') => { if (!flag('skip-asr')) asrJobs.push({ into, label, file, text, language }); return into; };

  const designs: Array<Record<string, unknown>> = [];
  const embeddings: Record<string, number[][]> = {};
  let peakReservedMb = 0; let gpuUsedPeak = 0;
  for (const d of DESIGNS) {
    const dir = path.join(OUT, d.id);
    const t0 = Date.now();
    // matched loudness for comparison and for the clone reference (§2.7 #3): a static gain to −20 LUFS before the
    // limiter; the gain applied is recorded, so the engine's own level is −20 − staticGainDb
    const r = await vd.designVoice({ description: d.description, text: d.text, language: d.language, seed: d.seed, n: 3, designId: `eval-${d.id}`, loudnessTarget: -20 }, dir);
    const hAfter = await vd.designHealth(10_000);
    peakReservedMb = Math.max(peakReservedMb, hAfter.torch?.peak_reserved_mb ?? 0);
    gpuUsedPeak = Math.max(gpuUsedPeak, hAfter.gpu?.used_mb ?? 0);
    console.log(`${d.id}: ${r.candidates.length} candidates in ${Date.now() - t0} ms (service ${r.ms} ms); torch peak reserved ${hAfter.torch?.peak_reserved_mb} MB; device ${hAfter.gpu?.used_mb} MB`);
    const cands = [];
    for (const c of r.candidates) {
      const native = await measure(c.native.file!);
      const reference = await measure(c.reference.file!);
      const nativeEntry = queueAsr({ file: path.relative(OUT, c.native.file!).replace(/\\/g, '/'), sha256: c.native.sha256, service: { lufs: c.native.lufs, truePeakDbtp: c.native.truePeakDbtp, ebur128TruePeakDbtp: c.native.ebur128TruePeakDbtp, inputTruePeakDbtp: c.native.inputTruePeakDbtp, gainReductionDb: c.native.gainReductionDb, trimDb: c.native.trimDb, clippedSamples: c.native.clippedSamples }, host: native }, `${d.id} c${c.index} 48k`, c.native.file!, d.text, d.language);
      const referenceEntry = queueAsr({ file: path.relative(OUT, c.reference.file!).replace(/\\/g, '/'), sha256: c.reference.sha256, service: { lufs: c.reference.lufs, truePeakDbtp: c.reference.truePeakDbtp, ebur128TruePeakDbtp: c.reference.ebur128TruePeakDbtp, trimDb: c.reference.trimDb, clippedSamples: c.reference.clippedSamples }, host: reference }, `${d.id} c${c.index} 24k`, c.reference.file!, d.text, d.language);
      cands.push({ index: c.index, seed: c.seed, generationMs: c.generationMs, staticGainDb: c.staticGainDb ?? null, engineLevelLufs: c.staticGainDb === undefined ? null : round(-20 - c.staticGainDb, 1), native: nativeEntry, reference: referenceEntry });
      console.log(`  c${c.index} seed ${c.seed}: ${native.durationSeconds}s in ${c.generationMs} ms, engine level ${c.staticGainDb === undefined ? '?' : round(-20 - c.staticGainDb, 1)} LUFS -> ${native.integratedLufs} LUFS, TP ${native.truePeakDbtp} dBTP, clipped ${native.clippedSamples}; 24k ${reference.integratedLufs} LUFS, TP ${reference.truePeakDbtp}, clipped ${reference.clippedSamples}`);
    }
    embeddings[d.id] = r.candidates.map((c) => c.embedding ?? []);
    designs.push({ id: d.id, designId: r.designId, description: r.description, text: r.text, language: r.language, engineVersion: r.engineVersion, seeds: r.seeds, params: r.params, serviceMs: r.ms, label: r.label, candidates: cands, ecapaBetweenSeeds: { matrix: r.similarity, ...stats(pairs(r.similarity ?? [])) } });
  }
  report.designs = designs;

  // between the two English voices: every male candidate against every female candidate (embeddings from the service)
  const m = embeddings['en-male-50'], f = embeddings['en-female-25'], a = embeddings['ar-msa-female-35'];
  const cross = (x: number[][], y: number[][]) => x.map((u) => y.map((v) => round(vd.cosine(u, v), 4)!));
  const enCross = cross(m, f);
  report.ecapaBetweenEnglishVoices = { rows: 'en-male-50 c1..c3', cols: 'en-female-25 c1..c3', matrix: enCross, ...stats(enCross.flat()) };
  report.ecapaArabicVsEnglishFemale = { matrix: cross(a, f), ...stats(cross(a, f).flat()) };
  // the two HTTP endpoints, checked against the embeddings the design call returned
  type Cand = { index: number; reference: { file: string; sha256: string; host: { durationSeconds: number | null } } };
  const d0 = designs[0].candidates as Cand[];
  const d1 = designs[1].candidates as Cand[];
  const p = (rel: string) => path.join(OUT, rel);
  // A seed is a usable clone reference only if the line engine hears all of it: F5/Habibi clips a reference over 12 s
  // (and then the reference text no longer matches the audio), IndexTTS caps at 15 s. Rule fixed before listening:
  // the first candidate whose 24 kHz seed is ≤ 11.5 s. (Run 1 used candidate 1 regardless and Habibi clipped a 12.16 s
  // seed: the last word of the reference text leaked into the line — kept in run1-habibi-ref-over-12s/.)
  const WINDOW_S = 11.5;
  const firstFitting = (cs: Cand[]) => cs.find((c) => (c.reference.host.durationSeconds ?? 99) <= WINDOW_S) ?? null;
  const viaSimilarity = await vd.voiceSimilarity(p(d0[0].reference.file), p(d0[1].reference.file));
  const viaEmbed = await vd.embedVoice(p(d1[0].reference.file));
  report.endpointCheck = {
    similarityEndpoint: { pair: 'en-male-50 c1 vs c2', cosine: viaSimilarity.cosine, fromDesignEmbeddings: round(vd.cosine(m[0], m[1]), 4) },
    embedEndpoint: { file: d1[0].reference.file, dim: viaEmbed.embedding.length, cosineToDesignEmbedding: round(vd.cosine(viaEmbed.embedding, f[0]), 6), version: viaEmbed.version },
  };

  const hLoaded = await vd.designHealth(10_000);
  await vd.unloadDesign();
  const hUnloaded = await vd.designHealth(10_000);
  report.vram = {
    deviceUsedBeforeLoadMb: gpuUsed(h0 as unknown as Record<string, unknown>), deviceUsedPeakObservedMb: gpuUsedPeak, deviceUsedAfterUnloadMb: hUnloaded.gpu?.used_mb ?? null,
    torchPeakReservedMb: peakReservedMb, torchWhileLoaded: hLoaded.torch, torchAfterUnload: hUnloaded.torch,
    note: 'device figures include every other service on the card; torch figures are the design process alone',
  };
  console.log(`VRAM: torch peak reserved ${peakReservedMb} MB; device ${gpuUsed(h0 as unknown as Record<string, unknown>)} -> ${gpuUsedPeak} -> ${hUnloaded.gpu?.used_mb} MB after unload`);

  // design → clone hop: one English seed (en-male-50, the first candidate that fits the window) as the IndexTTS reference
  const enSeed = firstFitting(d0);
  if (!flag('skip-clone') && !enSeed) report.cloneHop = { error: `no en-male-50 candidate is ≤ ${WINDOW_S} s` };
  if (!flag('skip-clone') && enSeed) {
    const seedRel = enSeed.reference.file;
    const seedFile = p(seedRel);
    const ttsBefore = await health(TTS);
    const cloneDir = path.join(OUT, 'clone-hop');
    await fsp.mkdir(cloneDir, { recursive: true });
    const syn = await speech.synthesize({ text: CLONE_TEXT, language: 'EN', referenceWav: seedFile, seed: 7, engine: 'indextts' }, cloneDir).catch(async (e) => {
      // e.g. CUDA out of memory when another service holds the card: record it and stop here rather than guess
      report.cloneHop = { error: (e as Error).message, seed: { file: seedRel } };
      await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      throw e;
    });
    const rendering = path.join(cloneDir, `indextts-from-en-male-50-c${enSeed.index}-seed7.wav`);
    await fsp.rename(syn.file, rendering);
    const ttsLoaded = await health(TTS);
    if (ttsBefore.loaded === false) { try { await fetch(`${TTS}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* reported below */ } }
    const ttsAfter = await health(TTS);
    const hop = await vd.voiceSimilarity(seedFile, rendering);
    const hopVsOtherSeeds = await Promise.all(d0.filter((c) => c !== enSeed).map(async (c) => ({ candidate: c.index, cosine: (await vd.voiceSimilarity(p(c.reference.file), rendering)).cosine })));
    const hopVsFemale = await Promise.all(d1.map(async (c) => ({ candidate: c.index, cosine: (await vd.voiceSimilarity(p(c.reference.file), rendering)).cosine })));
    report.cloneHop = {
      seed: { file: seedRel, candidate: enSeed.index, sha256: enSeed.reference.sha256, durationSeconds: enSeed.reference.host.durationSeconds, rule: `first candidate with a 24 kHz seed ≤ ${WINDOW_S} s` },
      lineEngine: { url: '/synthesize (tts :8020)', engine: syn.engine, model: syn.model, engineVersion: syn.engineVersion, seed: syn.seed, params: syn.params, ms: syn.ms, text: CLONE_TEXT },
      rendering: queueAsr({ file: path.relative(OUT, rendering).replace(/\\/g, '/'), host: await measure(rendering), serviceTruePeakDbtp: syn.truePeakDbtp }, 'clone-hop indextts', rendering, CLONE_TEXT, 'EN'),
      ecapaSeedToRendering: hop.cosine,
      context: { ecapaRenderingToOtherMaleSeeds: hopVsOtherSeeds, ecapaRenderingToFemaleSeeds: hopVsFemale, provisionalGate: 'ECAPA(seed, line-engine rendering) >= 0.75 (VOICE-IDENTITY-V2 §3.3)' },
      tts: { loadedBefore: ttsBefore.loaded ?? null, loadedAfterRequest: ttsLoaded.loaded ?? null, loadedAtEnd: ttsAfter.loaded ?? null, gpuUsedWhileLoadedMb: gpuUsed(ttsLoaded), gpuUsedAtEndMb: gpuUsed(ttsAfter) },
    };
    console.log(`clone hop: ECAPA(seed c${enSeed.index}, IndexTTS) = ${hop.cosine}; vs other male seeds ${JSON.stringify(hopVsOtherSeeds)}; vs female seeds ${JSON.stringify(hopVsFemale)}`);
  }

  // EXPERIMENT: a designed MSA seed (ar-msa candidate 1, chosen before listening) as the Habibi IRQ reference for one
  // short Iraqi line. The seed's own text is passed as reference_text so Habibi never runs its own Whisper download.
  const d2 = designs[2].candidates as Cand[];
  const arSeed = firstFitting(d2);
  if (!flag('skip-habibi') && !arSeed) report.habibiExperiment = { error: `no ar-msa candidate is ≤ ${WINDOW_S} s` };
  if (!flag('skip-habibi') && arSeed) {
    const seedRel = arSeed.reference.file;
    const seedFile = p(seedRel);
    const before = await health(HABIBI);
    const dir = path.join(OUT, 'habibi-experiment');
    await fsp.mkdir(dir, { recursive: true });
    let result: Record<string, unknown>;
    try {
      const syn = await speech.synthesize({ text: IRAQI_TEXT, language: 'AR', dialect: 'IRAQI_BAGHDADI', referenceWav: seedFile, referenceText: AR_TEXT, seed: 7, engine: 'habibi' }, dir);
      const rendering = path.join(dir, `habibi-irq-from-ar-msa-female-35-c${arSeed.index}-seed7.wav`);
      await fsp.rename(syn.file, rendering);
      const loaded = await health(HABIBI);
      if (before.loaded === false) { try { await fetch(`${HABIBI}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* reported below */ } }
      const after = await health(HABIBI);
      const ecapa = await vd.voiceSimilarity(seedFile, rendering);
      const vsOtherArSeeds = await Promise.all(d2.filter((c) => c !== arSeed).map(async (c) => ({ candidate: c.index, cosine: (await vd.voiceSimilarity(p(c.reference.file), rendering)).cosine })));
      result = {
        seed: { file: seedRel, candidate: arSeed.index, sha256: arSeed.reference.sha256, durationSeconds: arSeed.reference.host.durationSeconds, rule: `first candidate with a 24 kHz seed ≤ ${WINDOW_S} s`, referenceText: AR_TEXT, note: 'designed MSA voice; Habibi\'s authors advise a reference in the target dialect, so this is the off-label case (VOICE-IDENTITY-V2 §3.2, decision #7)' },
        lineEngine: { url: '/synthesize (tts-habibi :8021)', engine: syn.engine, model: syn.model, engineVersion: syn.engineVersion, seed: syn.seed, params: syn.params, ms: syn.ms, text: IRAQI_TEXT },
        rendering: queueAsr({ file: path.relative(OUT, rendering).replace(/\\/g, '/'), host: await measure(rendering), serviceTruePeakDbtp: syn.truePeakDbtp }, 'habibi experiment', rendering, IRAQI_TEXT, 'AR'),
        ecapaSeedToRendering: ecapa.cosine,
        ecapaRenderingToOtherArSeeds: vsOtherArSeeds,
        habibi: { loadedBefore: before.loaded ?? null, loadedAfterRequest: loaded.loaded ?? null, loadedAtEnd: after.loaded ?? null, gpuUsedWhileLoadedMb: gpuUsed(loaded), gpuUsedAtEndMb: gpuUsed(after) },
        verdict: 'EXPERIMENT — intelligibility and speaker similarity measured; Iraqi dialect authenticity UNVERIFIED (needs ≥ 3 native Baghdadi listeners, §5.2). ASR and CER can never certify dialect (Habibi paper: real Iraqi speech scores a worse WER than synthetic).',
      };
      console.log(`habibi experiment: ECAPA(seed c${arSeed.index}, Habibi) = ${ecapa.cosine}; vs other AR seeds ${JSON.stringify(vsOtherArSeeds)}`);
    } catch (e) {
      result = { error: (e as Error).message, seed: { file: seedRel } };
      console.log(`habibi experiment failed: ${(e as Error).message}`);
    }
    report.habibiExperiment = result;
  }

  // ASR over every generated file (faster-whisper large-v3 at :8030, language forced). CER/coverage use the studio's
  // folds (`normalizeLatin`; for Arabic the lenient Iraqi fold, so MSA is not charged for spelling variants); WER is raw.
  if (asrJobs.length) {
    const ASR = process.env.ASR_URL!.replace(/\/$/, '');
    const asrBefore = await health(ASR);
    for (const j of asrJobs) {
      j.into.asr = await intelligibility(j.file, j.text, j.language).catch((e) => ({ error: (e as Error).message }));
      const a = j.into.asr as { cer?: number; coverage?: number; transcript?: string; error?: string };
      console.log(`  ASR ${j.label}: ${a.error ? `error ${a.error}` : `CER ${a.cer}, coverage ${a.coverage} «${a.transcript}»`}`);
    }
    const asrLoaded = await health(ASR);
    if (asrBefore.loaded === false) { try { await fetch(`${ASR}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* reported below */ } }
    report.asrService = { files: asrJobs.length, loadedBefore: asrBefore.loaded ?? null, gpuUsedWhileLoadedMb: gpuUsed(asrLoaded), loadedAtEnd: (await health(ASR)).loaded ?? null, fold: { EN: 'normalizeLatin', AR: 'normalizeIraqi (lenient: also folds MSA spelling variants)' } };
  }

  // what a person should listen to (the measurements above cannot judge naturalness, accent or dialect)
  const allCands = designs.flatMap((d) => (d.candidates as Array<{ index: number; native: { file: string } }>).map((c) => ({ file: c.native.file, what: `${d.id} candidate ${c.index} (48 kHz original)` })));
  report.listen = {
    note: 'Blind, loudness-matched, headphones (§5.2). Judge: does it match the description (sex, age, pitch, pace, mood)? natural or artificial? for Arabic: Fusha as a news reader speaks it? for the Habibi file: Iraqi or not (native Baghdadi listeners only).',
    files: [
      ...allCands,
      ...(report.cloneHop && (report.cloneHop as { rendering?: { file: string } }).rendering ? [{ file: (report.cloneHop as { rendering: { file: string } }).rendering.file, what: `IndexTTS speaking from ${(report.cloneHop as { seed: { file: string } }).seed.file}: same voice as that seed?` }] : []),
      ...(report.habibiExperiment && (report.habibiExperiment as { rendering?: { file: string } }).rendering ? [{ file: (report.habibiExperiment as { rendering: { file: string } }).rendering.file, what: `Habibi IRQ speaking an Iraqi line from the designed MSA seed ${(report.habibiExperiment as { seed: { file: string } }).seed.file}: Iraqi or MSA-accented (native Baghdadi listeners only)? same voice as the seed?` }] : []),
    ],
    notMeasurable: ['naturalness', 'accent (English, MSA)', 'Iraqi dialect authenticity', 'whether the voice matches the description (age, warmth, brightness)', 'emotional fit'],
  };
  await vd.unloadDesign();
  report.healthAfter = { design: await vd.designHealth(10_000), tts: await health(TTS) };
  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.join(OUT, 'report.json')}`);
}

main().catch(async (e) => { console.error(e); await vd.unloadDesign(); process.exit(1); });

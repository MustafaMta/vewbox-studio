/* PHASE 1 REVIEW EVIDENCE — the machine's supporting evidence for one Phase 1 character (scripts/phase1.ts), written
 * to docs/evidence/phase1/<A|B|C>.json for the review page. Nothing here accepts anything: the producer's ears decide
 * naturalness, dialect and whether the Iraqi voice is the same person as the English one.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/phase1-review.ts A
 *
 * Per line: what Qwen3-ASR heard (from the job), CER / coverage, level, ECAPA(reference, line), pYIN pitch and, for
 * Iraqi, the phoneme gate's flags. Across languages: ECAPA between the English lines and each engine's Iraqi lines
 * (beside English↔English, the same-language baseline) and the median-pitch shift in semitones. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { linesFor } from './phase1';

type Key = 'A' | 'B' | 'C';
const sh = (cmd: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(cmd, args, { maxBuffer: 1e8 }, (e, o, err) => (e ? reject(new Error(`${e.message} ${err}`)) : resolve(String(o)))));
const r3 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? undefined : Math.round(v * 1000) / 1000);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

async function main() {
  const key = process.argv[2] as Key;
  if (!['A', 'B', 'C'].includes(key)) throw new Error('phase1-review.ts <A|B|C>');
  const { db } = await import('@/server/db/client');
  const { readState } = await import('@/server/studio/engine');
  const { assetFile } = await import('@/server/media');
  const { embedVoice, cosine } = await import('@/server/providers/voice-design');
  const { dialectPhonemes, isQaUnavailable } = await import('@/server/providers/qa-service');
  const { judgeLine } = await import('@/server/media/iraqi-phonology');
  const rows = async <T>(q: ReturnType<typeof sql>) => { const r = (await db().execute(q)) as unknown as { rows?: T[] }; return r.rows ?? (r as unknown as T[]); };
  const [created] = await rows<{ id: string; result: { characterId?: string } }>(sql`select id, result from jobs where (idempotency_key = ${`phase1:create:${key}`} or idempotency_key like ${`phase1:create:${key}:%`}) and result->>'characterId' is not null order by created_at desc limit 1`);
  const characterId = created?.result?.characterId;
  if (!characterId) throw new Error(`character ${key} is not created yet`);
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId)!;
  const byId = (id?: string) => state.assets.find((a) => a.id === id);
  const id = c.voice.identity;
  const design = c.voice.designs?.find((d) => d.id === id?.designId);
  const ref = byId(id?.referenceAssetId);
  const lines = linesFor(key);

  // every creative job for this character, and how many times each ran: Phase 1's first-attempt record
  const jobs = await rows<{ id: string; type: string; status: string; attempts: number; idempotency_key: string | null; created_at: string }>(sql`select id, type, status, attempts, idempotency_key, created_at from jobs where payload->>'characterId' = ${characterId} or id = ${created.id} or parent_id = ${created.id} order by created_at`);

  // the lines as spoken: each sample of a phase-1 line, with the job's own check
  const samples = c.voice.samples.filter((s) => s.source === 'GENERATED' && s.assetId);
  const lineOf = (text?: string) => [...lines.english, ...lines.iraqi].find((l) => l.text === text);
  const spoken = samples.map((s) => {
    const a = byId(s.assetId)!;
    const p = (a.provenance ?? {}) as Record<string, unknown>;
    const check = p.check as { status?: string; cer?: number; coverage?: number; heard?: string; heardReference?: string; asr?: string; reasons?: string[] } | null | undefined;
    const measured = p.measured as { lufs?: number; truePeakDbtp?: number; clipped?: number; seedToLineSimilarity?: number } | undefined;
    const line = lineOf(s.text);
    return { sampleId: s.id, assetId: a.id, file: assetFile(a), line: line?.id ?? (s.label.startsWith('Proof') ? 'proof' : 'other'), text: s.text, language: s.language, dialect: s.dialect, engine: s.engine ?? (p.engine as string | undefined), model: p.model as string | undefined, role: s.role ?? 'PRODUCTION', durationSeconds: r3(s.durationSeconds), jobId: s.jobId,
      asr: check ? { model: check.asr, heard: check.heard, cer: r3(check.cer), coverage: r3(check.coverage), status: check.status, reasons: check.reasons } : null,
      level: measured ? { lufs: measured.lufs, truePeakDbtp: measured.truePeakDbtp, clippedSamples: measured.clipped } : undefined, referenceSimilarity: measured?.seedToLineSimilarity } as Record<string, unknown> & { file: string; line: string; language?: string; engine?: string; text?: string };
  });

  // ECAPA of every line (and the reference), once
  const emb = new Map<string, number[]>();
  for (const f of [...spoken.map((s) => s.file), ...(ref ? [assetFile(ref)] : [])]) emb.set(f, (await embedVoice(f)).embedding);
  const en = spoken.filter((s) => s.language === 'EN' && s.line.startsWith('en-'));
  const iq = (engine: string) => spoken.filter((s) => s.language === 'AR' && s.engine === engine && s.line.startsWith('iq-'));
  const pairs = (xs: typeof spoken, ys: typeof spoken, same = false) => { const out: number[] = []; xs.forEach((x, i) => ys.forEach((y, j) => { if (!same || i < j) out.push(cosine(emb.get(x.file)!, emb.get(y.file)!)); })); return out; };

  // pYIN pitch in the tts-habibi container (it has librosa)
  const box = 'vewbox-tts-habibi-1';
  const files = [...spoken.map((s) => s.file), ...(ref ? [assetFile(ref)] : [])];
  await sh('docker', ['exec', box, 'sh', '-c', 'rm -rf /tmp/p1 && mkdir -p /tmp/p1']);
  await sh('docker', ['cp', path.resolve('scripts/pitch-stats.py'), `${box}:/tmp/p1/pitch-stats.py`]);
  const inBox = files.map((_, i) => `/tmp/p1/${i}.wav`);
  for (const [i, f] of files.entries()) await sh('docker', ['cp', f, `${box}:${inBox[i]}`]);
  const pitch = JSON.parse(await sh('docker', ['exec', box, '/opt/habibi/.venv/bin/python', '/tmp/p1/pitch-stats.py', ...inBox])) as Record<string, { median_hz: number | null; p10_hz?: number; p90_hz?: number; range_semitones?: number; breaks?: number }>;
  const pitchOf = (f: string) => pitch[inBox[files.indexOf(f)]];
  for (const s of spoken) s.pitch = pitchOf(s.file);
  const medianOf = (xs: typeof spoken) => { const v = xs.map((s) => pitchOf(s.file)?.median_hz).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : undefined; };
  const semis = (a?: number, b?: number) => (a && b ? r3(12 * Math.log2(b / a)) : undefined);

  // Qwen3-ASR is the primary transcriber: a line its job heard with Whisper alone (character A's proof, before the
  // inspector's permission was fixed) is heard by Qwen3-ASR here — supporting evidence, nothing re-spoken
  const { transcribeQwen } = await import('@/server/providers/qa-service');
  const { heardMetrics } = await import('@/worker/handlers/voice-measure');
  for (const s of spoken) {
    const asr = s.asr as { model?: string } | null;
    if (asr?.model === 'qwen3-asr' || !s.text) continue;
    const q = await transcribeQwen(s.file);
    if (isQaUnavailable(q)) { s.qwenAsr = { unavailable: q.reason }; continue; }
    const m = heardMetrics(s.text, q.text, s.language === 'AR' ? 'AR' : 'EN');
    s.qwenAsr = { heard: q.text, detectedLanguage: q.detectedLanguage, cer: r3(m.cer), coverage: r3(m.coverage), note: 'heard after the job (its own check used Whisper alone)' };
  }

  // the Iraqi phoneme gate (pronunciation flags, supporting only)
  for (const s of spoken.filter((x) => x.language === 'AR' && x.text)) {
    try {
      const ph = await dialectPhonemes(s.file, s.text!);
      if (isQaUnavailable(ph)) s.phonology = { verdict: 'NOT_MEASURED' };
      else { const j = judgeLine(ph.words); s.phonology = { verdict: j.verdict, flags: j.words.filter((w) => w.verdict !== 'PASS').map((w) => `${w.text}: ${w.detail}`) }; }
    } catch (e) { s.phonology = { verdict: 'NOT_MEASURED', why: (e as Error).message.slice(0, 200) }; }
  }

  const enMedian = medianOf(en);
  const crossLanguage = {
    note: 'Supporting evidence only. ECAPA is VoxCeleb-trained and language-sensitive: compare each cross-language number with the English↔English baseline, never with a fixed threshold. Perceived age, gender, vocal weight and "same person" are the listener’s.',
    ecapa: { englishToEnglish: r3(mean(pairs(en, en, true))), englishToIraqiHabibi: r3(mean(pairs(en, iq('habibi')))), englishToIraqiMoss: r3(mean(pairs(en, iq('moss')))), iraqiHabibiToIraqiMoss: r3(mean(pairs(iq('habibi'), iq('moss')))) },
    medianPitchHz: { english: enMedian, iraqiHabibi: medianOf(iq('habibi')), iraqiMoss: medianOf(iq('moss')), reference: ref ? pitchOf(assetFile(ref))?.median_hz ?? undefined : undefined },
    pitchShiftSemitones: { iraqiHabibi: semis(enMedian, medianOf(iq('habibi'))), iraqiMoss: semis(enMedian, medianOf(iq('moss'))) },
  };

  const canonical = c.canonicalImage;
  const out = {
    phase: 'PHASE_1', character: key, generatedAt: new Date().toISOString(), verdict: 'WAITING_FOR_USER_ACCEPTANCE',
    identity: { id: c.id, name: c.name, nameAr: c.nameAr, role: c.role, style: c.style, kind: c.kind, singing: c.singing, languages: c.voice.languages ?? [{ language: c.language, dialect: c.dialect }], sex: c.sex, ageYears: c.ageYears, build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, wardrobe: c.wardrobe, distinguishing: c.distinguishing, personality: c.personality },
    canonicalImage: canonical ? { assetId: canonical.assetId, version: canonical.version, status: canonical.status, engine: canonical.engine, seed: canonical.seed, check: canonical.check, jobId: canonical.jobId, file: assetFile(byId(canonical.assetId)!) } : null,
    voice: id ? { origin: id.origin, label: design?.label, designId: id.designId, description: design?.description, designEngine: design?.engineVersion, designModel: design?.model, designSeed: design?.seed, referenceAssetId: id.referenceAssetId, referenceSha256: id.seedSha256, referenceText: design?.text, englishEngine: id.model, englishCheckpoint: id.engineVersion, params: id.params, revision: id.revision, status: id.status, proof: id.proof, languageProfiles: id.languageProfiles, buildJob: id.jobId } : null,
    creativeAttempts: jobs.map((j) => ({ type: j.type, job: j.id, status: j.status, attempts: j.attempts, key: j.idempotency_key })),
    lines: spoken.map(({ file: _f, ...s }) => s),
    crossLanguage,
  };
  const dir = path.resolve('docs/evidence/phase1');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ character: key, name: c.name, lines: spoken.length, crossLanguage }, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

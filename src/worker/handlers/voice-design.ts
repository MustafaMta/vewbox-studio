import fsp from 'node:fs/promises';
import type { Handler, HandlerContext } from './index';
import { StudioError, missingReference } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Character, VoiceDesignCandidate, VoiceDesignPreview, VoiceDesignRecord } from '@/domain/types';
import type { JobPayloadParsed } from '@/domain/jobs';
import type { CommandSpec } from '@/server/studio/engine';
import type { VoiceDesignMeasurementPatch, VoiceDesignRecordInput } from '@/domain/actions';
import { voiceBuildLockProblem } from '@/domain/rules';
import { CALIBRATION_TEXT, DESIGN_CANDIDATES, DESIGN_LABEL, IRAQI_NEEDS_RECORDING, MSA_ACCENT_PENDING, IRAQI_DIALECT_PENDING, NATURALNESS_PENDING, candidateGate, castNames, cloneEligible, describeVoiceFromProfile, descriptionProblem, isIraqi, previewSentencesFor, rankDesignCandidates, rankingFor } from '@/domain/voice-identity';
import { commands, readState } from '@/server/studio/engine';
import { adoptFile, assetFromStored, removeFile } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { letterCoverage } from '@/server/media/arabic-align';
import { pickEngine, synthesize, transcribe } from '@/server/providers/speech';
import { cosine, designVoice, unloadDesign } from '@/server/providers/voice-design';
import { ASR_VRAM, DESIGN_VRAM, TTS_VRAM, heardMetrics, levelOf, round, speakerEmbedding, speedForPace } from './voice-measure';

/** VOICE DESIGN (docs/CONTRACTS-VOICE-IDENTITY-V2.md §2, Rule V-DESIGN in docs/research/VOICE-IDENTITY-V2.md §2.3) —
 *  a synthetic voice from a text description only, measured before anyone chooses it:
 *    1. the description: the producer's, or written from the profile (no names, no resemblance — refused before any
 *       GPU work);
 *    2. VoxCPM2 designs three candidates speaking the calibration sentence (no audio goes in); every file is stored
 *       (RAW tier, never on a profile) and the design record written BEFORE anything is measured, so a later failure
 *       keeps them — the same seed reproduces the voice, not the bytes;
 *    3. the gates per candidate on its 24 kHz reference: CER (heard back), loudness, true peak, clipped samples,
 *       ≤ 11.5 s;
 *    4. each candidate that may be chosen speaks the preview sentences THROUGH THE LINE ENGINE with itself as the
 *       reference (the clone hop the film will use); each rendering is heard back and its ECAPA cosine to the seed
 *       measured;
 *    5. the ranking: EN/MSA by mean ECAPA(seed, rendering); the Iraqi experiment by the probe lines' letter coverage,
 *       then CER (the Iraqi A/B's recipe). Every number goes on the record.
 *  Used by VOICE_DESIGN (manual: the producer chooses) and by VOICE_BUILD AUTOMATIC (the best passing candidate). */

export interface LineSpeech { speed: number; emotionAlpha: number; seed: number }

const finite = (v: number | null | undefined): number | undefined => (v !== null && v !== undefined && Number.isFinite(v) ? v : undefined);
const mean = (xs: Array<number | undefined>): number | undefined => { const v = xs.filter((x): x is number => x !== undefined); return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : undefined; };

/** Hear a file back in a language: the transcript and the ASR model, or null (with a job event) when the
 *  transcription service is away — an unheard candidate fails its CER gate, it is never passed on trust. */
async function hearDesignFile(ctx: HandlerContext, file: string, language: Character['language'], label: string): Promise<{ text: string; model: string } | null> {
  const input = { file, language: language === 'AR' ? ('ar' as const) : ('en' as const) };
  try {
    const t = await ctx.gpu('ASR', ASR_VRAM, () => ctx.tool('speech.transcribe', () => transcribe(input.file, { language: input.language }), { label, input }), { jobId: ctx.job.id });
    return { text: t.text.trim(), model: t.model };
  } catch (e) {
    await ctx.event('warn', `transcription unavailable (${label}): ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

export interface DesignOptions {
  mode: 'AUTOMATIC' | 'DESIGN';
  /** the producer's description (DESIGN); absent: written from the profile */
  description?: string;
  text?: string; seed?: number; n?: number;
  /** the `allowDesignedIraqi` experiment (the caller checked the setting) */
  experiment: boolean;
  /** the line engine's parameters the previews are spoken with — the ones a build from this design pins */
  speech: LineSpeech;
}

/** Design, store, measure and rank (see the module comment). Returns the record as stored, with its ranking. */
export async function designAndMeasure(ctx: HandlerContext, c: Character, o: DesignOptions): Promise<VoiceDesignRecord> {
  const iraqi = isIraqi(c);
  if (iraqi && !o.experiment) throw missingReference(IRAQI_NEEDS_RECORDING, { characterId: c.id });
  const { state } = await readState();
  const producerText = o.description?.trim();
  const description = producerText || describeVoiceFromProfile(c);
  const problem = descriptionProblem(description, castNames(state));
  if (problem) throw new StudioError('INVALID', `The voice description is refused (Rule V-DESIGN): ${problem}.`, { failureClass: 'INVALID_INPUT', characterId: c.id });
  const lineEngine = pickEngine(c.language, c.dialect);
  const designId = nid('vd');
  const dir = await tmpDir('voice-design');
  const kept: string[] = [];
  try {
    // 1) three candidates from the description alone
    const n = o.n ?? DESIGN_CANDIDATES;
    await ctx.progress('GENERATING', { phase: 'designing', message: `Designing ${n} candidate voice${n > 1 ? 's' : ''} for ${c.name} (VoxCPM2, from a description only)` });
    const input = { description, text: o.text?.trim() || CALIBRATION_TEXT[c.language], language: c.language, n, designId, loudnessTarget: -20, ...(o.seed !== undefined ? { seed: o.seed } : {}) };
    const designed = await ctx.gpu('TTS', DESIGN_VRAM, () => ctx.tool('speech.design_voice', () => designVoice(input, dir), { label: 'voxcpm2', input }), { jobId: ctx.job.id });
    // the design engine leaves the card before the line engine loads (its CPU speaker encoder reloads when asked)
    await unloadDesign();
    await ctx.event('info', 'voice designed', { designId, engineVersion: designed.engineVersion, seeds: designed.seeds, ms: designed.ms, description: designed.description });

    // 2) keep every candidate, then its record — before anything is measured
    const batch: CommandSpec[] = [];
    const files = new Map<number, string>();
    const embeddings = new Map<number, number[]>();
    const candidates: VoiceDesignCandidate[] = [];
    for (const cand of designed.candidates) {
      const refId = nid('gen');
      const ref = await adoptFile(refId, cand.reference.file!, { expectKind: 'AUDIO' });
      kept.push(ref.relPath);
      if (ref.sha256 !== cand.reference.sha256) throw new StudioError('PROVIDER', `Design ${designId} candidate ${cand.index}: the stored file's sha256 is not the one the service reported.`, { designId });
      const natId = nid('gen');
      const nat = cand.native.file ? await adoptFile(natId, cand.native.file, { expectKind: 'AUDIO' }) : undefined;
      if (nat) kept.push(nat.relPath);
      const provenance = { designId, candidate: cand.index, seed: cand.seed, engine: designed.engine, model: designed.model, engineVersion: designed.engineVersion, description: designed.description, text: designed.text, characterId: c.id, label: DESIGN_LABEL, service: { lufs: cand.reference.lufs, truePeakDbtp: cand.reference.truePeakDbtp, clippedSamples: cand.reference.clippedSamples, staticGainDb: cand.staticGainDb } };
      batch.push({ name: 'addAsset', args: [assetFromStored(refId, ref, { label: `${c.name} — designed voice ${cand.index} (24 kHz reference)`, tags: ['voice', 'design', 'candidate'], origin: 'GENERATED', jobId: ctx.job.id, tier: 'RAW', provenance: { ...provenance, role: 'reference', sampleRate: cand.reference.sampleRate } })] });
      if (nat) batch.push({ name: 'addAsset', args: [assetFromStored(natId, nat, { label: `${c.name} — designed voice ${cand.index} (48 kHz original)`, tags: ['voice', 'design', 'original'], origin: 'GENERATED', jobId: ctx.job.id, tier: 'RAW', provenance: { ...provenance, role: 'original', sampleRate: cand.native.sampleRate } })] });
      files.set(cand.index, ref.absPath);
      if (cand.embedding) embeddings.set(cand.index, cand.embedding);
      const measured = { durationSeconds: cand.reference.durationSeconds, ...(finite(cand.reference.lufs) !== undefined ? { lufs: finite(cand.reference.lufs) } : {}), ...(finite(cand.reference.truePeakDbtp) !== undefined ? { truePeakDbtp: finite(cand.reference.truePeakDbtp) } : {}), clippedSamples: cand.reference.clippedSamples };
      candidates.push({ index: cand.index, seed: cand.seed, assetId: refId, sha256: ref.sha256, durationSeconds: cand.reference.durationSeconds, ...(nat ? { nativeAssetId: natId, nativeSha256: nat.sha256 } : {}), measured, gate: { ok: false, reasons: ['not measured yet'] } });
    }
    const record: VoiceDesignRecordInput = {
      id: designId, characterId: c.id, mode: o.mode, engine: designed.engine, model: designed.model, engineVersion: designed.engineVersion,
      description: designed.description, descriptionSource: producerText ? 'PRODUCER' : 'PROFILE', language: c.language, ...(c.dialect ? { dialect: c.dialect } : {}), ...(iraqi ? { experiment: 'DESIGNED_IRAQI' as const } : {}),
      text: designed.text, seed: designed.seed, seeds: designed.seeds, params: designed.params, lineEngine, ...(designed.similarityModel ? { similarityModel: designed.similarityModel } : {}), lineParams: o.speech,
      candidates, ...(designed.similarity ? { similarity: designed.similarity } : {}), jobId: ctx.job.id,
    };
    batch.push({ name: 'addVoiceDesign', args: [c.id, record] });
    await commands(batch, 'worker');
    kept.length = 0; // the files are the records' now

    // 3) the gates on every candidate's reference
    const measuredCands: VoiceDesignCandidate[] = [];
    for (const cand of candidates) {
      await ctx.progress('VALIDATING', { phase: 'designing', message: `Measuring candidate ${cand.index} of ${candidates.length}: heard back, loudness, peak, length` });
      const file = files.get(cand.index)!;
      const heard = await hearDesignFile(ctx, file, c.language, `design candidate ${cand.index}`);
      const level = await levelOf(file);
      const m = heard ? heardMetrics(designed.text, heard.text, c.language) : undefined;
      const measured = {
        durationSeconds: cand.durationSeconds,
        ...(m ? { cer: round(m.cer), coverage: round(m.coverage), heard: heard!.text.slice(0, 4000), asrModel: heard!.model } : {}),
        // the host's measurement stack (voice-check) is the gate; the service's numbers stand in only when it cannot measure
        lufs: level.lufs ?? cand.measured.lufs, truePeakDbtp: level.truePeakDbtp ?? cand.measured.truePeakDbtp, clippedSamples: level.clipped ?? cand.measured.clippedSamples,
      };
      measuredCands.push({ ...cand, measured, gate: candidateGate(measured, c.language) });
    }

    // 4) the candidates that may be chosen, heard THROUGH THE LINE ENGINE
    const sentences = previewSentencesFor(c);
    const previews = new Map<number, Array<VoiceDesignPreview & { file: string }>>();
    const eligible = measuredCands.filter((x) => (o.mode === 'AUTOMATIC' ? x.gate.ok : cloneEligible(x)));
    for (const x of eligible) {
      const list: Array<VoiceDesignPreview & { file: string }> = [];
      let seedEmbedding = embeddings.get(x.index) ?? null;
      if (!seedEmbedding) seedEmbedding = (await speakerEmbedding(ctx, files.get(x.index)!))?.embedding ?? null;
      for (const [k, sentence] of sentences.entries()) {
        await ctx.progress('GENERATING', { phase: 'speaking', message: `Candidate ${x.index}: preview ${k + 1} of ${sentences.length} through ${lineEngine}` });
        const local = { text: sentence, language: c.language, dialect: c.dialect, referenceWav: files.get(x.index)!, referenceText: lineEngine === 'habibi' ? designed.text : undefined, speed: o.speech.speed, emotionAlpha: o.speech.emotionAlpha, seed: o.speech.seed, engine: lineEngine };
        const r = await ctx.gpu('TTS', TTS_VRAM, () => ctx.tool('speech.synthesize', () => synthesize(local, dir), { label: `${lineEngine} preview`, input: local }), { jobId: ctx.job.id });
        const e = seedEmbedding ? await speakerEmbedding(ctx, r.file) : null;
        list.push({ text: sentence, engine: r.engine, file: r.file, durationSeconds: round(r.durationSeconds, 3), ...(seedEmbedding && e ? { cosine: round(cosine(seedEmbedding, e.embedding)) } : {}) });
      }
      previews.set(x.index, list);
    }
    for (const [index, list] of previews) {
      for (const p of list) {
        const heard = await hearDesignFile(ctx, p.file, c.language, `design candidate ${index} preview`);
        if (!heard) continue;
        const m = heardMetrics(p.text, heard.text, c.language);
        Object.assign(p, { cer: round(m.cer), coverage: round(m.coverage), heard: heard.text.slice(0, 4000), ...(c.language === 'AR' ? { letterCoverage: round(letterCoverage(p.text, heard.text)) } : {}) });
      }
    }

    // 5) store the previews, the measurements and the ranking
    const final: VoiceDesignCandidate[] = measuredCands.map((x) => {
      const list = previews.get(x.index);
      if (!list) return x;
      return { ...x, previews: list.map(({ file: _f, ...p }) => p), ...scoresOf(list) };
    });
    const ranked = rankDesignCandidates(final, rankingFor(c));
    const tail: CommandSpec[] = [];
    for (const x of final) {
      const list = previews.get(x.index) ?? [];
      for (const [k, p] of list.entries()) {
        const id = nid('gen');
        const st = await adoptFile(id, p.file, { expectKind: 'AUDIO' });
        kept.push(st.relPath);
        x.previews![k].assetId = id;
        tail.push({ name: 'addAsset', args: [assetFromStored(id, st, { label: `${c.name} — designed voice ${x.index}, preview ${k + 1} (${p.engine})`, tags: ['voice', 'design', 'preview'], origin: 'GENERATED', jobId: ctx.job.id, tier: 'RAW', provenance: { designId, candidate: x.index, text: p.text, engine: p.engine, referenceAssetId: x.assetId, cosine: p.cosine, cer: p.cer, coverage: p.coverage, heard: p.heard } })] });
      }
    }
    const patch: VoiceDesignMeasurementPatch = { candidates: final.map((x) => ({ index: x.index, measured: x.measured, gate: x.gate, ...(x.previews ? { previews: x.previews } : {}), ...(x.similarityMean !== undefined ? { similarityMean: x.similarityMean } : {}), ...(x.letterCoverageMean !== undefined ? { letterCoverageMean: x.letterCoverageMean } : {}), ...(x.cerMean !== undefined ? { cerMean: x.cerMean } : {}) })), ranking: ranked.ranking, rankedBy: ranked.rankedBy };
    tail.push({ name: 'updateVoiceDesign', args: [c.id, designId, patch] });
    await commands(tail, 'worker');
    kept.length = 0;
    const stored = (await readState()).state.characters.find((x) => x.id === c.id)?.voice.designs?.find((d) => d.id === designId);
    if (!stored) throw new StudioError('NOT_FOUND', `Voice design ${designId} is not on ${c.name} after it was written.`);
    await ctx.event('info', 'voice design measured', { designId, ranking: ranked.ranking, rankedBy: ranked.rankedBy, pick: ranked.pick, gates: final.map((x) => ({ index: x.index, ok: x.gate.ok, reasons: x.gate.reasons, similarityMean: x.similarityMean, letterCoverageMean: x.letterCoverageMean })) });
    return stored;
  } catch (e) {
    for (const rel of kept) await removeFile(rel).catch(() => {});
    throw e;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** A candidate's preview scores: mean ECAPA, and (Arabic) mean letter coverage and CER of the renderings. */
function scoresOf(list: VoiceDesignPreview[]): Pick<VoiceDesignCandidate, 'similarityMean' | 'letterCoverageMean' | 'cerMean'> {
  const sim = mean(list.map((p) => p.cosine)); const lc = mean(list.map((p) => p.letterCoverage)); const cer = mean(list.map((p) => p.cer));
  return { ...(sim !== undefined ? { similarityMean: sim } : {}), ...(lc !== undefined ? { letterCoverageMean: lc } : {}), ...(cer !== undefined ? { cerMean: cer } : {}) };
}

/** What a design result says about itself wherever it is shown: synthetic, and what no measurement can claim. */
export function designNotes(c: Pick<Character, 'language' | 'dialect'>): string[] {
  return [DESIGN_LABEL, ...(c.language === 'AR' ? [isIraqi(c) ? IRAQI_DIALECT_PENDING : MSA_ACCENT_PENDING] : []), NATURALNESS_PENDING];
}

/** The candidates as a job result reads them. */
export const designSummary = (r: VoiceDesignRecord) => r.candidates.map((x) => ({ index: x.index, seed: x.seed, assetId: x.assetId, nativeAssetId: x.nativeAssetId, sha256: x.sha256, durationSeconds: x.durationSeconds, measured: x.measured, gate: x.gate, previews: x.previews ?? [], similarityMean: x.similarityMean, letterCoverageMean: x.letterCoverageMean, cerMean: x.cerMean }));

// ---------------------------------------------------------------------------------------------------- VOICE_DESIGN

/** VOICE_DESIGN (manual): the producer's description (or the profile's) → three measured candidates with previews
 *  through the line engine; nothing is pinned — the producer chooses with VOICE_BUILD { mode: 'DESIGN', designId,
 *  candidate }. Refused for a locked voice and, unless the experiment is on, for an Iraqi character. */
export const voiceDesign: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'VOICE_DESIGN'>;
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === p.characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  const lock = voiceBuildLockProblem(c, undefined);
  if (lock) throw new StudioError('VOICE_LOCKED', `${lock} (voice design).`, { characterId: c.id });
  const iraqi = isIraqi(c);
  if (iraqi && !state.settings.generation?.allowDesignedIraqi) throw missingReference(IRAQI_NEEDS_RECORDING, { characterId: c.id });
  const speech: LineSpeech = { speed: speedForPace(c.voice.pace), emotionAlpha: 1, seed: Math.floor(Math.random() * 2 ** 31) };
  const record = await designAndMeasure(ctx, c, { mode: 'DESIGN', description: p.description, text: p.text, seed: p.seed, n: p.n, experiment: iraqi, speech });
  const ranked = rankDesignCandidates(record.candidates, rankingFor(c));
  const passing = record.candidates.filter((x) => x.gate.ok).length;
  await ctx.activity('VOICE_DESIGNED', `${record.candidates.length} designed voice${record.candidates.length > 1 ? 's' : ''} for ${c.name}, ${passing} within the gates${ranked.pick ? `; recommended: candidate ${ranked.pick}` : ''} — studio-designed synthetic voices, waiting for the producer’s choice`, { characterId: c.id, designId: record.id, ranking: ranked.ranking });
  return {
    characterId: c.id, designId: record.id, language: record.language, dialect: record.dialect, description: record.description, descriptionSource: record.descriptionSource,
    engineVersion: record.engineVersion, lineEngine: record.lineEngine, ranking: ranked.ranking, rankedBy: ranked.rankedBy, recommended: ranked.pick ?? ranked.ranking[0] ?? null,
    candidates: designSummary(record), label: DESIGN_LABEL, notes: designNotes(c),
    // nothing to choose from is a result a person has to look at
    awaitingReview: ranked.ranking.length === 0,
  };
};

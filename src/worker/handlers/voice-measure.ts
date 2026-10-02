import type { Asset, Character } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import { fileFor } from '@/server/media';
import { clipping, loudness } from '@/server/media/voice-check';
import { arabicWordCoverage } from '@/server/media/arabic-align';
import { charErrorRate, scriptCoverage, wordErrorRate } from '@/server/providers/speech';
import { cosine, embedVoice } from '@/server/providers/voice-design';
import type { HandlerContext } from './index';

/** WHAT IS MEASURED ON A VOICE LINE (contract v2 §4), shared by the voice handlers (voice.ts) and the design pipeline
 *  (voice-design.ts): intelligibility against the intended text (CER, and word coverage — space-insensitive for
 *  Arabic), loudness, true peak and clipped samples on the one measurement stack (voice-check), and the ECAPA cosine
 *  between the reference the engine heard and the line it spoke. Measurements only: none of them says a voice is
 *  natural or a dialect authentic. */

/** VRAM the GPU lease reserves per family (MB): the line engines, the transcriber, the design engine (measured 6.4 GB
 *  reserved at peak, docs/MODELS.md). */
export const TTS_VRAM = 8000;
export const ASR_VRAM = 4000;
export const DESIGN_VRAM = 7000;

export const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

/** The profile's pace as the engine's speed factor. */
export const speedForPace = (pace: Character['voice']['pace']): number => (pace === 'SLOW' ? 0.9 : pace === 'QUICK' ? 1.12 : 1.0);

export const round = (v: number, digits = 4): number => Math.round(v * 10 ** digits) / 10 ** digits;
const finite = (v: number | null | undefined): number | undefined => (v !== null && v !== undefined && Number.isFinite(v) ? v : undefined);

/** Coverage, CER and WER of what was heard against what was intended. Arabic coverage is the space-insensitive word
 *  coverage of src/server/media/arabic-align.ts (a word written with other spaces is heard; one with other letters is
 *  not); English keeps `scriptCoverage`. CER (the dialect fold) and WER (reported) are unchanged. Pure. */
export function heardMetrics(text: string, heard: string, language: Language): { coverage: number; cer: number; wer: number } {
  return { coverage: language === 'AR' ? arabicWordCoverage(text, heard) : scriptCoverage(text, heard, language), cer: charErrorRate(text, heard, language), wer: wordErrorRate(text, heard, language) };
}

export interface LevelMeasure { lufs?: number; truePeakDbtp?: number; clipped?: number }

/** Integrated loudness, true peak and full-scale samples of a file (CPU, ffmpeg); a measurement that cannot be made is
 *  absent, never invented. */
export async function levelOf(file: string): Promise<LevelMeasure> {
  const [l, k] = await Promise.all([loudness(file).catch(() => null), clipping(file).catch(() => null)]);
  const lufs = finite(l?.integratedLufs); const tp = finite(l?.truePeakDbtp);
  return { ...(lufs !== undefined ? { lufs: round(lufs, 2) } : {}), ...(tp !== undefined ? { truePeakDbtp: round(tp, 2) } : {}), ...(k ? { clipped: k.clippedSamples } : {}) };
}

/** The ECAPA embedding of a file (CPU, in the design service), or null with a job event when the encoder is away. */
export async function speakerEmbedding(ctx: HandlerContext, file: string): Promise<{ embedding: number[]; model: string } | null> {
  try {
    const e = await ctx.tool('speech.embed_voice', () => embedVoice(file), { label: 'ecapa', input: { file } });
    return { embedding: e.embedding, model: `${e.model} (${e.version})` };
  } catch (err) {
    await ctx.event('warn', `speaker similarity unavailable: ${(err as Error).message.slice(0, 200)}`);
    return null;
  }
}

/** What a spoken line measures beside its words: level, true peak, clipping, and ECAPA(reference, line) when the
 *  reference file is given. */
export async function measureVoiceLine(ctx: HandlerContext, file: string, referenceFile?: string): Promise<LevelMeasure & { seedToLineSimilarity?: number; similarityModel?: string }> {
  const level = await levelOf(file);
  if (!referenceFile) return level;
  const a = await speakerEmbedding(ctx, referenceFile);
  const b = a ? await speakerEmbedding(ctx, file) : null;
  return { ...level, ...(a && b ? { seedToLineSimilarity: round(cosine(a.embedding, b.embedding)), similarityModel: b.model } : {}) };
}

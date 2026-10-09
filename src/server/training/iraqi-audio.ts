import { ffmpeg } from '@/server/media/ffmpeg';
import { clipping, loudness, speechRegions } from '@/server/media/voice-check';
import { ffprobe } from '@/server/media';

/** What is measured on a training utterance before it is accepted (scripts/iraqi-dataset.ts): the one measurement stack
 *  the studio already uses for voice references (voice-check: loudness, true peak, clipped samples, speech regions) plus
 *  a plain SNR estimate (speech-region RMS against the quietest 10 % of 50 ms frames). Measurements only. */
export interface UtteranceMeasure { durationSeconds: number; sampleRate: number; channels: number; lufs?: number; truePeakDbtp?: number; clippedSamples?: number; snrDb?: number; speech: boolean; music?: boolean }

export async function measureUtterance(file: string): Promise<UtteranceMeasure> {
  const probe = await ffprobe(file);
  const [l, k, s] = await Promise.all([loudness(file).catch(() => null), clipping(file).catch(() => null), speechRegions(file, { durationSeconds: probe.durationSeconds }).catch(() => null)]);
  const snr = await snrEstimate(file).catch(() => undefined);
  return {
    durationSeconds: probe.durationSeconds ?? 0, sampleRate: probe.sampleRate ?? 0, channels: probe.channels ?? 0,
    lufs: finite(l?.integratedLufs), truePeakDbtp: finite(l?.truePeakDbtp), clippedSamples: k?.clippedSamples,
    snrDb: snr, speech: Boolean(s && s.speechSeconds > 0.3),
  };
}

/** The training copy: 24 kHz mono 16-bit PCM, untouched otherwise (no loudness change, no trimming: the model learns
 *  the recording as it is; level is normalised at training time if the recipe wants it). */
export async function toTraining(src: string, dest: string): Promise<void> {
  await ffmpeg(['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', dest], { timeoutMs: 120_000 });
}

/** SNR from ffmpeg's astats per 50 ms frame: RMS of the loudest 50 % of frames (speech) over the quietest 10 % (noise floor). */
async function snrEstimate(file: string): Promise<number | undefined> {
  const { stderr } = await ffmpeg(['-v', 'info', '-i', file, '-af', 'aresample=16000,asetnsamples=800,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'], { timeoutMs: 120_000 });
  const rms = [...stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === '-inf' ? -90 : Number(m[1]))).filter(Number.isFinite).sort((a, b) => a - b);
  if (rms.length < 20) return undefined;
  const noise = mean(rms.slice(0, Math.max(1, Math.floor(rms.length * 0.1))));
  const speech = mean(rms.slice(Math.floor(rms.length * 0.5)));
  return Number((speech - noise).toFixed(1));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const finite = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(v) ? v : undefined);

import type { Production } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import type { AudioCue, AudioCueKind, AudioTimeline, GainSpan } from '@/domain/timeline';

/** THE MIX PLAN — the production audio timeline (src/domain/timeline.ts) as the tracks the cut is mixed from: every
 *  cue a typed track with its stable source, sample placement, gain, edge fades, ducking or replacement automation,
 *  and the policy that set it. A timeline with a problem (a source twice, a song twice, two voices at once) is
 *  refused here, before anything is rendered, as AUDIO_DUPLICATION. The ffmpeg filter of a track is written here too
 *  (pure, so its shape is tested); src/server/media/assembly.ts runs it. */

export type AudioTrackKind = AudioCueKind;
export interface AudioTrack {
  cueId: string;
  kind: AudioTrackKind;
  /** stable source: the asset (or the take's file) and, for a take, the frames skipped at its head */
  sourceAssetId: string;
  lineage: string;
  sourceOffsetSamples: number;
  startSample: number;
  durationSamples: number;
  gain: number;
  /** why this gain: the policy that set it (shown in the Final Cut mix panel and kept in provenance) */
  policy: string;
  shotId?: string;
  lineId?: string;
  muted?: boolean;
  voice: boolean;
  fadeInSamples: number;
  fadeOutSamples: number;
  fadeInCurve?: 'tri' | 'qsin';
  fadeOutCurve?: 'tri' | 'qsin';
  automation?: { rampSamples: number; spans: GainSpan[] };
  loop?: boolean;
  loopSamples?: number;
}
export interface MixPlan { rate: number; tracks: AudioTrack[]; targetLufs: number; notes: string[] }

const trackOf = (c: AudioCue): AudioTrack => ({ cueId: c.id, kind: c.kind, sourceAssetId: c.sourceAssetId, lineage: c.lineage, sourceOffsetSamples: c.sourceOffsetSamples, startSample: c.startSample, durationSamples: c.durationSamples, gain: c.muted ? 0 : c.gain, policy: c.policy, shotId: c.shotId, lineId: c.lineId, muted: c.muted, voice: c.voice, fadeInSamples: c.fadeInSamples, fadeOutSamples: c.fadeOutSamples, fadeInCurve: c.fadeInCurve, fadeOutCurve: c.fadeOutCurve, automation: c.automation, loop: c.loop, ...(c.loopSamples ? { loopSamples: c.loopSamples } : {}) });

/** The mix plan of a timeline: one track per cue, the loudness target (−23 LUFS films, −14 music videos). Throws
 *  (AUDIO_DUPLICATION) when the timeline would play a source twice, a song twice or two voices at once. */
export function mixPlanOf(p: Pick<Production, 'kind'>, t: AudioTimeline, opts: { targetLufs?: number } = {}): MixPlan {
  if (t.problems.length) {
    // a stale continuation join is a plan that no longer holds (INCONSISTENT_PLAN: regenerate the shot, or assemble
    // with the override); every other problem is a sound played twice
    const failureClass = t.problems.every((x) => x.kind === 'STALE_JOIN') ? 'INCONSISTENT_PLAN' : 'AUDIO_DUPLICATION';
    throw new StudioError('INVALID', `The mix plan refuses this cut: ${t.problems.map((x) => x.detail).join('; ')}.`, { failureClass, problems: t.problems });
  }
  const tracks = t.cues.map(trackOf);
  const notes = [...t.notes];
  const muted = tracks.filter((x) => x.muted).length;
  if (muted) notes.push(`${muted} take soundtrack(s) muted under the song master`);
  const replaced = tracks.filter((x) => x.kind === 'DIALOGUE' && /replaces/.test(x.policy)).length;
  if (replaced) notes.push(`${replaced} recorded line(s) replace the takes' own speech`);
  return { rate: t.rate, tracks, targetLufs: opts.targetLufs ?? (p.kind === 'MUSIC_VIDEO' ? -14 : -23), notes };
}

/** The gain automation as an ffmpeg `volume` expression of the cue's time `t` (seconds): 1 outside the spans, the
 *  span's gain inside, linear ramps of `rampSamples` before and after each span. Spans are expected merged. */
export function gainExpression(a: NonNullable<AudioTrack['automation']>, rate: number): string {
  const r = Math.max(1, a.rampSamples) / rate;
  const f = (x: number) => Number(x.toFixed(5)).toString();
  const terms = a.spans.map((s) => `${f(1 - s.gain)}*clip(min((t-${f(s.from / rate - r)})/${f(r)}\\,(${f(s.to / rate + r)}-t)/${f(r)})\\,0\\,1)`);
  return `max(0\\,1-${terms.join('-')})`;
}

/** The ffmpeg filter chain of one track: cut from the source by sample, gain (and automation), edge fades, placed
 *  at its start sample. `in`/`out` are the filtergraph labels. */
export function trackFilter(t: AudioTrack, input: string, output: string, rate: number): string {
  const parts = t.loopSamples
    // room tone: the stretch, looped to the cue's length
    ? [`aformat=sample_rates=${rate}:channel_layouts=stereo`, `atrim=start_sample=${t.sourceOffsetSamples}:end_sample=${t.sourceOffsetSamples + t.loopSamples}`, 'asetpts=PTS-STARTPTS', `aloop=loop=-1:size=${t.loopSamples}`, `atrim=end_sample=${t.durationSamples}`, 'asetpts=PTS-STARTPTS']
    : [`aformat=sample_rates=${rate}:channel_layouts=stereo`, `atrim=start_sample=${t.sourceOffsetSamples}:end_sample=${t.sourceOffsetSamples + t.durationSamples}`, 'asetpts=PTS-STARTPTS'];
  if (t.automation?.spans.length) parts.push('asetnsamples=n=240:p=0', `volume=volume=${gainExpression(t.automation, rate)}:eval=frame`);
  parts.push(`volume=${t.gain.toFixed(4)}`);
  if (t.fadeInSamples > 0) parts.push(`afade=t=in:ss=0:ns=${t.fadeInSamples}:curve=${t.fadeInCurve ?? 'tri'}`);
  if (t.fadeOutSamples > 0) parts.push(`afade=t=out:ss=${Math.max(0, t.durationSamples - t.fadeOutSamples)}:ns=${t.fadeOutSamples}:curve=${t.fadeOutCurve ?? 'tri'}`);
  parts.push(`adelay=${t.startSample}S:all=1`);
  return `${input}${parts.join(',')}${output}`;
}

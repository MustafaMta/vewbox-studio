import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import type { Location, LocationAmbience, Production, Scene } from '@/domain/types';
import type { TimeOfDay } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { assetFromStored } from '@/server/media';
import { committedOutput, jobOutputs, outputId, stableSeed } from '@/server/jobs/outputs';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { loudness } from '@/server/media/voice-check';
import { generateSoundEffect, sfxConfigured, SFX_MAX_SECONDS } from '@/server/providers/sfx';
import { ensurePin } from '@/server/world';
import { recordQaReport } from '@/server/org/runs';

/** THE PLACES' AMBIENCE (master plan Phase 5 sound design) — the Sound Designer's AMBIENCE job: one bed per place, made
 *  with MOSS-SoundEffect v2 from what the place is and the time and weather its scenes play in, recorded ONCE (the job's
 *  seed; a retry finds the bed an earlier attempt kept), measured on the stored file, kept on the place. The World Bible
 *  derives each place's bed from it; the cut loops it under the place's run of scenes (src/domain/timeline.ts). */

const TIME_WORDS: Record<TimeOfDay, string> = {
  DAWN: 'at dawn, the world just waking', MORNING: 'in the morning', MIDDAY: 'at midday', AFTERNOON: 'in the afternoon',
  GOLDEN_HOUR: 'in the late afternoon', DUSK: 'at dusk', NIGHT: 'at night, quiet and still',
};

/** What the weather in a scene's written words sounds like (the script says "rain lashes the windows": the bed has
 *  rain on glass). Order matters only for the output's order. */
const WEATHER: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(storm|thunder|lightning)/i, 'a storm, distant thunder'],
  [/\b(rain|downpour|drizzle)/i, 'heavy rain'],
  [/\b(wind|gale|gust)/i, 'wind gusting'],
  [/\b(sea|waves?|surf|tide|harbou?r|shore)\b/i, 'the sea and waves below'],
  [/\b(snow|blizzard)/i, 'snow muffling the air'],
  [/\b(fog|mist)/i, 'still, foggy air'],
];

/** THE BED'S DESCRIPTION (pure, tested): the place in its own words (interior or exterior, what it is made of), the time
 *  its scenes play at, the weather they are written in; never speech, never music. At most 600 characters (the
 *  engine's limit). `scenes`: the scenes at this place in the production the bed is made for (none: the place alone). */
export function ambiencePrompt(l: Pick<Location, 'kind' | 'description' | 'layout'>, scenes: Array<Pick<Scene, 'timeOfDay' | 'purpose' | 'beats'>> = []): string {
  const place = l.description.replace(/\s+/g, ' ').trim().replace(/\.$/, '').slice(0, 240);
  const materials = l.layout?.materials?.length ? `; ${l.layout.materials.slice(0, 4).join(', ')}` : '';
  const times = [...new Set(scenes.map((s) => s.timeOfDay))];
  const when = times.length === 1 ? ` ${TIME_WORDS[times[0]]}` : '';
  const text = scenes.map((s) => [s.purpose, ...s.beats.map((b) => b.action)].join(' ')).join(' ');
  const weather = WEATHER.filter(([re]) => re.test(text)).map(([, w]) => w);
  const room = l.kind === 'INTERIOR' ? 'Room tone and ambience inside' : 'Outdoor ambience at';
  const out = `${room}: ${place}${materials}${when}.${weather.length ? ` ${weather.join(', ')}${l.kind === 'INTERIOR' ? ', heard from inside' : ''}.` : ''} Continuous and steady, no voices, no speech, no music.`;
  return out.length <= 600 ? out : `${out.slice(0, 560).replace(/\s+\S*$/, '')}. No voices, no music.`;
}

/** THE SEAMLESS LOOP (pure, tested): the cut repeats a bed to fill a place's run of scenes (`-stream_loop`, assembly.ts),
 *  so the file must end where it begins. Its first `d` seconds are cross-faded (equal power) into its last `d`: the
 *  result is `d` shorter, and its end flows into its start with no jump. */
export function loopableArgs(input: string, output: string, d: number): string[] {
  const s = d.toFixed(3);
  return ['-hide_banner', '-nostdin', '-y', '-i', input, '-filter_complex', `[0:a]asplit=2[a][b];[a]atrim=start=${s},asetpts=PTS-STARTPTS[body];[b]atrim=end=${s},asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=${s}:c1=qsin:c2=qsin[out]`, '-map', '[out]', '-c:a', 'pcm_s16le', output];
}
export const LOOP_CROSSFADE_SECONDS = 2;

/** A bed is kept only when it is heard and clean (pure, tested): integrated loudness above −60 LUFS (not silence) and
 *  the true peak at or under −1 dBTP (the service's limiter; above it something went wrong). */
export function ambienceVerdict(m: { integratedLufs: number; truePeakDbtp: number }): { ok: boolean; reason?: string } {
  if (!Number.isFinite(m.integratedLufs) || m.integratedLufs < -60) return { ok: false, reason: `the bed is silent (${Number.isFinite(m.integratedLufs) ? m.integratedLufs.toFixed(1) : '−∞'} LUFS)` };
  if (Number.isFinite(m.truePeakDbtp) && m.truePeakDbtp > -0.9) return { ok: false, reason: `the bed peaks at ${m.truePeakDbtp.toFixed(2)} dBTP (over −1 dBTP)` };
  return { ok: true };
}

export const ambience: Handler = async (ctx) => {
  const { locationId, productionId, force } = ctx.job.payload as { locationId: string; productionId?: string; force?: boolean };
  const { state } = await readState();
  const l = state.locations.find((x) => x.id === locationId);
  if (!l) throw new StudioError('NOT_FOUND', 'Location not found');
  if (l.ambience && !force) return { assetId: l.ambience.assetId, reused: true };
  if (!sfxConfigured()) throw new StudioError('NOT_CONFIGURED', 'The sound-effect service is not configured (SFX_URL; compose profile sfx).');
  const p = productionId ? state.productions.find((x) => x.id === productionId) : undefined;
  if (productionId && !p) throw new StudioError('NOT_FOUND', 'Production not found');
  const scenes = (p?.scenes ?? []).filter((sc) => sc.locationId === l.id);
  const description = ambiencePrompt(l, scenes);
  const seconds = SFX_MAX_SECONDS;
  const seed = stableSeed(ctx.job.id, 'ambience');

  // ONE recording per job: a retry after a crash finds the bed an earlier attempt kept
  const earlier = await committedOutput(ctx.job.id, 'ambience');
  let bed: LocationAmbience;
  if (earlier) {
    bed = { assetId: earlier.id, description, seconds: earlier.durationSeconds ?? seconds, model: String(earlier.provenance?.model ?? 'MOSS-SoundEffect v2'), seed, jobId: ctx.job.id, createdAt: new Date().toISOString() };
    await ctx.event('info', `the bed was already recorded by an earlier attempt of this job (${earlier.id}); reused`, { assetId: earlier.id });
  } else {
    await ctx.progress('GENERATING', { phase: 'recording', message: `Recording the ambience of ${l.name}` });
    const dir = await tmpDir('ambience');
    try {
      const raw = path.join(dir, 'ambience-raw.wav');
      const r = await ctx.gpu('SFX', 14000, () => ctx.tool('audio.generate_effect', () => generateSoundEffect(description, raw, { seconds, seed, timeoutMs: 14 * 60_000 }), { label: l.name, input: { prompt: description, seconds, seed } }), { jobId: ctx.job.id });
      await ctx.checkpoint();
      await ctx.progress('VALIDATING', { phase: 'validating', message: 'Measuring the bed' });
      // the stored bed loops without a seam (the generated recording's head cross-faded into its tail)
      const file = path.join(dir, 'ambience.wav');
      await ffmpeg(loopableArgs(raw, file, LOOP_CROSSFADE_SECONDS));
      const m = await loudness(file, undefined, { format: 'wav' });
      const verdict = ambienceVerdict(m);
      await recordQaReport({ id: outputId(ctx.job.id, 'qa:ambience', 'qa'), productionId, subjectKind: 'LOCATION', subjectId: l.id, inspectorId: 'technical-media-inspector', checks: [{ name: 'heard', ok: Number.isFinite(m.integratedLufs) && m.integratedLufs >= -60, value: m.integratedLufs, threshold: '≥ −60 LUFS' }, { name: 'true-peak', ok: !(m.truePeakDbtp > -0.9), value: m.truePeakDbtp, threshold: '≤ −1 dBTP' }], failureClass: verdict.ok ? undefined : 'OUTPUT_CORRUPTION', decision: verdict.ok ? 'ACCEPT' : 'REJECT', jobId: ctx.job.id, notes: `ambience bed of ${l.name}: ${description}` });
      if (!verdict.ok) throw new StudioError('PROVIDER', `The ambience bed was not kept: ${verdict.reason}.`, { failureClass: 'OUTPUT_CORRUPTION' });
      const st = await jobOutputs(ctx.job).adopt('ambience', file, { expectKind: 'AUDIO' });
      const provenance = { provider: 'MOSS-SOUNDEFFECT', model: r.model, engineVersion: r.engineVersion, prompt: description, seconds: r.seconds, seed: r.seed, loop: { crossfadeSeconds: LOOP_CROSSFADE_SECONDS }, ms: r.ms, peakVramMb: r.peakVramMb, locationId: l.id, productionId, lufs: m.integratedLufs, truePeakDbtp: m.truePeakDbtp, creativeAttempt: 1 };
      await command('addAsset', [assetFromStored(st.id, st.stored, { label: `${l.name} — ambience`, tags: ['ambience', 'sfx', 'moss-soundeffect-v2'], origin: 'GENERATED', jobId: ctx.job.id, provenance })], 'worker');
      bed = { assetId: st.id, description, seconds: st.stored.probe?.durationSeconds ?? r.seconds, model: r.model, engineVersion: r.engineVersion, seed: r.seed, lufs: m.integratedLufs, truePeakDbtp: m.truePeakDbtp, jobId: ctx.job.id, createdAt: new Date().toISOString() };
    } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  await command('setLocationAmbience', [l.id, bed], 'worker');
  // every production at this place takes the bed: its World Bible revision is written and its pin advanced (an
  // ambience change never blocks a re-pin, src/domain/world.ts repinSafety)
  const fresh = (await readState()).state;
  const here = fresh.productions.filter((x) => x.locationIds.includes(l.id) || x.scenes.some((sc) => sc.locationId === l.id));
  for (const prod of here) {
    const o = await ensurePin(fresh, prod, { jobId: ctx.job.id, by: 'sound-designer' }).catch((e: Error) => ({ action: 'FAILED', message: e.message }));
    await ctx.event('info', `“${prod.title}”: ${o.message}`);
  }
  await ctx.activity('AMBIENCE_RECORDED', `${l.name}: an ambience bed (${bed.seconds.toFixed(1)} s${bed.lufs !== undefined ? `, ${bed.lufs.toFixed(1)} LUFS` : ''})`, { locationId: l.id, assetId: bed.assetId });
  return { assetId: bed.assetId, description, seconds: bed.seconds, lufs: bed.lufs, truePeakDbtp: bed.truePeakDbtp, productions: here.map((x) => x.id) };
};

/** The production's places that have no bed yet (pure): what a "make the ambience" pass over a production would do. */
export function placesWithoutAmbience(p: Pick<Production, 'scenes'>, locations: Array<Pick<Location, 'id' | 'ambience'>>): string[] {
  const ids = [...new Set(p.scenes.map((sc) => sc.locationId).filter((x): x is string => Boolean(x)))];
  return ids.filter((id) => !locations.find((l) => l.id === id)?.ambience);
}

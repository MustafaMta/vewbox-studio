import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { assetFile, assetFromStored, fileFor } from '@/server/media';
import { committedOutput, jobOutputs, stableSeed } from '@/server/jobs/outputs';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { separateStems, transcribe } from '@/server/providers/speech';
import { alignLyrics, linesFromForcedAlignment } from '@/server/media/lyrics';
import { alignScript, isQaUnavailable, scriptWords } from '@/server/providers/qa-service';
import * as comfy from '@/server/providers/comfy';
import { aceStepSong } from '@/server/workflows';
import { ACE_VARIANTS, type AceVariant } from '@/server/workflows/music';
import { joinLyrics, splitLyrics } from '@/domain/lyrics';
import type { Character, Production, StudioState } from '@/domain/types';
import { sings } from '@/domain/vocabulary';
import { songFromPlan, songLanguageOf, songPerformers, timeByContent, vocalTag, writeSongPlan } from '@/server/story/song';
import { loudness, speechRegions } from '@/server/media/voice-check';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { recordHandoff, recordQaReport } from '@/server/org/runs';

/** THE SONG — ONE engine (master plan Phase 2): ACE-Step 1.5 XL-SFT with the 5Hz LM 4B in ComfyUI (MIT). No hosted
 *  API, no turbo fallback: when the production engine cannot run, the job says why. WRITE_SONG has
 *  the planner write the song (concept, structure, lyrics, tempo, key, who sings what); GENERATE_SONG records it as
 *  ONE authoritative song (one graph, batch 1, the job's seed: a retry re-attaches, never a second take), sung by the
 *  singers the song names — their own singing profiles set the vocal. Section timings are spread over the real
 *  duration, then placed on the sung vocal when the transcription service can hear it. */

type Engine = 'ace-step';

/** Which ACE-Step XL variant a song is made with: XL-SFT with the 5Hz LM 4B, the production song generator. Its files
 *  missing is a configuration error with the files named — never a silent drop to turbo. MUSIC_ACE_VARIANT=xl-turbo is
 *  an explicit draft choice of the producer's, recorded on the song. Pure, tested. */
export function chooseAceVariant(diffusionModels: string[], textEncoders: string[], want: 'auto' | AceVariant = 'auto'): { variant: AceVariant } {
  if (want === 'xl-turbo') return { variant: 'xl-turbo' };
  const missing = [ACE_VARIANTS['xl-sft'].dit, ACE_VARIANTS['xl-sft'].lm].filter((f) => !diffusionModels.includes(f) && !textEncoders.includes(f));
  if (missing.length) throw new StudioError('NOT_CONFIGURED', `The song engine (ACE-Step 1.5 XL-SFT + 5Hz LM 4B) is not installed: ComfyUI does not have ${missing.join(' and ')} (manifest group music-ace-step-xl).`, { missing, failureClass: 'NOT_CONFIGURED' });
  return { variant: 'xl-sft' };
}

/** The singers a song names, as characters; refused when it names nobody who sings, or a cast member who does not
 *  sing (an actor never sings the lead of a song made in their name). */
export function songSingers(state: StudioState, p: Production): Character[] {
  const ids = p.song?.singerIds?.length ? p.song.singerIds : [...new Set((p.song?.sections ?? []).flatMap((s) => s.singerIds))];
  const chars = ids.map((id) => state.characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  const silent = chars.filter((c) => !sings(c.kind ?? 'ACTOR'));
  if (silent.length) throw new StudioError('INVALID', `${silent.map((c) => c.name).join(' and ')} ${silent.length === 1 ? 'is' : 'are'} cast as an actor, not a singer: make them a Singer or an Actor + Singer (their page › Performs), or give their sections to someone who sings.`, { characterIds: silent.map((c) => c.id), failureClass: 'INVALID_INPUT' });
  if (!chars.length) throw new StudioError('INVALID', 'Nobody sings this song yet: write the song (it names its singers) or assign a singer to its sections.', { productionId: p.id, failureClass: 'INVALID_INPUT' });
  return chars;
}

/** WRITE_SONG — the planner writes the production's song (src/server/story/song.ts): ONE plan, validated; the
 *  production's Song becomes it (its earlier recording, if any, stays in the library). */
export const writeSong: Handler = async (ctx) => {
  const { productionId, brief, singerIds } = ctx.job.payload as { productionId: string; brief?: string; singerIds?: string[] };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const performers = songPerformers(castOf(state, p), singerIds);
  const seconds = Math.min(300, Math.max(15, Math.round(p.song?.durationSeconds || p.targetSeconds)));
  await ctx.progress('GENERATING', { phase: 'writing', message: `Writing the song for ${performers.map((s) => s.name).join(' and ') || 'the cast'}`, percent: null });
  const plan = await ctx.tool('story.structured_answer', () => writeSongPlan(p, performers, { seconds, brief: brief ?? p.song?.caption }, { jobId: ctx.job.id }), { label: 'song plan', input: { task: 'song', productionId: p.id, characterIds: performers.map((s) => s.id) } });
  await ctx.checkpoint();
  const song = songFromPlan(plan, performers, seconds, p.song, songLanguageOf(p));
  await command(p.song ? 'updateSong' : 'setSong', p.song ? [p.id, { ...song, assetId: undefined, stems: undefined, provider: undefined, model: undefined, requestId: undefined, jobId: ctx.job.id }] : [p.id, { ...song, jobId: ctx.job.id }], 'worker');
  await ctx.activity('SONG_WRITTEN', `“${song.title}” written: ${song.sections.length} sections, ${song.bpm} BPM${song.key ? `, ${song.key}` : ''}, sung by ${performers.filter((s) => song.singerIds.includes(s.id)).map((s) => s.name).join(' and ')}`, { productionId: p.id, sections: song.sections.length });
  return { title: song.title, sections: song.sections.length, singerIds: song.singerIds, bpm: song.bpm, key: song.key, concept: song.concept, caption: song.caption };
};

export const generateSong: Handler = async (ctx) => {
  const { productionId, instrumental } = ctx.job.payload as { productionId: string; instrumental?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (!p.song) throw new StudioError('INVALID', 'This production has no song yet: write the song first.');
  const song = p.song;
  // the sections ARE the song (edited in the Song & Lyrics tab); the stored text is only for a song without sections
  const lyrics = song.sections.some((s) => (s.text || s.textAr || '').trim()) ? joinLyrics(song.sections) : (song.lyrics?.trim() ?? '');
  if (!instrumental && !lyrics.trim()) throw new StudioError('INVALID', 'The song has no lyrics: write the song first, or choose an instrumental.');
  const singers = instrumental ? [] : songSingers(state, p);
  const seconds = Math.min(300, Math.max(15, Math.round(song.durationSeconds || p.targetSeconds)));
  // the vocal is the named singers' own (their singing profiles), said to the engine — never an unnamed voice
  const vocal = vocalTag(singers.map((c) => ({ sex: c.sex, voiceType: c.singing?.voiceType })));
  const caption = [song.caption?.trim() || `${p.genre ?? 'pop'}, ${p.mood ?? ''}`.trim(), vocal].filter(Boolean).join(', ');
  await ctx.progress('GENERATING', { phase: 'composing', message: `Composing with ACE-Step 1.5 XL-SFT${singers.length ? ` for ${singers.map((c) => c.name).join(' and ')}` : ''}`, percent: null });
  return generateSongLocal(ctx, { p, caption, lyrics, seconds, instrumental: Boolean(instrumental), language: p.language, t0: Date.now(), bpm: song.bpm, key: song.key, singerIds: singers.map((c) => c.id) });
};

async function generateSongLocal(ctx: Parameters<Handler>[0], a: { p: Production; caption: string; lyrics: string; seconds: number; instrumental: boolean; language: string; t0: number; bpm?: number; key?: string; singerIds: string[] }) {
  const engine: Engine = 'ace-step';
  if (!(await comfy.health()).ok) throw new StudioError('UNAVAILABLE', 'The song engine is not reachable: start the comfyui service.', { failureClass: 'INFRASTRUCTURE' });
  // the song's seed and prompt key are the job's (audit H8, step 7): every attempt builds the same graph, and a restarted
  // attempt re-attaches to the composition it already asked for instead of composing a second one
  const seed = stableSeed(ctx.job.id, `song:${engine}`);
  const [dms, tes] = await Promise.all([comfy.listModels('diffusion_models').catch(() => [] as string[]), comfy.listModels('text_encoders').catch(() => [] as string[])]);
  const ace = chooseAceVariant(dms, tes, env().MUSIC_ACE_VARIANT);
  const graph = aceStepSong({ caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental, language: a.language === 'AR' ? 'ar' : 'en', seed, variant: ace.variant, bpm: a.bpm, key: a.key });
  const run = await ctx.gpu('MUSIC', 20000, () => ctx.tool('music.generate', () => comfy.run(graph, { promptKey: `:song:${engine}:${ace.variant}`, timeoutMs: 30 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (q) => ctx.progress('GENERATING', { phase: 'composing', message: q.queue ? `waiting behind ${q.queue} in the GPU queue` : 'composing', percent: null }) }), { label: engine, input: { engine, variant: ace.variant, caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental, bpm: a.bpm, key: a.key, seed } }), { jobId: ctx.job.id });
  const out = comfy.firstOutput(run.outputs, 'audio');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI produced no audio.');
  const dir = await tmpDir('song');
  const file = path.join(dir, out.filename);
  await fsp.writeFile(file, await comfy.view(out));
  return finishSong(ctx, { p: a.p, file, model: `${ACE_VARIANTS[ace.variant].label}${ace.variant === 'xl-turbo' ? ' (draft: chosen by MUSIC_ACE_VARIANT)' : ''}`, requestId: run.promptId, workflowVersion: run.workflowVersion, engine, caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, t0: a.t0, dir, seed, singerIds: a.singerIds, bpm: a.bpm, key: a.key });
}

/** The gain that brings a true peak above −1 dBTP down to −1 dBTP (0 when it is already there). Pure (tested). */
export function levelTrimDb(truePeakDbtp: number): number {
  return truePeakDbtp > -1 ? -(truePeakDbtp + 1) : 0;
}

/** The planned sections over the recording's real length: their planned proportions kept (the plan times them by
 *  what they hold), never re-spread evenly — the windows the lyric alignment searches come from these. Pure (tested). */
export function scaleSections<T extends { from: number; to: number }>(sections: T[], duration: number): T[] {
  const planned = sections[sections.length - 1]?.to ?? 0;
  const k = planned > 0 ? duration / planned : 1;
  return sections.map((s) => ({ ...s, from: Math.round(s.from * k), to: Math.round(s.to * k) }));
}

async function finishSong(ctx: Parameters<Handler>[0], a: { p: Production; file: string; model: string; requestId?: string; workflowVersion?: string; engine: Engine; caption: string; lyrics: string; seconds: number; t0: number; dir: string; seed: number; singerIds: string[]; bpm?: number; key?: string }) {
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the recording' });
  // the song's asset id is the job's (step 6/7): a retry that finds it recorded reuses it instead of a second copy
  const earlier = await committedOutput(ctx.job.id, 'song');
  let id: string; let duration: number;
  if (earlier) {
    id = earlier.id; duration = earlier.durationSeconds ?? a.seconds;
    await fsp.rm(a.dir, { recursive: true, force: true }).catch(() => {});
    await ctx.event('info', `the song was already recorded by an earlier attempt of this job (${id}); reused`, { assetId: id });
  } else {
    const made = { provider: 'ACE-STEP', model: a.model, requestId: a.requestId, caption: a.caption, lyrics: a.lyrics, workflowVersion: a.workflowVersion, productionId: a.p.id, seed: a.seed, singerIds: a.singerIds, bpm: a.bpm, key: a.key, creativeAttempt: 1 };
    const t = await levelTrim(ctx, a.file, a.dir);
    let trim: Record<string, unknown> | undefined;
    if (t.trim) {
      // the raw recording is kept as its own asset; the song is the trimmed copy, the trim in its provenance
      const r = await jobOutputs(ctx.job).adopt('song-raw', a.file, { expectKind: 'AUDIO' });
      await command('addAsset', [assetFromStored(r.id, r.stored, { label: `${a.p.song?.title ?? a.p.title} — raw recording`, tags: ['song', 'raw', a.engine], origin: 'GENERATED', jobId: ctx.job.id, provenance: made })], 'worker');
      trim = { ...t.trim, rawAssetId: r.id };
    }
    const st = await jobOutputs(ctx.job).adopt('song', t.file, { expectKind: 'AUDIO' });
    id = st.id; const stored = st.stored;
    await fsp.rm(a.dir, { recursive: true, force: true }).catch(() => {});
    duration = stored.probe?.durationSeconds ?? a.seconds;
    await command('addAsset', [assetFromStored(id, stored, { label: `${a.p.song?.title ?? a.p.title} — song`, tags: ['song', a.engine], origin: 'GENERATED', jobId: ctx.job.id, provenance: { ...made, ...(trim ? { levelTrim: trim } : {}) } })], 'worker');
  }
  const genMs = Date.now() - a.t0;
  // re-time the sections over the real duration, keeping singer assignments (the song's own — never "the whole cast")
  const fresh = (await readState()).state.productions.find((x) => x.id === a.p.id)!;
  const singers = fresh.song?.singerIds?.length ? fresh.song.singerIds : a.singerIds;
  const old = fresh.song?.sections ?? [];
  const sections = old.length ? scaleSections(old, duration) : splitLyrics(a.lyrics, duration).map((s) => ({ ...s, singerIds: singers }));
  await command('updateSong', [a.p.id, { source: 'GENERATED', assetId: id, durationSeconds: Math.round(duration), lyrics: a.lyrics, caption: a.caption, provider: a.engine, model: a.model, requestId: a.requestId, jobId: ctx.job.id, sections }], 'worker');
  await recordMetric('song.generation_ms', genMs, 'ms', { engine: a.engine, seconds: Math.round(duration) }, ctx.job.id);
  const stems = await makeStems(ctx, a.p.id, id, `${a.p.song?.title ?? a.p.title}`);
  const aligned = stems?.vocals ? await alignSongLyrics(ctx, a.p.id, stems.vocals) : undefined;
  const { alignedRatio, lengthOk, levelOk, silenceOk } = await inspectSong(ctx, { p: a.p, id, duration, seconds: a.seconds, stems, aligned });
  await recordHandoff({ productionId: a.p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: [id, ...(stems ? Object.values(stems).filter((x): x is string => Boolean(x)) : [])], outputVersions: { song: id, seconds: Math.round(duration) }, validation: { ok: lengthOk && Boolean(stems?.vocals), checks: [{ name: 'song-recorded', ok: true, detail: `${a.model}, ${Math.round(duration)} s` }, { name: 'duration-as-planned', ok: lengthOk }, { name: 'stems-separated', ok: Boolean(stems?.vocals) }, { name: 'lyrics-aligned', ok: alignedRatio >= 0.5, detail: `${Math.round(alignedRatio * 100)} % of the lines placed on the vocal` }] }, jobId: ctx.job.id });
  await ctx.activity('SONG_COMPOSED', `“${a.p.song?.title ?? a.p.title}” composed with ${a.model} (${Math.round(duration)} s)${aligned ? `; ${aligned.aligned} of ${aligned.lines} lyric lines placed on the vocal` : ''}`, { assetId: id, engine: a.engine, seconds: Math.round(duration), aligned });
  return { assetId: id, durationSeconds: duration, engine: a.engine, model: a.model, generationMs: genMs, stems, aligned, singerIds: a.singerIds, checks: { lengthOk, levelOk, silenceOk, alignedRatio }, awaitingReview: !(lengthOk && alignedRatio >= 0.5 && levelOk && silenceOk) };
}

/** THE LEVEL TRIM, in the open: ACE-Step's raw output can peak above 0 dBTP (Harbour Lights: +0.3), which clips once
 *  encoded. A plain gain cut brings the true peak to −1 dBTP and changes nothing else — no limiter, no loudness
 *  target. Returns the file the song is (a trimmed copy in `dir`, or the input untouched) and the trim made. */
async function levelTrim(ctx: Parameters<Handler>[0], file: string, dir: string): Promise<{ file: string; trim?: { gainDb: number; rawTruePeakDbtp: number; rawLufs: number } }> {
  const raw = await loudness(file).catch(async (e) => { await ctx.event('warn', `the recording's level could not be measured, so it was not trimmed: ${(e as Error).message}`); return undefined; });
  const gainDb = raw ? levelTrimDb(raw.truePeakDbtp) : 0;
  if (!raw || gainDb >= 0) return { file };
  const out = path.join(dir, 'song-trimmed.flac');
  await ffmpeg(['-y', '-i', file, '-af', `volume=${gainDb.toFixed(2)}dB`, '-c:a', 'flac', out]);
  const trim = { gainDb: Number(gainDb.toFixed(2)), rawTruePeakDbtp: Number(raw.truePeakDbtp.toFixed(2)), rawLufs: Number(raw.integratedLufs.toFixed(2)) };
  await ctx.event('info', `level trim ${trim.gainDb} dB: the raw recording peaked at ${trim.rawTruePeakDbtp} dBTP`, trim);
  return { file: out, trim };
}

type SongChecks = { alignedRatio: number; lengthOk: boolean; levelOk: boolean; silenceOk: boolean };

/** SONG CHECK (the Audio Synchronization Inspector's step): the length as planned, the stems, the lyrics heard, the
 *  level (integrated loudness and true peak: measured, never normalised behind the producer — the only change is the
 *  open level trim, reported here with the raw peak) and dead air. The song is handed to Video Production with it. */
async function inspectSong(ctx: Parameters<Handler>[0], a: { p: Production; id: string; duration: number; seconds: number; stems?: { vocals?: string; instrumental?: string }; aligned?: { lines: number; aligned: number } }): Promise<SongChecks> {
  const { id, duration, stems, aligned } = a;
  return step(ctx, 'audio-sync-inspector', `song-check: “${a.p.song?.title ?? a.p.title}”`, async () => {
    const alignedRatio = aligned && aligned.lines ? aligned.aligned / aligned.lines : 0;
    const lengthOk = Math.abs(duration - a.seconds) <= Math.max(5, a.seconds * 0.15);
    const songAsset = (await readState()).state.assets.find((x) => x.id === id)!;
    const songFile = assetFile(songAsset);
    const trim = songAsset.provenance?.levelTrim as { gainDb: number; rawTruePeakDbtp: number } | undefined;
    const level = await loudness(songFile).catch(() => undefined);
    const sound = await speechRegions(songFile, { noiseDb: -50, minSilence: 2, durationSeconds: duration }).catch(() => undefined);
    const silentSeconds = sound ? Math.max(0, duration - sound.speechSeconds) : undefined;
    const levelOk = level ? level.integratedLufs >= -20 && level.integratedLufs <= -8 && level.truePeakDbtp <= 0 : false;
    const silenceOk = silentSeconds !== undefined && silentSeconds <= Math.max(4, duration * 0.08);
    await recordQaReport({ productionId: a.p.id, subjectKind: 'SONG', subjectId: id, inspectorId: 'audio-sync-inspector', checks: [
      { name: 'duration-as-planned', ok: lengthOk, value: Number(duration.toFixed(1)), threshold: a.seconds },
      { name: 'stems-separated', ok: Boolean(stems?.vocals), detail: stems ? 'vocals + accompaniment' : 'no stems' },
      { name: 'lyrics-heard-in-vocal', ok: alignedRatio >= 0.5, value: Number(alignedRatio.toFixed(2)), threshold: 0.5, detail: aligned ? `${aligned.aligned} of ${aligned.lines} lines placed` : 'not aligned' },
      { name: 'loudness-and-peak', ok: levelOk, value: level ? Number(level.integratedLufs.toFixed(1)) : undefined, detail: level ? `${level.integratedLufs.toFixed(1)} LUFS integrated, true peak ${level.truePeakDbtp.toFixed(1)} dBTP (−20…−8 LUFS, ≤ 0 dBTP)${trim ? `; level trim ${trim.gainDb} dB from a raw true peak of ${trim.rawTruePeakDbtp} dBTP` : ''}` : 'not measured' },
      { name: 'no-dead-air', ok: silenceOk, value: silentSeconds !== undefined ? Number(silentSeconds.toFixed(1)) : undefined, detail: silentSeconds !== undefined ? `${silentSeconds.toFixed(1)} s below −50 dB in stretches of 2 s or more` : 'not measured' },
    ], decision: lengthOk && alignedRatio >= 0.5 && levelOk && silenceOk ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [id, ...(stems?.vocals ? [stems.vocals] : [])], jobId: ctx.job.id, failureClass: lengthOk ? undefined : 'WRONG_PARAMETERS' });
    return { alignedRatio, lengthOk, levelOk, silenceOk };
  });
}

/** CHECK_SONG — check the recording again, without composing again (composing is a new seed: a second creative
 *  attempt). The song's own recording gets what a fresh recording gets today: the open level trim (the recording it
 *  was cut from stays as the raw one), its sections timed by what they hold over its real length, stems, the lyrics
 *  placed on the vocal, and the song check. */
export const checkSong: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const recorded = state.assets.find((x) => x.id === p.song?.assetId);
  if (!p.song || !recorded) throw new StudioError('INVALID', 'There is no recording to check: generate the song first.', { productionId, failureClass: 'INVALID_INPUT' });
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the recording again' });
  let id = recorded.id;
  if (!recorded.provenance?.levelTrim) {
    const earlier = await committedOutput(ctx.job.id, 'song');
    if (earlier) id = earlier.id;
    else {
      const dir = await tmpDir('song-check');
      try {
        const t = await levelTrim(ctx, assetFile(recorded), dir);
        if (t.trim) {
          const st = await jobOutputs(ctx.job).adopt('song', t.file, { expectKind: 'AUDIO' });
          await command('addAsset', [assetFromStored(st.id, st.stored, { label: recorded.label, tags: recorded.tags.filter((x) => x !== 'raw'), origin: 'DERIVED', jobId: ctx.job.id, provenance: { ...(recorded.provenance ?? {}), from: recorded.id, levelTrim: { ...t.trim, rawAssetId: recorded.id } } })], 'worker');
          id = st.id;
        }
      } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
    }
  }
  const duration = recorded.durationSeconds ?? p.song.durationSeconds;
  await command('updateSong', [p.id, { assetId: id, sections: timeByContent(p.song.sections, duration) }], 'worker');
  // stems are cut from the song as it is: a trimmed song gets its own
  const stems = id !== recorded.id || !p.song.stems?.vocals ? await makeStems(ctx, p.id, id, p.song.title || p.title) : p.song.stems;
  const aligned = stems?.vocals ? await alignSongLyrics(ctx, p.id, stems.vocals) : undefined;
  const checks = await inspectSong(ctx, { p, id, duration, seconds: p.song.durationSeconds, stems, aligned });
  const passed = checks.lengthOk && checks.alignedRatio >= 0.5 && checks.levelOk && checks.silenceOk;
  await ctx.activity('SONG_CHECKED', `“${p.song.title || p.title}” checked again${aligned ? `: ${aligned.aligned} of ${aligned.lines} lyric lines placed on the vocal` : ''}${passed ? '; every check passed' : '; it needs your review'}`, { assetId: id, aligned });
  return { assetId: id, stems, aligned, checks, awaitingReview: !passed };
};

/** The song's sections after its lines are placed on the vocal: the lines run forward through the whole song (a
 *  section's first line never starts before the previous section's last line ends — the forced aligner's padded
 *  window can reach into the section before: Harbour Lights' second chorus began 1.6 s early); a sung section spans
 *  its own lines; the sections without words take the gaps between; and together they cover 0…duration exactly,
 *  in order, nothing past the end (the outro read 90–91 s of a 90 s song). Pure (tested). */
export function settleSections<T extends { from: number; to: number; text?: string; lineTimes?: Array<{ from: number; to: number }> }>(sections: T[], duration: number): T[] {
  let last = 0;
  const lined = sections.map((s) => {
    if (!s.lineTimes?.length) return s;
    const lineTimes = s.lineTimes.map((l) => { const from = Math.max(l.from, last); const to = Math.min(duration, Math.max(l.to, from + 0.3)); last = to; return { ...l, from: Number(from.toFixed(3)), to: Number(to.toFixed(3)) }; });
    return { ...s, lineTimes, from: lineTimes[0].from, to: lineTimes[lineTimes.length - 1].to };
  });
  // the boundaries: a sung section starts at its first line (whole seconds, never before the previous boundary); the
  // gap before it belongs to the wordless section before it when there is one, else to the sung one
  const bounds: number[] = [0];
  for (let i = 1; i < lined.length; i++) {
    const s = lined[i]; const prev = lined[i - 1];
    const sung = Boolean(s.lineTimes?.length); const prevSung = Boolean(prev.lineTimes?.length);
    const at = sung ? Math.floor(s.from) : prevSung ? Math.ceil(prev.to) : s.from;
    bounds.push(Math.min(duration, Math.max(bounds[i - 1], at)));
  }
  bounds.push(duration);
  return lined.map((s, i) => ({ ...s, from: bounds[i], to: Math.max(bounds[i], bounds[i + 1]) }));
}

/** Place the written lines on the real vocal: transcribe the vocal stem with word timings and align each line
 *  (fuzzy, monotone). Sections whose lines mostly aligned take their sung extent; every section keeps per-line
 *  times for cues and shot windows. Best effort: a song without an alignment keeps its even spread. */
export async function alignSongLyrics(ctx: Parameters<Handler>[0], productionId: string, vocalsAssetId: string): Promise<{ lines: number; aligned: number } | undefined> {
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  const vocals = state.assets.find((x) => x.id === vocalsAssetId);
  if (!p?.song || !vocals) return undefined;
  await ctx.progress('POSTPROCESSING', { phase: 'aligning', message: 'Placing the lyrics on the vocal track', percent: null });
  try {
    const file = fileFor({ storage: 'LIBRARY', path: String(vocals.provenance?.path ?? '') });
    const asr = { file, language: p.language === 'AR' ? ('ar' as const) : ('en' as const) };
    // 1) Whisper large-v3 on the vocal stem + the fuzzy monotone match: where each section is sung (robust to
    //    mis-heard words); 2) WhisperX-style forced alignment of the KNOWN lyrics (asr /align, wav2vec2 CTC) inside each
    //    section's window: word-accurate line times. A line the forced aligner cannot place keeps the transcript time.
    const { t, forced } = await ctx.gpu('ASR', 4000, async () => {
      const t = await ctx.tool('speech.transcribe', () => transcribe(asr.file, { language: asr.language }), { label: 'vocal stem', input: asr });
      const words = t.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
      const out = await ctx.tool('lyrics.align', async () => alignLyrics(p.song!.sections, words, p.language), { input: { sections: p.song!.sections, words, language: p.language } });
      const forced = new Map<string, Array<{ from: number; to: number; aligned: number; total: number } | undefined>>();
      for (const sec of p.song!.sections) {
        const text = (asr.language === 'ar' ? sec.textAr || sec.text : sec.text) || '';
        const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (!lines.length) continue;
        const mine = out.filter((l) => l.sectionId === sec.id);
        const lo = Math.max(0, Math.min(sec.from, ...mine.filter((l) => l.method === 'ALIGNED').map((l) => l.from)) - 1.5);
        const hi = Math.max(sec.to, ...mine.filter((l) => l.method === 'ALIGNED').map((l) => l.to)) + 1.5;
        if (hi - lo > 175) continue; // one /align call covers at most 180 s
        const r = await alignScript(file, lines.join('\n'), asr.language, { start: lo, end: hi });
        if (isQaUnavailable(r)) { await ctx.event('warn', `forced alignment of section ${sec.id} not available: ${r.reason}`); continue; }
        forced.set(sec.id, linesFromForcedAlignment(lines, r.words, scriptWords));
      }
      return { t: { ...t, out }, forced };
    }, { jobId: ctx.job.id });
    const out = t.out;
    const sections = p.song.sections.map((sec) => {
      const mine = out.filter((l) => l.sectionId === sec.id).sort((x, y) => x.index - y.index);
      if (!mine.length) return sec;
      const ctc = forced.get(sec.id) ?? [];
      // the forced aligner refines a line the transcript placed, never moves it: it is held to its window and reports
      // full confidence even where the window was wrong (Harbour Lights: the bridge placed 5 s early), so a CTC time
      // more than 2 s from the heard one is set aside
      const timed = mine.map((l) => { const c0 = ctc[l.index]; const c = c0 && (l.method !== 'ALIGNED' || Math.abs(c0.from - l.from) <= 2) ? c0 : undefined; return c ? { ...l, from: c.from, to: c.to, method: 'ALIGNED' as const, confidence: c.aligned / c.total, source: 'CTC' as const } : { ...l, source: l.method === 'ALIGNED' ? ('TRANSCRIPT' as const) : undefined }; });
      const alignedOnes = timed.filter((l) => l.method === 'ALIGNED');
      const extent = alignedOnes.length * 2 >= timed.length ? { from: Math.min(sec.from, Math.floor(alignedOnes[0].from)), to: Math.max(sec.to, Math.ceil(alignedOnes[alignedOnes.length - 1].to)) } : {};
      return { ...sec, ...extent, lineTimes: timed.map((l) => ({ index: l.index, from: Number(l.from.toFixed(3)), to: Number(l.to.toFixed(3)), method: l.method, confidence: Number(l.confidence.toFixed(2)), ...(l.source ? { source: l.source } : {}) })) };
    });
    await command('updateSong', [productionId, { sections: settleSections(sections, p.song.durationSeconds) }], 'worker');
    const aligned = out.filter((l) => l.method === 'ALIGNED').length;
    const byCtc = [...forced.values()].flat().filter(Boolean).length;
    await ctx.event('info', 'lyrics aligned to the vocal track', { lines: out.length, aligned, forcedAligned: byCtc, heard: t.text.slice(0, 300) });
    await recordMetric('lyrics.aligned_ratio', out.length ? aligned / out.length : 0, 'ratio', {}, ctx.job.id);
    return { lines: out.length, aligned };
  } catch (e) { await ctx.event('warn', `lyrics not aligned: ${(e as Error).message}`); return undefined; }
}

/** Vocals and accompaniment of a song as two more assets (Demucs in the audio service). Best effort: a song without
 *  stems is still a song, and the job says why they are missing. */
export async function makeStems(ctx: Parameters<Handler>[0], productionId: string, songAssetId: string, title: string): Promise<{ vocals?: string; instrumental?: string } | undefined> {
  const { state } = await readState();
  const asset = state.assets.find((x) => x.id === songAssetId);
  if (!asset) return undefined;
  const src = assetFile(asset);
  await ctx.progress('POSTPROCESSING', { phase: 'stems', message: 'Separating vocals from the accompaniment', percent: null });
  const dir = await tmpDir('stems');
  try {
    const r = await ctx.gpu('ASR', 4000, () => ctx.tool('audio.separate_stems', () => separateStems(src, dir), { input: { file: src, outDir: dir } }), { jobId: ctx.job.id });
    const out: { vocals?: string; instrumental?: string } = {};
    for (const [key, file] of [['vocals', r.files.vocals], ['instrumental', r.files.no_vocals]] as const) {
      if (!file) continue;
      const name = `stem:${songAssetId}:${key}`;
      const earlier = await committedOutput(ctx.job.id, name);
      if (earlier) { out[key] = earlier.id; continue; }
      const { id: sid, stored } = await jobOutputs(ctx.job).adopt(name, file, { expectKind: 'AUDIO' });
      await command('addAsset', [assetFromStored(sid, stored, { label: `${title} — ${key}`, tags: ['song', 'stem', key], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: songAssetId, model: r.model, ms: r.ms, productionId } })], 'worker');
      out[key] = sid;
    }
    await command('updateSong', [productionId, { stems: out }], 'worker');
    await recordMetric('stems.ms', r.ms, 'ms', { model: r.model }, ctx.job.id);
    return out;
  } catch (e) {
    await ctx.event('warn', `stems not made: ${(e as Error).message}`);
    return undefined;
  } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { assetFile, assetFromStored, fileFor } from '@/server/media';
import { committedOutput, jobOutputs, stableSeed } from '@/server/jobs/outputs';
import { tmpDir } from '@/server/media/ffmpeg';
import { separateStems, transcribe } from '@/server/providers/speech';
import { alignLyrics, linesFromForcedAlignment } from '@/server/media/lyrics';
import { alignScript, isQaUnavailable, scriptWords } from '@/server/providers/qa-service';
import * as comfy from '@/server/providers/comfy';
import * as minimax from '@/server/providers/minimax';
import { aceStepSong, minimaxMusic3Song } from '@/server/workflows';
import { ACE_VARIANTS, type AceVariant } from '@/server/workflows/music';
import { joinLyrics, splitLyrics } from '@/domain/lyrics';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { recordHandoff, recordQaReport } from '@/server/org/runs';

/** THE SONG — written lyrics and a musical caption become a recording. Engines, in order of preference: MiniMax
 *  Music (hosted, when the account still has access), ACE-Step 1.5 XL in ComfyUI (local, MIT), MiniMax Music 3 in
 *  ComfyUI (local). MUSIC_ENGINE selects one explicitly. Section timings are spread over the real duration; the
 *  transcription service refines them later when available. */

type Engine = 'minimax-api' | 'ace-step' | 'minimax-music3';

async function pickLocalEngine(): Promise<Exclude<Engine, 'minimax-api'>> {
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'No music engine is reachable: set MINIMAX_API_KEY or start the comfyui service with ACE-Step weights.');
  const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
  if (models.some((m) => m.startsWith('acestep'))) return 'ace-step';
  if (models.some((m) => m.startsWith('minimax_music3'))) return 'minimax-music3';
  throw new StudioError('NOT_CONFIGURED', 'No music weights are downloaded yet (see docker/models: music-ace-step).');
}

/** Which ACE-Step XL variant this machine can run: XL-SFT with the 5Hz LM 4B (the production song generator) when both
 *  files are in ComfyUI's folders, else XL turbo — named as a fallback, never silently (the job warns and the song's
 *  provenance records it). MUSIC_ACE_VARIANT forces one (`xl-turbo` for a quick draft). Pure, tested. */
export function chooseAceVariant(diffusionModels: string[], textEncoders: string[], want: 'auto' | AceVariant = 'auto'): { variant: AceVariant; fallback?: string } {
  const sft = diffusionModels.includes(ACE_VARIANTS['xl-sft'].dit) && textEncoders.includes(ACE_VARIANTS['xl-sft'].lm);
  if (want === 'xl-turbo') return { variant: 'xl-turbo' };
  if (sft) return { variant: 'xl-sft' };
  const missing = [ACE_VARIANTS['xl-sft'].dit, ACE_VARIANTS['xl-sft'].lm].filter((f) => !diffusionModels.includes(f) && !textEncoders.includes(f));
  if (want === 'xl-sft') throw new StudioError('NOT_CONFIGURED', `MUSIC_ACE_VARIANT=xl-sft but ComfyUI does not have ${missing.join(' and ')} (manifest group music-ace-step-xl)`);
  return { variant: 'xl-turbo', fallback: `ACE-Step XL-SFT is not installed (${missing.join(', ')} missing: manifest group music-ace-step-xl); made with XL turbo instead` };
}

async function pickEngine(): Promise<Engine> {
  const want = env().MUSIC_ENGINE as Engine | 'auto';
  if (want !== 'auto') return want;
  if (env().MINIMAX_API_KEY) return 'minimax-api';
  return pickLocalEngine();
}

export const generateSong: Handler = async (ctx) => {
  const { productionId, instrumental } = ctx.job.payload as { productionId: string; instrumental?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (!p.song) throw new StudioError('INVALID', 'This production has no song yet: write the caption and lyrics first.');
  const song = p.song;
  const lyrics = song.lyrics?.trim() || joinLyrics(song.sections);
  if (!instrumental && !lyrics.trim()) throw new StudioError('INVALID', 'The song has no lyrics. Add lyrics or choose an instrumental.');
  const seconds = Math.min(300, Math.max(15, Math.round(song.durationSeconds || p.targetSeconds)));
  const caption = song.caption?.trim() || `${p.genre ?? 'pop'}, ${p.mood ?? ''}`.trim();
  const engine = await pickEngine();
  await ctx.progress('GENERATING', { phase: 'composing', message: `Composing with ${engine === 'minimax-api' ? 'MiniMax Music' : engine === 'ace-step' ? 'ACE-Step 1.5' : 'MiniMax Music 3'}`, percent: null });
  const t0 = Date.now();
  const dir = await tmpDir('song');
  let file: string; let model: string; let requestId: string | undefined; let workflowVersion: string | undefined;
  if (engine === 'minimax-api') {
    let r;
    try { r = await ctx.tool('music.generate', () => minimax.generateMusic({ prompt: caption, lyrics, instrumental, format: 'mp3' }), { label: 'minimax-api', input: { engine: 'minimax-api', caption, lyrics, instrumental } }); }
    catch (e) {
      // the hosted music API is closed to new accounts; say so and let the local engines take over on retry
      const m = (e as Error).message;
      if (/not available|permission|2049|1004/i.test(m) && (await comfy.health()).ok) { await ctx.event('warn', `MiniMax Music API refused (${m.slice(0, 120)}); using the local engine`); return generateSongLocal(ctx, { p, caption, lyrics, seconds, instrumental: Boolean(instrumental), language: p.language, t0 }); }
      throw e;
    }
    file = path.join(dir, `song.${r.format}`); await fsp.writeFile(file, r.bytes); model = env().MINIMAX_MUSIC_MODEL; requestId = r.traceId;
  } else {
    return generateSongLocal(ctx, { p, caption, lyrics, seconds, instrumental: Boolean(instrumental), language: p.language, t0, engine });
  }
  return finishSong(ctx, { p, file, model, requestId, workflowVersion, engine, caption, lyrics, seconds, t0, dir });
};

async function generateSongLocal(ctx: Parameters<Handler>[0], a: { p: NonNullable<Awaited<ReturnType<typeof readState>>['state']['productions'][number]>; caption: string; lyrics: string; seconds: number; instrumental: boolean; language: string; t0: number; engine?: Engine }) {
  const engine = a.engine && a.engine !== 'minimax-api' ? a.engine : await pickLocalEngine();
  // the song's seed and prompt key are the job's (audit H8, step 7): every attempt builds the same graph, and a restarted
  // attempt re-attaches to the composition it already asked for instead of composing a second one
  const seed = stableSeed(ctx.job.id, `song:${engine}`);
  // ACE-Step: XL-SFT + the 5Hz LM 4B by default; a fallback to turbo is said, not hidden
  let ace: { variant: AceVariant; fallback?: string } | undefined;
  if (engine === 'ace-step') {
    const [dms, tes] = await Promise.all([comfy.listModels('diffusion_models').catch(() => [] as string[]), comfy.listModels('text_encoders').catch(() => [] as string[])]);
    ace = chooseAceVariant(dms, tes, env().MUSIC_ACE_VARIANT);
    if (ace.fallback) await ctx.event('warn', ace.fallback, { variant: ace.variant });
  }
  const graph = engine === 'minimax-music3' ? minimaxMusic3Song({ caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental, seed }) : aceStepSong({ caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental, language: a.language === 'AR' ? 'ar' : 'en', seed, variant: ace!.variant });
  const run = await ctx.gpu('MUSIC', 20000, () => ctx.tool('music.generate', () => comfy.run(graph, { promptKey: `:song:${engine}${ace ? `:${ace.variant}` : ''}`, timeoutMs: 30 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (q) => ctx.progress('GENERATING', { phase: 'composing', message: q.queue ? `waiting behind ${q.queue} in the GPU queue` : 'composing', percent: null }) }), { label: engine, input: { engine, caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental } }), { jobId: ctx.job.id });
  const out = comfy.firstOutput(run.outputs, 'audio');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI produced no audio.');
  const dir = await tmpDir('song');
  const file = path.join(dir, out.filename);
  await fsp.writeFile(file, await comfy.view(out));
  return finishSong(ctx, { p: a.p, file, model: engine === 'minimax-music3' ? 'MiniMax-Music3 (local int8)' : `${ACE_VARIANTS[ace!.variant].label}${ace!.fallback ? ' (fallback: XL-SFT not installed)' : ''}`, requestId: run.promptId, workflowVersion: run.workflowVersion, engine, caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, t0: a.t0, dir });
}

async function finishSong(ctx: Parameters<Handler>[0], a: { p: Awaited<ReturnType<typeof readState>>['state']['productions'][number]; file: string; model: string; requestId?: string; workflowVersion?: string; engine: Engine; caption: string; lyrics: string; seconds: number; t0: number; dir: string }) {
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the recording' });
  // the song's asset id is the job's (step 6/7): a retry that finds it recorded reuses it instead of a second copy
  const earlier = await committedOutput(ctx.job.id, 'song');
  let id: string; let duration: number;
  if (earlier) {
    id = earlier.id; duration = earlier.durationSeconds ?? a.seconds;
    await fsp.rm(a.dir, { recursive: true, force: true }).catch(() => {});
    await ctx.event('info', `the song was already recorded by an earlier attempt of this job (${id}); reused`, { assetId: id });
  } else {
    const st = await jobOutputs(ctx.job).adopt('song', a.file, { expectKind: 'AUDIO' });
    id = st.id; const stored = st.stored;
    await fsp.rm(a.dir, { recursive: true, force: true }).catch(() => {});
    duration = stored.probe?.durationSeconds ?? a.seconds;
    await command('addAsset', [assetFromStored(id, stored, { label: `${a.p.song?.title ?? a.p.title} — song`, tags: ['song', a.engine], origin: 'GENERATED', jobId: ctx.job.id, provenance: { provider: a.engine.startsWith('minimax') ? 'MINIMAX' : 'ACE-STEP', model: a.model, requestId: a.requestId, caption: a.caption, lyrics: a.lyrics, workflowVersion: a.workflowVersion, productionId: a.p.id } })], 'worker');
  }
  const genMs = Date.now() - a.t0;
  // re-time the sections over the real duration, keeping singer assignments
  const fresh = (await readState()).state.productions.find((x) => x.id === a.p.id)!;
  const singers = fresh.song?.singerIds ?? castOf((await readState()).state, fresh).map((c) => c.id);
  const old = fresh.song?.sections ?? [];
  const sections = (old.length ? old : splitLyrics(a.lyrics, duration).map((s) => ({ ...s, singerIds: singers }))).map((s, i, arr) => ({ ...s, from: Math.round((i / arr.length) * duration), to: Math.round(((i + 1) / arr.length) * duration) }));
  await command('updateSong', [a.p.id, { source: 'GENERATED', assetId: id, durationSeconds: Math.round(duration), lyrics: a.lyrics, caption: a.caption, provider: a.engine, model: a.model, requestId: a.requestId, jobId: ctx.job.id, sections }], 'worker');
  await recordMetric('song.generation_ms', genMs, 'ms', { engine: a.engine, seconds: Math.round(duration) }, ctx.job.id);
  const stems = await makeStems(ctx, a.p.id, id, `${a.p.song?.title ?? a.p.title}`);
  const aligned = stems?.vocals ? await alignSongLyrics(ctx, a.p.id, stems.vocals) : undefined;
  // the song is handed to Video Production with its proof: a recording of the right length, stems, and lyrics heard
  // SONG CHECK (the Audio Synchronization Inspector's step): the length as planned, the stems, the lyrics heard
  const { alignedRatio, lengthOk } = await step(ctx, 'audio-sync-inspector', `song-check: “${a.p.song?.title ?? a.p.title}”`, async () => {
    const alignedRatio = aligned && aligned.lines ? aligned.aligned / aligned.lines : 0;
    const lengthOk = Math.abs(duration - a.seconds) <= Math.max(5, a.seconds * 0.15);
    await recordQaReport({ productionId: a.p.id, subjectKind: 'SONG', subjectId: id, inspectorId: 'audio-sync-inspector', checks: [{ name: 'duration-as-planned', ok: lengthOk, value: Number(duration.toFixed(1)), threshold: a.seconds }, { name: 'stems-separated', ok: Boolean(stems?.vocals), detail: stems ? 'vocals + accompaniment' : 'no stems' }, { name: 'lyrics-heard-in-vocal', ok: alignedRatio >= 0.5, value: Number(alignedRatio.toFixed(2)), threshold: 0.5, detail: aligned ? `${aligned.aligned} of ${aligned.lines} lines placed` : 'not aligned' }], decision: lengthOk && alignedRatio >= 0.5 ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [id, ...(stems?.vocals ? [stems.vocals] : [])], jobId: ctx.job.id, failureClass: lengthOk ? undefined : 'WRONG_PARAMETERS' });
    return { alignedRatio, lengthOk };
  });
  await recordHandoff({ productionId: a.p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: [id, ...(stems ? Object.values(stems).filter((x): x is string => Boolean(x)) : [])], outputVersions: { song: id, seconds: Math.round(duration) }, validation: { ok: lengthOk && Boolean(stems?.vocals), checks: [{ name: 'song-recorded', ok: true, detail: `${a.model}, ${Math.round(duration)} s` }, { name: 'duration-as-planned', ok: lengthOk }, { name: 'stems-separated', ok: Boolean(stems?.vocals) }, { name: 'lyrics-aligned', ok: alignedRatio >= 0.5, detail: `${Math.round(alignedRatio * 100)} % of the lines placed on the vocal` }] }, jobId: ctx.job.id });
  await ctx.activity('SONG_COMPOSED', `“${a.p.song?.title ?? a.p.title}” composed with ${a.model} (${Math.round(duration)} s)${aligned ? `; ${aligned.aligned} of ${aligned.lines} lyric lines placed on the vocal` : ''}`, { assetId: id, engine: a.engine, seconds: Math.round(duration), aligned });
  return { assetId: id, durationSeconds: duration, engine: a.engine, model: a.model, generationMs: genMs, stems, aligned, awaitingReview: !(lengthOk && alignedRatio >= 0.5) };
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
      const timed = mine.map((l) => { const c = ctc[l.index]; return c ? { ...l, from: c.from, to: c.to, method: 'ALIGNED' as const, confidence: c.aligned / c.total, source: 'CTC' as const } : { ...l, source: l.method === 'ALIGNED' ? ('TRANSCRIPT' as const) : undefined }; });
      const alignedOnes = timed.filter((l) => l.method === 'ALIGNED');
      const extent = alignedOnes.length * 2 >= timed.length ? { from: Math.min(sec.from, Math.floor(alignedOnes[0].from)), to: Math.max(sec.to, Math.ceil(alignedOnes[alignedOnes.length - 1].to)) } : {};
      return { ...sec, ...extent, lineTimes: timed.map((l) => ({ index: l.index, from: Number(l.from.toFixed(3)), to: Number(l.to.toFixed(3)), method: l.method, confidence: Number(l.confidence.toFixed(2)), ...(l.source ? { source: l.source } : {}) })) };
    });
    // sections must stay in order without overlap after taking their sung extents
    for (let i = 1; i < sections.length; i++) if (sections[i].from < sections[i - 1].to) sections[i] = { ...sections[i], from: sections[i - 1].to, to: Math.max(sections[i].to, sections[i - 1].to + 1) };
    await command('updateSong', [productionId, { sections }], 'worker');
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

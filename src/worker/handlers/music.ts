import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { separateStems } from '@/server/providers/speech';
import * as comfy from '@/server/providers/comfy';
import * as minimax from '@/server/providers/minimax';
import { aceStepSong, minimaxMusic3Song } from '@/server/workflows';
import { joinLyrics, splitLyrics } from '@/domain/lyrics';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';

/** THE SONG — written lyrics and a musical caption become a recording. Engines, in order of preference: MiniMax
 *  Music (hosted, when the account still has access), ACE-Step 1.5 XL in ComfyUI (local, MIT), MiniMax Music 3 in
 *  ComfyUI (local). MUSIC_ENGINE selects one explicitly. Section timings are spread over the real duration; the
 *  transcription service refines them later when available. */

type Engine = 'minimax-api' | 'ace-step' | 'minimax-music3';

async function pickEngine(): Promise<Engine> {
  const want = (process.env.MUSIC_ENGINE ?? 'auto').toLowerCase() as Engine | 'auto';
  if (want !== 'auto') return want;
  if (env().MINIMAX_API_KEY) return 'minimax-api';
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'No music engine is reachable: set MINIMAX_API_KEY or start the comfyui service with ACE-Step weights.');
  const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
  if (models.some((m) => m.startsWith('acestep'))) return 'ace-step';
  if (models.some((m) => m.startsWith('minimax_music3'))) return 'minimax-music3';
  throw new StudioError('NOT_CONFIGURED', 'No music weights are downloaded yet (see docker/models: music-ace-step).');
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
    try { r = await minimax.generateMusic({ prompt: caption, lyrics, instrumental, format: 'mp3' }); }
    catch (e) {
      // the hosted music API is closed to new accounts; say so and let the local engines take over on retry
      const m = (e as Error).message;
      if (/not available|permission|2049|1004/i.test(m) && (await comfy.health()).ok) { await ctx.event('warn', `MiniMax Music API refused (${m.slice(0, 120)}); using the local engine`); process.env.MUSIC_ENGINE = process.env.MUSIC_ENGINE ?? 'auto'; return generateSongLocal(ctx, { p, caption, lyrics, seconds, instrumental: Boolean(instrumental), language: p.language, t0 }); }
      throw e;
    }
    file = path.join(dir, `song.${r.format}`); await fsp.writeFile(file, r.bytes); model = env().MINIMAX_MUSIC_MODEL; requestId = r.traceId;
  } else {
    return generateSongLocal(ctx, { p, caption, lyrics, seconds, instrumental: Boolean(instrumental), language: p.language, t0, engine });
  }
  return finishSong(ctx, { p, file, model, requestId, workflowVersion, engine, caption, lyrics, seconds, t0, dir });
};

async function generateSongLocal(ctx: Parameters<Handler>[0], a: { p: NonNullable<Awaited<ReturnType<typeof readState>>['state']['productions'][number]>; caption: string; lyrics: string; seconds: number; instrumental: boolean; language: string; t0: number; engine?: Engine }) {
  const engine = a.engine ?? (await pickEngine());
  const graph = engine === 'minimax-music3' ? minimaxMusic3Song({ caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental }) : aceStepSong({ caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, instrumental: a.instrumental, language: a.language === 'AR' ? 'ar' : 'en' });
  const run = await ctx.gpu('MUSIC', 20000, () => comfy.run(graph, { timeoutMs: 30 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (q) => ctx.progress('GENERATING', { phase: 'composing', message: q.queue ? `waiting behind ${q.queue} in the GPU queue` : 'composing', percent: null }) }), { jobId: ctx.job.id });
  const out = comfy.firstOutput(run.outputs, 'audio');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI produced no audio.');
  const dir = await tmpDir('song');
  const file = path.join(dir, out.filename);
  await fsp.writeFile(file, await comfy.view(out));
  return finishSong(ctx, { p: a.p, file, model: engine === 'minimax-music3' ? 'MiniMax-Music3 (local int8)' : 'ACE-Step 1.5 XL turbo', requestId: run.promptId, workflowVersion: run.workflowVersion, engine, caption: a.caption, lyrics: a.lyrics, seconds: a.seconds, t0: a.t0, dir });
}

async function finishSong(ctx: Parameters<Handler>[0], a: { p: Awaited<ReturnType<typeof readState>>['state']['productions'][number]; file: string; model: string; requestId?: string; workflowVersion?: string; engine: Engine; caption: string; lyrics: string; seconds: number; t0: number; dir: string }) {
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the recording' });
  const id = nid('gen');
  const stored = await adoptFile(id, a.file, { expectKind: 'AUDIO' });
  await fsp.rm(a.dir, { recursive: true, force: true }).catch(() => {});
  const duration = stored.probe?.durationSeconds ?? a.seconds;
  const genMs = Date.now() - a.t0;
  await command('addAsset', [assetFromStored(id, stored, { label: `${a.p.song?.title ?? a.p.title} — song`, tags: ['song', a.engine], origin: 'GENERATED', jobId: ctx.job.id, provenance: { provider: a.engine.startsWith('minimax') ? 'MINIMAX' : 'ACE-STEP', model: a.model, requestId: a.requestId, caption: a.caption, lyrics: a.lyrics, workflowVersion: a.workflowVersion, productionId: a.p.id } })], 'worker');
  // re-time the sections over the real duration, keeping singer assignments
  const fresh = (await readState()).state.productions.find((x) => x.id === a.p.id)!;
  const singers = fresh.song?.singerIds ?? castOf((await readState()).state, fresh).map((c) => c.id);
  const old = fresh.song?.sections ?? [];
  const sections = (old.length ? old : splitLyrics(a.lyrics, duration).map((s) => ({ ...s, singerIds: singers }))).map((s, i, arr) => ({ ...s, from: Math.round((i / arr.length) * duration), to: Math.round(((i + 1) / arr.length) * duration) }));
  await command('updateSong', [a.p.id, { source: 'GENERATED', assetId: id, durationSeconds: Math.round(duration), lyrics: a.lyrics, caption: a.caption, provider: a.engine, model: a.model, requestId: a.requestId, jobId: ctx.job.id, sections }], 'worker');
  await recordMetric('song.generation_ms', genMs, 'ms', { engine: a.engine, seconds: Math.round(duration) }, ctx.job.id);
  const stems = await makeStems(ctx, a.p.id, id, `${a.p.song?.title ?? a.p.title}`);
  return { assetId: id, durationSeconds: duration, engine: a.engine, model: a.model, generationMs: genMs, stems };
}

/** Vocals and accompaniment of a song as two more assets (Demucs in the audio service). Best effort: a song without
 *  stems is still a song, and the job says why they are missing. */
export async function makeStems(ctx: Parameters<Handler>[0], productionId: string, songAssetId: string, title: string): Promise<{ vocals?: string; instrumental?: string } | undefined> {
  const { state } = await readState();
  const asset = state.assets.find((x) => x.id === songAssetId);
  if (!asset) return undefined;
  const src = fileFor({ storage: asset.sample ? 'PUBLIC' : 'LIBRARY', path: asset.sample ? asset.src.replace(/^\/+/, '') : String(asset.provenance?.path ?? '') });
  await ctx.progress('POSTPROCESSING', { phase: 'stems', message: 'Separating vocals from the accompaniment', percent: null });
  const dir = await tmpDir('stems');
  try {
    const r = await ctx.gpu('ASR', 4000, () => separateStems(src, dir), { jobId: ctx.job.id });
    const out: { vocals?: string; instrumental?: string } = {};
    for (const [key, file] of [['vocals', r.files.vocals], ['instrumental', r.files.no_vocals]] as const) {
      if (!file) continue;
      const sid = nid('gen');
      const stored = await adoptFile(sid, file, { expectKind: 'AUDIO' });
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

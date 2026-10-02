import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { log } from '../log';
import * as minimax from './minimax';
import * as comfy from './comfy';
import { minimaxH3Video } from '../workflows';
import { tmpDir } from '../media/ffmpeg';

/** VIDEO = MINIMAX, two ways to run it. `api`: the hosted MiniMax H3 on platform.minimax.io. `local`: the
 *  open-weights MiniMax H3 in ComfyUI on this machine's RTX 5090. Same request shape, same result shape, same
 *  provenance fields; the backend is chosen by VIDEO_BACKEND (auto = api when a key exists, otherwise local). There
 *  is no third option and no fallback to another model family. */

export type VideoBackend = 'api' | 'local';

export interface VideoRequest {
  prompt: string;
  seconds: number;
  width: number; height: number; aspect: string;
  firstFrame?: { file: string; mime: string };
  lastFrame?: { file: string; mime: string };
  referenceImages?: Array<{ file: string; mime: string }>;
  referenceAudio?: Array<{ file: string }>;
  seed?: number;
  model?: string; resolution?: string;
  /** Called with provider status while waiting. */
  onStatus?: (s: { status: string; queue?: number; detail?: string }) => Promise<void> | void;
  shouldStop?: () => Promise<boolean> | boolean;
  /** For resuming: a hosted task id that was already created by a previous attempt. */
  resumeTaskId?: string;
  onTaskCreated?: (taskId: string) => Promise<void> | void;
}

export interface VideoResult { file: string; backend: VideoBackend; model: string; requestId: string; resolution: string; seconds: number; costUsd?: number; ms: number; workflowVersion?: string; params: Record<string, unknown> }

export function chooseBackend(): VideoBackend {
  const want = env().VIDEO_BACKEND;
  if (want === 'api') { if (!env().MINIMAX_API_KEY) throw new StudioError('NOT_CONFIGURED', 'VIDEO_BACKEND=api but MINIMAX_API_KEY is not set.'); return 'api'; }
  if (want === 'local') return 'local';
  return env().MINIMAX_API_KEY ? 'api' : 'local';
}

const RATIOS: Record<string, string> = { WIDE_16_9: '16:9', VERTICAL_9_16: '9:16', SQUARE_1_1: '1:1', CINEMA_2_39: '21:9' };

export async function generateVideo(req: VideoRequest): Promise<VideoResult> {
  const backend = chooseBackend();
  const t0 = Date.now();
  if (backend === 'api') {
    const e = env();
    const model = req.model ?? e.MINIMAX_VIDEO_MODEL;
    const resolution = req.resolution ?? e.MINIMAX_VIDEO_RESOLUTION;
    const seconds = Math.min(15, Math.max(4, Math.round(req.seconds)));
    const content: minimax.VideoContentItem[] = [{ type: 'text', text: req.prompt }];
    const useRefs = (req.referenceImages?.length ?? 0) > 0 || (req.referenceAudio?.length ?? 0) > 0;
    let ratio: string | undefined;
    if (useRefs) {
      for (const r of req.referenceImages ?? []) content.push({ type: 'image_url', image_url: { url: await minimax.dataUri(r.file, r.mime) }, role: 'reference_image' });
      for (const a of req.referenceAudio ?? []) content.push({ type: 'audio_url', audio_url: { url: await minimax.dataUri(a.file, 'audio/wav') }, role: 'reference_audio' });
      ratio = RATIOS[req.aspect] ?? '16:9';
    } else if (req.firstFrame || req.lastFrame) {
      if (req.firstFrame) content.push({ type: 'image_url', image_url: { url: await minimax.dataUri(req.firstFrame.file, req.firstFrame.mime) }, role: 'first_frame' });
      if (req.lastFrame) content.push({ type: 'image_url', image_url: { url: await minimax.dataUri(req.lastFrame.file, req.lastFrame.mime) }, role: 'last_frame' });
      ratio = 'adaptive';
    } else ratio = RATIOS[req.aspect] ?? '16:9';
    let taskId = req.resumeTaskId;
    if (!taskId) {
      const created = await minimax.createVideo({ model, content, resolution, duration: seconds, ratio });
      taskId = created.taskId;
      await req.onTaskCreated?.(taskId);
      log.info({ taskId, model, resolution, seconds, refs: req.referenceImages?.length ?? 0 }, 'minimax video task created');
    } else log.info({ taskId }, 'resuming minimax video task');
    let task: Awaited<ReturnType<typeof minimax.waitForVideo>>;
    try {
      task = await minimax.waitForVideo(taskId, { shouldStop: req.shouldStop, onTick: (t) => req.onStatus?.({ status: t.status }) });
    } catch (e) {
      // the producer cancelled while MiniMax was still working: tell MiniMax so a queued task is not billed
      if (e instanceof StudioError && e.code === 'CONFLICT' && e.message === 'cancelled') {
        const r = await minimax.cancelVideo(taskId).catch((err: Error) => ({ action: `cancel failed: ${err.message}` }));
        log.info({ taskId, action: r.action }, 'minimax video task cancelled by the producer');
      }
      throw e;
    }
    const dir = await tmpDir('mmx');
    const file = path.join(dir, `${taskId}.mp4`);
    await req.onStatus?.({ status: 'downloading' });
    await minimax.download(task.url!, file);
    return { file, backend, model, requestId: taskId, resolution: task.resolution ?? resolution, seconds: task.duration ?? seconds, costUsd: minimax.estimateVideoCostUsd(model, task.resolution ?? resolution, task.duration ?? seconds, (req.referenceImages?.length ?? 0) + (req.firstFrame ? 1 : 0) + (req.lastFrame ? 1 : 0)), ms: Date.now() - t0, params: { ratio, content: content.map((c) => ({ type: c.type, role: c.role })), usage: task.usage } };
  }
  // local: ComfyUI MiniMax H3
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'The local MiniMax H3 engine (ComfyUI) is not reachable. Start the comfyui service or set MINIMAX_API_KEY for the hosted API.');
  const first = req.firstFrame ? await comfy.uploadInput(req.firstFrame.file) : undefined;
  const last = req.lastFrame ? await comfy.uploadInput(req.lastFrame.file) : undefined;
  const refs = req.referenceImages?.length ? await Promise.all(req.referenceImages.map((r) => comfy.uploadInput(r.file))) : undefined;
  const audio = req.referenceAudio?.length ? await Promise.all(req.referenceAudio.map((a) => comfy.uploadInput(a.file))) : undefined;
  const graph = minimaxH3Video({ prompt: req.prompt, width: req.width, height: req.height, seconds: Math.min(15, Math.max(4, req.seconds)), seed: req.seed, firstFrame: first, lastFrame: last, referenceImages: refs, referenceAudio: audio, filenamePrefix: 'vewbox/h3' });
  await req.onStatus?.({ status: 'queued' });
  const run = await comfy.run(graph, { timeoutMs: 90 * 60_000, shouldStop: req.shouldStop, onProgress: (p) => req.onStatus?.({ status: p.queue && p.queue > 0 ? 'queued' : 'generating', queue: p.queue }) });
  const out = comfy.firstOutput(run.outputs, 'video') ?? comfy.firstOutput(run.outputs, 'gifs') ?? comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI produced no video output for the MiniMax H3 workflow.');
  const bytes = await comfy.view(out);
  const dir = await tmpDir('h3');
  const file = path.join(dir, out.filename.endsWith('.mp4') ? out.filename : `${out.filename}.mp4`);
  await fsp.writeFile(file, bytes);
  return { file, backend, model: 'MiniMax-H3 (local, pruned int8)', requestId: run.promptId, resolution: `${req.width}x${req.height}`, seconds: req.seconds, ms: Date.now() - t0, workflowVersion: run.workflowVersion, params: { graphNodes: Object.keys(graph).length, first: Boolean(first), last: Boolean(last), refs: refs?.length ?? 0 } };
}

export async function videoBackendStatus(): Promise<{ backend: VideoBackend | null; ready: boolean; detail: string }> {
  try {
    const b = chooseBackend();
    if (b === 'api') return { backend: b, ready: true, detail: `hosted MiniMax ${env().MINIMAX_VIDEO_MODEL} @ ${env().MINIMAX_VIDEO_RESOLUTION}` };
    const h = await comfy.health();
    if (!h.ok) return { backend: b, ready: false, detail: 'ComfyUI not reachable' };
    const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
    const has = models.some((m) => m.includes('minimax_h3_fl2va'));
    return { backend: b, ready: has, detail: has ? `local MiniMax H3 in ComfyUI ${h.version ?? ''} on ${h.device ?? 'GPU'}` : 'MiniMax H3 weights not downloaded yet' };
  } catch (e) { return { backend: null, ready: false, detail: (e as Error).message }; }
}

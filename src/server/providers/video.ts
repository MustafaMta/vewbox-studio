import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { log } from '../log';
import * as minimax from './minimax';
import * as comfy from './comfy';
import { H3_FPS, h3FrameCount, h3GraphKind, minimaxH3Video } from '../workflows';
import { tmpDir } from '../media/ffmpeg';
import { libraryRoot } from '../media';
import { cachedEngineReadiness, graphRequirements, storageReadiness } from '../production/readiness';
import { jobScope } from '../jobs/context';
import { preserveFailedOutput, rejectTaskOutput, rejectedTaskIds, videoProblem } from '../jobs/evidence';

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
  /** local engine only: media anchored on the clip's timeline (the recorded line or song stretch, the previous shot's
   *  tail with its own sound). The hosted API has no anchored guides: a request carrying any is REFUSED there, never
   *  silently dropped — the take handler lowers a hosted request first (docs/research/MINIMAX-CONTINUITY.md §3.8). */
  guides?: Array<{ frameIdx: number; imageFile?: string; imageIsVideo?: boolean; audioFile?: string; /** anchor the guide video's own soundtrack with its frames */ audioFromVideo?: boolean }>;
  /** how the shot's plan was lowered for this backend (recorded in provenance), e.g. "hosted continuation: last frame as first frame" */
  lowering?: string;
  seed?: number;
  model?: string; resolution?: string;
  /** Called with provider status while waiting. */
  onStatus?: (s: { status: string; queue?: number; detail?: string }) => Promise<void> | void;
  shouldStop?: () => Promise<boolean> | boolean;
  /** For resuming: a hosted task id that was already created by a previous attempt. */
  resumeTaskId?: string;
  onTaskCreated?: (taskId: string) => Promise<void> | void;
}

export interface VideoResult { file: string; backend: VideoBackend; model: string; requestId: string; resolution: string; seconds: number; costUsd?: number; ms: number; /** the engine's own generation time, without queueing (local backend) */ engineMs?: number; workflowVersion?: string; /** an earlier attempt's engine run was adopted (a worker restart): `ms` then counts only the wait after adoption */ resumed?: boolean; params: Record<string, unknown> }

export function chooseBackend(): VideoBackend {
  const want = env().VIDEO_BACKEND;
  if (want === 'api') { if (!env().MINIMAX_API_KEY) throw new StudioError('NOT_CONFIGURED', 'VIDEO_BACKEND=api but MINIMAX_API_KEY is not set.'); return 'api'; }
  if (want === 'local') return 'local';
  return env().MINIMAX_API_KEY ? 'api' : 'local';
}

const RATIOS: Record<string, string> = { WIDE_16_9: '16:9', VERTICAL_9_16: '9:16', SQUARE_1_1: '1:1', CINEMA_2_39: '21:9' };
/** the H3 checkpoint this process last ran on the local engine */
let lastH3Checkpoint: string | undefined;

/** Why the hosted MiniMax API cannot run this request as asked, or null. The platform has no anchored guides and
 *  forbids mixing frame roles (first/last frame) with reference roles (pictures, audio); reference audio needs a
 *  reference picture or video; at most 9 pictures and 3 audios (platform.minimax.io /v2/video_generation). Nothing is
 *  dropped to make a request fit: the caller lowers it (take.ts) or runs it on the local engine. */
export function hostedVideoProblem(req: Pick<VideoRequest, 'guides' | 'firstFrame' | 'lastFrame' | 'referenceImages' | 'referenceAudio'>): string | null {
  if (req.guides?.length) return `the hosted MiniMax API has no anchored guides (${req.guides.length} given: ${req.guides.map((g) => (g.imageIsVideo ? 'clip' : g.imageFile ? 'frame' : 'audio') + `@${g.frameIdx}`).join(', ')}); lower the request (a continuation starts from the previous take's last frame) or run it on the local engine`;
  const frames = Boolean(req.firstFrame || req.lastFrame);
  const refs = (req.referenceImages?.length ?? 0) + (req.referenceAudio?.length ?? 0) > 0;
  if (frames && refs) return 'the hosted MiniMax API cannot mix a first/last frame with reference pictures or audio; send one or the other';
  if ((req.referenceAudio?.length ?? 0) > 0 && !(req.referenceImages?.length ?? 0)) return 'hosted reference audio needs a reference picture';
  if ((req.referenceImages?.length ?? 0) > 9) return `${req.referenceImages!.length} reference pictures (hosted limit 9)`;
  if ((req.referenceAudio?.length ?? 0) > 3) return `${req.referenceAudio!.length} reference audios (hosted limit 3)`;
  return null;
}

/** THE ENGINE'S OUTPUT IS INSPECTED BEFORE IT IS USED (directive §26 "corrupted output"): zero bytes, a truncated or
 *  undecodable clip is fetched once more (a transfer cut short), and if it is still unusable it is kept as evidence,
 *  its task is marked rejected (a later attempt generates again instead of adopting it), and the attempt fails as
 *  OUTPUT_CORRUPTION — never passed on for a later step to misreport as an invalid input. */
async function acceptOutput(file: string, taskId: string, name: string, refetch: () => Promise<unknown>, engine: string): Promise<void> {
  let bad = await videoProblem(file);
  if (bad) {
    log.warn({ taskId, problem: bad }, 'engine output unusable; fetching it once more');
    await refetch();
    bad = await videoProblem(file);
  }
  if (!bad) return;
  const evidence = await preserveFailedOutput(name, { file });
  await rejectTaskOutput(taskId, bad, evidence);
  throw Object.assign(new StudioError('PROVIDER', `The ${engine} output for task ${taskId} is unusable: ${bad}.`, { taskId, evidence, problem: bad }), { failureClass: 'OUTPUT_CORRUPTION' });
}

export async function generateVideo(req: VideoRequest): Promise<VideoResult> {
  const backend = chooseBackend();
  const t0 = Date.now();
  const jobId = jobScope()?.jobId;
  const rejected = jobId ? await rejectedTaskIds(jobId) : [];
  if (backend === 'api') {
    const problem = hostedVideoProblem(req);
    if (problem) throw new StudioError('NOT_CONFIGURED', `Unsupported on the hosted MiniMax API: ${problem}.`, { failureClass: 'UNSUPPORTED_CAPABILITY', backend: 'api' });
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
    // a task whose output an earlier attempt rejected as corrupt is never adopted again (src/server/jobs/evidence.ts)
    let taskId = req.resumeTaskId && !rejected.includes(req.resumeTaskId) ? req.resumeTaskId : undefined;
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
    await acceptOutput(file, taskId, `${taskId}.mp4`, () => minimax.download(task.url!, file), 'hosted MiniMax');
    return { file, backend, model, requestId: taskId, resumed: Boolean(req.resumeTaskId && req.resumeTaskId === taskId), resolution: task.resolution ?? resolution, seconds: task.duration ?? seconds, costUsd: minimax.estimateVideoCostUsd(model, task.resolution ?? resolution, task.duration ?? seconds, (req.referenceImages?.length ?? 0) + (req.firstFrame ? 1 : 0) + (req.lastFrame ? 1 : 0)), ms: Date.now() - t0, params: { ratio, content: content.map((c) => ({ type: c.type, role: c.role })), usage: task.usage, ...(req.lowering ? { lowering: req.lowering } : {}) } };
  }
  // local: ComfyUI MiniMax H3
  // an engine that is restarting is waited for (up to COMFY_START_WAIT_MS, default 3 min) before the attempt fails
  const h = await comfy.healthWithin(Number(process.env.COMFY_START_WAIT_MS ?? 180_000));
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'The local MiniMax H3 engine (ComfyUI) is not reachable. Start the comfyui service or set MINIMAX_API_KEY for the hosted API.');
  const first = req.firstFrame ? await comfy.uploadInput(req.firstFrame.file) : undefined;
  const last = req.lastFrame ? await comfy.uploadInput(req.lastFrame.file) : undefined;
  const refs = req.referenceImages?.length ? await Promise.all(req.referenceImages.map((r) => comfy.uploadInput(r.file))) : undefined;
  const audio = req.referenceAudio?.length ? await Promise.all(req.referenceAudio.map((a) => comfy.uploadInput(a.file))) : undefined;
  const guides = req.guides?.length ? await Promise.all(req.guides.map(async (gd) => ({ frameIdx: gd.frameIdx, image: gd.imageFile ? await comfy.uploadInput(gd.imageFile) : undefined, imageIsVideo: gd.imageIsVideo, audio: gd.audioFile ? await comfy.uploadInput(gd.audioFile) : undefined, audioFromVideo: gd.audioFromVideo }))) : undefined;
  const graph = minimaxH3Video({ prompt: req.prompt, width: req.width, height: req.height, seconds: Math.min(15, Math.max(1, req.seconds)), seed: req.seed, firstFrame: first, lastFrame: last, referenceImages: refs, referenceAudio: audio, guides, filenamePrefix: 'vewbox/h3' });
  const graphKind = h3GraphKind({ referenceImages: refs, referenceAudio: audio });
  // FIRST-ATTEMPT RELIABILITY (src/server/production/readiness.ts): the node classes and model files THIS graph names
  // are present, and the library has room for the take — before the engine is asked (not when adopting a run)
  const resumeId = req.resumeTaskId && !rejected.includes(req.resumeTaskId) ? req.resumeTaskId : undefined;
  if (!resumeId) {
    const ready = await cachedEngineReadiness(graphRequirements(graph as never));
    if (!ready.ok) throw Object.assign(new StudioError('UNAVAILABLE', `The local MiniMax H3 engine is not ready: ${ready.detail}`, { readiness: ready }), { failureClass: 'INFRASTRUCTURE' });
    const room = await storageReadiness(libraryRoot());
    if (!room.ok) throw Object.assign(new StudioError('UNAVAILABLE', `No room for the take: ${room.detail}`, { storage: room }), { failureClass: 'RESOURCE_EXHAUSTION' });
  }
  // FL2VA and Ref2VA are separate 19.5 GB checkpoints next to a 14.6 GB text encoder: switching between them with both
  // held in host RAM got ComfyUI OOM-killed (exit 137, 2026-10-03, docs/evidence/minimax-p1). Its models are freed
  // before a run on the other checkpoint (the text encoder reloads; a minute at most)
  const checkpoint = String(graph['1']?.inputs?.unet_name ?? '');
  if (lastH3Checkpoint && lastH3Checkpoint !== checkpoint) await comfy.free().catch((e: Error) => log.warn({ err: e.message }, 'ComfyUI free before an H3 checkpoint switch failed'));
  lastH3Checkpoint = checkpoint;
  await req.onStatus?.({ status: 'queued' });
  // the prompt id is recorded on the job as soon as it exists: a worker that restarts mid-generation waits for the
  // same prompt instead of asking the engine for a second one
  const run = await comfy.run(graph, { timeoutMs: 90 * 60_000, shouldStop: req.shouldStop, resumePromptId: resumeId, rejectPromptIds: rejected, onSubmitted: req.onTaskCreated, onProgress: (p) => req.onStatus?.({ status: p.queue && p.queue > 0 ? 'queued' : 'generating', queue: p.queue }) });
  const out = comfy.firstOutput(run.outputs, 'video') ?? comfy.firstOutput(run.outputs, 'gifs') ?? comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI produced no video output for the MiniMax H3 workflow.');
  const dir = await tmpDir('h3');
  const file = path.join(dir, out.filename.endsWith('.mp4') ? out.filename : `${out.filename}.mp4`);
  const fetchOut = async () => { await fsp.writeFile(file, await comfy.view(out)); };
  await fetchOut();
  await acceptOutput(file, run.promptId, path.basename(file), fetchOut, 'local MiniMax H3');
  return { file, backend, model: 'MiniMax-H3 (local, pruned int8)', requestId: run.promptId, resolution: `${req.width}x${req.height}`, seconds: h3FrameCount(req.seconds) / H3_FPS, ms: Date.now() - t0, engineMs: run.engineMs, workflowVersion: run.workflowVersion, resumed: run.resumed, params: { graph: graphKind, frames: h3FrameCount(req.seconds), graphNodes: Object.keys(graph).length, first: Boolean(first), last: Boolean(last), refs: refs?.length ?? 0, audioRefs: audio?.length ?? 0, guides: (guides ?? []).map((gd) => ({ frameIdx: gd.frameIdx, image: Boolean(gd.image), video: Boolean(gd.imageIsVideo), audio: Boolean(gd.audio || (gd.imageIsVideo && gd.audioFromVideo)) })), engineMs: run.engineMs, ...(req.lowering ? { lowering: req.lowering } : {}) } };
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

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { workflowVersion as structuralWorkflowVersion, type Graph } from '../workflows';
import { StudioError, type StudioErrorCode } from '@/domain/errors';
import type { FailureClass } from '@/server/org/model';
import { env } from '../env';
import { log } from '../log';
import { followJobSignal, jobScope, jobSignal, stopReasonOf } from '../jobs/context';

/** COMFYUI AS AN ENGINE — workflows are JSON graphs built in code (src/server/workflows), submitted over HTTP,
 *  tracked through ComfyUI's job API and history, and their outputs fetched through /view. The worker never edits node
 *  graphs by hand and users never see ComfyUI. Each graph is hashed so a take can say which workflow revision made it.
 *
 *  Reliability (docs/research/REPOS-AND-ORCHESTRATION.md §4 C1–C6, §9 P0-8):
 *  - the prompt id is generated here and handed to `onSubmitted` BEFORE the POST, so a worker that dies between the
 *    POST and the answer finds its prompt again instead of drawing it twice (`resumePromptId`, or a stable `promptKey`);
 *  - a refused graph (HTTP 400) is classified: a missing model or node is a non-retryable INFRASTRUCTURE failure that
 *    names the file, a bad value is WRONG_PARAMETERS, a lost input picture is retryable; runtime errors are read from
 *    `execution_error` (out of memory → RESOURCE_EXHAUSTION after `/free`);
 *  - a prompt ComfyUI no longer knows (it restarted) is reported after three polls instead of waiting for the timeout;
 *  - cancel and timeout cancel only our own prompt (`/api/jobs/{id}/cancel`; fallback `/queue` delete + targeted
 *    `/interrupt`), never whatever else is running;
 *  - step progress comes from the `/ws` event stream (Node's global WebSocket), `/api/jobs` polling stays the truth. */

export interface ComfyOutputFile { filename: string; subfolder: string; type: 'output' | 'temp' | 'input' }
export interface ComfyRunResult { promptId: string; outputs: Record<string, { images?: ComfyOutputFile[]; audio?: ComfyOutputFile[]; video?: ComfyOutputFile[]; gifs?: ComfyOutputFile[]; text?: string[] }>; ms: number; /** ComfyUI's own execution time (queue wait excluded), when it reported it */ engineMs?: number; workflowVersion: string; /** true when an earlier attempt's prompt was adopted instead of submitting again */ resumed?: boolean }
export interface ComfyProgress { node?: string; value?: number; max?: number; queue?: number }

const baseUrl = () => env().COMFYUI_URL.replace(/\/$/, '');

/** A stopped job (cancel, deadline, lost lease) aborts its ComfyUI calls with the job's reason; that reason is what
 *  surfaces, not "not reachable". */
const stopReason = (ctrl: AbortController): unknown => stopReasonOf(ctrl.signal);

/** `detached`: not tied to the running job's signal — the calls that clean up after an abort (cancel, free) must
 *  still go out once the job is aborted. */
async function http<T>(path: string, init: RequestInit & { timeoutMs?: number; detached?: boolean } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
  const unlink = init.detached ? () => {} : followJobSignal(ctrl);
  try {
    const res = await fetch(`${baseUrl()}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new StudioError(res.status >= 500 ? 'UNAVAILABLE' : 'PROVIDER', `ComfyUI ${path}: HTTP ${res.status} ${text.slice(0, 1500)}`, { status: res.status });
    }
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? await res.json() : await res.text()) as T;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    if (stopReason(ctrl)) throw stopReason(ctrl);
    throw new StudioError('UNAVAILABLE', `ComfyUI is not reachable at ${baseUrl()}: ${(e as Error).message}`);
  } finally { clearTimeout(t); unlink(); }
}

const postJson = (path: string, body: unknown, opts: { detached?: boolean } = {}) => http(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...opts });

export async function health(): Promise<{ ok: boolean; version?: string; vramTotal?: number; vramFree?: number; device?: string }> {
  try {
    const s = await http<{ system: { comfyui_version?: string }; devices: Array<{ name: string; vram_total: number; vram_free: number }> }>('/system_stats');
    const d = s.devices?.[0];
    return { ok: true, version: s.system?.comfyui_version, vramTotal: d?.vram_total, vramFree: d?.vram_free, device: d?.name };
  } catch { return { ok: false }; }
}

export async function objectInfo(nodeClass?: string): Promise<Record<string, unknown>> {
  return http<Record<string, unknown>>(nodeClass ? `/object_info/${encodeURIComponent(nodeClass)}` : '/object_info', { timeoutMs: 60_000 });
}

export async function hasNodes(classes: string[]): Promise<{ missing: string[] }> {
  const info = await objectInfo();
  return { missing: classes.filter((c) => !(c in info)) };
}

export async function listModels(folder: string): Promise<string[]> {
  return http<string[]>(`/models/${encodeURIComponent(folder)}`);
}

/** Drop every loaded model and free VRAM (used when the GPU switches family, and after an out-of-memory error). */
export async function free(): Promise<void> {
  await postJson('/free', { unload_models: true, free_memory: true }, { detached: true });
}

/** Cancel one prompt, pending or running, and nothing else. True when ComfyUI had something to cancel. */
export async function cancelPrompt(promptId: string): Promise<boolean> {
  try {
    const r = await http<{ cancelled?: boolean }>(`/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST', detached: true });
    return Boolean(r?.cancelled);
  } catch (e) {
    if (!(e instanceof StudioError && (e.details?.status === 404 || e.details?.status === 405))) throw e;
    // ComfyUI without the jobs API: dequeue if pending, targeted interrupt if running (both no-ops otherwise)
    await postJson('/queue', { delete: [promptId] }, { detached: true }).catch(() => {});
    await postJson('/interrupt', { prompt_id: promptId }, { detached: true }).catch(() => {});
    return true;
  }
}

/** Put a local file into ComfyUI's input folder (name derived from content so repeats are cheap). */
export async function uploadInput(file: string, opts: { ext?: string; subfolder?: string } = {}): Promise<string> {
  const buf = await fs.readFile(file);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const ext = opts.ext ?? (file.split('.').pop() ?? 'bin');
  const name = `vb-${hash}.${ext}`;
  const fd = new FormData();
  fd.set('image', new Blob([buf]), name);
  fd.set('overwrite', 'true');
  fd.set('type', 'input');
  if (opts.subfolder) fd.set('subfolder', opts.subfolder);
  const r = await http<{ name: string; subfolder: string }>('/upload/image', { method: 'POST', body: fd, timeoutMs: 300_000 });
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
}

export const workflowVersion = (graph: Record<string, unknown>) => structuralWorkflowVersion(graph as Graph);

// ----------------------------------------------------------------------------------------- failure classes

export type ComfyFailureKind = 'MODEL_OR_NODE_MISSING' | 'ENVIRONMENT' | 'INPUT_FILE_MISSING' | 'BAD_INPUT' | 'OUT_OF_MEMORY' | 'EXECUTION' | 'LOST' | 'INTERRUPTED' | 'TIMEOUT';

/** kind → the studio's error code (decides the worker's blind-retry rule: only PROVIDER/UNAVAILABLE retry) and the
 *  failure class `classifyFailure` reads first. */
const KIND: Record<ComfyFailureKind, { code: StudioErrorCode; failureClass: FailureClass; retryable: boolean }> = {
  MODEL_OR_NODE_MISSING: { code: 'NOT_CONFIGURED', failureClass: 'INFRASTRUCTURE', retryable: false },
  ENVIRONMENT: { code: 'NOT_CONFIGURED', failureClass: 'INFRASTRUCTURE', retryable: false },
  INPUT_FILE_MISSING: { code: 'UNAVAILABLE', failureClass: 'INFRASTRUCTURE', retryable: true },
  BAD_INPUT: { code: 'INVALID', failureClass: 'WRONG_PARAMETERS', retryable: false },
  OUT_OF_MEMORY: { code: 'UNAVAILABLE', failureClass: 'RESOURCE_EXHAUSTION', retryable: true },
  EXECUTION: { code: 'PROVIDER', failureClass: 'PROVIDER', retryable: true },
  LOST: { code: 'UNAVAILABLE', failureClass: 'INFRASTRUCTURE', retryable: true },
  INTERRUPTED: { code: 'PROVIDER', failureClass: 'PROVIDER', retryable: true },
  TIMEOUT: { code: 'PROVIDER', failureClass: 'PROVIDER', retryable: true },
};

/** A ComfyUI failure with its kind. It is a StudioError (same `name`), and `failureClass` is honoured by
 *  `classifyFailure` before any message regex. */
export class ComfyError extends StudioError {
  readonly kind: ComfyFailureKind;
  readonly failureClass: FailureClass;
  readonly retryable: boolean;
  constructor(kind: ComfyFailureKind, message: string, details: Record<string, unknown> = {}) {
    super(KIND[kind].code, message, { ...details, comfyKind: kind, failureClass: KIND[kind].failureClass, providerErrorType: details.providerErrorType ?? kind });
    this.kind = kind;
    this.failureClass = KIND[kind].failureClass;
    this.retryable = KIND[kind].retryable;
  }
}

interface NodeErrorItem { type?: string; message?: string; details?: string; extra_info?: { input_name?: string; received_value?: unknown } }
interface RejectionBody { error?: { type?: string; message?: string; details?: string; extra_info?: { node_id?: string; class_type?: string | null } } | string; node_errors?: Record<string, { errors?: NodeErrorItem[]; class_type?: string }> }

const LOADER_INPUT = /(^|_)(name|ckpt_name|unet_name|clip_name|vae_name|lora_name|model_name|control_net_name|style_model_name)$/;

/** Turn ComfyUI's HTTP 400 answer to POST /prompt into a precise, classified error. Pure (tested). */
export function classifyRejection(status: number, body: string): ComfyError {
  let parsed: RejectionBody | undefined;
  try { parsed = JSON.parse(body) as RejectionBody; } catch { parsed = undefined; }
  if (!parsed || typeof parsed !== 'object') return new ComfyError('BAD_INPUT', `ComfyUI refused the workflow (HTTP ${status}): ${body.slice(0, 600)}`, { status });
  const err = typeof parsed.error === 'object' && parsed.error ? parsed.error : { message: typeof parsed.error === 'string' ? parsed.error : undefined };
  const base = { status, providerErrorType: err.type ?? 'unknown', nodeErrors: parsed.node_errors ?? {} };
  if (err.type === 'missing_node_type') {
    const cls = err.extra_info?.class_type;
    return new ComfyError('MODEL_OR_NODE_MISSING', `ComfyUI has no node class ${cls ? `"${cls}"` : '(empty class_type)'} (node #${err.extra_info?.node_id ?? '?'}): the ComfyUI build or a custom node is missing.`, base);
  }
  const found: Array<{ kind: ComfyFailureKind; text: string; type?: string }> = [];
  for (const [id, n] of Object.entries(parsed.node_errors ?? {})) {
    for (const e of n.errors ?? []) {
      const input = e.extra_info?.input_name ?? '';
      const value = e.extra_info?.received_value;
      const where = `${n.class_type ?? 'node'} #${id}`;
      if (n.class_type === 'LoadImage' || (input === 'image' && /LoadImage/i.test(n.class_type ?? ''))) {
        found.push({ kind: 'INPUT_FILE_MISSING', type: e.type, text: `the input picture ${value !== undefined ? `"${String(value)}" ` : ''}is not in ComfyUI's input folder (${where}: ${e.details ?? e.message ?? e.type})` });
      } else if (e.type === 'value_not_in_list' && LOADER_INPUT.test(input)) {
        found.push({ kind: 'MODEL_OR_NODE_MISSING', type: e.type, text: `ComfyUI does not have ${input} "${String(value)}" (${where}): the model file is missing from the models volume or its folder is not mapped in docker/comfyui/extra_model_paths.yaml` });
      } else {
        found.push({ kind: 'BAD_INPUT', type: e.type, text: `${where}${input ? ` input "${input}"` : ''}: ${e.type ?? 'invalid'} — ${(e.details || e.message || '').slice(0, 300)}` });
      }
    }
  }
  const rank: ComfyFailureKind[] = ['MODEL_OR_NODE_MISSING', 'INPUT_FILE_MISSING', 'BAD_INPUT'];
  found.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
  if (found.length) return new ComfyError(found[0].kind, `ComfyUI refused the workflow: ${found.map((f) => f.text).join('; ').slice(0, 1500)}`, { ...base, providerErrorType: found[0].type ?? base.providerErrorType });
  return new ComfyError('BAD_INPUT', `ComfyUI refused the workflow: ${err.type ?? 'error'} — ${(err.message ?? '').slice(0, 300)}${err.details ? ` (${String(err.details).slice(0, 300)})` : ''}`, base);
}

type HistoryMessage = [string, Record<string, unknown>];

/** Read the failure out of a history entry's status messages. Pure (tested). */
export function classifyExecutionError(messages: unknown[] | undefined, promptId?: string): ComfyError {
  const msgs = (messages ?? []).filter((m): m is HistoryMessage => Array.isArray(m) && typeof m[0] === 'string');
  const ex = msgs.find((m) => m[0] === 'execution_error')?.[1];
  if (!ex) {
    if (msgs.some((m) => m[0] === 'execution_interrupted')) return new ComfyError('INTERRUPTED', `ComfyUI prompt ${promptId ?? ''} was interrupted by someone else.`.replace('  ', ' '), { promptId });
    return new ComfyError('EXECUTION', `ComfyUI workflow failed: ${JSON.stringify(messages ?? []).slice(0, 800)}`, { promptId });
  }
  const type = String(ex.exception_type ?? ''); const msg = String(ex.exception_message ?? '').trim();
  const node = `${String(ex.node_type ?? 'node')} #${String(ex.node_id ?? '?')}`;
  const details = { promptId, nodeId: ex.node_id, nodeType: ex.node_type, exceptionType: type, providerErrorType: type || 'execution_error' };
  if (/OutOfMemory|out of memory|Allocation on device/i.test(`${type} ${msg}`)) return new ComfyError('OUT_OF_MEMORY', `ComfyUI ran out of GPU memory in ${node}: ${msg.slice(0, 300)}`, details);
  if (String(ex.node_type) === 'LoadImage' && /FileNotFound|No such file|Invalid image/i.test(`${type} ${msg}`)) return new ComfyError('INPUT_FILE_MISSING', `ComfyUI could not read the input picture in ${node}: ${msg.slice(0, 300)}`, details);
  // the engine's own environment is broken (a toolchain, a kernel build): retrying the same graph cannot help — it fails
  // the same way until the container is fixed (found 2026-10-03: "Failed to find C compiler" retried 3× unchanged)
  if (/Failed to find C compiler|triton\.knobs\.build|No such file or directory: '(gcc|cc|clang|nvcc)'|no kernel image is available|ninja: (not found|command not found)/i.test(`${type} ${msg}`)) return new ComfyError('ENVIRONMENT', `ComfyUI's environment cannot run ${node}: ${msg.slice(0, 300)} — the ComfyUI container needs fixing (see docs/OPERATIONS.md); retrying unchanged will fail the same way.`, details);
  return new ComfyError('EXECUTION', `ComfyUI ${node} failed: ${type ? `${type}: ` : ''}${msg.slice(0, 600)}`, details);
}

// ------------------------------------------------------------------------------------------- prompt state

export type PromptState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
let jobsApi: boolean | undefined;

/** Where one prompt is, in one call when ComfyUI has the jobs API (0.38+), else history + queue. */
export async function promptState(promptId: string): Promise<PromptState> {
  if (jobsApi !== false) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const unlink = followJobSignal(ctrl);
    const res = await fetch(`${baseUrl()}/api/jobs/${encodeURIComponent(promptId)}`, { signal: ctrl.signal }).catch((e: Error) => { throw stopReason(ctrl) ?? new StudioError('UNAVAILABLE', `ComfyUI is not reachable at ${baseUrl()}: ${e.message}`); }).finally(() => { clearTimeout(timer); unlink(); });
    if (res.ok) {
      jobsApi = true;
      const j = await res.json() as { status?: string };
      return j.status === 'in_progress' ? 'running' : j.status === 'pending' ? 'pending' : j.status === 'failed' ? 'failed' : j.status === 'cancelled' ? 'cancelled' : 'completed';
    }
    const text = await res.text().catch(() => '');
    if (res.status === 404 && /job not found/i.test(text)) { jobsApi = true; return 'unknown'; }
    if (res.status >= 500) throw new StudioError('UNAVAILABLE', `ComfyUI /api/jobs: HTTP ${res.status}`);
    jobsApi = false;
  }
  const hist = await http<Record<string, { status?: { status_str?: string; messages?: unknown[] } }>>(`/history/${promptId}`);
  const h = hist[promptId];
  if (h) {
    if (h.status?.status_str === 'error') return (h.status.messages ?? []).some((m) => Array.isArray(m) && m[0] === 'execution_interrupted') ? 'cancelled' : 'failed';
    return 'completed';
  }
  const q = await http<{ queue_running: unknown[][]; queue_pending: unknown[][] }>('/queue');
  if (q.queue_running.some((x) => x[1] === promptId)) return 'running';
  if (q.queue_pending.some((x) => x[1] === promptId)) return 'pending';
  return 'unknown';
}

/** A stable prompt id for a job step: the same key and graph always give the same UUID, so a restarted worker finds
 *  the prompt its previous life submitted (`promptKey`). `n` walks to the next id after a failed attempt. */
export function promptIdFromKey(key: string, graph: Record<string, unknown>, n = 0): string {
  const h = crypto.createHash('sha256').update(`${key}\n${n}\n${JSON.stringify(graph)}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5-style (name-based)
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// ------------------------------------------------------------------------------------------- progress socket

interface SocketLike { onmessage: ((ev: { data: unknown }) => void) | null; onerror: ((ev: unknown) => void) | null; close(): void }

/** Subscribe to ComfyUI's event stream for one prompt. Returns null when there is no global WebSocket. */
function progressSocket(clientId: string, promptId: () => string | undefined, onEvent: (type: string, data: Record<string, unknown>) => void): SocketLike | null {
  const WS = (globalThis as unknown as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (!WS) return null;
  try {
    const ws = new WS(`${baseUrl().replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`);
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return; // binary previews
      try {
        const m = JSON.parse(ev.data) as { type?: string; data?: Record<string, unknown> };
        if (m.type && m.data && m.data.prompt_id && m.data.prompt_id === promptId()) onEvent(m.type, m.data);
      } catch { /* not ours */ }
    };
    return ws;
  } catch { return null; }
}

// ------------------------------------------------------------------------------------------------------ run

export interface RunOptions {
  timeoutMs?: number;
  onProgress?: (p: ComfyProgress) => Promise<void> | void;
  shouldStop?: () => Promise<boolean> | boolean;
  clientId?: string;
  /** the prompt id a previous attempt recorded: adopted while ComfyUI still has it queued, running or finished;
   *  re-used for the submission when ComfyUI never saw it; replaced by a fresh id when that attempt failed */
  resumePromptId?: string;
  /** called with the prompt id BEFORE it is submitted (record it on the job), and again if a retry needs a new id */
  onSubmitted?: (promptId: string) => Promise<void> | void;
  /** a stable key for this step (e.g. `${jobId}:sheet`): the prompt id is derived from it and the graph, so no record
   *  is needed to resume after a crash */
  promptKey?: string;
  /** ms between status polls (default 2000; the socket wakes the loop early) */
  pollMs?: number;
  /** listen to /ws for step progress (default true) */
  socket?: boolean;
  /** stops the wait and cancels the prompt when aborted; default: the running job's signal (src/server/jobs/context.ts) */
  signal?: AbortSignal;
  /** consecutive polls with the prompt absent everywhere before it is declared lost (default 3) */
  lostAfterPolls?: number;
}

/** Submit a graph (or adopt the one a previous attempt submitted) and wait for it. */
export async function run(graph: Record<string, unknown>, opts: RunOptions = {}): Promise<ComfyRunResult> {
  const clientId = opts.clientId ?? crypto.randomUUID();
  const signal = opts.signal ?? jobSignal();
  if (signal?.aborted) throw signal.reason;
  const t0 = Date.now();
  const pollMs = opts.pollMs ?? 2000;
  let promptId: string | undefined;
  let resumed = false;
  // EVERY PROMPT A JOB SUBMITS HAS A KEY (docs/BACKEND-AUDIT-2026-10.md H8, step 7): the caller's step key, else — in
  // a job — the job itself. The prompt id is derived from the key and the graph, so a restarted or reclaimed attempt
  // that builds the same graph (the job's seeds are stable, src/server/jobs/outputs.ts) re-attaches to the prompt
  // the earlier attempt submitted, running or finished, instead of drawing it twice.
  const jobId = jobScope()?.jobId;
  const promptKey = opts.promptKey ?? (!opts.resumePromptId && jobId ? `${jobId}:graph` : undefined);

  // 1. which prompt id: adopt a live or finished one, else choose the id to submit with
  if (promptKey) {
    for (let n = 0; n < 20 && !promptId; n++) {
      const id = promptIdFromKey(promptKey, graph, n);
      const st = await promptState(id);
      if (st === 'failed' || st === 'cancelled') continue; // that attempt is over: the next id in the sequence
      promptId = id; resumed = st !== 'unknown';
    }
    if (!promptId) throw new ComfyError('EXECUTION', `ComfyUI: 20 earlier attempts of ${promptKey} failed; giving up.`);
  } else if (opts.resumePromptId) {
    const st = await promptState(opts.resumePromptId).catch(() => 'unknown' as PromptState);
    if (st === 'pending' || st === 'running' || st === 'completed') { promptId = opts.resumePromptId; resumed = true; }
    else if (st === 'unknown') promptId = opts.resumePromptId; // never reached ComfyUI, or ComfyUI restarted: same id, recorded already
  }
  if (resumed) log.info({ promptId }, 'adopting a ComfyUI prompt from a previous attempt');
  if (!promptId) promptId = crypto.randomUUID();
  const id = promptId;

  // 2. events: step progress and an early wake-up when the prompt ends
  let wake: (() => void) | undefined;
  let lastReport = 0;
  const report = async (p: ComfyProgress, force = false) => {
    if (!opts.onProgress) return;
    const now = Date.now();
    if (!force && now - lastReport < 1000) return;
    lastReport = now;
    await Promise.resolve(opts.onProgress(p)).catch(() => {});
  };
  let running: ComfyProgress = {};
  const ws = opts.socket === false ? null : progressSocket(clientId, () => id, (type, data) => {
    if (type === 'progress') { running = { node: String(data.node ?? ''), value: Number(data.value), max: Number(data.max) }; void report(running, Number(data.value) === Number(data.max)); }
    else if (type === 'executing' && data.node) { running = { node: String(data.node) }; void report(running); }
    else if (type === 'execution_success' || type === 'execution_error' || type === 'execution_interrupted') wake?.();
  });

  try {
    // 3. submit (the id is recorded first: a crash after this line resumes instead of submitting twice)
    if (!resumed) {
      await opts.onSubmitted?.(id);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      const unlink = followJobSignal(ctrl, signal);
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: clientId, prompt_id: id }), signal: ctrl.signal });
      } catch (e) {
        // stopped mid-submit: the prompt may have reached ComfyUI — cancel it by its id (a no-op if it did not)
        if (stopReason(ctrl)) { await cancelPrompt(id).catch(() => false); throw stopReason(ctrl); }
        throw new StudioError('UNAVAILABLE', `ComfyUI is not reachable at ${baseUrl()}: ${(e as Error).message}`, { promptId: id });
      } finally { clearTimeout(timer); unlink(); }
      const text = await res.text().catch(() => '');
      if (res.status === 400) throw classifyRejection(res.status, text);
      if (!res.ok) throw new StudioError(res.status >= 500 ? 'UNAVAILABLE' : 'PROVIDER', `ComfyUI /prompt: HTTP ${res.status} ${text.slice(0, 800)}`, { status: res.status, promptId: id });
    }

    // 4. wait
    const timeout = opts.timeoutMs ?? 60 * 60_000;
    const lostAfter = Math.max(1, opts.lostAfterPolls ?? 3);
    let absent = 0;
    let lastQueueReport = 0;
    for (;;) {
      if (await opts.shouldStop?.()) { await cancelPrompt(id).catch(() => false); throw new StudioError('CONFLICT', 'cancelled', { promptId: id }); }
      // the job was cancelled, passed its deadline or lost its lease: interrupt OUR prompt (pending: dequeued;
      // running: interrupted — the GPU is freed for the next job) and stop with the job's reason (audit H5)
      if (signal?.aborted) { await cancelPrompt(id).catch(() => false); log.info({ promptId: id }, 'ComfyUI prompt cancelled: the job was stopped'); throw signal.reason; }
      let st: PromptState;
      try { st = await promptState(id); } catch (e) { if (signal?.aborted) continue; throw e; }
      if (st === 'completed' || st === 'failed' || st === 'cancelled') {
        const hist = await http<Record<string, { outputs?: ComfyRunResult['outputs']; status?: { status_str?: string; messages?: unknown[] } }>>(`/history/${id}`);
        const h = hist[id];
        if (st !== 'completed' || h?.status?.status_str === 'error') {
          const err = classifyExecutionError(h?.status?.messages, id);
          if (err.kind === 'OUT_OF_MEMORY') await free().catch(() => {});
          throw err;
        }
        const stamps = ((h?.status?.messages ?? []) as Array<[string, { timestamp?: number }]>).filter((m) => Array.isArray(m));
        const started = stamps.find((m) => m[0] === 'execution_start')?.[1]?.timestamp;
        const finished = stamps.find((m) => m[0] === 'execution_success')?.[1]?.timestamp;
        return { promptId: id, outputs: h?.outputs ?? {}, ms: Date.now() - t0, engineMs: started && finished ? finished - started : undefined, workflowVersion: workflowVersion(graph), resumed };
      }
      if (st === 'unknown') {
        if (++absent >= lostAfter) throw new ComfyError('LOST', `ComfyUI no longer knows prompt ${id} (not queued, not running, not in history — it was probably restarted); the attempt can be retried.`, { promptId: id });
      } else {
        absent = 0;
        if (Date.now() - lastQueueReport > 15_000) {
          lastQueueReport = Date.now();
          if (st === 'pending') {
            const q = await http<{ queue_pending: unknown[][] }>('/queue').catch(() => null);
            const ahead = q ? q.queue_pending.filter((x) => x[1] !== id).length : undefined;
            await report({ queue: ahead !== undefined ? Math.max(1, ahead + 1) : 1 }, true);
          } else if (!running.node) await report({ queue: 0 }, true);
        }
      }
      if (Date.now() - t0 > timeout) { await cancelPrompt(id).catch(() => false); throw new ComfyError('TIMEOUT', `ComfyUI workflow ${id} did not finish within ${Math.round(timeout / 60000)} min; it was cancelled.`, { promptId: id }); }
      await new Promise<void>((r) => {
        const done = () => { clearTimeout(t); signal?.removeEventListener('abort', done); r(); };
        const t = setTimeout(done, pollMs); wake = done;
        signal?.addEventListener('abort', done, { once: true });
      });
      wake = undefined;
    }
  } finally {
    try { ws?.close(); } catch { /* closed */ }
  }
}

/** Fetch an output file's bytes. */
export async function view(f: ComfyOutputFile): Promise<Buffer> {
  const sp = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? '', type: f.type ?? 'output' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 300_000);
  const unlink = followJobSignal(ctrl);
  try {
    const res = await fetch(`${baseUrl()}/view?${sp}`, { signal: ctrl.signal });
    if (!res.ok) throw new StudioError('PROVIDER', `ComfyUI /view ${f.filename}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) { throw stopReason(ctrl) ?? e; } finally { clearTimeout(t); unlink(); }
}

export function firstOutput(outputs: ComfyRunResult['outputs'], kind: 'images' | 'audio' | 'video' | 'gifs'): ComfyOutputFile | undefined {
  for (const node of Object.values(outputs)) { const xs = node[kind]; if (xs && xs.length) return xs[0]; }
  return undefined;
}

/** The text a PreviewAny node produced (the face boxes of `faceCheck`, a VLM answer), or undefined. */
export function textOutput(outputs: ComfyRunResult['outputs'], nodeId: string): string | undefined {
  const t = outputs[nodeId]?.text;
  return Array.isArray(t) ? t.join('\n') : typeof t === 'string' ? t : undefined;
}

export { log as comfyLog };

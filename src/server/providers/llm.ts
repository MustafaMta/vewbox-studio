import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { guardedEngineUrl, isLocalEngine } from '../gpu/lease-db';
import { log } from '../log';
import { dropNulls } from '../story/lenient';
import { followJobSignal, stopReasonOf } from '../jobs/context';

/** THE STUDIO'S BRAIN — ONE planner, no alternatives (producer directive 2026-10-07): Qwen3.8-27B-NVFP4
 *  (Inferact/Qwen3.8-27B-NVFP4) served by the local vLLM OpenAI server (compose service llm-vllm), reached at
 *  OPENAI_COMPATIBLE_BASE_URL. There is no hosted planner, no Ollama route and no fallback model: when the planner is not
 *  configured or not reachable the call fails with the real reason. Every call asks for JSON and validates it against
 *  a schema; a bad answer is sent back with the validation error so the model can repair it. Nothing here invents
 *  content when the model is unavailable. */

export type LlmProvider = 'openai-compatible';

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }
/** `reasoning`: let the local model think before it answers, with at most `reasoningTokens` of thinking added to the
 *  answer's budget (the context permitting). Off unless asked: explicit, never an accident (MODEL-EVAL-2026-10 §9). */
export interface LlmOptions { maxTokens?: number; temperature?: number; timeoutMs?: number; jobId?: string; reasoning?: boolean; reasoningTokens?: number }
/** The thinking budget a reasoning call gets on top of its answer budget, when it names none. */
export const DEFAULT_REASONING_TOKENS = 4096;
/** `truncated`: the answer stopped at the output limit (`finish_reason: "length"`). */
export interface LlmResult { text: string; provider: LlmProvider; model: string; inputTokens?: number; outputTokens?: number; ms: number; finishReason?: string; truncated?: boolean; maxTokens?: number }

/** An answer cut off at the output limit (or JSON left unterminated), with no room left to ask for a longer one. It is
 *  never sent back for a repair — a repair has less room than the call it repairs (the cut answer joins the history)
 *  — and never accepted partially: the caller makes the task smaller (the shot planner splits the scene) or fails. */
export class TruncatedAnswerError extends StudioError {
  readonly truncated = true;
  constructor(message: string, details: Record<string, unknown>) { super('PROVIDER', message, { ...details, truncated: true, failureClass: 'LLM_TRUNCATED' }); }
}
export const isTruncatedAnswer = (e: unknown): e is TruncatedAnswerError => e instanceof TruncatedAnswerError || Boolean((e as { details?: { truncated?: unknown } } | null)?.details?.truncated);

/** Tokens kept free inside the context for the chat template and the end of the answer. */
export const CONTEXT_MARGIN_TOKENS = 384;
/** A conservative token count for a prompt before it is sent: ≈ 3 characters per token (English runs ≈ 4 on the Qwen
 *  tokenizer), so this over-counts, and the room it leaves is never more than the context really has. */
export function estimateTokens(messages: LlmMessage[]): number {
  return messages.reduce((a, m) => a + Math.ceil(m.content.length / 3) + 8, 0);
}

/** The planner's context window, prompt and answer together (vLLM --max-model-len, LLM_CONTEXT_LENGTH). */
export const localContextLength = (): number => env().LLM_CONTEXT_LENGTH;

/** How many tokens an answer to these messages may take, at most: the context minus the prompt (its known size when
 *  given, else the estimate) minus a margin. vLLM refuses a request whose prompt plus max_tokens passes the window. */
export function outputRoom(messages: LlmMessage[], opts: { promptTokens?: number } = {}): number {
  const prompt = opts.promptTokens ?? estimateTokens(messages);
  return Math.max(512, localContextLength() - prompt - CONTEXT_MARGIN_TOKENS);
}

/** The planner's served model id when OPENAI_COMPATIBLE_MODEL names none: Qwen3.8-27B-NVFP4 — Inferact/Qwen3.8-27B-NVFP4
 *  (ModelOpt NVFP4 of Qwen/Qwen3.8-27B, Apache-2.0, revision 6128240e, manifest group llm-qwen3.8-27b-nvfp4) under vLLM's
 *  `--served-model-name`; proven in Phase 0 (2026-10-07: direct test 7/7, the studio's story → script → shot plan on
 *  the first attempt; docs/PRODUCTION-EXECUTION-STATUS.md). */
export const DEFAULT_LOCAL_LLM = 'Qwen3.8-27B-NVFP4';

/** What the planner holds on the card while it answers, in MB — the LLM family's GPU lease estimate. Qwen3.8-27B-NVFP4
 *  on vLLM 0.31 (2026-10-07: weights 24.18 GiB, FP8 KV 2.29 GiB = 57,040 tokens at --gpu-memory-utilization 0.90):
 *  29,976 MiB peak while answering. A model never measured is given the whole card, so nothing runs beside it. */
export const LOCAL_LLM_VRAM_MB: ReadonlyArray<readonly [prefix: string, mb: number]> = [['qwen3.8-27b', 30000]];
export const UNMEASURED_LLM_VRAM_MB = 31500;
export function llmLeaseMb(model: string): number {
  const m = model.trim().toLowerCase();
  return LOCAL_LLM_VRAM_MB.find(([prefix]) => m.startsWith(prefix))?.[1] ?? UNMEASURED_LLM_VRAM_MB;
}

/** How fast the planner answers on the RTX 5090, warm (answer tokens per second; seconds to read one ≈ 4K-token
 *  shot-plan prompt): Qwen3.8-27B-NVFP4 on vLLM --enforce-eager 13 tok/s (2026-10-07: 2,119 tokens at 12.9 tok/s; the
 *  studio's 3,765-token shot plan in 285 s; a 9,947-token prompt read in 1.3 s). The shot planner's deadline is computed
 *  from it (src/server/jobs/work-deadline.ts). A model never measured is assumed slow so its jobs are not cut short. */
export const LOCAL_LLM_SPEED: ReadonlyArray<readonly [prefix: string, tokensPerSecond: number, promptSecondsPerPart: number]> = [['qwen3.8-27b', 13, 5]];
export const UNMEASURED_LLM_SPEED = { tokensPerSecond: 8, promptSecondsPerPart: 90 };
export function llmSpeed(model: string): { tokensPerSecond: number; promptSecondsPerPart: number } {
  const m = model.trim().toLowerCase();
  const hit = LOCAL_LLM_SPEED.find(([prefix]) => m.startsWith(prefix));
  return hit ? { tokensPerSecond: hit[1], promptSecondsPerPart: hit[2] } : UNMEASURED_LLM_SPEED;
}

/** The planner's address and model. It must be this machine's vLLM server (a loopback address or a compose service):
 *  anything else — nothing configured, a hosted URL — is refused with the reason, never replaced by another engine. */
export function resolveProvider(): { provider: LlmProvider; model: string; baseUrl: string; apiKey: string } {
  const e = env();
  const baseUrl = e.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, '');
  if (!baseUrl) throw new StudioError('NOT_CONFIGURED', 'The planner is not configured: set OPENAI_COMPATIBLE_BASE_URL to the local vLLM server (http://127.0.0.1:8050/v1 on the host, http://llm-vllm:8000/v1 in compose).');
  if (!isLocalEngine(baseUrl)) throw new StudioError('NOT_CONFIGURED', `The planner must be the local vLLM server; OPENAI_COMPATIBLE_BASE_URL points at ${new URL(baseUrl).host}.`);
  return { provider: 'openai-compatible', model: e.OPENAI_COMPATIBLE_MODEL || DEFAULT_LOCAL_LLM, baseUrl, apiKey: e.OPENAI_COMPATIBLE_API_KEY || 'none' };
}
/** vLLM's base URL (without /v1) for the configured planner. */
export const plannerBase = (baseUrl: string): string => baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');

/** A planner answer may take this long, at most: 5 minutes plus a quarter second per token it may write (a floor of 4
 *  tokens/s; the planner writes 13/s); a stalled engine is caught sooner by LOCAL_STALL_MS. */
export const localDeadlineMs = (maxTokens: number) => 300_000 + Math.max(0, maxTokens) * 250;
/** The longest silence a stream may keep before it is given up (the first token waits for the whole prompt to be
 *  read and, after a family switch, for vLLM to wake: ≈ 6 s). */
export const LOCAL_STALL_MS = 240_000;

/** What the planner is asked besides the chat itself (Qwen3.8-27B-NVFP4): thinking through the chat template (`chat_template_kwargs.enable_thinking`, the model card's
 *  switch; the server's default is off too) and the card's sampling — non-thinking: top_p 0.8, top_k 20, presence 1.5
 *  at the stage's own temperature (the card's 0.7 when the stage names none); thinking: temperature 1.0, top_p 0.95,
 *  top_k 20, presence 0. Pure (tested). */
export function vllmRequest(reasoning: boolean, temperature?: number): Record<string, unknown> {
  return reasoning
    ? { chat_template_kwargs: { enable_thinking: true }, temperature: 1.0, top_p: 0.95, top_k: 20, presence_penalty: 0 }
    : { chat_template_kwargs: { enable_thinking: false }, temperature: temperature ?? 0.7, top_p: 0.8, top_k: 20, presence_penalty: Number(process.env.LLM_PRESENCE_PENALTY || 1.5) };
}

/** Whether a local call reasons: the call's own choice, else LLM_LOCAL_REASONING=on (an evaluation switch; default off). */
export const reasoningOf = (opts: Pick<LlmOptions, 'reasoning'>, e: Record<string, string | undefined> = process.env): boolean => opts.reasoning ?? e.LLM_LOCAL_REASONING === 'on';

type ChatAnswer = { choices?: Array<{ message?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };

/** THE PLANNER STALLED: no first token within LOCAL_STALL_MS, or, once it writes, fewer than
 *  LOCAL_MIN_TOKENS_PER_WINDOW tokens in a LOCAL_SLOW_WINDOW_MS window — a model at the card's edge whose weights
 *  Windows paged to shared system memory never errors, it crawls. Failed fast as RESOURCE_EXHAUSTION (retryable at
 *  infrastructure level: the planner is put to sleep and the next attempt wakes it on a free card). */
export class LocalModelStalled extends StudioError {
  readonly failureClass = 'RESOURCE_EXHAUSTION';
  readonly retryable = true;
  constructor(message: string, details: Record<string, unknown> = {}) { super('UNAVAILABLE', message, { ...details, failureClass: 'RESOURCE_EXHAUSTION', reason: 'LOCAL_LLM_STALLED' }); }
}
/** The slowest a writing planner may be before it counts as stalled: 90 tokens in 90 s (1/s; it writes 13/s). */
export const LOCAL_SLOW_WINDOW_MS = 90_000;
export const LOCAL_MIN_TOKENS_PER_WINDOW = 90;

/** Read an OpenAI-compatible server-sent-event stream into the shape of a whole answer: the content deltas joined, the
 *  last finish_reason, the usage chunk (`stream_options.include_usage`). A silence longer than `stallMs`, or a crawl
 *  (fewer than `minTokens` deltas in `windowMs` once writing), aborts with LocalModelStalled. */
export async function readChatStream(res: Response, ctrl: AbortController, stallMs: number, slow: { windowMs: number; minTokens: number } = { windowMs: LOCAL_SLOW_WINDOW_MS, minTokens: LOCAL_MIN_TOKENS_PER_WINDOW }): Promise<ChatAnswer> {
  const reader = res.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let buffer = ''; let content = ''; let reasoning = ''; let finish: string | undefined; let usage: ChatAnswer['usage']; let error: ChatAnswer['error'];
  let stall: ReturnType<typeof setTimeout> | undefined;
  const arm = () => { if (stall) clearTimeout(stall); stall = setTimeout(() => ctrl.abort(new LocalModelStalled(`the local model sent nothing for ${Math.round(stallMs / 1000)} s (the card may be over-full)`, { stallMs })), stallMs); };
  // the crawl watch: deltas counted per window once the model writes
  let deltas = 0; let windowStart = 0; let windowDeltas = 0;
  const crawl = setInterval(() => {
    if (!windowStart) return;
    const now = Date.now();
    if (now - windowStart < slow.windowMs) return;
    if (windowDeltas < slow.minTokens) ctrl.abort(new LocalModelStalled(`the local model slowed to ${windowDeltas} tokens in ${Math.round((now - windowStart) / 1000)} s after ${deltas} (the card may be over-full: its weights paged out of VRAM)`, { tokensInWindow: windowDeltas, windowMs: now - windowStart, tokens: deltas }));
    windowStart = now; windowDeltas = 0;
  }, Math.max(50, Math.min(5_000, Math.floor(slow.windowMs / 6))));
  const take = (line: string) => {
    const data = line.replace(/^data:\s?/, '').trim();
    if (!data || data === '[DONE]') return;
    let j: { choices?: Array<{ delta?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string | null }>; usage?: ChatAnswer['usage']; error?: ChatAnswer['error'] };
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) error = j.error;
    const c = j.choices?.[0];
    // reasoning arrives as `reasoning_content` (vLLM's reasoning parser) or `reasoning` (newer servers)
    const thought = c?.delta?.reasoning ?? c?.delta?.reasoning_content;
    if (c?.delta?.content || thought) { deltas++; windowDeltas++; if (!windowStart) windowStart = Date.now(); }
    if (c?.delta?.content) content += c.delta.content;
    if (thought) reasoning += thought;
    if (c?.finish_reason) finish = c.finish_reason;
    if (j.usage) usage = j.usage;
  };
  try {
    arm();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); if (line.startsWith('data:')) take(line); }
    }
    if (buffer.startsWith('data:')) take(buffer);
  } finally { if (stall) clearTimeout(stall); clearInterval(crawl); }
  return { choices: [{ message: { content, ...(reasoning ? { reasoning } : {}) }, finish_reason: finish }], usage, error };
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new StudioError('PROVIDER', `${what} timed out after ${Math.round(ms / 1000)} s`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (t) clearTimeout(t); }
}

/** A chat with the planner. It runs under the shared GPU lease as the LLM family (docs/BACKEND-AUDIT-2026-10.md H7,
 *  step 8): it waits its turn for the card while the engines of other families unload; when another family takes the
 *  card, vLLM is put to sleep (level 2), and it is woken here, inside the lease, before it answers (≈ 6 s). */
export async function chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmResult> {
  const cfg = resolveProvider();
  const { gpuLease } = await import('../gpu/lease');
  return gpuLease('LLM', llmLeaseMb(cfg.model), async () => {
    await (await import('./vllm')).wakeVllm(plannerBase(guardedEngineUrl(cfg.baseUrl, 'the planner')));
    return chatWith(cfg, messages, opts);
  }, { jobId: opts.jobId });
}

async function chatWith(cfg: ReturnType<typeof resolveProvider>, messages: LlmMessage[], opts: LlmOptions): Promise<LlmResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? localDeadlineMs((opts.maxTokens ?? 8000) + (reasoningOf(opts) ? opts.reasoningTokens ?? DEFAULT_REASONING_TOKENS : 0));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // a stopped job (cancel, deadline, lost lease) aborts the request with its own reason (src/server/jobs/context.ts)
  const unlink = followJobSignal(ctrl);
  try {
    // the answer comes as a STREAM: a long answer can take longer than Node's fetch waits for response headers
    // (300 s), and a stream shows a stalled engine early. An explicit reasoning call gets its thinking budget on top of
    // the answer's, inside the context's room; vLLM refuses a request whose prompt plus max_tokens passes
    // --max-model-len, so nothing is ever asked past the room.
    const think = reasoningOf(opts);
    const room = localContextLength() - estimateTokens(messages) - CONTEXT_MARGIN_TOKENS;
    const asked = think ? Math.min((opts.maxTokens ?? 8000) + (opts.reasoningTokens ?? DEFAULT_REASONING_TOKENS), Math.max(opts.maxTokens ?? 8000, room)) : opts.maxTokens ?? 8000;
    const maxTokens = Math.max(256, Math.min(asked, room));
    const res = await withTimeout(fetch(`${guardedEngineUrl(cfg.baseUrl, 'the planner')}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, ...vllmRequest(think, opts.temperature) }) }), timeoutMs, `${cfg.provider} ${cfg.model}`);
    const json = /text\/event-stream/i.test(res.headers.get('content-type') ?? '') && res.ok
      ? await withTimeout(readChatStream(res, ctrl, LOCAL_STALL_MS), timeoutMs, `${cfg.provider} ${cfg.model}`)
      : await res.json().catch(() => ({})) as ChatAnswer;
    if (!res.ok || json.error) throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${json.error?.message ?? `HTTP ${res.status}`}`, { status: res.status });
    const text = json.choices?.[0]?.message?.content ?? '';
    const finishReason = json.choices?.[0]?.finish_reason;
    // reasoning the studio asked to be off still spends the answer's budget: say so (a server that ignores the switch)
    const reasoning = json.choices?.[0]?.message?.reasoning ?? json.choices?.[0]?.message?.reasoning_content ?? '';
    if (reasoning && !think) log.warn({ model: cfg.model, reasoningChars: reasoning.length, outputTokens: json.usage?.completion_tokens }, 'the local model reasoned although thinking is off');
    return { text, provider: cfg.provider, model: cfg.model, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, ms: Date.now() - t0, finishReason, truncated: finishReason === 'length', maxTokens };
  } catch (e) {
    const reason = stopReasonOf(ctrl.signal);
    // a stalled planner is put to sleep so the retry wakes it again onto a card with room (never left crawling)
    if (reason instanceof LocalModelStalled) {
      log.warn({ model: cfg.model, err: reason.message }, 'planner stalled: putting it to sleep');
      await (await import('./vllm')).sleepVllm(plannerBase(cfg.baseUrl)).catch(() => undefined);
    }
    if (reason) throw reason;
    if ((e as Error).name === 'AbortError') throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model} timed out after ${Math.round(timeoutMs / 1000)} s`);
    if (e instanceof StudioError) throw e;
    throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${(e as Error).message}`);
  } finally { clearTimeout(timer); unlink(); }
}

/** Pull the first JSON object or array out of a model answer (tolerates code fences and <think> blocks). */
export function extractJson(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = Math.min(...['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0));
  if (!Number.isFinite(start)) throw new StudioError('PROVIDER', 'The model did not answer with JSON.');
  // walk to the matching close so trailing prose is ignored
  const open = t[start]; const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close) { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return t.slice(start);
}

/** True when the answer opens a JSON object or array and never closes it (the walk of `extractJson` ends inside it):
 *  the shape a cut-off answer has, whatever the engine reported as its stop reason. */
export function isUnterminatedJson(text: string): boolean {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim(); else t = t.replace(/^```(?:json)?\s*/i, '');
  const start = Math.min(...['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0));
  if (!Number.isFinite(start)) return false;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) return false; }
  }
  return true;
}

/** Ask for JSON matching a schema; on a validation failure, show the model its mistake once and retry.
 *  A CUT-OFF ANSWER (stop reason "length"/"max_tokens", or JSON left unterminated) is not a validation failure: it is
 *  asked again, unchanged, with the whole room the context has left when that is larger than the budget it was cut
 *  at (`outputRoom`); otherwise TruncatedAnswerError is thrown. A partial answer is never parsed or accepted. */
export async function json<T>(schema: z.ZodType<T>, messages: LlmMessage[], opts: LlmOptions & { repairs?: number } = {}): Promise<{ data: T; result: LlmResult; attempts: number }> {
  const repairs = opts.repairs ?? 2;
  const history: LlmMessage[] = [...messages];
  let last: LlmResult | null = null;
  let maxTokens = opts.maxTokens;
  let widened = false;
  for (let attempt = 1; attempt <= repairs + 1; attempt++) {
    // a repair round carries the earlier answer in its history: its budget is what the context still has room for
    const budget = history.length > messages.length ? Math.min(maxTokens ?? 8000, outputRoom(history)) : maxTokens;
    last = await chat(history, { ...opts, maxTokens: budget, temperature: attempt === 1 ? opts.temperature : Math.max(0.2, (opts.temperature ?? 0.7) - 0.2) });
    // cut off: JSON left open, or the engine stopped at the limit before any JSON (a closed object is complete)
    if (isUnterminatedJson(last.text) || (last.truncated && !/[{[]/.test(last.text))) {
      const cutAt = last.maxTokens ?? maxTokens ?? 8000;
      const room = outputRoom(history, { promptTokens: last.inputTokens });
      log.warn({ attempt, provider: last.provider, finishReason: last.finishReason, outputTokens: last.outputTokens, cutAt, room }, 'llm answer was cut off');
      if (!widened && room >= cutAt + 1024) { widened = true; maxTokens = room; attempt--; continue; }
      throw new TruncatedAnswerError(`The story engine (${last.provider}) ran out of room: the answer was cut off at ${last.outputTokens ?? cutAt} tokens${last.inputTokens ? ` after a ${last.inputTokens}-token prompt` : ''}.`, { provider: last.provider, model: last.model, inputTokens: last.inputTokens, outputTokens: last.outputTokens, maxTokens: cutAt, finishReason: last.finishReason });
    }
    let parsed: unknown;
    try { parsed = JSON.parse(extractJson(last.text)); } catch (e) {
      log.warn({ attempt, provider: last.provider, err: (e as Error).message, head: last.text.slice(0, 200) }, 'llm answer was not json');
      history.push({ role: 'assistant', content: last.text }, { role: 'user', content: `That was not valid JSON (${(e as Error).message}). Answer again with only the JSON object, no prose, no code fences.` });
      continue;
    }
    const v = schema.safeParse(dropNulls(parsed));
    if (v.success) return { data: v.data, result: last, attempts: attempt + (widened ? 1 : 0) };
    const issues = v.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    log.warn({ attempt, provider: last.provider, issues }, 'llm json failed validation');
    history.push({ role: 'assistant', content: last.text }, { role: 'user', content: `The JSON does not match the required shape. Fix exactly these problems and answer with the complete corrected JSON only:\n${issues}` });
  }
  throw new StudioError('PROVIDER', `The story engine (${last?.provider ?? 'llm'}) did not produce a valid answer after ${repairs + 1} attempts.`);
}

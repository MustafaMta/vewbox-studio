import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { guardedEngineUrl } from '../gpu/lease-db';
import { log } from '../log';
import { dropNulls } from '../story/lenient';
import { followJobSignal, stopReasonOf } from '../jobs/context';

/** THE STORY ENGINE'S LANGUAGE MODEL — one small interface over three hosted/local backends:
 *  - MiniMax text (M3) through its Anthropic-compatible messages endpoint (the same MiniMax key as video);
 *  - Anthropic Claude;
 *  - any OpenAI-compatible chat server (the bundled Ollama, vLLM, LM Studio …).
 *  Every call asks for JSON and validates it against a schema; a bad answer is sent back once with the validation
 *  error so the model can repair it. Nothing here invents content when the model is unavailable: it fails. */

export type LlmProvider = 'minimax' | 'anthropic' | 'openai-compatible';

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }
/** `reasoning`: let the local model think before it answers, with at most `reasoningTokens` of thinking added to the
 *  answer's budget (the context permitting). Off unless asked: explicit, never an accident (MODEL-EVAL-2026-10 §9). */
export interface LlmOptions { maxTokens?: number; temperature?: number; provider?: LlmProvider; timeoutMs?: number; jobId?: string; reasoning?: boolean; reasoningTokens?: number }
/** The thinking budget a reasoning call gets on top of its answer budget, when it names none. */
export const DEFAULT_REASONING_TOKENS = 4096;
/** `truncated`: the answer stopped at the output limit (OpenAI/Ollama `finish_reason: "length"`, Anthropic/MiniMax
 *  `stop_reason: "max_tokens"`) — on the local Ollama also when the prompt and the answer filled num_ctx. */
export interface LlmResult { text: string; provider: LlmProvider; model: string; inputTokens?: number; outputTokens?: number; ms: number; finishReason?: string; truncated?: boolean; maxTokens?: number }

/** An answer cut off at the output limit (or JSON left unterminated), with no room left to ask for a longer one. It is
 *  never sent back for a repair — a repair has less room than the call it repairs (the cut answer joins the history)
 *  — and never accepted partially: the caller makes the task smaller (the shot planner splits the scene) or fails. */
export class TruncatedAnswerError extends StudioError {
  readonly truncated = true;
  constructor(message: string, details: Record<string, unknown>) { super('PROVIDER', message, { ...details, truncated: true, failureClass: 'LLM_TRUNCATED' }); }
}
export const isTruncatedAnswer = (e: unknown): e is TruncatedAnswerError => e instanceof TruncatedAnswerError || Boolean((e as { details?: { truncated?: unknown } } | null)?.details?.truncated);

/** The output budget a hosted engine is given at most (their windows are far larger than any answer the studio asks). */
export const HOSTED_OUTPUT_CAP = 16000;
/** Tokens kept free inside the local context for the chat template and the end of the answer. */
export const CONTEXT_MARGIN_TOKENS = 384;
/** A conservative token count for a prompt before it is sent: ≈ 3 characters per token. Measured 4.26 for the Arabic
 *  shot-plan prompt on Gemma 4 (17,356 characters → 4,076 tokens, MODEL-EVAL-2026-10 §3), so this over-counts, and the
 *  room it leaves is never more than the context really has. */
export function estimateTokens(messages: LlmMessage[]): number {
  return messages.reduce((a, m) => a + Math.ceil(m.content.length / 3) + 8, 0);
}

/** How many tokens an answer to these messages may take, at most, on the engine that will answer them. On the local
 *  Ollama the prompt and the answer share num_ctx (OLLAMA_CONTEXT_LENGTH, measured at 16384 for Gemma's 21.4 GB card
 *  total): the room is the context minus the prompt (its known size when given, else the estimate) minus a margin. A
 *  hosted engine gets HOSTED_OUTPUT_CAP; another OpenAI-compatible server (unknown window) the old 8000. */
export function outputRoom(messages: LlmMessage[], opts: { provider?: LlmProvider; promptTokens?: number } = {}): number {
  let cfg: ReturnType<typeof resolveProvider>;
  try { cfg = resolveProvider(opts.provider); } catch { return 8000; } // nothing configured: the call itself says so
  if (cfg.provider !== 'openai-compatible') return HOSTED_OUTPUT_CAP;
  if (!isLocalOllama(cfg.baseUrl)) return 8000;
  const prompt = opts.promptTokens ?? estimateTokens(messages);
  return Math.max(512, env().OLLAMA_CONTEXT_LENGTH - prompt - CONTEXT_MARGIN_TOKENS);
}
const isLocalOllama = (baseUrl: string) => /:11434(\/|$)/.test(baseUrl);

/** The local story model when OPENAI_COMPATIBLE_MODEL names none: Qwen3.6-27B dense, Q8_0 (Ollama
 *  `qwen3.6:27b-q8_0`, Apache-2.0) — the production brain by the producer's directive of 2026-10-06
 *  (docs/directives/PRODUCTION-STACK-DIRECTIVE-2026-10-06.md; promotion record docs/research/MODEL-EVAL-2026-10.md §9).
 *  It fills the card (≈ 31.5 GB at num_ctx 16384): a stall there fails fast (LocalModelStalled) and the documented
 *  fallback is a Q6_K build of the same model (a Hugging Face GGUF: Ollama's library has no q6_K tag; §9.1). Gemma 4 31B (`gemma4:31b-it-qat`) stays installed as the emergency
 *  fallback, qwen3:14b as a preview model — both through OPENAI_COMPATIBLE_MODEL. */
export const DEFAULT_LOCAL_LLM = 'qwen3.6:27b-q8_0';
/** The emergency fallback when the production model cannot run (selected by setting OPENAI_COMPATIBLE_MODEL to it). */
export const FALLBACK_LOCAL_LLM = 'gemma4:31b-it-qat';

/** What a local model holds on the card while it answers, in MB — the LLM family's GPU lease estimate. Measured on the
 *  RTX 5090 with num_ctx 16384 and a q8_0 KV cache (MODEL-EVAL-2026-10 §3, nvidia-smi peak incl. ≈ 0.8 GB of idle
 *  contexts): qwen3.6:27b-q8_0 31,499 MiB loaded, 31,708 writing (Ollama: 28.4 GB, 66/66 layers, 100 % GPU; §9 — the
 *  whole card), gemma4:31b-it-qat 21,405 MiB (Ollama: 19.1 GB, 100 % GPU), qwen3:14b 11,489 MiB (10.57 GB). A model
 *  that was never measured keeps the earlier 12000 and should be measured before it is relied on. */
export const LOCAL_LLM_VRAM_MB: ReadonlyArray<readonly [prefix: string, mb: number]> = [['qwen3.6:27b', 31500], ['gemma4:31b', 21500], ['qwen3:14b', 12000]];
export const UNMEASURED_LLM_VRAM_MB = 12000;
export function llmLeaseMb(model: string): number {
  const m = model.trim().toLowerCase();
  return LOCAL_LLM_VRAM_MB.find(([prefix]) => m.startsWith(prefix))?.[1] ?? UNMEASURED_LLM_VRAM_MB;
}

/** How fast a local model answers on the RTX 5090, warm, at num_ctx 16384 (answer tokens per second over whole calls,
 *  prompt reading included; seconds to read one ≈ 4K-token shot-plan prompt): qwen3.6:27b-q8_0 25 tok/s (MODEL-EVAL-2026-10
 *  §9: 3,402 answer tokens in 138 s, thinking off), gemma4:31b-it-qat 52 tok/s (§9, shot plans), qwen3:14b ≈ 100 (§3). The shot planner's deadline is computed from it (src/server/jobs/work-deadline.ts).
 *  A model never measured is assumed slow (8 tok/s, a large model with experts on the CPU) so its jobs are not cut short. */
export const LOCAL_LLM_SPEED: ReadonlyArray<readonly [prefix: string, tokensPerSecond: number, promptSecondsPerPart: number]> = [['qwen3.6:27b', 25, 15], ['gemma4:31b', 52, 10], ['qwen3:14b', 100, 5]];
export const UNMEASURED_LLM_SPEED = { tokensPerSecond: 8, promptSecondsPerPart: 90 };
/** A hosted engine's speed for the same purpose (fast; its deadline stays near the flat value). */
export const HOSTED_LLM_SPEED = { tokensPerSecond: 40, promptSecondsPerPart: 10 };
export function llmSpeed(model: string, provider: LlmProvider = 'openai-compatible', baseUrl = ''): { tokensPerSecond: number; promptSecondsPerPart: number } {
  if (provider !== 'openai-compatible' || (baseUrl && !isLocalOllama(baseUrl))) return HOSTED_LLM_SPEED;
  const m = model.trim().toLowerCase();
  const hit = LOCAL_LLM_SPEED.find(([prefix]) => m.startsWith(prefix));
  return hit ? { tokensPerSecond: hit[1], promptSecondsPerPart: hit[2] } : UNMEASURED_LLM_SPEED;
}

export function resolveProvider(preferred?: string): { provider: LlmProvider; model: string; baseUrl: string; apiKey: string } {
  const e = env();
  const pick = (p: string | undefined): LlmProvider | null => {
    if (p === 'minimax' && e.MINIMAX_API_KEY) return 'minimax';
    if (p === 'anthropic' && e.ANTHROPIC_API_KEY) return 'anthropic';
    if (p === 'openai-compatible' && e.OPENAI_COMPATIBLE_BASE_URL) return 'openai-compatible';
    return null;
  };
  const chosen = pick(preferred) ?? (e.LLM_PROVIDER !== 'auto' ? pick(e.LLM_PROVIDER) : null) ?? pick('minimax') ?? pick('anthropic') ?? pick('openai-compatible');
  if (!chosen) throw new StudioError('NOT_CONFIGURED', 'No story engine is configured: set MINIMAX_API_KEY, ANTHROPIC_API_KEY or OPENAI_COMPATIBLE_BASE_URL.');
  if (chosen === 'minimax') return { provider: chosen, model: e.MINIMAX_TEXT_MODEL, baseUrl: `${e.MINIMAX_BASE_URL.replace(/\/$/, '')}/anthropic`, apiKey: e.MINIMAX_API_KEY };
  if (chosen === 'anthropic') return { provider: chosen, model: e.ANTHROPIC_MODEL, baseUrl: 'https://api.anthropic.com', apiKey: e.ANTHROPIC_API_KEY };
  return { provider: chosen, model: e.OPENAI_COMPATIBLE_MODEL || DEFAULT_LOCAL_LLM, baseUrl: e.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, ''), apiKey: e.OPENAI_COMPATIBLE_API_KEY || 'none' };
}

/** A local answer may take this long, at most: 5 minutes plus a quarter second per token it may write (a floor of 4
 *  tokens/s — a large model with experts offloaded to the CPU writes 10–20/s); a stalled engine is caught sooner by
 *  LOCAL_STALL_MS. */
export const localDeadlineMs = (maxTokens: number) => 300_000 + Math.max(0, maxTokens) * 250;
/** The longest silence a local stream may keep before it is given up (the first token waits for the whole prompt to
 *  be read, which a partly offloaded model does at a few hundred tokens a second). */
export const LOCAL_STALL_MS = 240_000;

/** What the local model is asked besides the chat itself: THINKING OFF (the studio asks for JSON, not reasoning).
 *  Ollama's OpenAI-compatible endpoint ignores a top-level `think` — measured on 0.35.1 (MODEL-EVAL-2026-10 §9):
 *  with `think: false` alone, gemma4:31b-it-qat and qwen3.6:27b (both "thinking: default true") still reasoned, and
 *  the reasoning was counted in completion_tokens and max_tokens (qwen3.6: 4,621 reasoning characters and a cut answer
 *  for a 120-token JSON; Gemma's answers ran 0.6–2 characters per token where JSON runs 3–4) — the hidden cause of
 *  budgets running out. `reasoning_effort: "none"` is the switch that endpoint maps to think=false (0 reasoning
 *  characters, 114 tokens, 3.6 s instead of 71 s); `think: false` stays for servers that read it. */
export function localModelRequest(_model: string, reasoning = false): Record<string, unknown> {
  return reasoning ? { think: true, reasoning_effort: 'high' } : { think: false, reasoning_effort: 'none' };
}

/** Whether a local call reasons: the call's own choice, else LLM_LOCAL_REASONING=on (an evaluation switch; default off). */
export const reasoningOf = (opts: Pick<LlmOptions, 'reasoning'>, e: Record<string, string | undefined> = process.env): boolean => opts.reasoning ?? e.LLM_LOCAL_REASONING === 'on';

type ChatAnswer = { choices?: Array<{ message?: { content?: string; reasoning?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };

/** THE LOCAL MODEL STALLED: no first token within LOCAL_STALL_MS, or, once it writes, fewer than
 *  LOCAL_MIN_TOKENS_PER_WINDOW tokens in a LOCAL_SLOW_WINDOW_MS window. Seen on the RTX 5090 with qwen3.6:27b-q8_0 at
 *  the card's edge (32.0 of 32.6 GB, 0–2 % GPU utilisation: Windows had paged the weights to shared system memory) —
 *  the engine never errors, it crawls. Failed fast as RESOURCE_EXHAUSTION (retryable: the next attempt reloads the
 *  model on a free card); recurring stalls are the cue for the Q6_K fallback (MODEL-EVAL-2026-10 §9). */
export class LocalModelStalled extends StudioError {
  readonly failureClass = 'RESOURCE_EXHAUSTION';
  readonly retryable = true;
  constructor(message: string, details: Record<string, unknown> = {}) { super('UNAVAILABLE', message, { ...details, failureClass: 'RESOURCE_EXHAUSTION', reason: 'LOCAL_LLM_STALLED' }); }
}
/** The slowest a writing local model may be before it counts as stalled: 90 tokens in 90 s (1/s; the 27–31B models
 *  write 25–55/s on this card). */
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
    let j: { choices?: Array<{ delta?: { content?: string; reasoning?: string }; finish_reason?: string | null }>; usage?: ChatAnswer['usage']; error?: ChatAnswer['error'] };
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) error = j.error;
    const c = j.choices?.[0];
    if (c?.delta?.content || c?.delta?.reasoning) { deltas++; windowDeltas++; if (!windowStart) windowStart = Date.now(); }
    if (c?.delta?.content) content += c.delta.content;
    if (c?.delta?.reasoning) reasoning += c.delta.reasoning;
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

/** A chat with the story model. The LOCAL model (Ollama on this machine's GPU) runs under the shared GPU lease as the
 *  LLM family (docs/BACKEND-AUDIT-2026-10.md H7, step 8): it waits its turn for the card, and the engines of other
 *  families unload first; when another family takes the card, Ollama is told to unload (`keep_alive: 0`). A hosted
 *  model needs no card. */
export async function chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmResult> {
  const cfg = resolveProvider(opts.provider);
  if (cfg.provider === 'openai-compatible' && isLocalOllama(cfg.baseUrl)) {
    const { gpuLease } = await import('../gpu/lease');
    return gpuLease('LLM', llmLeaseMb(cfg.model), () => chatWith(cfg, messages, opts), { jobId: opts.jobId });
  }
  return chatWith(cfg, messages, opts);
}

async function chatWith(cfg: ReturnType<typeof resolveProvider>, messages: LlmMessage[], opts: LlmOptions): Promise<LlmResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? (cfg.provider === 'openai-compatible' && isLocalOllama(cfg.baseUrl) ? localDeadlineMs((opts.maxTokens ?? 8000) + (reasoningOf(opts) ? opts.reasoningTokens ?? DEFAULT_REASONING_TOKENS : 0)) : 300_000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // a stopped job (cancel, deadline, lost lease) aborts the request with its own reason (src/server/jobs/context.ts)
  const unlink = followJobSignal(ctrl);
  try {
    if (cfg.provider === 'minimax' || cfg.provider === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const body: Record<string, unknown> = { model: cfg.model, max_tokens: opts.maxTokens ?? 8000, temperature: opts.temperature ?? 0.7, messages: rest, ...(system ? { system } : {}) };
      if (cfg.provider === 'minimax') body.thinking = { type: 'disabled' };
      const res = await fetch(`${cfg.baseUrl}/v1/messages`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, authorization: `Bearer ${cfg.apiKey}`, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({})) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string; type?: string }; base_resp?: { status_code?: number; status_msg?: string } };
      if (!res.ok || json.error) throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${json.error?.message ?? json.base_resp?.status_msg ?? `HTTP ${res.status}`}`, { status: res.status, type: json.error?.type });
      const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      return { text, provider: cfg.provider, model: cfg.model, inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens, ms: Date.now() - t0, finishReason: json.stop_reason, truncated: json.stop_reason === 'max_tokens', maxTokens: body.max_tokens as number };
    }
    // OpenAI-compatible. The local Ollama answers as a STREAM: a long answer from a large (partly CPU-offloaded) model
    // can take longer than Node's fetch waits for response headers (300 s), and a stream shows a stalled engine early
    const local = isLocalOllama(cfg.baseUrl);
    // an explicit reasoning call gets its thinking budget on top of the answer's, inside the context's room
    const think = local && reasoningOf(opts);
    const maxTokens = think ? Math.min((opts.maxTokens ?? 8000) + (opts.reasoningTokens ?? DEFAULT_REASONING_TOKENS), Math.max(opts.maxTokens ?? 8000, env().OLLAMA_CONTEXT_LENGTH - estimateTokens(messages) - CONTEXT_MARGIN_TOKENS)) : opts.maxTokens ?? 8000;
    const res = await withTimeout(fetch(`${guardedEngineUrl(cfg.baseUrl, 'the local story model')}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify({ model: cfg.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: maxTokens, ...(local ? { stream: true, stream_options: { include_usage: true }, options: { num_ctx: env().OLLAMA_CONTEXT_LENGTH }, keep_alive: env().OLLAMA_KEEP_ALIVE, ...localModelRequest(cfg.model, think) } : { stream: false }) }) }), timeoutMs, `${cfg.provider} ${cfg.model}`);
    const json = /text\/event-stream/i.test(res.headers.get('content-type') ?? '') && res.ok
      ? await withTimeout(readChatStream(res, ctrl, LOCAL_STALL_MS), timeoutMs, `${cfg.provider} ${cfg.model}`)
      : await res.json().catch(() => ({})) as ChatAnswer;
    if (!res.ok || json.error) throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${json.error?.message ?? `HTTP ${res.status}`}`, { status: res.status });
    const text = json.choices?.[0]?.message?.content ?? '';
    const finishReason = json.choices?.[0]?.finish_reason;
    // reasoning the studio asked to be off still spends the answer's budget: say so (a server that ignores the switch)
    const reasoning = json.choices?.[0]?.message?.reasoning ?? '';
    if (reasoning && !think) log.warn({ model: cfg.model, reasoningChars: reasoning.length, outputTokens: json.usage?.completion_tokens }, 'the local model reasoned although thinking is off');
    return { text, provider: cfg.provider, model: cfg.model, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, ms: Date.now() - t0, finishReason, truncated: finishReason === 'length', maxTokens };
  } catch (e) {
    const reason = stopReasonOf(ctrl.signal);
    // a stalled model is unloaded so the retry loads it again onto a card with room (never left crawling)
    if (reason instanceof LocalModelStalled) {
      log.warn({ model: cfg.model, err: reason.message }, 'local model stalled: unloading it');
      await fetch(`${cfg.baseUrl.replace(/\/v1\/?$/, '')}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model, keep_alive: 0 }), signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
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
    const budget = history.length > messages.length ? Math.min(maxTokens ?? 8000, outputRoom(history, { provider: opts.provider })) : maxTokens;
    last = await chat(history, { ...opts, maxTokens: budget, temperature: attempt === 1 ? opts.temperature : Math.max(0.2, (opts.temperature ?? 0.7) - 0.2) });
    // cut off: JSON left open, or the engine stopped at the limit before any JSON (a closed object is complete)
    if (isUnterminatedJson(last.text) || (last.truncated && !/[{[]/.test(last.text))) {
      const cutAt = last.maxTokens ?? maxTokens ?? 8000;
      const room = outputRoom(history, { provider: opts.provider, promptTokens: last.inputTokens });
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

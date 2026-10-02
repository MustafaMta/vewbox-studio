import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { log } from '../log';

/** THE STORY ENGINE'S LANGUAGE MODEL — one small interface over three hosted/local backends:
 *  - MiniMax text (M3) through its Anthropic-compatible messages endpoint (the same MiniMax key as video);
 *  - Anthropic Claude;
 *  - any OpenAI-compatible chat server (the bundled Ollama, vLLM, LM Studio …).
 *  Every call asks for JSON and validates it against a schema; a bad answer is sent back once with the validation
 *  error so the model can repair it. Nothing here invents content when the model is unavailable: it fails. */

export type LlmProvider = 'minimax' | 'anthropic' | 'openai-compatible';

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmOptions { maxTokens?: number; temperature?: number; provider?: LlmProvider; timeoutMs?: number; jobId?: string }
export interface LlmResult { text: string; provider: LlmProvider; model: string; inputTokens?: number; outputTokens?: number; ms: number }

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
  return { provider: chosen, model: e.OPENAI_COMPATIBLE_MODEL || 'default', baseUrl: e.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, ''), apiKey: e.OPENAI_COMPATIBLE_API_KEY || 'none' };
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new StudioError('PROVIDER', `${what} timed out after ${Math.round(ms / 1000)} s`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (t) clearTimeout(t); }
}

export async function chat(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmResult> {
  const cfg = resolveProvider(opts.provider);
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (cfg.provider === 'minimax' || cfg.provider === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const body: Record<string, unknown> = { model: cfg.model, max_tokens: opts.maxTokens ?? 8000, temperature: opts.temperature ?? 0.7, messages: rest, ...(system ? { system } : {}) };
      if (cfg.provider === 'minimax') body.thinking = { type: 'disabled' };
      const res = await fetch(`${cfg.baseUrl}/v1/messages`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, authorization: `Bearer ${cfg.apiKey}`, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({})) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string; type?: string }; base_resp?: { status_code?: number; status_msg?: string } };
      if (!res.ok || json.error) throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${json.error?.message ?? json.base_resp?.status_msg ?? `HTTP ${res.status}`}`, { status: res.status, type: json.error?.type });
      const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      return { text, provider: cfg.provider, model: cfg.model, inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens, ms: Date.now() - t0 };
    }
    // OpenAI-compatible
    const res = await withTimeout(fetch(`${cfg.baseUrl}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify({ model: cfg.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 8000, stream: false, ...(cfg.baseUrl.includes('11434') ? { options: { num_ctx: 32768 }, keep_alive: '2m', think: false } : {}) }) }), timeoutMs, `${cfg.provider} ${cfg.model}`);
    const json = await res.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string; reasoning?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
    if (!res.ok || json.error) throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${json.error?.message ?? `HTTP ${res.status}`}`, { status: res.status });
    const text = json.choices?.[0]?.message?.content ?? '';
    return { text, provider: cfg.provider, model: cfg.model, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, ms: Date.now() - t0 };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model} timed out after ${Math.round(timeoutMs / 1000)} s`);
    if (e instanceof StudioError) throw e;
    throw new StudioError('PROVIDER', `${cfg.provider} ${cfg.model}: ${(e as Error).message}`);
  } finally { clearTimeout(timer); }
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

/** Ask for JSON matching a schema; on a validation failure, show the model its mistake once and retry. */
export async function json<T>(schema: z.ZodType<T>, messages: LlmMessage[], opts: LlmOptions & { repairs?: number } = {}): Promise<{ data: T; result: LlmResult; attempts: number }> {
  const repairs = opts.repairs ?? 2;
  const history: LlmMessage[] = [...messages];
  let last: LlmResult | null = null;
  for (let attempt = 1; attempt <= repairs + 1; attempt++) {
    last = await chat(history, { ...opts, temperature: attempt === 1 ? opts.temperature : Math.max(0.2, (opts.temperature ?? 0.7) - 0.2) });
    let parsed: unknown;
    try { parsed = JSON.parse(extractJson(last.text)); } catch (e) {
      log.warn({ attempt, provider: last.provider, err: (e as Error).message, head: last.text.slice(0, 200) }, 'llm answer was not json');
      history.push({ role: 'assistant', content: last.text }, { role: 'user', content: `That was not valid JSON (${(e as Error).message}). Answer again with only the JSON object, no prose, no code fences.` });
      continue;
    }
    const v = schema.safeParse(parsed);
    if (v.success) return { data: v.data, result: last, attempts: attempt };
    const issues = v.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    log.warn({ attempt, provider: last.provider, issues }, 'llm json failed validation');
    history.push({ role: 'assistant', content: last.text }, { role: 'user', content: `The JSON does not match the required shape. Fix exactly these problems and answer with the complete corrected JSON only:\n${issues}` });
  }
  throw new StudioError('PROVIDER', `The story engine (${last?.provider ?? 'llm'}) did not produce a valid answer after ${repairs + 1} attempts.`);
}

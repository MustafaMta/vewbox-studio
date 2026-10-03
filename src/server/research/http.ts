import { userAgent } from './config';

/** HTTP FOR RESEARCH — every call has a 15 s timeout (also bounded by the caller's AbortSignal), an honest
 *  User-Agent, and per-source spacing (GDELT asks for at most one request every 5 s). Errors name the host and path,
 *  never the query string (where a key could be). */

export const CALL_TIMEOUT_MS = 15_000;

export class ResearchHttpError extends Error {
  constructor(readonly status: number, message: string, readonly body?: string) { super(message); this.name = 'ResearchHttpError'; }
}

const where = (url: string) => { try { const u = new URL(url); return `${u.host}${u.pathname}`; } catch { return 'the source'; } };

export interface CallOptions { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number; accept?: string }

/** One HTTP call: the parsed JSON (or the text when the source answered text), with the status. A non-2xx answer
 *  throws ResearchHttpError with the status, so a provider maps 401/403/429 to its coverage. */
export async function call(url: string, opts: CallOptions = {}): Promise<{ status: number; json?: unknown; text: string }> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? CALL_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? 'GET', headers: { 'User-Agent': userAgent(), accept: opts.accept ?? 'application/json', ...(opts.headers ?? {}) }, body: opts.body, signal });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ResearchHttpError(0, `${where(url)} did not answer within ${Math.round((opts.timeoutMs ?? CALL_TIMEOUT_MS) / 1000)} s`);
    throw new ResearchHttpError(0, `${where(url)} is not reachable (${err.message})`);
  }
  const text = await res.text();
  if (!res.ok) throw new ResearchHttpError(res.status, `${where(url)} answered HTTP ${res.status}`, text.slice(0, 300));
  let json: unknown;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, json, text };
}

/** Per-source spacing, process-wide: calls with the same key run one after another, at least `minMs` apart. */
const lanes = new Map<string, { last: number; chain: Promise<unknown> }>();
export function spaced<T>(key: string, minMs: number, fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  const lane = lanes.get(key) ?? { last: 0, chain: Promise.resolve() };
  lanes.set(key, lane);
  const run = lane.chain.catch(() => undefined).then(async () => {
    const wait = lane.last + minMs - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { lane.last = Date.now(); }
  });
  lane.chain = run;
  return run;
}
/** Tests: forget the spacing history. */
export const resetSpacing = () => lanes.clear();

/** At most `max` characters, cut at a word. */
export function clip(s: string | undefined, max = 200): string | undefined {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30))}…`;
}

/** A number the source returned (a string or a number), or undefined: never a guess. */
export const num = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };

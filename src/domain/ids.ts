/** IDS AND CLOCKS FOR COMMANDS — a command runs twice: once in the browser (optimistically) and once on the server
 *  (authoritatively). Both must produce the same ids and timestamps, so a command carries a seed and a time, and the
 *  reducers draw ids from a deterministic sequence while it runs. Outside a command (UI-local ids), `nid` is random. */

interface Ctx { seed: string; at: string; counter: number }
let current: Ctx | null = null;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function randomId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 10);
}

/** A short id with a readable prefix: `shot-3f9a1c2b7d`. Deterministic inside a command. */
export function nid(prefix: string): string {
  if (!current) return `${prefix}-${randomId()}`;
  current.counter += 1;
  const a = fnv1a(`${current.seed}:${current.counter}:a`).toString(16).padStart(8, '0');
  const b = fnv1a(`${current.seed}:${current.counter}:b`).toString(16).padStart(8, '0');
  return `${prefix}-${(a + b).slice(0, 10)}`;
}

/** The command's clock, or the real one outside a command. */
export const now = (): string => current?.at ?? new Date().toISOString();

/** Run `fn` with a fixed id sequence and clock. Nested calls are not supported and not needed. */
export function withCommandContext<T>(seed: string, at: string, fn: () => T): T {
  const previous = current;
  current = { seed, at, counter: 0 };
  try { return fn(); } finally { current = previous; }
}

export const newSeed = (): string => randomId() + randomId();

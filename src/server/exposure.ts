/** NETWORK EXPOSURE (docs/BACKEND-AUDIT-2026-10.md H1, step 2). The studio listens on the loopback interface by
 *  default; the LAN is an explicit opt-in (STUDIO_BIND, or WEB_BIND for the compose stack) and needs a password
 *  (STUDIO_PASSWORD, HTTP Basic in src/proxy.ts). STUDIO_ALLOW_OPEN_LAN=1 is the deliberate, logged exception (an
 *  open studio on a trusted network). Dependency-free: scripts/serve.ts and src/instrumentation.ts both use it. */

export const DEFAULT_BIND = '127.0.0.1';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const isLoopback = (host: string) => LOOPBACK.has(host.trim().toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host.trim());

export type Exposure = { ok: true; host: string; lan: boolean; open: boolean } | { ok: false; host: string; reason: string };

/** Where to listen, and whether that is allowed with the configured password. */
export function checkExposure(env: Record<string, string | undefined>): Exposure {
  const host = (env.STUDIO_BIND || DEFAULT_BIND).trim();
  if (isLoopback(host)) return { ok: true, host, lan: false, open: !env.STUDIO_PASSWORD };
  if (env.STUDIO_PASSWORD) return { ok: true, host, lan: true, open: false };
  if (env.STUDIO_ALLOW_OPEN_LAN === '1') return { ok: true, host, lan: true, open: true };
  return { ok: false, host, reason: `Refusing to listen on ${host} without a password: anyone on the network could change or empty the studio. Set STUDIO_PASSWORD (or STUDIO_ALLOW_OPEN_LAN=1 to accept an open studio on a trusted network), or leave STUDIO_BIND unset to stay on ${DEFAULT_BIND}.` };
}

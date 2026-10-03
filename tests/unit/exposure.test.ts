import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkExposure, isLoopback } from '@/server/exposure';

/** The studio listens on loopback by default; the LAN is an explicit opt-in that needs a password
 *  (docs/BACKEND-AUDIT-2026-10.md H1, step 2). */

describe('where the studio listens', () => {
  it('defaults to 127.0.0.1, open on this machine only', () => {
    expect(checkExposure({})).toEqual({ ok: true, host: '127.0.0.1', lan: false, open: true });
    for (const h of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.0.1.1']) expect(isLoopback(h), h).toBe(true);
    for (const h of ['0.0.0.0', '::', '192.168.1.20', 'studio.local']) expect(isLoopback(h), h).toBe(false);
  });
  it('a LAN address needs STUDIO_PASSWORD (or the explicit open-LAN opt-in)', () => {
    expect(checkExposure({ STUDIO_BIND: '0.0.0.0' })).toMatchObject({ ok: false, reason: expect.stringMatching(/without a password/) });
    expect(checkExposure({ STUDIO_BIND: '0.0.0.0', STUDIO_PASSWORD: 'pw' })).toEqual({ ok: true, host: '0.0.0.0', lan: true, open: false });
    expect(checkExposure({ STUDIO_BIND: '192.168.1.20', STUDIO_ALLOW_OPEN_LAN: '1' })).toEqual({ ok: true, host: '192.168.1.20', lan: true, open: true });
  });
  it('the dev/start scripts and the compose port go through it, loopback by default', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe('tsx scripts/serve.ts dev');
    expect(pkg.scripts.start).toBe('tsx scripts/serve.ts start');
    const compose = fs.readFileSync('compose.yaml', 'utf8');
    expect(compose).toContain('"${WEB_BIND:-127.0.0.1}:${WEB_PORT:-4200}:4200"');
    expect(compose).not.toMatch(/- "\$\{WEB_PORT:-4200\}:4200"/);
  });
});

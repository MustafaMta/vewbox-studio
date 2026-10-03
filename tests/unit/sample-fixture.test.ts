import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Audit C4/D2: the sample studio is a test fixture, not product content. The browser never imports it (it used to
 *  be the store's initial state, shipping the whole fixture in the shared client chunk), Settings offers no reset to
 *  it, and the server loads it only when started with STUDIO_SAMPLE_FIXTURE=1 (the browser and API tests' reset). */

const fake = vi.hoisted(() => ({ replaced: [] as string[] }));
vi.mock('@/server/studio/seed', async (orig) => ({ ...(await orig<typeof import('@/server/studio/seed')>()), replaceStudio: async (kind: string) => { fake.replaced.push(kind); return { version: 2, hash: 'h' }; } }));
vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: { assets: [] }, version: 1, hash: 'h' }), notifyJobs: async () => undefined }));
vi.mock('@/server/jobs/queue', () => ({ clearJobs: async () => ({ removed: 0, running: 0 }) }));
vi.mock('@/server/media', () => ({ removeFile: async () => undefined, libraryRoot: () => '/nowhere' }));

import { POST } from '@/app/api/studio/reset/route';

const reset = (kind: string) => POST(new Request('http://studio.test/api/studio/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) }), undefined);
const flag = process.env.STUDIO_SAMPLE_FIXTURE;
// a test server (src/server/test-guard.ts): reset is allowed, on a database that is not the live one
beforeEach(() => { fake.replaced = []; delete process.env.STUDIO_SAMPLE_FIXTURE; vi.stubEnv('VEWBOX_ALLOW_RESET', '1'); vi.stubEnv('DATABASE_URL', 'postgres://u:p@127.0.0.1:1/vewbox_test'); });
afterEach(() => { vi.unstubAllEnvs(); if (flag === undefined) delete process.env.STUDIO_SAMPLE_FIXTURE; else process.env.STUDIO_SAMPLE_FIXTURE = flag; });

describe('POST /api/studio/reset', () => {
  it('refuses the sample studio on a server without STUDIO_SAMPLE_FIXTURE=1 (NOT_CONFIGURED) and changes nothing', async () => {
    const res = await reset('sample');
    expect(res.status).toBe(424);
    expect(((await res.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringContaining('STUDIO_SAMPLE_FIXTURE=1') });
    expect(fake.replaced).toEqual([]);
  });

  it('loads it on a server started with STUDIO_SAMPLE_FIXTURE=1 (the test servers)', async () => {
    process.env.STUDIO_SAMPLE_FIXTURE = '1';
    expect((await reset('sample')).status).toBe(200);
    expect(fake.replaced).toEqual(['sample']);
  });

  it('empties a test studio whatever the fixture flag', async () => {
    expect((await reset('empty')).status).toBe(200);
    expect(fake.replaced).toEqual(['empty']);
  });
});

describe('the fixture stays out of the product', () => {
  const src = path.resolve('src');
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p); } };
  walk(src);

  it('only server code imports src/domain/sample.ts (nothing the browser loads)', () => {
    const importers = files.filter((f) => /from ['"](@\/domain\/sample|\.{1,2}\/(\.\.\/)*(domain\/)?sample)['"]/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(src, f).replace(/\\/g, '/'));
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((f) => !f.startsWith('server/'))).toEqual([]);
  });

  it('the browser store starts from an empty studio, not from the fixture', () => {
    const store = fs.readFileSync(path.join(src, 'studio', 'store.tsx'), 'utf8');
    expect(store).toMatch(/useState<StudioState>\(\(\) => emptyStudio\(DEFAULT_SETTINGS\)\)/);
  });

  it('Settings offers no reset to the sample data', () => {
    const page = fs.readFileSync(path.join(src, 'app', '(app)', 'settings', 'page.tsx'), 'utf8');
    expect(page).not.toMatch(/reset\(\)|btn\.reset|resetConfirm|toast\.reset/);
  });
});

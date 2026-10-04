import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertNotLiveDatabase, databaseName, isLiveDatabase, isTestLibrary, markTestLibrary, resetAllowed, testDatabaseUrl, TEST_LIBRARY_MARKER, withDatabase } from '@/server/test-guard';

/** TEST SAFETY (docs/BACKEND-AUDIT-2026-10.md C3, step 1): tests, resets and fixtures never touch the producer's
 *  studio — not its database `vewbox`, not its library files. */

const LIVE = 'postgres://vewbox:secret@127.0.0.1:5432/vewbox';
const TEST = 'postgres://vewbox:secret@127.0.0.1:5432/vewbox_test_backend';

describe('the database guard', () => {
  it('knows the live database by name (any case), and treats an unreadable URL as live', () => {
    expect(databaseName(TEST)).toBe('vewbox_test_backend');
    expect(isLiveDatabase(LIVE)).toBe(true);
    expect(isLiveDatabase('postgres://u:p@h:5432/VEWBOX')).toBe(true);
    expect(isLiveDatabase('not a url')).toBe(true);
    expect(isLiveDatabase(undefined)).toBe(true);
    expect(isLiveDatabase('postgres://u:p@h:5432/')).toBe(true);
    expect(isLiveDatabase(TEST)).toBe(false);
    expect(isLiveDatabase(TEST, { VEWBOX_LIVE_DATABASES: 'vewbox_prod, vewbox_test_backend' })).toBe(true);
  });

  it('assertNotLiveDatabase refuses the live one and returns the name of a test one', () => {
    expect(() => assertNotLiveDatabase(LIVE, 'worker tests')).toThrow(/live database "vewbox"/);
    expect(() => assertNotLiveDatabase('', 'worker tests')).toThrow(/missing or unreadable/);
    expect(assertNotLiveDatabase(TEST, 'worker tests')).toBe('vewbox_test_backend');
  });

  it('the test URL is TEST_DATABASE_URL, else DATABASE_URL renamed to vewbox_test — never the live one', () => {
    expect(testDatabaseUrl({ DATABASE_URL: LIVE })).toBe('postgres://vewbox:secret@127.0.0.1:5432/vewbox_test');
    expect(testDatabaseUrl({ DATABASE_URL: LIVE, TEST_DATABASE_URL: TEST })).toBe(TEST);
    expect(() => testDatabaseUrl({ DATABASE_URL: TEST, TEST_DATABASE_URL: LIVE })).toThrow(/live database/);
    expect(() => testDatabaseUrl({})).toThrow(/missing or unreadable/);
    expect(withDatabase(LIVE, 'x_test')).toBe('postgres://vewbox:secret@127.0.0.1:5432/x_test');
  });

  it('reset is allowed only with VEWBOX_ALLOW_RESET=1 on a database that is not live', () => {
    expect(resetAllowed({ DATABASE_URL: TEST }).ok).toBe(false);
    expect(resetAllowed({ DATABASE_URL: TEST, VEWBOX_ALLOW_RESET: 'true' }).ok).toBe(false);
    expect(resetAllowed({ DATABASE_URL: LIVE, VEWBOX_ALLOW_RESET: '1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/live database "vewbox"/) });
    expect(resetAllowed({ DATABASE_URL: 'garbage', VEWBOX_ALLOW_RESET: '1' }).ok).toBe(false);
    expect(resetAllowed({ DATABASE_URL: TEST, VEWBOX_ALLOW_RESET: '1' })).toEqual({ ok: true, database: 'vewbox_test_backend' });
  });

  it('a library is a test library only when it carries the marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-guard-'));
    try {
      expect(isTestLibrary(d)).toBe(false);
      markTestLibrary(d);
      expect(fs.existsSync(path.join(d, TEST_LIBRARY_MARKER))).toBe(true);
      expect(isTestLibrary(d)).toBe(true);
      expect(isTestLibrary(path.join(d, 'missing'))).toBe(false);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
});

// ------------------------------------------------------------------------------------------- the reset route

const fake = vi.hoisted(() => ({ replaced: [] as string[], cleared: 0, removed: [] as string[], root: '' }));
vi.mock('@/server/studio/seed', async (orig) => ({ ...(await orig<typeof import('@/server/studio/seed')>()), replaceStudio: async (kind: string) => { fake.replaced.push(kind); return { version: 2, hash: 'h' }; } }));
vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: { assets: [{ id: 'up-1', sample: false, provenance: { path: 'video/2026/10/up-1.mp4' } }, { id: 'take-01', sample: true, src: '/sample/x.mp4' }] }, version: 1, hash: 'h' }), notifyJobs: async () => undefined }));
vi.mock('@/server/jobs/queue', () => ({ clearJobs: async () => { fake.cleared++; return { removed: 3, running: 0 }; } }));
vi.mock('@/server/media', () => ({ removeFile: async (rel: string) => { fake.removed.push(rel); }, libraryRoot: () => fake.root }));

import { POST } from '@/app/api/studio/reset/route';

const reset = (kind: string) => POST(new Request('http://studio.test/api/studio/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) }), undefined);

describe('POST /api/studio/reset is a test operation', () => {
  let lib = '';
  beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-reset-lib-')); Object.assign(fake, { replaced: [], cleared: 0, removed: [], root: lib }); });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(lib, { recursive: true, force: true }); });

  it('is refused (403 FORBIDDEN) without VEWBOX_ALLOW_RESET=1, and nothing is touched', async () => {
    vi.stubEnv('DATABASE_URL', TEST); vi.stubEnv('VEWBOX_ALLOW_RESET', '');
    for (const kind of ['empty', 'sample']) {
      const res = await reset(kind);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    }
    expect(fake).toMatchObject({ replaced: [], cleared: 0, removed: [] });
  });

  it('is refused on the live database even with the flag', async () => {
    vi.stubEnv('DATABASE_URL', LIVE); vi.stubEnv('VEWBOX_ALLOW_RESET', '1'); vi.stubEnv('STUDIO_SAMPLE_FIXTURE', '1');
    const res = await reset('empty');
    expect(res.status).toBe(403);
    expect(fake).toMatchObject({ replaced: [], cleared: 0, removed: [] });
  });

  it('on a test database it resets, but keeps the files of a library that is not marked as a test library', async () => {
    vi.stubEnv('DATABASE_URL', TEST); vi.stubEnv('VEWBOX_ALLOW_RESET', '1');
    const res = await reset('empty');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jobsRemoved: 3, filesRemoved: 0 });
    expect(fake.replaced).toEqual(['empty']);
    expect(fake.removed).toEqual([]);
  });

  it('in a marked test library it removes the non-sample files of the removed assets', async () => {
    vi.stubEnv('DATABASE_URL', TEST); vi.stubEnv('VEWBOX_ALLOW_RESET', '1');
    markTestLibrary(lib);
    const res = await reset('empty');
    expect(await res.json()).toMatchObject({ filesRemoved: 1 });
    expect(fake.removed).toEqual(['video/2026/10/up-1.mp4']);
  });
});

describe('the suites point at an isolated server by default', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(f), 'utf8');
  it('no test config or helper defaults to the studio on :4200', () => {
    for (const f of ['playwright.config.ts', 'vitest.api.config.ts', 'tests/e2e/helpers.ts', 'tests/api/studio.test.ts', 'tests/api/negative.test.ts', 'scripts/qa-journeys.mjs']) expect(read(f), f).not.toMatch(/localhost:4200|127\.0\.0\.1:4200/);
    expect(read('playwright.config.ts')).toMatch(/globalSetup: '\.\/tests\/e2e\/global-setup\.ts'/);
    expect(read('vitest.api.config.ts')).toMatch(/tests\/setup\/api-server\.ts/);
  });
  it('the worker suite takes its database from the test guard, never from .env directly', () => {
    const cfg = read('vitest.worker.config.ts');
    expect(cfg).toMatch(/process\.env\.DATABASE_URL = resolveTestDatabaseUrl\(\)/);
    expect(cfg).toMatch(/process\.env\.LIBRARY_ROOT = testLibraryRoot\(/);
  });
});

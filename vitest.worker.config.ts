import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEnvFiles, resolveTestDatabaseUrl, testLibraryRoot } from './scripts/lib/test-db';

/** WORKER TESTS talk to a real database and exercise the queue contracts a browser cannot reach: leases, stale
 *  recovery, backoff, idempotency, cancellation, fencing. They WRITE (they claim and complete jobs), so they run on the
 *  TEST database only (docs/BACKEND-AUDIT-2026-10.md C3): TEST_DATABASE_URL, or DATABASE_URL with its database renamed
 *  to `vewbox_test`. The live `vewbox` is refused before anything runs (src/server/test-guard.ts), the database is
 *  created and migrated by the global setup, and the library is a marked scratch folder — never LIBRARY_ROOT.
 *  Engine URLs (ComfyUI, TTS, ASR) still come from .env / .env.local, as the host worker reads them. */
const fromShell = new Set(Object.keys(process.env));
for (const [k, v] of Object.entries(readEnvFiles())) if (!fromShell.has(k)) process.env[k] = v;
// never the files' (live) values for these
process.env.DATABASE_URL = resolveTestDatabaseUrl();
// the GPU lease of the worker suite is its own test database (src/server/gpu/lease-db.ts): it never queues on - or
// writes to - the live studio's lease, so the guard refuses its calls to the machine's real engines (the suites use
// fixture engines: VEWBOX_FIXTURE_ENGINES=1 where they stand in for them)
process.env.GPU_LEASE_DATABASE_URL = process.env.DATABASE_URL;
process.env.LIBRARY_ROOT = testLibraryRoot('worker');
process.env.TMP_ROOT = path.join(process.env.LIBRARY_ROOT, 'tmp');

export default defineConfig({
  test: { include: ['tests/worker/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false, globalSetup: ['tests/setup/test-db.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

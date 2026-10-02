import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/** WORKER TESTS talk to the real database (DATABASE_URL from .env / .env.local, as the host worker does) and exercise
 *  the queue contracts a browser cannot reach: leases, stale recovery, backoff, idempotency, cancellation. */
const fromShell = new Set(Object.keys(process.env));
for (const f of ['.env', '.env.local']) { // later files override earlier ones; the shell overrides both
  try {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !fromShell.has(m[1])) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  } catch { /* optional */ }
}

export default defineConfig({
  test: { include: ['tests/worker/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { TEST_PORT } from './src/server/test-guard';

/** API tests run against a TEST studio server and its test database (docs/BACKEND-AUDIT-2026-10.md C3): STUDIO_URL,
 *  default http://127.0.0.1:4210 — never the studio's :4200. The global setup refuses any server whose /api/health does
 *  not report `testServer: true` (VEWBOX_ALLOW_RESET=1 on a database that is not `vewbox`), starts `pnpm test:server`
 *  when nothing answers, and loads the sample fixture. They use the real HTTP contracts: commands, uploads, media
 *  streaming, jobs, the event stream. */
process.env.STUDIO_URL ||= `http://127.0.0.1:${TEST_PORT}`;

export default defineConfig({
  test: { include: ['tests/api/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false, globalSetup: ['tests/setup/api-server.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** API tests run against a live studio server (BASE_URL, default http://localhost:4200) and its database. They use
 *  the real HTTP contracts: commands, uploads, media streaming, jobs, the event stream. */
export default defineConfig({
  test: { include: ['tests/api/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

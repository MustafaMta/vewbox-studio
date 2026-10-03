import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** EVIDENCE RUNS — real engines through the studio's own code paths, with the studio kept in memory (never the shared
 *  database) and the library in a scratch folder. Not part of `pnpm test`: run one on purpose, with the GPU free:
 *    pnpm exec vitest run --config vitest.evidence.config.ts tests/evidence/voice-identity-v2.evidence.ts */
export default defineConfig({
  test: { include: ['tests/evidence/**/*.evidence.ts'], environment: 'node', testTimeout: 60 * 60_000, hookTimeout: 10 * 60_000, setupFiles: ['tests/evidence/env.ts'], fileParallelism: false },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

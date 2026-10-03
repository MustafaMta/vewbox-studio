import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// unit tests never reach a real database or library: tests/setup/unit-env.ts points both at scratch values
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup/unit-env.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

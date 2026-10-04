import type { GpuFamily } from '@/server/gpu/lease';
import { registerEngine } from '@/server/gpu/unloaders';

/** THE GPU BUDGET — one RTX 5090, 32 GB. The lease lives in src/server/gpu/lease.ts since step 8 of
 *  docs/BACKEND-AUDIT-2026-10.md: a database row per request, shared by every worker and the web server, FIFO, with
 *  the engines' unloaders (src/server/gpu/unloaders.ts). This module keeps the worker's names for it. */

export { gpuLease, type GpuFamily, type GpuLease } from '@/server/gpu/lease';

/** Another service that holds weights for `family` and how it drops them (the built-in engines are registered in
 *  src/server/gpu/unloaders.ts). */
export function registerUnloader(family: GpuFamily, unload: () => Promise<void>) { registerEngine({ name: `extra-${family.toLowerCase()}`, serves: [family], unload }); }

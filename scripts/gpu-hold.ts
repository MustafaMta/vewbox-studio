/** GPU HOLD — run one command while holding the studio's GPU lease (src/server/gpu/lease.ts), so work outside the
 *  worker (model benchmarks, evaluation scripts, a direct ComfyUI or Ollama call) queues behind the worker's jobs and
 *  they behind it, instead of two models fighting for the RTX 5090. The lease is the same database row the worker
 *  takes: FIFO by ticket, the other families' engines unloaded first (src/server/gpu/unloaders.ts), released when the
 *  command exits (or expired 90 s after this process dies).
 *
 *  PRIORITY (the films first): a hold is BACKGROUND by default — it is admitted only when no worker request waits for
 *  the card and no worker GPU job is queued or preparing; it never preempts a holder; after 45 min of waiting it is
 *  served at the next free slot. `--priority normal` queues it FIFO with the worker's own requests (use sparingly).
 *
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts IMAGE 30400 -- node bench/images.mjs --case 3
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts --priority normal VIDEO 31900 -- node x.mjs
 *
 *  Family: IMAGE | VIDEO | TTS | ASR | MUSIC | LLM. Estimate: the measured peak in MB (docs/research/GPU-STAGING-2026-10.md).
 *  Hold the card for one bounded batch at a time (minutes, not hours): the acceptance run's jobs wait while it is held.
 *  The command inherits stdio; its exit code is this script's. */
import { spawn } from 'node:child_process';
import { gpuLease, type GpuFamily, type GpuPriority } from '../src/server/gpu/lease';

const FAMILIES: GpuFamily[] = ['IMAGE', 'VIDEO', 'TTS', 'ASR', 'MUSIC', 'LLM'];
let argv = process.argv.slice(2);
let priority: GpuPriority = 'background';
if (argv[0] === '--priority') { if (argv[1] !== 'normal' && argv[1] !== 'background') { console.error('--priority must be normal or background'); process.exit(2); } priority = argv[1]; argv = argv.slice(2); }
const [family, estimate] = argv;
// `--` before the command is optional (pnpm exec consumes it)
const cmd = argv[2] === '--' ? argv.slice(3) : argv.slice(2);
if (!FAMILIES.includes(family as GpuFamily) || !Number.isFinite(Number(estimate)) || cmd.length === 0) {
  console.error('usage: gpu-hold.ts [--priority background|normal] <IMAGE|VIDEO|TTS|ASR|MUSIC|LLM> <estimateMb> -- <command> [args…]');
  process.exit(2);
}

const t0 = Date.now();
const code = await gpuLease(family as GpuFamily, Number(estimate), () => new Promise<number>((resolve) => {
  console.error(`[gpu-hold] ${family} (${priority}) granted after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${cmd.join(' ')}`);
  // Windows needs the shell for pnpm/npx (.cmd shims); the shell then re-splits the line, so quote each argument
  const win = process.platform === 'win32';
  const q = (a: string) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const child = win ? spawn(cmd.map(q).join(' '), { stdio: 'inherit', shell: true }) : spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  const stop = () => child.kill();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  child.on('exit', (c, sig) => resolve(c ?? (sig ? 1 : 0)));
  child.on('error', (e) => { console.error(`[gpu-hold] ${e.message}`); resolve(1); });
}), { priority });
console.error(`[gpu-hold] ${family} released after ${((Date.now() - t0) / 1000).toFixed(1)} s (exit ${code})`);
process.exit(code);

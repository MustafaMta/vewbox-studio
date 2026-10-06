import { GPU_FAMILIES, type GpuFamily, type GpuPriority } from './lease';

/** The arguments of scripts/gpu-hold.ts, parsed (pure, tested): `[--priority background|normal] <FAMILY> <estimateMb>
 *  [--] <command…>`. A hold is BACKGROUND unless `--priority normal` is given. Every family the lease knows is accepted
 *  (LIPSYNC included). Returns the parsed request or the usage error. */
export interface HoldArgs { family: GpuFamily; estimateMb: number; priority: GpuPriority; cmd: string[] }

export const HOLD_USAGE = `usage: gpu-hold.ts [--priority background|normal] <${GPU_FAMILIES.join('|')}> <estimateMb> -- <command> [args…]`;

export function parseHoldArgs(argv: readonly string[]): HoldArgs | { error: string } {
  let a = [...argv];
  let priority: GpuPriority = 'background';
  if (a[0] === '--priority') {
    if (a[1] !== 'normal' && a[1] !== 'background') return { error: '--priority must be normal or background' };
    priority = a[1];
    a = a.slice(2);
  }
  const [family, estimate] = a;
  // `--` before the command is optional (pnpm exec consumes it)
  const cmd = a[2] === '--' ? a.slice(3) : a.slice(2);
  if (!GPU_FAMILIES.includes(family as GpuFamily) || !Number.isFinite(Number(estimate)) || cmd.length === 0) return { error: HOLD_USAGE };
  return { family: family as GpuFamily, estimateMb: Number(estimate), priority, cmd };
}

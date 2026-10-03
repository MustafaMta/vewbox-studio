import type { Handler } from './index';
import { readState, command } from '@/server/studio/engine';
import { assetFile, ffprobe, decodeCheck } from '@/server/media';
import { StudioError } from '@/domain/errors';

/** Re-validate a stored file with ffprobe and a full decode; marks the asset unavailable when it is broken. */
export const mediaProbe: Handler = async (ctx) => {
  const { assetId } = ctx.job.payload as { assetId: string };
  const { state } = await readState();
  const a = state.assets.find((x) => x.id === assetId);
  if (!a) throw new StudioError('NOT_FOUND', 'Asset not found');
  if (!a.sample && !a.provenance?.path) throw new StudioError('INVALID', 'Asset has no file path');
  await ctx.progress('VALIDATING', { phase: 'probing' });
  const file = assetFile(a);
  const probe = await ctx.tool('media.probe', () => ffprobe(file), { input: { file } });
  const decode = a.kind === 'IMAGE' ? { ok: true } : await ctx.tool('media.probe', () => decodeCheck(file), { label: 'decode', input: { file } });
  await command('updateAsset', [assetId, { width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, unavailable: !decode.ok, provenance: { ...(a.provenance ?? {}), probe } }], 'worker');
  return { probe, decode };
};

import type { Handler } from './index';
import { readState, command } from '@/server/studio/engine';
import { assetFile, ffprobe, decodeCheck } from '@/server/media';
import { presentationOfAsset } from '@/server/media/presentation';
import type { Presentation } from '@/domain/presentation';
import { StudioError } from '@/domain/errors';

/** Re-validate a stored file with ffprobe and a full decode; marks the asset unavailable when it is broken. A picture
 *  that has no presentation yet (docs/DESIGN-SYSTEM-V4.md §2.4: the measure failed at ingest — the upload route then
 *  queues this job — or the picture predates it) is measured from its pixels here; a failed measure is reported as
 *  an event and leaves the field empty, it never fails the probe. A presentation already stored is never redone. */
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
  let presentation: Presentation | undefined;
  if (a.kind === 'IMAGE' && !a.presentation) {
    try { presentation = await ctx.tool('media.probe', () => presentationOfAsset({ ...a, width: probe.width ?? a.width, height: probe.height ?? a.height }, file), { label: 'presentation', input: { file } }); }
    catch (e) { await ctx.event('warn', `the picture's presentation could not be measured: ${(e as Error).message.split('\n')[0]}`, { assetId }); }
  }
  await command('updateAsset', [assetId, { width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, unavailable: !decode.ok, provenance: { ...(a.provenance ?? {}), probe }, ...(presentation ? { presentation } : {}) }], 'worker');
  return { probe, decode, ...(presentation ? { presentation } : {}) };
};

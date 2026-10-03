import type { Asset, Production } from '@/domain/types';

/** THE BEST FRAME OF A PRODUCTION (docs/CONTRACTS-REDESIGN-BACKEND.md B7; docs/DESIGN-SYSTEM-V5.md §5.9) — what the
 *  frame poster is cut from when there is no key art: the selected take's poster frame of the first shot of the last
 *  scene, else the first opening frame in storyboard order. Pure; the backfill and the page use the same choice, so
 *  the readout ("Frame poster · shot 2.4") names the right shot. */

/** `videoAssetId`: for a take's poster frame, the take's own video — the same frame at its native size (the poster
 *  JPEG is 640 px wide); `frameSeconds` is the moment the poster was taken (src/worker/handlers/take.ts). */
export interface BestFrame { assetId: string; source: 'TAKE_POSTER' | 'OPENING_FRAME'; shotId: string; sceneNumber?: number; shotNumber: number; takeId?: string; videoAssetId?: string; frameSeconds?: number }

const posterIdOf = (a: Asset | undefined): string | undefined => { const m = a?.poster ? /^\/api\/media\/([^/?#]+)/.exec(a.poster) : null; return m?.[1]; };

export function bestFrameFor(p: Pick<Production, 'scenes' | 'shots'>, assets: Asset[]): BestFrame | null {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const usable = (id: string | undefined): id is string => Boolean(id) && (byId.get(id!)?.kind === 'IMAGE') && !byId.get(id!)?.unavailable;
  const lastScene = [...p.scenes].sort((a, b) => a.number - b.number).at(-1);
  if (lastScene) {
    const first = p.shots.filter((sh) => sh.sceneId === lastScene.id).sort((a, b) => a.number - b.number)[0];
    const take = first?.takes.find((t) => t.id === first.selectedTakeId);
    if (first && take) {
      const posterId = usable(take.thumbnailAssetId) ? take.thumbnailAssetId : posterIdOf(byId.get(take.assetId));
      if (usable(posterId)) {
        const video = byId.get(take.assetId);
        const duration = take.durationSeconds ?? video?.durationSeconds ?? 1;
        return { assetId: posterId, source: 'TAKE_POSTER', shotId: first.id, sceneNumber: lastScene.number, shotNumber: first.number, takeId: take.id, videoAssetId: video && video.kind === 'VIDEO' && !video.unavailable && !video.sample ? video.id : undefined, frameSeconds: Math.min(0.5, duration / 4) };
      }
    }
  }
  for (const sh of p.shots) {
    if (usable(sh.openingFrameAssetId)) return { assetId: sh.openingFrameAssetId, source: 'OPENING_FRAME', shotId: sh.id, sceneNumber: p.scenes.find((sc) => sc.id === sh.sceneId)?.number, shotNumber: sh.number };
  }
  return null;
}

/** The picture a production's poster slot shows: key art first, the composed frame poster second, else nothing. */
export function posterOf(p: Pick<Production, 'posterAssetId' | 'framePosterAssetId'>, assets: Asset[]): { asset: Asset; kind: 'KEY_ART' | 'FRAME_POSTER' } | null {
  const key = p.posterAssetId ? assets.find((a) => a.id === p.posterAssetId) : undefined;
  if (key) return { asset: key, kind: 'KEY_ART' };
  const frame = p.framePosterAssetId ? assets.find((a) => a.id === p.framePosterAssetId) : undefined;
  return frame ? { asset: frame, kind: 'FRAME_POSTER' } : null;
}

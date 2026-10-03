import type { Asset, Production, Shot } from '@/domain/types';

/** THE KEY FRAME OF A PRODUCTION (docs/CONTRACTS-REDESIGN-BACKEND.md B7; docs/DESIGN-SYSTEM-V5.md §5.9, the design
 *  authority) — what the frame poster is cut from when there is no key art: "the production's chosen key frame
 *  (default: the last shot's selected take's opening frame; the producer can choose another)". Pure; the backfill and
 *  the page use the same choice, so the readout ("Frame poster · shot 2.4") names the right shot.
 *
 *  - `choice` is the producer's own key frame (a shot, optionally a take of it). It is the override the design asks
 *    for; nothing persists it yet (see the contract), so today it is passed by a caller or absent.
 *  - The default walks the storyboard from its LAST shot (scenes by number, shots by number) backwards: a shot whose
 *    selected take is real footage (not a bundled sample clip) gives that take's opening frame — the first frame the
 *    cut shows, after a continuation's head (`trimStartFrames`); a shot with no usable take gives its drawn opening
 *    frame. The last shot answers in all but an unfinished production. */

export interface KeyFrame {
  /** TAKE_OPENING_FRAME: a frame of the take's video, taken at `frameSeconds`. DRAWN_OPENING_FRAME: the shot's drawn
   *  opening frame (an image asset). */
  source: 'TAKE_OPENING_FRAME' | 'DRAWN_OPENING_FRAME';
  shotId: string;
  sceneNumber?: number;
  shotNumber: number;
  takeId?: string;
  /** the take's video, for TAKE_OPENING_FRAME */
  videoAssetId?: string;
  frameSeconds?: number;
  /** the image the frame is (DRAWN) or the take's poster frame (TAKE: its presentation stands in for the frame's) */
  imageAssetId?: string;
  chosen: boolean;
  /** the identity of the frame: a stored poster made from another key is stale */
  key: string;
}

const storyboardOrder = (p: Pick<Production, 'scenes' | 'shots'>): Shot[] => {
  const sceneNo = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  return p.shots.map((sh, i) => ({ sh, i })).sort((a, b) => (sceneNo.get(a.sh.sceneId) ?? 0) - (sceneNo.get(b.sh.sceneId) ?? 0) || a.sh.number - b.sh.number || a.i - b.i).map((x) => x.sh);
};

function frameOf(p: Pick<Production, 'scenes' | 'shots'>, sh: Shot, byId: Map<string, Asset>, opts: { takeId?: string; chosen: boolean }): KeyFrame | null {
  const sceneNumber = p.scenes.find((sc) => sc.id === sh.sceneId)?.number;
  const image = (id?: string) => { const a = id ? byId.get(id) : undefined; return a && a.kind === 'IMAGE' && !a.unavailable ? a : undefined; };
  const take = sh.takes.find((t) => t.id === (opts.takeId ?? sh.selectedTakeId));
  const video = take ? byId.get(take.assetId) : undefined;
  if (take && take.provider !== 'SAMPLE' && take.status !== 'REJECTED' && take.rating !== 'REJECTED' && video && video.kind === 'VIDEO' && !video.unavailable && !video.sample) {
    const fps = take.fps ?? video.fps ?? 24;
    const frameSeconds = Math.round(((take.trimStartFrames ?? 0) / fps) * 1e4) / 1e4;
    return { source: 'TAKE_OPENING_FRAME', shotId: sh.id, sceneNumber, shotNumber: sh.number, takeId: take.id, videoAssetId: video.id, frameSeconds, imageAssetId: image(take.thumbnailAssetId)?.id, chosen: opts.chosen, key: `take:${take.id}:${video.id}@${frameSeconds}` };
  }
  if (opts.takeId) return null; // a chosen take that cannot be used is not silently replaced by the drawing
  const drawn = image(sh.openingFrameAssetId);
  return drawn ? { source: 'DRAWN_OPENING_FRAME', shotId: sh.id, sceneNumber, shotNumber: sh.number, imageAssetId: drawn.id, chosen: opts.chosen, key: `drawn:${sh.id}:${drawn.id}` } : null;
}

export function keyFrameFor(p: Pick<Production, 'scenes' | 'shots'>, assets: Asset[], choice?: { shotId: string; takeId?: string }): KeyFrame | null {
  const byId = new Map(assets.map((a) => [a.id, a]));
  if (choice) { const sh = p.shots.find((x) => x.id === choice.shotId); const f = sh ? frameOf(p, sh, byId, { takeId: choice.takeId, chosen: true }) : null; if (f) return f; }
  for (const sh of [...storyboardOrder(p)].reverse()) { const f = frameOf(p, sh, byId, { chosen: false }); if (f) return f; }
  return null;
}

/** The picture a production's poster slot shows: key art first, the composed frame poster second, else nothing. */
export function posterOf(p: Pick<Production, 'posterAssetId' | 'framePosterAssetId'>, assets: Asset[]): { asset: Asset; kind: 'KEY_ART' | 'FRAME_POSTER' } | null {
  const key = p.posterAssetId ? assets.find((a) => a.id === p.posterAssetId) : undefined;
  if (key) return { asset: key, kind: 'KEY_ART' };
  const frame = p.framePosterAssetId ? assets.find((a) => a.id === p.framePosterAssetId) : undefined;
  return frame ? { asset: frame, kind: 'FRAME_POSTER' } : null;
}

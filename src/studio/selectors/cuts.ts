import type { Asset, Production } from '@/domain/types';

/** CUT VERSIONS (docs/CONTRACTS-REDESIGN-BACKEND.md B3; docs/DESIGN-SYSTEM-V5.md §8.12 "Cut 3 of 3", Compare) — the
 *  production's cuts in the order they were assembled, derived from the assets that already exist (ASSEMBLE stores
 *  every cut as a DERIVED video tagged `cut`, with the shots it was built from in its provenance); nothing is
 *  duplicated or stored twice. The current cut is `production.cutAssetId`; the others are its history. Pure. */

export interface CutVersion {
  /** 1-based, oldest first */
  version: number;
  assetId: string;
  asset: Asset;
  /** the production's current cut */
  current: boolean;
  createdAt: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  /** the poster frame ASSEMBLE drew for it (an asset src), when there is one */
  poster?: string;
  /** how many shots it was built from, and their ids in order */
  shots: number;
  shotIds: string[];
  /** the subtitle sidecars written for this cut (SRT/VTT, per language) */
  subtitleAssetIds: string[];
  jobId?: string;
}

interface CutProvenance { shots?: Array<{ shotId?: string; takeAssetId?: string }> }

/** Whether a stored video is a cut of this production: the current cut by id, else a DERIVED video tagged `cut` whose
 *  provenance names at least one of the production's shots (cuts of other productions never do, and a renamed
 *  production keeps its history). An export (tagged `export`) is not a cut. */
export function isCutOf(p: Pick<Production, 'id' | 'cutAssetId' | 'shots'>, a: Asset): boolean {
  if (a.id === p.cutAssetId) return true;
  if (a.kind !== 'VIDEO' || a.origin !== 'DERIVED' || !a.tags.includes('cut') || a.tags.includes('export')) return false;
  const shots = (a.provenance as CutProvenance | undefined)?.shots;
  if (!Array.isArray(shots) || shots.length === 0) return false;
  const mine = new Set(p.shots.map((sh) => sh.id));
  return shots.some((s) => s.shotId && mine.has(s.shotId));
}

export function cutVersionsOf(p: Pick<Production, 'id' | 'cutAssetId' | 'shots'>, assets: Asset[]): CutVersion[] {
  const cuts = assets.filter((a) => isCutOf(p, a)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return cuts.map((a, i) => {
    const shots = ((a.provenance as CutProvenance | undefined)?.shots ?? []).map((s) => s.shotId).filter((x): x is string => Boolean(x));
    const subtitleAssetIds = assets.filter((s) => s.kind === 'SUBTITLE' && s.provenance?.for === a.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((s) => s.id);
    return { version: i + 1, assetId: a.id, asset: a, current: a.id === p.cutAssetId, createdAt: a.createdAt, durationSeconds: a.durationSeconds, width: a.width, height: a.height, poster: a.poster, shots: shots.length, shotIds: shots, subtitleAssetIds, jobId: a.jobId };
  });
}

/** The current cut's version ("Cut 3 of 3"), or null when the production has no cut yet. */
export function currentCutVersion(p: Pick<Production, 'id' | 'cutAssetId' | 'shots'>, assets: Asset[]): { version: number; of: number } | null {
  if (!p.cutAssetId) return null;
  const all = cutVersionsOf(p, assets);
  const cur = all.find((c) => c.current);
  return cur ? { version: cur.version, of: all.length } : null;
}

import type { Production, StudioState } from './types';
import { canonical, hashString } from './hash';
import { cutInputsHash } from './cut';
import { locationIdentity } from './location';
import { orderedShots } from './timeline';

/** THE FROZEN INPUT SNAPSHOT OF A CUT (Phase 5: "episode snapshots"; the open item "no frozen input snapshot"). When a
 *  cut is assembled, everything it was made from is written into the cut's own record: the World Bible revision, the
 *  script, every shot's chosen take with the production-context hash, prompt and seed it was made with, each
 *  character's canonical image version and voice identity, each place's identity version and plate. A later episode,
 *  a re-cut or an audit reads exactly what this one used — and a change since is a difference of two snapshots, not a
 *  guess. Pure; read only from the studio's records. */

export const INPUT_SNAPSHOT_VERSION = 1;

export interface InputSnapshot {
  version: number;
  productionId: string;
  kind: Production['kind'];
  show?: { showId: string; seasonId?: string; episodeNumber?: number };
  world?: { revisionId: string; revision: number; pinned: boolean };
  /** the scenes and every line as written */
  script: { hash: string; scenes: number; lines: number };
  shots: Array<{ shotId: string; number: number; boundary?: string; takeId?: string; assetId?: string; contextHash?: string; promptHash?: string; seed?: number; model?: string; endStateApproved: boolean }>;
  characters: Array<{ characterId: string; name: string; canonical?: { assetId: string; version?: number; status?: string }; voice?: { revision?: number; provider?: string; model?: string; engineVersion?: string; status?: string; dialectStatus?: string } }>;
  locations: Array<{ locationId: string; name: string; identityVersion: number; identityHash: string; masterAssetId?: string }>;
  song?: { assetId?: string };
  cutInputs: string;
  hash: string;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);

export function inputSnapshot(state: Pick<StudioState, 'characters' | 'locations'>, p: Production, world?: InputSnapshot['world']): InputSnapshot {
  const scriptBody = p.scenes.map((sc) => ({ id: sc.id, n: sc.number, title: sc.title, loc: sc.locationId, tod: sc.timeOfDay, beats: sc.beats })).concat();
  const lines = p.shots.flatMap((sh) => sh.dialogue.map((d) => ({ shot: sh.id, id: d.id, who: d.characterId, text: d.text, textAr: d.textAr ?? null })));
  const shots = orderedShots(p).map((sh) => {
    const t = sh.takes.find((x) => x.id === sh.selectedTakeId);
    const params = (t?.params ?? {}) as Record<string, unknown>;
    const context = params.context as { hash?: unknown } | undefined;
    return {
      shotId: sh.id, number: sh.number, ...(sh.boundary ? { boundary: sh.boundary } : {}),
      ...(t ? { takeId: t.id, assetId: t.assetId } : {}),
      ...(str(context?.hash) ? { contextHash: str(context?.hash) } : {}),
      ...(t?.prompt ? { promptHash: hashString(t.prompt) } : {}),
      ...(num(params.seed) !== undefined ? { seed: num(params.seed) } : {}),
      ...(t?.model ? { model: t.model } : {}),
      endStateApproved: Boolean(t?.endState?.approved),
    };
  });
  const characters = p.castIds.map((id) => state.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => {
    const v = c.voice?.identity;
    return {
      characterId: c.id, name: c.name,
      ...(c.canonicalImage ? { canonical: { assetId: c.canonicalImage.assetId, version: c.canonicalImage.version, status: c.canonicalImage.status } } : {}),
      ...(v ? { voice: { revision: v.revision, provider: v.provider, model: v.model, engineVersion: v.engineVersion, status: v.status, dialectStatus: v.dialectStatus } } : {}),
    };
  });
  const locations = p.locationIds.map((id) => state.locations.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => {
    const id = locationIdentity(l);
    return { locationId: l.id, name: l.name, identityVersion: id.version, identityHash: id.hash, ...(l.masterAssetId ? { masterAssetId: l.masterAssetId } : {}) };
  });
  const body: Omit<InputSnapshot, 'hash'> = {
    version: INPUT_SNAPSHOT_VERSION, productionId: p.id, kind: p.kind,
    ...(p.showId ? { show: { showId: p.showId, ...(p.seasonId ? { seasonId: p.seasonId } : {}), ...(p.episodeNumber ? { episodeNumber: p.episodeNumber } : {}) } } : {}),
    ...(world ? { world } : {}),
    script: { hash: hashString(canonical({ scenes: scriptBody, lines })), scenes: p.scenes.length, lines: lines.length },
    shots, characters, locations,
    ...(p.song ? { song: { assetId: p.song.assetId } } : {}),
    cutInputs: cutInputsHash(p),
  };
  return { ...body, hash: hashString(canonical(body)) };
}

/** What changed between two snapshots of the same production, in words (empty: the same inputs). */
export function snapshotChanges(a: InputSnapshot, b: InputSnapshot): string[] {
  const out: string[] = [];
  if (a.world?.revision !== b.world?.revision) out.push(`World Bible revision ${a.world?.revision ?? '—'} → ${b.world?.revision ?? '—'}`);
  if (a.script.hash !== b.script.hash) out.push('the script changed');
  for (const s of b.shots) {
    const o = a.shots.find((x) => x.shotId === s.shotId);
    if (!o) out.push(`shot ${s.number} is new`);
    else if (o.takeId !== s.takeId) out.push(`shot ${s.number}: another take is chosen`);
    else if (o.contextHash !== s.contextHash) out.push(`shot ${s.number}: made from another context`);
  }
  for (const o of a.shots) if (!b.shots.some((x) => x.shotId === o.shotId)) out.push(`shot ${o.number} was removed`);
  for (const c of b.characters) {
    const o = a.characters.find((x) => x.characterId === c.characterId);
    if (!o) { out.push(`${c.name} joined the cast`); continue; }
    if (o.canonical?.assetId !== c.canonical?.assetId || o.canonical?.version !== c.canonical?.version) out.push(`${c.name}: another canonical image`);
    if (o.voice?.revision !== c.voice?.revision || o.voice?.model !== c.voice?.model) out.push(`${c.name}: another voice`);
  }
  for (const l of b.locations) {
    const o = a.locations.find((x) => x.locationId === l.locationId);
    if (o && (o.identityHash !== l.identityHash || o.masterAssetId !== l.masterAssetId)) out.push(`${l.name}: the place changed`);
  }
  if (a.song?.assetId !== b.song?.assetId) out.push('another song');
  return out;
}

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Production, Shot, StudioState, WorldChange, WorldPin, WorldRead, WorldRevision } from '@/domain/types';
import { nid } from '@/domain/ids';
import { StudioError } from '@/domain/errors';
import { deriveWorld, diffWorld, establishCandidates, isEstablished, overlayWorld, productionsInScope, repinSafety, scopeKey, summarizeChanges, usageOf, withEstablished, worldScopeOf, type EstablishCandidate } from '@/domain/world';
import { latestApproval } from '../org/gates';
import { adoptFile, assetFile, assetFromStored } from '../media';
import { frameAt, tmpDir } from '../media/ffmpeg';
import { command } from '../studio/engine';
import { appendPin, appendRevision, currentPin, latestRevision, revisionById } from './store';

export { recordWorldRead, saveAudioTimeline, worldReads, latestRevision, listRevisions, pinHistory, currentPin } from './store';

/** THE WORLD BIBLE SERVICE — what the jobs call (docs/research/MINIMAX-CONTINUITY.md §4):
 *  - `syncWorld`: the scope's bible derived from the studio, a new revision when anything changed (story development,
 *    shot planning, the show's continuity record);
 *  - `ensurePin`: a production pins the revision its approved story is made against — one pin per STORY approval
 *    (a new approval pins again, with the diff). The pin then follows new revisions only when that is safe (nothing
 *    the production already filmed changes underneath it: `repinSafety`); otherwise the production stays on its pin
 *    and the blocking changes are named — a new story approval takes them;
 *  - `worldForShot`: the pinned revision laid over the studio for one shot (the plate it is filmed against, the
 *    canonical images it holds), with the record of what was read — the take stores it;
 *  - `establishFromApprovedCut`: the frames an approved cut establishes become ESTABLISHED plates of their places in
 *    a new revision, reused by id when the story returns (and the places are locked).
 *  The world is read from the pin, never re-derived from a similar description. */

export interface WorldView { revision: WorldRevision; pinned: boolean; pin?: WorldPin }
const AGENT = { kind: 'AGENT' as const, id: 'world-continuity' };
/** A timestamp as milliseconds, from an ISO string or Postgres' text form ("2026-10-03 06:53:28.1+00"). */
export const instant = (s: string): number => Date.parse(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));

/** Derive the scope's bible from the studio and append a revision when anything changed. */
export async function syncWorld(state: StudioState, p: Production, meta: { reason: string; jobId?: string }): Promise<{ revision: WorldRevision; created: boolean }> {
  const scope = worldScopeOf(p);
  return appendRevision(scope, (latest) => deriveWorld(state, scope, latest?.bible, new Date().toISOString()), { author: AGENT, reason: meta.reason, jobId: meta.jobId });
}

export interface PinOutcome { view: WorldView; action: 'UNPINNED' | 'PINNED' | 'REPINNED' | 'KEPT'; message: string; blocking: WorldChange[] }

/** The pin of a production, made or advanced as the rules allow (see the module note). Without an approved story
 *  nothing is pinned: the scope's latest revision is read, marked unpinned. */
export async function ensurePin(state: StudioState, p: Production, opts: { jobId?: string; by: string }): Promise<PinOutcome> {
  const synced = await syncWorld(state, p, { reason: 'sync before the pin', jobId: opts.jobId });
  const latest = synced.revision;
  const approval = await latestApproval(p.id, 'STORY');
  if (approval?.decision !== 'APPROVED') return { view: { revision: latest, pinned: false }, action: 'UNPINNED', message: `the story is not approved: World Bible revision ${latest.number} is read, not pinned`, blocking: [] };
  const pin = await currentPin(p.id);
  const key = scopeKey(worldScopeOf(p));
  if (!pin || pin.approvalId !== approval.id || pin.scopeKey !== key) {
    const was = pin && pin.scopeKey === key ? await revisionById(pin.revisionId) : undefined;
    const diff = diffWorld(was?.bible, latest.bible);
    const made = await appendPin({ productionId: p.id, revisionId: latest.id, revisionNumber: latest.number, scopeKey: key, reason: 'STORY_APPROVAL', approvalId: approval.id, diff, by: opts.by, jobId: opts.jobId });
    return { view: { revision: latest, pinned: true, pin: made }, action: 'PINNED', message: `pinned to World Bible revision ${latest.number} at the story's approval${was ? ` (was ${was.number}: ${summarizeChanges(diff)})` : ''}`, blocking: [] };
  }
  const pinned = await revisionById(pin.revisionId);
  if (!pinned) throw new StudioError('NOT_FOUND', `The pinned World Bible revision ${pin.revisionId} is missing.`, { failureClass: 'INFRASTRUCTURE' });
  if (pinned.id === latest.id) return { view: { revision: pinned, pinned: true, pin }, action: 'KEPT', message: `pinned to World Bible revision ${pinned.number}`, blocking: [] };
  const diff = diffWorld(pinned.bible, latest.bible);
  const safety = repinSafety(diff, usageOf(p));
  if (!safety.safe) return { view: { revision: pinned, pinned: true, pin }, action: 'KEPT', message: `kept on World Bible revision ${pinned.number}: revision ${latest.number} changes what this production already filmed (${summarizeChanges(safety.blocking)}); approve the story again to take it`, blocking: safety.blocking };
  const made = await appendPin({ productionId: p.id, revisionId: latest.id, revisionNumber: latest.number, scopeKey: key, reason: 'SAFE_REPIN', approvalId: approval.id, diff, by: opts.by, jobId: opts.jobId });
  return { view: { revision: latest, pinned: true, pin: made }, action: 'REPINNED', message: `re-pinned from World Bible revision ${pinned.number} to ${latest.number} (${summarizeChanges(diff)})`, blocking: [] };
}

/** The world a production's job reads without changing the pin: the pin, else the scope's latest revision. */
export async function worldOfProduction(state: StudioState, p: Production, opts: { jobId?: string } = {}): Promise<WorldView> {
  const pin = await currentPin(p.id);
  if (pin && pin.scopeKey === scopeKey(worldScopeOf(p))) { const r = await revisionById(pin.revisionId); if (r) return { revision: r, pinned: true, pin }; }
  const latest = (await latestRevision(scopeKey(worldScopeOf(p)))) ?? (await syncWorld(state, p, { reason: 'first read', jobId: opts.jobId })).revision;
  return { revision: latest, pinned: false };
}

/** One shot's world: the pin (made or safely advanced first), laid over the studio state. */
export async function worldForShot(state: StudioState, p: Production, sh: Shot, opts: { jobId?: string; by: string }): Promise<{ state: StudioState; read: WorldRead; outcome: PinOutcome }> {
  const outcome = await ensurePin(state, p, opts);
  const r = outcome.view.revision;
  const { state: overlaid, read } = overlayWorld(state, r.bible, p, sh, { id: r.id, number: r.number, pinned: outcome.view.pinned });
  return { state: overlaid, read, outcome };
}

/** The frames a production's approved cut establishes, registered as ESTABLISHED plates (by id) in a new revision.
 *  Only when the cut was approved after it was made (the approval is for this cut); only the takes that are in it;
 *  a frame already established is skipped. Returns how many were added. */
export async function establishFromApprovedCut(state: StudioState, p: Production, opts: { jobId?: string }): Promise<{ added: number; revision?: WorldRevision; reason: string }> {
  const approval = await latestApproval(p.id, 'EDIT');
  if (approval?.decision !== 'APPROVED') return { added: 0, reason: 'the cut is not approved' };
  const cut = state.assets.find((a) => a.id === p.cutAssetId);
  if (!cut) return { added: 0, reason: 'there is no cut' };
  if (instant(approval.createdAt) < instant(cut.createdAt)) return { added: 0, reason: 'the approval is for an earlier cut' };
  const inCut = new Set(((cut.provenance as { shots?: Array<{ takeAssetId?: string }> } | undefined)?.shots ?? []).map((s) => s.takeAssetId).filter((x): x is string => Boolean(x)));
  const scope = worldScopeOf(p);
  const before = (await latestRevision(scopeKey(scope))) ?? (await syncWorld(state, p, { reason: 'before establishing', jobId: opts.jobId })).revision;
  const todo = establishCandidates(p, state.assets).filter((c) => (!inCut.size || inCut.has(c.videoAssetId)) && !isEstablished(before.bible, c));
  if (!todo.length) return { added: 0, revision: before, reason: 'nothing new to establish' };
  const dir = await tmpDir('established');
  const frames: Array<{ candidate: EstablishCandidate; imageAssetId: string; productionId: string; label: string; approvalId: string; approvedAt: string }> = [];
  const added: StudioState['assets'] = [];
  try {
    for (const c of todo) {
      const video = state.assets.find((a) => a.id === c.videoAssetId)!;
      const scene = p.scenes.find((sc) => sc.id === c.sceneId);
      const place = state.locations.find((l) => l.id === c.locationId)?.name ?? 'the place';
      const png = await frameAt(assetFile(video), path.join(dir, `${c.takeId}-${c.frame}.png`), c.frame);
      const id = nid('gen');
      const stored = await adoptFile(id, png, { expectKind: 'IMAGE' });
      const label = `${place} — established in “${p.title}”, scene ${scene?.number ?? '?'} (${c.framing.toLowerCase().replace(/_/g, ' ')})`;
      const asset = assetFromStored(id, stored, { label, tags: ['location', 'established'], origin: 'DERIVED', jobId: opts.jobId, provenance: { from: c.videoAssetId, takeId: c.takeId, shotId: c.shotId, frame: c.frame, productionId: p.id, locationId: c.locationId, approvalId: approval.id, view: 'ESTABLISHED' } });
      await command('addAsset', [asset], 'worker');
      added.push({ ...asset, createdAt: new Date().toISOString() });
      frames.push({ candidate: c, imageAssetId: id, productionId: p.id, label, approvalId: approval.id, approvedAt: approval.createdAt });
    }
  } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  const now = new Date().toISOString();
  const fresh = { ...state, assets: [...state.assets, ...added] };
  const { revision } = await appendRevision(scope, (latest) => withEstablished(deriveWorld(fresh, scope, latest?.bible, now), frames, now), { author: AGENT, reason: `established frames from the approved cut of “${p.title}”`, jobId: opts.jobId });
  return { added: frames.length, revision, reason: `${frames.length} frame(s) established` };
}

/** Every approved cut in a production's world registers what it establishes (a cut approved since the last run). */
export async function establishApprovedCuts(state: StudioState, p: Production, opts: { jobId?: string }): Promise<Array<{ productionId: string; added: number; reason: string }>> {
  const out: Array<{ productionId: string; added: number; reason: string }> = [];
  for (const q of productionsInScope(state, worldScopeOf(p)).filter((x) => x.cutAssetId)) {
    const r = await establishFromApprovedCut(state, q, opts);
    out.push({ productionId: q.id, added: r.added, reason: r.reason });
  }
  return out;
}

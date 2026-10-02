import type { Asset, Character, IdentityPack, IdentityPackView, IdentityView, Production, VideoUsage } from '@/domain/types';
import { IDENTITY_VIEWS } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { appearanceLock, type AppearanceLock } from '@/domain/rules';
import type { Key } from '@/lib/i18n';
import { jobSecondary, jobViews, usagePackVersion, type SecondaryKind } from './contract';

/** THE CAST PROFILE'S VIEW-MODEL — pure functions over a character, its assets and the jobs, so every page reads
 *  the identity the same way (docs/CONTRACTS-IDENTITY-PACK.md): which picture is primary, whether the identity is a
 *  draft, approved or locked, what each of the four canonical views is doing, and which pictures are shown where by
 *  tier. No React; unit-tested in tests/unit/character-identity.test.ts. Everything renders without an identity
 *  pack (a character from before the contract, or one whose front was never drawn). */

/* ---- status ------------------------------------------------------------------------------------------------ */

/** NONE: no canonical view yet. DRAFT: drawn, waiting for the producer. APPROVED: the canonical identity. LOCKED:
 *  the character has been in a video (or its history is unknown), so the look is preserved whatever the pack says. */
export type IdentityKind = 'NONE' | 'DRAFT' | 'APPROVED' | 'LOCKED';

export interface IdentityStatus {
  kind: IdentityKind;
  pack?: IdentityPack;
  version?: number;
  approvedAt?: string;
  /** the pack's own word, kept when a lock overrides it (a character filmed before approval stays "never approved") */
  packStatus?: IdentityPack['status'];
  present: IdentityView[];
  missing: IdentityView[];
  /** views whose automatic check ran and failed */
  failedChecks: IdentityView[];
  /** directional views drawn from an earlier FRONT than the current one */
  stale: IdentityView[];
  lock: AppearanceLock;
  /** distinct productions the character has been filmed in */
  videos: number;
}

const viewsOf = (pack: IdentityPack | undefined) => IDENTITY_VIEWS.filter((v) => Boolean(pack?.views[v]?.assetId));

/** A side view is stale when it names the references it was drawn from and the current FRONT is not among them. */
export function isStale(pack: IdentityPack | undefined, view: IdentityView): boolean {
  if (!pack || view === 'FRONT') return false;
  const front = pack.views.FRONT?.assetId; const pv = pack.views[view];
  if (!front || !pv || !Array.isArray(pv.references) || pv.references.length === 0) return false;
  return !pv.references.includes(front);
}

export const checkState = (pv: IdentityPackView | undefined): 'passed' | 'failed' | 'unmeasured' | 'none' => (!pv?.check ? 'none' : pv.check.measurable === false ? 'unmeasured' : pv.check.ok ? 'passed' : 'failed');

export function identityStatus(c: Pick<Character, 'identityPack' | 'usage'>): IdentityStatus {
  const pack = c.identityPack;
  const lock = appearanceLock(c);
  const present = viewsOf(pack);
  const base = {
    pack, version: pack?.version, approvedAt: pack?.approvedAt, packStatus: pack?.status, present,
    missing: IDENTITY_VIEWS.filter((v) => !present.includes(v)),
    failedChecks: present.filter((v) => checkState(pack?.views[v]) === 'failed'),
    stale: present.filter((v) => isStale(pack, v)),
    lock, videos: new Set(lock.videos.map((v) => v.productionId)).size,
  };
  const kind: IdentityKind = lock.locked ? 'LOCKED' : present.length === 0 ? 'NONE' : pack!.status === 'APPROVED' ? 'APPROVED' : 'DRAFT';
  return { kind, ...base };
}

/** The status in words: the short chip of a directory card, the full sentence of the profile header, and its tone. */
export function statusWords(s: Pick<IdentityStatus, 'kind' | 'lock' | 'missing'>): { short: Key; long: Key; tone: 'warn' | 'ok' | 'neutral' } {
  if (s.kind === 'LOCKED') return { short: 'cast.status.locked', long: s.lock.reason === 'UNKNOWN' ? 'cast.status.lockedUnknown' : 'cast.status.lockedUsed', tone: 'neutral' };
  if (s.kind === 'APPROVED') return { short: 'cast.status.approved', long: 'cast.status.approvedLong', tone: 'ok' };
  if (s.kind === 'DRAFT') return { short: 'cast.status.draft', long: s.missing.length ? 'cast.status.draftIncomplete' : 'cast.status.draftLong', tone: 'warn' };
  return { short: 'cast.status.none', long: 'cast.status.noneLong', tone: 'neutral' };
}

/* ---- the primary image ------------------------------------------------------------------------------------- */

/** The FRONT full-body view is the primary image everywhere. A character without one falls back to its old
 *  close-up portrait (shown as a close-up, never passed off as the full body), and then to nothing. */
export function primaryImage<A extends Pick<Asset, 'id'>>(c: Pick<Character, 'identityPack' | 'portraitAssetId'>, assets: A[]): { asset?: A; kind: 'FRONT' | 'PORTRAIT' | 'NONE' } {
  const front = c.identityPack?.views.FRONT?.assetId;
  const fa = front ? assets.find((a) => a.id === front) : undefined;
  if (fa) return { asset: fa, kind: 'FRONT' };
  const pa = c.portraitAssetId ? assets.find((a) => a.id === c.portraitAssetId) : undefined;
  return pa ? { asset: pa, kind: 'PORTRAIT' } : { kind: 'NONE' };
}

export const initialsOf = (name: string): string => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? '').join('') || '·';

/* ---- the four canonical views ------------------------------------------------------------------------------ */

export type SlotState = 'ready' | 'missing' | 'drawing' | 'failed' | 'unavailable';
export interface ViewSlot<A extends Pick<Asset, 'id' | 'unavailable'> = Asset> {
  view: IdentityView;
  packView?: IdentityPackView;
  asset?: A;
  state: SlotState;
  /** the running job (drawing) or the one that failed */
  job?: Job;
  stale: boolean;
  check: ReturnType<typeof checkState>;
}

const newestFirst = (a: Job, b: Job) => b.createdAt.localeCompare(a.createdAt);
/** The jobs that draw a given identity view of this character, newest first. */
export const jobsForView = (characterId: string, view: IdentityView, jobs: Job[]): Job[] => jobs.filter((j) => j.characterId === characterId && jobViews(j).includes(view)).sort(newestFirst);
/** The jobs that draw secondary material of a given kind for this character, newest first. */
export const jobsForSecondary = (characterId: string, kind: SecondaryKind, jobs: Job[]): Job[] => jobs.filter((j) => j.characterId === characterId && jobSecondary(j).includes(kind)).sort(newestFirst);

export function viewSlots<A extends Pick<Asset, 'id' | 'unavailable'>>(c: Pick<Character, 'id' | 'identityPack'>, assets: A[], jobs: Job[]): ViewSlot<A>[] {
  const pack = c.identityPack;
  return IDENTITY_VIEWS.map((view) => {
    const packView = pack?.views[view];
    const asset = packView ? assets.find((a) => a.id === packView.assetId) : undefined;
    const mine = jobsForView(c.id, view, jobs);
    const running = mine.find((j) => isActiveStatus(j.status));
    const last = mine[0];
    const failed = !running && last?.status === 'FAILED' && (!packView || last.createdAt > packView.generatedAt) ? last : undefined;
    const state: SlotState = running ? 'drawing' : failed ? 'failed' : !packView ? 'missing' : !asset || asset.unavailable ? 'unavailable' : 'ready';
    return { view, packView, asset, state, job: running ?? failed, stale: isStale(pack, view), check: checkState(packView) };
  });
}

/** Can the producer approve now, and if not, why (the first reason that applies). A failed check does not block:
 *  it asks for a reason (the override) instead. */
export function approval(s: IdentityStatus, slots: Pick<ViewSlot, 'state'>[]): { can: boolean; needsOverride: boolean; block: 'LOCKED' | 'APPROVED' | 'NONE' | 'DRAWING' | 'MISSING' | 'STALE' | null } {
  const block = s.kind === 'LOCKED' ? 'LOCKED' : s.kind === 'APPROVED' ? 'APPROVED' : s.kind === 'NONE' ? 'NONE'
    : slots.some((x) => x.state === 'drawing') ? 'DRAWING' : s.missing.length > 0 || slots.some((x) => x.state === 'unavailable') ? 'MISSING' : s.stale.length > 0 ? 'STALE' : null;
  return { can: block === null, needsOverride: block === null && s.failedChecks.length > 0, block };
}

/* ---- side labels ------------------------------------------------------------------------------------------- */

/** Sides are anatomical: "Right side" is the character's own right, said under the label so nobody reads it as the
 *  side of the screen. */
export const VIEW_LABEL: Record<IdentityView, { label: Key; caption?: Key }> = {
  FRONT: { label: 'cast.view.FRONT' },
  RIGHT: { label: 'cast.view.RIGHT', caption: 'cast.view.RIGHT.caption' },
  LEFT: { label: 'cast.view.LEFT', caption: 'cast.view.LEFT.caption' },
  BACK: { label: 'cast.view.BACK' },
};

/* ---- material by tier -------------------------------------------------------------------------------------- */

export interface Material<A> {
  /** the current pack's views, in the fixed order */
  canonical: A[];
  /** optional material, each kind in its own group; "earlier" holds views drawn before the identity pack existed */
  secondary: { portrait: A[]; expressions: A[]; outfits: A[]; earlier: A[] };
  secondaryCount: number;
  /** intermediate outputs (a sheet before cutting, crops, rejected candidates): counted, never shown */
  rawCount: number;
}

/** Where each picture of a character belongs. CANONICAL = the current pack's four views (Sides). SECONDARY = the
 *  close-up portrait, expressions, outfits and any view from before the pack (the quiet "Secondary material"
 *  section). RAW never reaches the profile: an asset marked RAW, a face crop (an intermediate the old sheet was
 *  drawn from), and a canonical view of an earlier pack version. */
export function materialByTier<A extends Pick<Asset, 'id' | 'tier'>>(c: Pick<Character, 'identityPack' | 'refs' | 'portraitAssetId'>, assets: A[]): Material<A> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const canonicalIds = IDENTITY_VIEWS.map((v) => c.identityPack?.views[v]?.assetId).filter((x): x is string => Boolean(x));
  const canonical = canonicalIds.map((id) => byId.get(id)).filter((a): a is A => Boolean(a));
  const out: Material<A>['secondary'] = { portrait: [], expressions: [], outfits: [], earlier: [] };
  const seen = new Set<string>(canonicalIds);
  let rawCount = 0;
  const candidates: Array<{ assetId: string; role: string }> = [
    ...(c.portraitAssetId ? [{ assetId: c.portraitAssetId, role: 'PORTRAIT' }] : []),
    ...c.refs.map((r) => ({ assetId: r.assetId, role: r.role })),
  ];
  for (const { assetId, role } of candidates) {
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    const a = byId.get(assetId);
    if (!a) continue;
    if (a.tier === 'RAW' || a.tier === 'CANONICAL' || role === 'FACE') { rawCount += 1; continue; }
    if (role === 'PORTRAIT') out.portrait.push(a);
    else if (role === 'EXPRESSION') out.expressions.push(a);
    else if (role === 'OUTFIT') out.outfits.push(a);
    else out.earlier.push(a);
  }
  const secondaryCount = out.portrait.length + out.expressions.length + out.outfits.length + out.earlier.length;
  return { canonical, secondary: out, secondaryCount, rawCount };
}

/* ---- usage ------------------------------------------------------------------------------------------------- */

export interface UsageGroup { productionId: string; title: string; production?: Production; firstAt: string; rows: Array<VideoUsage & { packVersion?: number }>; packVersions: number[] }

/** The videos a character has been in, one group per production (newest first), each take with the identity
 *  pack version it was made with when the record says so. */
export function usageGroups(c: Pick<Character, 'usage'>, productions: Production[]): UsageGroup[] {
  const map = new Map<string, UsageGroup>();
  for (const v of c.usage?.videos ?? []) {
    const g = map.get(v.productionId) ?? { productionId: v.productionId, title: v.productionTitle, production: productions.find((p) => p.id === v.productionId), firstAt: v.recordedAt, rows: [], packVersions: [] };
    const packVersion = usagePackVersion(v);
    g.rows.push({ ...v, packVersion });
    if (v.recordedAt < g.firstAt) g.firstAt = v.recordedAt;
    if (packVersion !== undefined && !g.packVersions.includes(packVersion)) g.packVersions.push(packVersion);
    map.set(v.productionId, g);
  }
  return [...map.values()].map((g) => ({ ...g, packVersions: g.packVersions.sort((a, b) => a - b) })).sort((a, b) => b.firstAt.localeCompare(a.firstAt));
}

/** The voice the character can be heard with right now: the identity's proof line first, else the chosen sample. */
export function voiceTrackSource(c: Pick<Character, 'voice'>): { assetId?: string; text?: string; kind: 'PROOF' | 'SAMPLE' | 'NONE' } {
  const id = c.voice.identity;
  if (id?.proof) { const s = c.voice.samples.find((x) => x.id === id.proof!.sampleId); return { assetId: s?.assetId ?? id.proof.assetId, text: id.proof.text, kind: 'PROOF' }; }
  const sel = c.voice.samples.find((x) => x.id === c.voice.selectedSampleId);
  return sel?.assetId ? { assetId: sel.assetId, text: sel.text, kind: 'SAMPLE' } : { kind: 'NONE' };
}

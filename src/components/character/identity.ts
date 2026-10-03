import type { Asset, CanonicalImage, Character, Production, VideoUsage } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { appearanceLock, type AppearanceLock } from '@/domain/rules';
import { canonicalCheckFailed, primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import type { Key } from '@/lib/i18n';
import { jobSecondary, usageImageVersion, voiceExtras, type SecondaryKind, type VoiceListening, type VoiceOrigin } from './contract';

/** THE CAST PROFILE'S VIEW-MODEL — pure functions over a character, its assets and the jobs, so every page reads the
 *  identity the same way (docs/CONTRACTS-IDENTITY-PACK.md v2: one canonical front full-body image + one voice
 *  identity): which picture is primary, whether the image is a draft, approved or locked, what is being drawn, and
 *  which pictures are shown where by tier. No React; unit-tested in tests/unit/character-identity.test.ts. Everything
 *  renders without a canonical image (a character from before the contract, or one whose image was never drawn). */

/* ---- status ------------------------------------------------------------------------------------------------ */

/** NONE: no canonical image yet. DRAFT: drawn, waiting for the producer. APPROVED: the official identity. LOCKED: the
 *  character has been in a video (or its history is unknown), so the look is preserved whatever the image says. */
export type IdentityKind = 'NONE' | 'DRAFT' | 'APPROVED' | 'LOCKED';

export interface IdentityStatus {
  kind: IdentityKind;
  image?: CanonicalImage;
  version?: number;
  approvedAt?: string;
  /** the image's own word, kept when a lock overrides it (a character filmed before approval was never approved) */
  imageStatus?: CanonicalImage['status'];
  /** an automatic check ran and failed: approval then asks for a reason */
  checkFailed: boolean;
  checkNotes: string[];
  lock: AppearanceLock;
  /** distinct productions the character has been filmed in */
  videos: number;
  /** no canonical image, but an older close-up portrait stands in for it */
  legacyPortrait: boolean;
}

export function identityStatus(c: Pick<Character, 'canonicalImage' | 'portraitAssetId' | 'usage'>): IdentityStatus {
  const image = c.canonicalImage?.assetId ? c.canonicalImage : undefined;
  const lock = appearanceLock(c);
  const kind: IdentityKind = lock.locked ? 'LOCKED' : !image ? 'NONE' : image.status === 'APPROVED' ? 'APPROVED' : 'DRAFT';
  return {
    kind, image, version: image?.version, approvedAt: image?.approvedAt, imageStatus: image?.status,
    checkFailed: canonicalCheckFailed(image), checkNotes: image?.check?.notes ?? [],
    lock, videos: new Set(lock.videos.map((v) => v.productionId)).size,
    legacyPortrait: !image && primaryImageSourceOf(c) === 'PORTRAIT',
  };
}

/** The status in words: the short chip of a card, the full sentence of the profile, and its tone. */
export function statusWords(s: Pick<IdentityStatus, 'kind' | 'lock' | 'videos'> & Partial<Pick<IdentityStatus, 'legacyPortrait'>>): { short: Key; long: Key; tone: 'warn' | 'ok' | 'neutral' } {
  if (s.kind === 'LOCKED') return { short: 'cast.status.locked', long: s.lock.reason === 'UNKNOWN' ? 'cast.status.lockedUnknown' : s.videos === 1 ? 'cast.status.lockedUsedOne' : 'cast.status.lockedUsed', tone: 'neutral' };
  if (s.kind === 'APPROVED') return { short: 'cast.status.approved', long: 'cast.status.approvedLong', tone: 'ok' };
  if (s.kind === 'DRAFT') return { short: 'cast.status.draft', long: 'cast.status.draftLong', tone: 'warn' };
  if (s.legacyPortrait) return { short: 'cast.status.legacy', long: 'cast.status.legacyLong', tone: 'neutral' };
  return { short: 'cast.status.none', long: 'cast.status.noneLong', tone: 'neutral' };
}

/* ---- the primary image ------------------------------------------------------------------------------------- */

/** How a frame should treat the primary image: full-body canonical, an older close-up, or the honest placeholder. */
export const imageKindOf = (c: Pick<Character, 'canonicalImage' | 'portraitAssetId'>): 'CANONICAL' | 'PORTRAIT' | 'NONE' => primaryImageSourceOf(c) ?? 'NONE';

/** Initials for the honest placeholder: two letters at most, from the first two words. */
export const initialsOf = (name: string): string => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? '').join('') || '·';

/* ---- drawing ----------------------------------------------------------------------------------------------- */

const newestFirst = (a: Job, b: Job) => b.createdAt.localeCompare(a.createdAt);

/** The image's jobs: the one drawing now, and the last one that failed — only when nothing was drawn after it. */
export function imageJobs(c: Pick<Character, 'id' | 'canonicalImage'>, jobs: Job[]): { running?: Job; failed?: Job } {
  const mine = jobs.filter((j) => j.characterId === c.id && j.type === 'CHARACTER_APPEARANCE').sort(newestFirst);
  const running = mine.find((j) => isActiveStatus(j.status));
  const last = mine[0];
  const failed = !running && last?.status === 'FAILED' && (!c.canonicalImage || last.createdAt > c.canonicalImage.generatedAt) ? last : undefined;
  return { running, failed };
}

/** The jobs that draw secondary material of a kind for this character, newest first. */
export const secondaryJobs = (characterId: string, kind: SecondaryKind, jobs: Job[]): Job[] => jobs.filter((j) => j.characterId === characterId && jobSecondary(j).includes(kind)).sort(newestFirst);

/** Can the producer approve now, and if not why. A failed check does not block: it asks for a reason (the override). */
export function approval(s: Pick<IdentityStatus, 'kind' | 'checkFailed'>, drawing: boolean): { can: boolean; needsOverride: boolean; block: 'LOCKED' | 'APPROVED' | 'NONE' | 'DRAWING' | null } {
  const block = s.kind === 'LOCKED' ? 'LOCKED' : s.kind === 'APPROVED' ? 'APPROVED' : s.kind === 'NONE' ? 'NONE' : drawing ? 'DRAWING' : null;
  return { can: block === null, needsOverride: block === null && s.checkFailed, block };
}

/** Redraw is offered only while the character has never been in a video (the server refuses it after). */
export const canRedraw = (s: Pick<IdentityStatus, 'kind'>): boolean => s.kind !== 'LOCKED';

/* ---- material by tier -------------------------------------------------------------------------------------- */

export interface Material<A> {
  /** optional material, each kind in its own group; "earlier" holds views drawn before the canonical image existed */
  secondary: { portrait: A[]; expressions: A[]; outfits: A[]; earlier: A[] };
  secondaryCount: number;
  /** intermediate outputs (rejected candidates, previous versions, crops): counted, never shown */
  rawCount: number;
}

/** Where each picture of a character belongs. CANONICAL = the one image the profile is built around (never repeated
 *  in the secondary section). SECONDARY = a close-up portrait, expressions, outfits, and views from before the
 *  canonical image existed — a quiet, collapsed section. RAW never reaches the profile: an asset marked RAW, a
 *  canonical image of an earlier version, and a face crop (an intermediate the old sheet was drawn from). An older
 *  portrait is the primary image while there is no canonical one, so it is not repeated as secondary then. */
export function materialByTier<A extends Pick<Asset, 'id' | 'tier'>>(c: Pick<Character, 'canonicalImage' | 'refs' | 'portraitAssetId'>, assets: A[]): Material<A> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const primary = primaryImageOf(c);
  const out: Material<A>['secondary'] = { portrait: [], expressions: [], outfits: [], earlier: [] };
  const seen = new Set<string>(primary ? [primary] : []);
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
  return { secondary: out, secondaryCount: out.portrait.length + out.expressions.length + out.outfits.length + out.earlier.length, rawCount };
}

/* ---- usage ------------------------------------------------------------------------------------------------- */

export interface UsageGroup { productionId: string; title: string; production?: Production; firstAt: string; rows: Array<VideoUsage & { imageVersion?: number }>; imageVersions: number[] }

/** The videos a character has been in, one group per production (newest first), each take with the canonical image
 *  version it was made with when the record says so. */
export function usageGroups(c: Pick<Character, 'usage'>, productions: Production[]): UsageGroup[] {
  const map = new Map<string, UsageGroup>();
  for (const v of c.usage?.videos ?? []) {
    const g = map.get(v.productionId) ?? { productionId: v.productionId, title: v.productionTitle, production: productions.find((p) => p.id === v.productionId), firstAt: v.recordedAt, rows: [], imageVersions: [] };
    const imageVersion = usageImageVersion(v);
    g.rows.push({ ...v, imageVersion });
    if (v.recordedAt < g.firstAt) g.firstAt = v.recordedAt;
    if (imageVersion !== undefined && !g.imageVersions.includes(imageVersion)) g.imageVersions.push(imageVersion);
    map.set(v.productionId, g);
  }
  return [...map.values()].map((g) => ({ ...g, imageVersions: [...g.imageVersions].sort((a, b) => a - b) })).sort((a, b) => b.firstAt.localeCompare(a.firstAt));
}

/* ---- the voice --------------------------------------------------------------------------------------------- */

/** What the character can be heard saying right now: the identity's proof line first, else the chosen sample. */
export function voiceTrackSource(c: Pick<Character, 'voice'>): { assetId?: string; text?: string; kind: 'PROOF' | 'SAMPLE' | 'NONE'; source?: 'SAMPLE' | 'UPLOADED' | 'GENERATED' } {
  const id = c.voice.identity;
  if (id?.proof) { const s = c.voice.samples.find((x) => x.id === id.proof!.sampleId); return { assetId: s?.assetId ?? id.proof.assetId, text: id.proof.text, kind: 'PROOF', source: 'GENERATED' }; }
  const sel = c.voice.samples.find((x) => x.id === c.voice.selectedSampleId);
  return sel?.assetId ? { assetId: sel.assetId, text: sel.text, kind: 'SAMPLE', source: sel.source } : { kind: 'NONE' };
}

/** The voice identity's state in one word — never "verified": a proof line transcribed back is MEASURED
 *  (intelligible), a doubtful one needs a listen (REVIEW), a changed language makes it STALE, no proof is UNCHECKED.
 *  Whether it sounds natural (or Iraqi) is only ever said from a listening record (`voiceListened`). */
export function voiceState(c: Pick<Character, 'voice'>): 'NONE' | 'MEASURED' | 'REVIEW' | 'STALE' | 'UNCHECKED' {
  const id = c.voice.identity;
  if (!id) return 'NONE';
  if (id.status === 'STALE') return 'STALE';
  if (id.status === 'REVIEW' || (id.proof && !id.proof.heard && id.proof.coverage !== undefined && id.proof.coverage < 0.85)) return 'REVIEW';
  return id.proof || voiceExtras(id).evaluation ? 'MEASURED' : 'UNCHECKED';
}

/** The loudness gates of a reference recording (src/server/media/voice-check.ts REFERENCE_RULES), mirrored for
 *  display: integrated loudness within −30…−10 LUFS and no clipped samples. */
const LUFS_RANGE = { min: -30, max: -10 } as const;

/** What was measured on the voice, in numbers a sentence can say: the share of words heard back (intelligibility)
 *  and whether the loudness sat within the gates. Absent numbers stay absent — nothing is assumed. */
export function voiceMeasures(c: Pick<Character, 'voice'>): { intelligible?: number; loudnessOk?: boolean; lufs?: number } {
  const id = c.voice.identity; if (!id) return {};
  const ev = voiceExtras(id).evaluation;
  const coverage = ev?.coverage ?? id.proof?.coverage;
  const cer = ev?.cer ?? id.proof?.cer;
  const intelligible = coverage !== undefined ? coverage : cer !== undefined ? Math.max(0, 1 - cer) : undefined;
  const lufs = ev?.lufs;
  const loudnessOk = lufs === undefined ? undefined : lufs >= LUFS_RANGE.min && lufs <= LUFS_RANGE.max && (ev?.clipped ?? 0) === 0;
  return { intelligible, loudnessOk, lufs };
}

/** The producer's latest listening, and the dialect verdict that only a listener can give. */
export function voiceListened(c: Pick<Character, 'voice' | 'dialect'>): { last?: VoiceListening; dialect: 'NOT_APPLICABLE' | 'UNVERIFIED' | 'APPROVED' | 'REJECTED' } {
  const x = voiceExtras(c.voice.identity);
  const last = [...x.listening].sort((a, b) => b.at.localeCompare(a.at))[0];
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const recorded = x.dialectStatus === 'LISTENER_APPROVED' ? 'APPROVED' : x.dialectStatus === 'LISTENER_REJECTED' ? 'REJECTED' : undefined;
  const fromListening = last?.dialectAuthentic === true ? 'APPROVED' : last?.dialectAuthentic === false ? 'REJECTED' : undefined;
  return { last, dialect: !iraqi && !recorded ? 'NOT_APPLICABLE' : recorded ?? fromListening ?? 'UNVERIFIED' };
}

/** Where the voice comes from, as the label every voice carries. */
export function voiceOrigin(c: Pick<Character, 'voice'>): VoiceOrigin | 'LEGACY' | 'NONE' {
  const id = c.voice.identity; if (!id) return 'NONE';
  const o = voiceExtras(id).origin;
  if (o) return o;
  // an identity built before origins were recorded: cloned from a recording (wave 2), or hosted
  return id.provider === 'MINIMAX' ? 'HOSTED' : 'LEGACY';
}

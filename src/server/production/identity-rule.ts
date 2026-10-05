import type { Character, Location, Shot } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import { primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import type { ShotPack } from './shot-pack';

/** THE IDENTITY RE-APPLICATION RULE (docs/research/MINIMAX-CONTINUITY.md §3.4; the directive: "reapply approved
 *  references on every shot, never only the last frame"). Every take's conditioning carries the canonical image of
 *  each character present in the shot and the plate of the shot's place — bound in the prompt, connected in the
 *  request — whatever the relation (a continuation's tail fixes its first second; the references keep the identity
 *  from drifting over the rest and across the chain). A missing reference fails fast, before the engine is asked,
 *  as an IdentityConditioningError (code and failure class MISSING_REFERENCE, rule named): never a take with a face
 *  drawn from words or a place redrawn from a description. Pure: the pack (and, in the worker, the request) in, the
 *  report out. The one documented exception is the hosted frame mode (the previous take's last frame as the first
 *  frame: the platform cannot mix frame and reference roles), recorded as a lowering. */

export const IDENTITY_RULE = 'identity-reapplication' as const;

export class IdentityConditioningError extends StudioError {
  readonly rule = IDENTITY_RULE;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('MISSING_REFERENCE', message, { ...details, failureClass: 'MISSING_REFERENCE', rule: IDENTITY_RULE });
    this.name = 'IdentityConditioningError';
  }
}

export interface IdentityConditioningReport {
  ok: boolean;
  rule: typeof IDENTITY_RULE;
  /** the hosted lowering that stands in for the references (frame mode), when the rule is waived */
  lowered?: string;
  characters: Array<{ characterId: string; name: string; assetId?: string; source?: 'CANONICAL' | 'PORTRAIT'; picture?: number; ok: boolean; why?: string }>;
  location?: { locationId: string; name: string; assetId?: string; picture?: number; ok: boolean; why?: string };
  problems: string[];
}

export interface ConditioningRequest {
  /** the pictures as connected, in order (the k-th is <Picture k>) */
  referenceImages?: Array<{ file: string }>;
  /** the prompt as it will be sent */
  prompt?: string;
  /** the file of an asset, to check the connected pictures against the pack */
  fileOf?: (assetId: string) => string | undefined;
}

/** Judge a pack (and, when given, the request built from it) against the rule. */
export function identityConditioning(pack: Pick<ShotPack, 'backend' | 'graph' | 'subjects' | 'location' | 'establishing' | 'pictures' | 'opening' | 'unreferenced' | 'lowering'>, sh: Pick<Shot, 'characterIds'>, cast: Character[], loc: Location | undefined, request: ConditioningRequest = {}): IdentityConditioningReport {
  const problems: string[] = [];
  const local = pack.backend === 'local';
  const label = (k: number) => (local ? `<Picture ${k}>` : `Image ${k}`);
  // the hosted frame mode: no references can travel with a first frame (documented lowering)
  if (pack.graph === 'FRAMES' && pack.opening.kind === 'LAST_FRAME_AS_FIRST') {
    return { ok: true, rule: IDENTITY_RULE, lowered: pack.lowering ?? 'hosted frame mode: no references travel with a first frame', characters: sh.characterIds.map((id) => ({ characterId: id, name: cast.find((c) => c.id === id)?.name ?? id, ok: true, why: 'identity rests on the previous take\'s last frame (hosted frame mode)' })), problems: [] };
  }
  const connected = (picture: number | undefined, assetId: string | undefined): string | undefined => {
    if (!picture || !assetId) return undefined;
    if (request.referenceImages && request.fileOf) {
      const want = request.fileOf(assetId); const got = request.referenceImages[picture - 1]?.file;
      if (!got) return `picture ${picture} is not connected to the request`;
      if (want && got !== want) return `picture ${picture} is connected to another file than ${assetId}`;
    }
    if (request.prompt && !request.prompt.includes(label(picture))) return `${label(picture)} is not bound in the prompt`;
    return undefined;
  };
  const characters: IdentityConditioningReport['characters'] = sh.characterIds.map((id) => {
    const c = cast.find((x) => x.id === id);
    const name = c?.name ?? id;
    if (!c) return { characterId: id, name, ok: false, why: 'not in the cast' };
    const subject = pack.subjects.find((s) => s.characterId === id);
    const image = primaryImageOf(c);
    if (!image) return { characterId: id, name, ok: false, why: `${name} has no canonical image: draw the character first` };
    if (!subject) {
      const u = pack.unreferenced.find((x) => x.characterId === id);
      return { characterId: id, name, assetId: image, source: primaryImageSourceOf(c) ?? undefined, ok: false, why: u ? `${name}'s image is not conditioned on: ${u.reason}` : `${name}'s image is not in the pack` };
    }
    if (subject.assetId !== image) return { characterId: id, name, assetId: subject.assetId, source: subject.source, picture: subject.picture, ok: false, why: `${name} is conditioned on ${subject.assetId}, not the current primary image ${image}` };
    const bad = connected(subject.picture, subject.assetId);
    return { characterId: id, name, assetId: subject.assetId, source: subject.source, picture: subject.picture, ok: !bad, why: bad ? `${name}: ${bad}` : undefined };
  });
  for (const c of characters) if (!c.ok && c.why) problems.push(c.why);
  let location: IdentityConditioningReport['location'];
  if (loc) {
    // "establish here" (the Location Bible): the place has no plate yet by the production's own declaration — the
    // identity line stands in, and this take's first frame becomes the plate (src/server/production/location-rule.ts)
    if (!pack.location && pack.establishing?.locationId === loc.id) location = { locationId: loc.id, name: loc.name, ok: true, why: `${loc.name} is established here: filmed from its identity line (v${pack.establishing.identity.version}); the first frame becomes its plate` };
    else if (!pack.location) location = { locationId: loc.id, name: loc.name, ok: false, why: `${loc.name} has no usable plate: draw the place first` };
    else if (pack.location.locationId !== loc.id) location = { locationId: loc.id, name: loc.name, assetId: pack.location.assetId, picture: pack.location.picture, ok: false, why: `the plate conditioned on belongs to another place (${pack.location.locationId}), not ${loc.name}` };
    else { const bad = connected(pack.location.picture, pack.location.assetId); location = { locationId: loc.id, name: loc.name, assetId: pack.location.assetId, picture: pack.location.picture, ok: !bad, why: bad ? `${loc.name}'s plate: ${bad}` : undefined }; }
    if (!location.ok && location.why) problems.push(location.why);
  }
  return { ok: problems.length === 0, rule: IDENTITY_RULE, characters, location, problems };
}

/** The rule as a gate: throws IdentityConditioningError with the report when a reference is missing. */
export function assertIdentityConditioning(pack: Parameters<typeof identityConditioning>[0], sh: Pick<Shot, 'characterIds' | 'number'>, cast: Character[], loc: Location | undefined, request: ConditioningRequest = {}): IdentityConditioningReport {
  const report = identityConditioning(pack, sh, cast, loc, request);
  if (!report.ok) throw new IdentityConditioningError(`Shot ${sh.number} cannot be generated: its conditioning does not carry every identity (${report.problems.join('; ')}).`, { report });
  return report;
}

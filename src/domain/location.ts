import type { Location, LocationIdentity } from './types';
import { canonical, hashString } from './hash';

/** THE LOCATION IDENTITY, PURE (the Location Bible; types.ts LocationIdentity). One place = one canonical identity:
 *  what never changes about the place in words — its kind and description, architecture, geography, spatial layout,
 *  materials, landmarks (fixed features), permanent furniture and props, entrances, camera zones. The identity LINE is
 *  the words every prompt that shows the place carries (the plate carries the picture); the HASH says whether any of
 *  it changed; the VERSION moves on when it did. The PICTURES of the identity — the master plate, the per-lighting
 *  plates, the established frames — are the World Bible's plate list (src/domain/world.ts): appended per revision and
 *  never swapped once the place is locked, so a redrawn or added plate is an addition there, not a new identity. */

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const list = (xs?: string[] | null) => (xs ?? []).map(clean).filter(Boolean);

/** What the identity is made of, in a fixed shape (the hash is over this). */
export function identityFacts(l: Pick<Location, 'kind' | 'description' | 'landmarks' | 'props' | 'layout'>) {
  const lay = l.layout ?? {};
  return { kind: l.kind, description: clean(l.description), architecture: clean(lay.architecture), geography: clean(lay.geography), spatial: clean(lay.spatial), materials: list(lay.materials), fixedFeatures: list(l.landmarks), props: list(l.props), entrances: list(lay.entrances), zones: list(lay.cameraZones) };
}

export const identityHashOf = (l: Parameters<typeof identityFacts>[0]): string => hashString(canonical(identityFacts(l)));

/** The identity line: the place in words, without its name, in a fixed order — the description first, then what is
 *  fixed about it. The kind (interior / exterior) is said by the sentence that uses the line. */
export function locationIdentityLine(l: Parameters<typeof identityFacts>[0]): string {
  const f = identityFacts(l);
  const parts = [
    f.description && f.description.replace(/\.$/, ''),
    f.architecture && `architecture: ${f.architecture.replace(/\.$/, '')}`,
    f.geography && `geography: ${f.geography.replace(/\.$/, '')}`,
    f.spatial && `layout: ${f.spatial.replace(/\.$/, '')}`,
    f.materials.length && `materials: ${f.materials.join(', ')}`,
    f.fixedFeatures.length && `fixed features: ${f.fixedFeatures.join('; ')}`,
    f.props.length && `permanent props: ${f.props.join(', ')}`,
    f.entrances.length && `entrances: ${f.entrances.join('; ')}`,
    f.zones.length && `camera zones: ${f.zones.join('; ')}`,
  ].filter((x): x is string => Boolean(x));
  return parts.join('; ');
}

/** The identity as it stands: the stored one when nothing changed, else the next version of what the place holds
 *  (a row without one is version 1). Pure: the same place gives the same answer. */
export function locationIdentity(l: Pick<Location, 'kind' | 'description' | 'landmarks' | 'props' | 'layout' | 'identity' | 'updatedAt'>, at?: string): LocationIdentity {
  const hash = identityHashOf(l);
  if (l.identity && l.identity.hash === hash) return l.identity;
  return { version: (l.identity?.version ?? 0) + 1, hash, line: locationIdentityLine(l), updatedAt: at ?? l.updatedAt };
}

/** The place with its identity brought up to date (the same object when it already is). */
export function withLocationIdentity<T extends Location>(l: T, at: string): T {
  const next = locationIdentity(l, at);
  return next === l.identity ? l : { ...l, identity: next };
}

/** The identity after a change: the identity the place had BEFORE (stored, or version 1 of what it held — a row
 *  written before identities), carried when nothing of the canon changed, else the next version. This is how a
 *  reducer moves a place on: the version counts changes, whether or not the first one was stored. */
export function advanceIdentity<T extends Location>(before: Pick<Location, 'kind' | 'description' | 'landmarks' | 'props' | 'layout' | 'identity' | 'updatedAt'>, after: T, at: string): T {
  const prev = locationIdentity(before);
  const hash = identityHashOf(after);
  const identity: LocationIdentity = hash === prev.hash ? prev : { version: prev.version + 1, hash, line: locationIdentityLine(after), updatedAt: at };
  return identity === after.identity ? after : { ...after, identity };
}

/** The kind and the identity line as one description (what `describeLocation` in the prompts says of a place). */
export const describeIdentity = (l: Parameters<typeof locationIdentity>[0]): string => { const i = locationIdentity(l); return `${l.kind === 'INTERIOR' ? 'interior' : 'exterior'}${i.line ? `: ${i.line}` : ''} (place identity v${i.version})`; };

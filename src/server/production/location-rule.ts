import type { Location, Production, Scene, Shot } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import { locationIdentity } from '@/domain/location';
import type { ShotPack } from './shot-pack';

/** THE LOCATION PLATE RULE (the Location Bible; docs/research/MINIMAX-CONTINUITY.md §4.5). A shot set in a place is
 *  filmed against that place's canonical plate — the World Bible's choice for the scene's time of day, else the master
 *  plate — and carries the place's identity line in its prompt. A place that has no plate is never filmed from words:
 *  the request is refused before the engine as an UnestablishedLocationError (a StudioError; code and failure class
 *  MISSING_REFERENCE; rule `location-identity`), with the two ways out named — draw the plates (LOCATION_PLATES), or
 *  mark the scene "establish here" (Scene.establishLocation): the production's explicit declaration that this is the
 *  place's first appearance, whose first accepted take's opening frame becomes the plate. Pure. */

export const LOCATION_RULE = 'location-identity' as const;

export class UnestablishedLocationError extends StudioError {
  readonly rule = LOCATION_RULE;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('MISSING_REFERENCE', message, { ...details, failureClass: 'MISSING_REFERENCE', rule: LOCATION_RULE });
    this.name = 'UnestablishedLocationError';
  }
}

export interface LocationPlateVerdict {
  ok: boolean;
  rule: typeof LOCATION_RULE;
  locationId?: string;
  name?: string;
  /** PLATE: the place's plate is conditioned on; ESTABLISHING: no plate, the scene is marked "establish here"; NONE: no place in the scene */
  mode: 'PLATE' | 'ESTABLISHING' | 'NONE' | 'REFUSED';
  identity?: { version: number; line: string };
  detail: string;
}

/** Judge a shot's place against the rule, from the pack it resolves to. */
export function locationPlateVerdict(pack: Pick<ShotPack, 'location' | 'establishing' | 'graph' | 'opening'>, scene: Pick<Scene, 'establishLocation' | 'timeOfDay'> | undefined, loc: Location | undefined): LocationPlateVerdict {
  if (!loc) return { ok: true, rule: LOCATION_RULE, mode: 'NONE', detail: 'the scene has no place' };
  const identity = locationIdentity(loc);
  const id = { version: identity.version, line: identity.line };
  // the hosted frame mode carries no pictures at all (the documented lowering of the identity rule): the plate exists,
  // it is the mode that cannot send it
  if (pack.location || (pack.graph === 'FRAMES' && pack.opening.kind === 'LAST_FRAME_AS_FIRST')) return { ok: true, rule: LOCATION_RULE, locationId: loc.id, name: loc.name, mode: 'PLATE', identity: id, detail: pack.location ? `${loc.name}: ${pack.location.role === 'STATE' ? `the plate for ${(scene?.timeOfDay ?? '').toLowerCase().replace('_', ' ') || 'this time of day'}` : 'the master plate'} (${pack.location.assetId}), identity v${identity.version}` : `${loc.name}: hosted frame mode (no pictures travel with a first frame)` };
  if (pack.establishing?.locationId === loc.id) return { ok: true, rule: LOCATION_RULE, locationId: loc.id, name: loc.name, mode: 'ESTABLISHING', identity: id, detail: `${loc.name} has no plate and the scene is marked "establish here": filmed from its identity line (v${identity.version}); the first accepted take's opening frame becomes its plate` };
  return { ok: false, rule: LOCATION_RULE, locationId: loc.id, name: loc.name, mode: 'REFUSED', identity: id, detail: `${loc.name} has no plate: draw its plates first (LOCATION_PLATES), or mark the scene "establish here" so this first appearance creates the plate` };
}

/** The rule as a gate: throws UnestablishedLocationError when the place has no plate and the scene is not marked. */
export function assertLocationPlate(pack: Parameters<typeof locationPlateVerdict>[0], p: Pick<Production, 'title'>, sh: Pick<Shot, 'number'>, scene: Parameters<typeof locationPlateVerdict>[1], loc: Location | undefined): LocationPlateVerdict {
  const v = locationPlateVerdict(pack, scene, loc);
  if (!v.ok) throw new UnestablishedLocationError(`Shot ${sh.number} of “${p.title}” cannot be generated: ${v.detail}.`, { verdict: v, locationId: v.locationId, locationName: v.name, establishHere: false });
  return v;
}

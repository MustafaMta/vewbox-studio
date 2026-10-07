import { StudioError } from './errors';
import type { Character, Location, Production, Show, StudioState } from './types';
import type { Style } from './vocabulary';

/** ONE STYLE PER PRODUCTION (2026-10-08). A place's plates and a person's canonical image are drawn in their own
 *  style, and every frame and take is conditioned on them: a REALISTIC episode that borrows a CARTOON place is filmed
 *  against an animated-feature still ("The Last Crossing" in "The Lamp Keeper"'s lantern room). So a production or a
 *  show takes only people and places of its own style; the same place in another style is its own record (drawn in that
 *  style). The engines already offer only same-style members; this is the rule every path is held to. Pure. */

type Member = { id: string; name: string; style: Style };

/** The members of another style than `style`, from `ids` (unknown ids are left to the caller's own checks). */
export function offStyle<T extends Member>(style: Style, ids: string[], pool: T[]): T[] {
  return ids.map((id) => pool.find((x) => x.id === id)).filter((x): x is T => Boolean(x) && x!.style !== style);
}

const STYLE_WORD: Record<string, string> = { REALISTIC: 'realistic', CARTOON: 'cartoon', ANIME: 'anime' };
const word = (s: Style) => STYLE_WORD[s] ?? s.toLowerCase();

/** Refuse new members of another style (the error names each, its style and the way out). */
export function assertOneStyle(target: { title: string; style: Style }, people: Array<Pick<Character, 'id' | 'name' | 'style'>>, places: Array<Pick<Location, 'id' | 'name' | 'style'>>): void {
  const off = [...people.map((c) => ({ ...c, kind: 'person' })), ...places.map((l) => ({ ...l, kind: 'place' }))];
  if (!off.length) return;
  throw new StudioError('INVALID', `“${target.title}” is ${word(target.style)}; ${off.map((x) => `${x.name} is a ${word(x.style)} ${x.kind}`).join(', ')}. Use a ${word(target.style)} version (a new ${off.some((x) => x.kind === 'place') ? 'place' : 'person'} of this style) instead.`, { rule: 'one-style', styles: { target: target.style, members: off.map((x) => ({ id: x.id, style: x.style })) } });
}

/** The members of a production (its cast, its world and its scenes' places) that are not of its style. */
export function productionStyleProblems(s: Pick<StudioState, 'characters' | 'locations'>, p: Pick<Production, 'style' | 'castIds' | 'locationIds' | 'scenes'>): { people: Character[]; places: Location[] } {
  const placeIds = [...new Set([...p.locationIds, ...p.scenes.map((sc) => sc.locationId).filter((x): x is string => Boolean(x))])];
  const peopleIds = [...new Set([...p.castIds, ...p.scenes.flatMap((sc) => sc.characterIds)])];
  return { people: offStyle(p.style, peopleIds, s.characters), places: offStyle(p.style, placeIds, s.locations) };
}

/** A show's members of another style. */
export function showStyleProblems(s: Pick<StudioState, 'characters' | 'locations'>, sh: Pick<Show, 'style' | 'castIds' | 'locationIds'>): { people: Character[]; places: Location[] } {
  return { people: offStyle(sh.style, sh.castIds, s.characters), places: offStyle(sh.style, sh.locationIds, s.locations) };
}

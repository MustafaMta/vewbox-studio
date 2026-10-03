import type { Character, IdeaProposal, Location, StudioState } from '@/domain/types';
import type { IdeaContext } from './context';
import type { DraftOut } from './schemas';

/** CAST AND PLACES OF A DRAFT — the writer names people and places; the studio decides which are existing records.
 *  The same resolution the single-prompt proposal used (src/server/story/engine.ts proposeIdea, whose body is not
 *  exported): a library id from the model is trusted only when its name agrees; required characters and places are
 *  added back when dropped; a continuation offers its show's regulars and places. The language, dialect, direction
 *  and running time are the request's, never the model's. Pure. */

const n = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/^(the|a|an) /, '').trim();
/** Whole words, a leading article aside: "Karim" is "Karim the poet" and "The café" is "Abu Samir's Café", but "Sami" is not "Abu Samir". */
const same = (a: string, b: string) => { const x = n(a); const y = n(b); return Boolean(x && y) && (x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `)); };

export function resolveDraft(s: StudioState, c: IdeaContext, out: DraftOut): Omit<IdeaProposal, 'development'> {
  const show = c.showId ? s.shows.find((x) => x.id === c.showId) : undefined;
  const mustCast = c.mustCast.map((m) => s.characters.find((x) => x.id === m.id)).filter((x): x is Character => Boolean(x));
  const mustLocs = c.mustLocations.map((m) => s.locations.find((x) => x.id === m.id)).filter((x): x is Location => Boolean(x));
  const resolveChar = (id: string | undefined, name: string) => {
    const byId = id ? s.characters.find((x) => x.id === id) : undefined;
    if (byId && (same(byId.name, name) || (byId.nameAr && same(byId.nameAr, name)))) return byId;
    return s.characters.find((x) => same(x.name, name) || (x.nameAr ? same(x.nameAr, name) : false));
  };
  const resolveLoc = (id: string | undefined, name: string) => {
    const byId = id ? s.locations.find((x) => x.id === id) : undefined;
    if (byId && (same(byId.name, name) || (byId.nameAr && same(byId.nameAr, name)))) return byId;
    return s.locations.find((x) => same(x.name, name) || (x.nameAr ? same(x.nameAr, name) : false));
  };
  const cast: IdeaProposal['cast'] = [];
  out.cast.forEach((m, i) => {
    const existing = resolveChar(m.existingCharacterId, m.name);
    if (existing && cast.some((x) => x.characterId === existing.id)) return;
    cast.push({ key: existing ? `c-${existing.id}` : `new-c-${i}`, characterId: existing?.id, name: existing?.name ?? m.name, role: existing?.role ?? m.role, reason: m.reason ?? (existing ? 'Returning from the library.' : 'New to this story.'), isNew: !existing, fromPreference: Boolean(existing && mustCast.some((x) => x.id === existing.id)), sex: m.sex ?? existing?.sex, ageYears: m.ageYears ?? existing?.ageYears, appearance: existing ? undefined : m.appearance, personality: existing ? undefined : m.personality });
  });
  for (const m of mustCast) if (!cast.some((x) => x.characterId === m.id)) cast.unshift({ key: `c-${m.id}`, characterId: m.id, name: m.name, role: m.role, reason: 'You asked for this character.', isNew: false, fromPreference: true, sex: m.sex, ageYears: m.ageYears });
  if (show) {
    const returning = `Returning cast of ${show.title}.`;
    for (const x of cast) if (x.characterId && show.castIds.includes(x.characterId) && !x.fromPreference) x.reason = x.reason && x.reason !== returning ? `${returning} ${x.reason}` : returning;
    for (const id of show.castIds.slice(0, 6)) { const m = s.characters.find((x) => x.id === id); if (m && !cast.some((x) => x.characterId === id)) cast.push({ key: `c-${id}`, characterId: id, name: m.name, role: m.role, reason: returning, isNew: false, fromPreference: false, sex: m.sex, ageYears: m.ageYears }); }
  }
  const locations: IdeaProposal['locations'] = [];
  out.locations.forEach((l, i) => {
    const existing = resolveLoc(l.existingLocationId, l.name);
    if (existing && locations.some((x) => x.locationId === existing.id)) return;
    locations.push({ key: existing ? `l-${existing.id}` : `new-l-${i}`, locationId: existing?.id, name: existing?.name ?? l.name, description: existing?.description ?? l.description, isNew: !existing, fromPreference: Boolean(existing && mustLocs.some((m) => m.id === existing.id)), kind: l.kind ?? existing?.kind });
  });
  for (const m of mustLocs) if (!locations.some((l) => l.locationId === m.id)) locations.unshift({ key: `l-${m.id}`, locationId: m.id, name: m.name, description: m.description, isNew: false, fromPreference: true, kind: m.kind });
  if (show) for (const id of show.locationIds.slice(0, 3)) { const m = s.locations.find((x) => x.id === id); if (m && !locations.some((l) => l.locationId === id)) locations.push({ key: `l-${id}`, locationId: id, name: m.name, description: m.description, isNew: false, fromPreference: false, kind: m.kind }); }
  return {
    sample: false, title: out.title, titleAr: out.titleAr, logline: out.logline, premise: out.premise, genre: out.genre, mood: c.mood ?? out.mood,
    style: c.style, language: c.language, dialect: c.dialect, durationSeconds: c.durationSeconds, structure: out.structure, cast, locations,
    concept: c.kind === 'MUSIC_VIDEO' ? c.concept ?? 'PERFORMANCE' : undefined,
    song: c.kind === 'MUSIC_VIDEO' && out.song ? { title: out.song.title, caption: out.song.caption ?? '', lyrics: out.song.lyrics } : undefined,
  };
}

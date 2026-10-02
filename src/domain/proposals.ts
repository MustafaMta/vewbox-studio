import type { AutoIdeaRequest, IdeaProposal, ProposedCast, ProposedLocation, StudioState } from '@/domain/types';
import { DURATIONS } from '@/domain/vocabulary';

/** SAMPLE PROPOSALS — the written examples the Auto Idea review offers as a fallback to the story engine. They are written
 *  templates, labelled as samples wherever they appear, and never the result of research or generation.
 *
 *  What is real is the shape and the rules a backend must follow, and those are applied here too:
 *  - explicit preferences win (style, language, dialect, duration, mood, treatment, the characters and places asked for);
 *  - for an episode, the show's world is the context: its style, language, returning cast and locations are reused,
 *    and additions are proposed only as new, optional entries;
 *  - nothing is created until the producer accepts the reviewed proposal. */

type Template = Omit<IdeaProposal, 'sample' | 'style' | 'language' | 'dialect' | 'durationSeconds' | 'cast' | 'locations'> & {
  newCast: Array<{ name: string; role: string; reason: string; sex: 'FEMALE' | 'MALE' }>;
  newLocations: Array<{ name: string; description: string; kind: 'INTERIOR' | 'EXTERIOR' }>;
};

const TEMPLATES: Record<AutoIdeaRequest['kind'], Template[]> = {
  SHOW: [
    {
      title: 'The Night Market', logline: 'A market that opens at midnight, and the family who has sold tea at its gate for three generations.', genre: 'Comedy-drama', mood: 'Warm, nocturnal',
      premise: 'Every night at twelve the square fills with stalls that were not there at eleven. Rasha runs the tea stall her grandmother opened; her brother wants to sell it to the man who owns the other five. Each episode is one night and one customer who needs something the market sells.',
      structure: [{ title: 'Opening night', summary: 'Rasha refuses the offer; a customer pays in a currency no one has seen.' }, { title: 'The inspector', summary: 'A city inspector tries to find the market in daylight.' }, { title: 'Last cup', summary: 'The brother makes his own offer.' }],
      newCast: [{ name: 'Rasha', role: 'Runs the tea stall at the gate', reason: 'The lead: the story is hers.', sex: 'FEMALE' }, { name: 'Faris', role: 'Her younger brother, wants to sell', reason: 'The pressure on her every episode.', sex: 'MALE' }],
      newLocations: [{ name: 'The midnight square', description: 'A stone square that fills with lantern-lit stalls at midnight.', kind: 'EXTERIOR' }],
    },
    {
      title: 'Second Floor', logline: 'Four neighbours, one broken lift, and a building that argues back.', genre: 'Comedy', mood: 'Bright, quick',
      premise: 'The lift has been broken for a year. Everyone on the second floor has a theory and a grudge. Each episode, one neighbour tries to fix something in the building and breaks something else.',
      structure: [{ title: 'The petition', summary: 'A signature campaign that ends in a feud over the stairwell light.' }, { title: 'The engineer', summary: 'Someone finally comes to look at the lift.' }, { title: 'Power cut', summary: 'The whole building on the roof for one hot night.' }],
      newCast: [{ name: 'Mr. Adel', role: 'Retired teacher, keeps the building’s records', reason: 'The voice of order.', sex: 'MALE' }, { name: 'Dina', role: 'New tenant, fixes things', reason: 'The outsider who changes the floor.', sex: 'FEMALE' }],
      newLocations: [{ name: 'The stairwell', description: 'Four flights of worn terrazzo, one flickering light, a lift door taped shut.', kind: 'INTERIOR' }],
    },
  ],
  EPISODE: [
    {
      title: 'Rain Day', logline: 'The first rain of the year keeps everyone inside, and nobody can agree who should pay for the leak.', genre: 'Comedy', mood: 'Cosy, crowded',
      premise: 'A downpour traps the regulars together for an afternoon. A leak in the roof becomes a question of whose fault, whose money and whose bucket — and a stranger sheltering from the rain turns out to know how to fix it.',
      structure: [{ title: 'The first drop', summary: 'The rain starts; the leak finds the only chair nobody is sitting in.' }, { title: 'The argument', summary: 'Everyone has a plan; none of them involve paying.' }, { title: 'The stranger', summary: 'The one who fixes it asks for nothing, which is worse.' }],
      newCast: [{ name: 'The stranger', role: 'Sheltering from the rain; a roofer, it turns out', reason: 'The story needs someone from outside the regulars.', sex: 'MALE' }],
      newLocations: [],
    },
    {
      title: 'The Inspector', logline: 'A health inspector arrives on the one morning nothing is where it should be.', genre: 'Comedy', mood: 'Tense, farcical',
      premise: 'An inspector arrives unannounced. Everything the regulars hide makes things worse; the one thing they cannot hide saves the day.',
      structure: [{ title: 'The knock', summary: 'Someone at the door with a clipboard.' }, { title: 'Hiding it all', summary: 'Every regular hides something; the cat hides the inspector’s pen.' }, { title: 'The verdict', summary: 'A pass, for the wrong reason.' }],
      newCast: [{ name: 'The inspector', role: 'City health inspector, humourless', reason: 'A new guest the story needs; not part of the regular cast.', sex: 'FEMALE' }],
      newLocations: [],
    },
  ],
  SHORT: [
    {
      title: 'The Last Tram', logline: 'The last tram of the night stops at a station that closed twenty years ago.', genre: 'Fantasy', mood: 'Quiet, uncanny',
      premise: 'A conductor on her final shift before retirement notices one passenger who never gets off. At a station that should not exist, he does — and asks her to come too.',
      structure: [{ title: 'Final shift', summary: 'The empty tram, the one passenger.' }, { title: 'The closed station', summary: 'Lights in a station that was bricked up.' }, { title: 'The choice', summary: 'She stays on the tram; she keeps his ticket.' }],
      newCast: [{ name: 'Samira', role: 'Tram conductor on her last shift', reason: 'The lead.', sex: 'FEMALE' }, { name: 'The passenger', role: 'Never gets off', reason: 'The mystery she follows.', sex: 'MALE' }],
      newLocations: [{ name: 'The last tram', description: 'A narrow tram carriage at night, windows full of the passing city.', kind: 'INTERIOR' }],
    },
    {
      title: 'Bread at Four', logline: 'A baker who wakes the street each dawn discovers the street has been waking her.', genre: 'Drama', mood: 'Tender, early',
      premise: 'Every morning at four she lights the oven. One morning someone has lit it already. Over a week, she learns who, and why.',
      structure: [{ title: 'The warm oven', summary: 'The oven is already lit when she arrives.' }, { title: 'The watch', summary: 'She waits in the dark to see who comes.' }, { title: 'At four', summary: 'She lights it for them, next time.' }],
      newCast: [{ name: 'Warda', role: 'The baker', reason: 'The lead.', sex: 'FEMALE' }],
      newLocations: [{ name: 'The bakery', description: 'A small bakery with a wood-fired oven and a door onto the street.', kind: 'INTERIOR' }],
    },
  ],
  MUSIC_VIDEO: [
    {
      title: 'Salt', logline: 'A song for the sea from someone who has never seen it.', genre: 'Ballad', mood: 'Longing, open',
      premise: 'The singer performs on a rooftop far from any coast, while a paper boat travels the city’s gutters and canals towards the sea she sings about.',
      structure: [{ title: 'Verse — the roof', summary: 'The singer alone, the city grey around her.' }, { title: 'Chorus — the boat', summary: 'The paper boat sets off into the rain.' }, { title: 'Bridge — the river', summary: 'The boat reaches the river; she sees it from the roof.' }],
      concept: 'MIXED', song: { title: 'Salt', caption: 'Slow ballad, piano and strings, a low voice that opens on the chorus.', lyrics: '[verse]\nI have only heard the sea in shells\n\n[chorus]\nCarry me to salt, carry me to blue\n\n[bridge]\nEvery gutter knows the way' },
      newCast: [{ name: 'The singer', role: 'Performer', reason: 'No existing singer suits the song.', sex: 'FEMALE' }],
      newLocations: [{ name: 'The high roof', description: 'A rooftop above the old city, washing lines and water tanks.', kind: 'EXTERIOR' }],
    },
  ],
};

const pick = <T,>(xs: T[], variant: number) => xs[((variant % xs.length) + xs.length) % xs.length];

export function sampleProposal(s: StudioState, req: AutoIdeaRequest, variant = 0): IdeaProposal {
  const t = pick(TEMPLATES[req.kind], variant);
  const prefs = req.preferences;
  const show = req.showId ? s.shows.find((x) => x.id === req.showId) : undefined;
  const d = s.settings.defaults;
  const durations = DURATIONS[req.kind === 'SHOW' ? 'EPISODE' : req.kind];
  const showEpisodes = show ? s.productions.filter((p) => p.showId === show.id) : [];
  const showDuration = showEpisodes.length ? Math.round(showEpisodes.reduce((a, p) => a + p.targetSeconds, 0) / showEpisodes.length) : undefined;
  const language = prefs.language ?? show?.language ?? d.language;

  const cast: ProposedCast[] = [];
  const locations: ProposedLocation[] = [];
  const addCast = (id: string, reason: string, fromPreference: boolean) => { const c = s.characters.find((x) => x.id === id); if (c && !cast.some((x) => x.characterId === id)) cast.push({ key: `c-${id}`, characterId: id, name: c.name, role: c.role, reason, isNew: false, fromPreference }); };
  const addLoc = (id: string, fromPreference: boolean) => { const l = s.locations.find((x) => x.id === id); if (l && !locations.some((x) => x.locationId === id)) locations.push({ key: `l-${id}`, locationId: id, name: l.name, description: l.description, isNew: false, fromPreference }); };

  // explicit preferences first
  for (const id of prefs.castIds ?? []) addCast(id, 'You asked for this character.', true);
  for (const id of prefs.locationIds ?? []) addLoc(id, true);
  // the show's world next: returning cast and places
  if (show) { for (const id of show.castIds.slice(0, 4)) addCast(id, `Returning cast of ${show.title}.`, false); for (const id of show.locationIds.slice(0, 3)) addLoc(id, false); }
  // a music video with no performer asked for: an existing singer, if the library has one
  if (req.kind === 'MUSIC_VIDEO' && cast.length === 0) { const singer = s.characters.find((c) => /singer|perform/i.test(c.role)); if (singer) addCast(singer.id, 'Already a singer in your library.', false); }
  // additions the story needs, proposed as new and optional
  const wantsNewCast = req.kind === 'EPISODE' || cast.length === 0;
  if (wantsNewCast) t.newCast.forEach((c, i) => cast.push({ key: `new-c-${i}`, name: c.name, role: c.role, reason: c.reason, isNew: true, fromPreference: false, sex: c.sex }));
  if (locations.length === 0) t.newLocations.forEach((l, i) => locations.push({ key: `new-l-${i}`, name: l.name, description: l.description, isNew: true, fromPreference: false, kind: l.kind }));

  return {
    sample: true,
    title: t.title, logline: t.logline, premise: t.premise, genre: t.genre, mood: prefs.mood?.trim() || t.mood, structure: t.structure,
    style: prefs.style ?? show?.style ?? d.style,
    language,
    dialect: language === 'AR' ? prefs.dialect ?? show?.dialect ?? d.dialect : undefined,
    durationSeconds: prefs.durationSeconds ?? showDuration ?? durations[1],
    cast, locations,
    concept: req.kind === 'MUSIC_VIDEO' ? prefs.concept ?? t.concept ?? 'PERFORMANCE' : undefined,
    song: req.kind === 'MUSIC_VIDEO' ? t.song : undefined,
  };
}

export const SAMPLE_VARIANTS: Record<AutoIdeaRequest['kind'], number> = { SHOW: TEMPLATES.SHOW.length, EPISODE: TEMPLATES.EPISODE.length, SHORT: TEMPLATES.SHORT.length, MUSIC_VIDEO: TEMPLATES.MUSIC_VIDEO.length };

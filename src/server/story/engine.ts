import { z } from 'zod';
import type { Character, ContinuityState, IdeaPreferences, IdeaProposal, Location, Production, Scene, StudioState } from '@/domain/types';
import type { Dialect, Language, Style } from '@/domain/vocabulary';
import { DIALECT_LABELS, DURATIONS } from '@/domain/vocabulary';
import { nid } from '@/domain/ids';
import { StudioError } from '@/domain/errors';
import { json as llmJson, type LlmMessage, type LlmOptions, type LlmResult } from '../providers/llm';
import { styleDirection } from './style';
import { DevelopSchema, PerformancePlanSchema, ProposalSchema, ScriptSchema, ShotPlanSchema, type ShotPlanOut } from './schemas';
import { agentPrompt } from '../org/skills';

/** THE STORY ENGINE — turns a brief into a production: concept, cast and world, synopsis, scenes, script, shots with
 *  continuity, and the performance plan of a music video. It writes original material in the chosen style and
 *  language, reuses the studio's existing characters and places when they fit, and never invents what the producer
 *  already decided. Every answer is validated; the engine returns data, and the handlers persist it. */

const STUDIO_RULES = `You are the story department of Vewbox Studio, an AI filmmaking studio that makes original shows, short films and music videos in three production directions (cartoon, anime, realistic) and in English or Arabic, including Iraqi (Baghdadi) Arabic.
Rules you always follow:
- Write ORIGINAL characters, places and stories. Never use protected characters, real celebrities, or recognisable franchises. Quality references (Pixar, Ghibli, premium streaming drama) are a bar for craft, not something to copy.
- Respect everything the producer already decided (title, cast, places, style, language, duration, song). Build on it; do not contradict it.
- Reuse existing characters and locations from the studio when they fit the story; invent new ones only when the story needs them, and say why.
- Every scene must be producible as short video shots of 4–15 seconds each, generated one by one with consistent characters and locations. Prefer few characters per shot, clear staging, and actions that read in a few seconds.
- Keep continuity explicit: who is where, what they wear, what they hold, time of day, and how each shot relates to the one before (continuation, cut, or story transition).
- Answer with ONE JSON object only. No prose before or after it, no markdown fences, no comments.`;

const LANGUAGE_RULES = (language: Language, dialect?: Dialect) => language === 'AR'
  ? `Language: Arabic${dialect ? `, dialect: ${DIALECT_LABELS[dialect].en}` : ''}. Dialogue and lyrics must be written in natural spoken ${dialect === 'IRAQI_BAGHDADI' ? 'Iraqi Baghdadi Arabic — everyday colloquial wording, Iraqi vocabulary (شلونك، هواية، شنو، وين، اكو/ماكو، خوش، زين), Iraqi spelling conventions including چ and گ where they are pronounced (e.g. چاي، گلب، شگد), not Modern Standard Arabic' : dialect === 'MSA' ? 'Modern Standard Arabic' : 'the given Arabic dialect'}. Put the Arabic in "textAr" and a faithful English gloss in "text" so the producer can review both. Titles may have an Arabic version in "titleAr"/"nameAr".`
  : 'Language: English. Write natural spoken English in "text"; leave "textAr" empty.';

const STYLE_RULES = (style: Style) => { const d = styleDirection(style); return `Production direction: ${d.name}.\nStorytelling: ${d.writing}\nCharacter design rules: ${d.character}\nEnvironment rules: ${d.environment}\nCamera rules: ${d.camera}`; };

const compact = (v: unknown) => JSON.stringify(v);

function castSummary(c: Character) {
  return { id: c.id, name: c.name, nameAr: c.nameAr, role: c.role, sex: c.sex, ageYears: c.ageYears, species: c.species, look: [c.build, c.face, c.hair, c.eyes && `${c.eyes} eyes`, c.skin && `${c.skin} skin`].filter(Boolean).join('; '), wardrobe: c.wardrobe, distinguishing: c.distinguishing, personality: c.personality, language: c.language, dialect: c.dialect, voice: `${c.voice.pitch} ${c.voice.pace} ${c.voice.timbre}`.trim(), hasAppearance: Boolean(c.portraitAssetId) };
}
function locationSummary(l: Location) {
  return { id: l.id, name: l.name, nameAr: l.nameAr, kind: l.kind, description: l.description, landmarks: l.landmarks, props: l.props, lighting: l.lighting, layout: l.layout };
}

/** `agentId`: the studio agent making the call (the handler knows it). Its role, instructions and PROMPT skills are
 *  appended to the system message (src/server/org/skills.ts agentPrompt); without it, or for an agent that does not
 *  call the model, the system message is exactly the engine's own. */
export interface EngineOptions extends LlmOptions { onResult?: (r: LlmResult) => void; agentId?: string }

/** The engine's system message for a call, followed by what the calling agent brings (its instructions, its skills). */
const system = (content: string, opts: EngineOptions): LlmMessage => ({ role: 'system', content: `${content}${agentPrompt(opts.agentId)}` });

// --------------------------------------------------------------------------------------------------- Auto Idea

/** Everything a new season or episode inherits from its show: the concept, the language and dialect (never changed
 *  by a proposal), every season so far with its arc, the finished and unfinished episodes with where each one left
 *  the story (the last scene's exit state), the bible (rules, relationships, timeline, open storylines) and the
 *  locked cast and places by id. */
export function showContinuity(s: StudioState, show: NonNullable<StudioState['shows'][number]>, season?: StudioState['seasons'][number]) {
  const seasons = s.seasons.filter((x) => x.showId === show.id).sort((a, b) => a.number - b.number);
  const episodes = s.productions.filter((p) => p.showId === show.id).sort((a, b) => (a.seasonId === b.seasonId ? (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) : (seasons.findIndex((x) => x.id === a.seasonId) - seasons.findIndex((x) => x.id === b.seasonId))));
  const epSummary = (p: Production) => ({ season: seasons.find((x) => x.id === p.seasonId)?.number, number: p.episodeNumber, title: p.title, logline: p.logline, synopsis: p.synopsis.slice(0, 600), finished: p.stage === 'COMPLETE' || Boolean(p.cutAssetId), endsWith: [...p.scenes].reverse().find((sc) => sc.exitState)?.exitState });
  const previousSeason = season ? seasons.filter((x) => x.number < season.number).at(-1) : seasons.at(-1);
  const lastEpisode = episodes.at(-1);
  return {
    title: show.title, logline: show.logline, genre: show.genre, synopsis: show.synopsis,
    language: show.language, dialect: show.dialect, style: show.style,
    bible: show.bible,
    seasons: seasons.map((x) => ({ number: x.number, title: x.title, arc: x.arc, episodes: episodes.filter((p) => p.seasonId === x.id).length })),
    thisSeason: season ? { number: season.number, title: season.title, arc: season.arc } : undefined,
    previousSeason: previousSeason ? { number: previousSeason.number, title: previousSeason.title, arc: previousSeason.arc, endedWith: episodes.filter((p) => p.seasonId === previousSeason.id).at(-1)?.scenes.slice(-1)[0]?.exitState } : undefined,
    previousEpisodes: episodes.slice(-8).map(epSummary),
    lastEpisode: lastEpisode ? epSummary(lastEpisode) : undefined,
    returningCast: show.castIds.map((id) => s.characters.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...castSummary(c!), usedInVideo: Boolean(c!.usage?.videos.length) })),
    returningLocations: show.locationIds.map((id) => s.locations.find((l) => l.id === id)).filter(Boolean).map((l) => locationSummary(l!)),
  };
}

export async function proposeIdea(s: StudioState, req: { kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; preferences: IdeaPreferences; brief?: string }, opts: EngineOptions = {}): Promise<IdeaProposal> {
  const prefs = req.preferences;
  const show = req.showId ? s.shows.find((x) => x.id === req.showId) : undefined;
  const season = req.seasonId ? s.seasons.find((x) => x.id === req.seasonId) : undefined;
  const d = s.settings.defaults;
  // a show's language, dialect and direction are its identity: a season or episode never changes them
  const language = show?.language ?? prefs.language ?? d.language;
  const dialect = language === 'AR' ? show?.dialect ?? prefs.dialect ?? d.dialect : undefined;
  const style = show?.style ?? prefs.style ?? d.style;
  const episodes = show ? s.productions.filter((p) => p.showId === show.id) : [];
  const avgDuration = episodes.length ? Math.round(episodes.reduce((a, p) => a + p.targetSeconds, 0) / episodes.length) : undefined;
  const durations = DURATIONS[req.kind === 'SHOW' || req.kind === 'SEASON' ? 'EPISODE' : req.kind];
  const durationSeconds = prefs.durationSeconds ?? avgDuration ?? durations[1];
  const mustCast = (prefs.castIds ?? []).map((id) => s.characters.find((c) => c.id === id)).filter(Boolean) as Character[];
  const mustLocs = (prefs.locationIds ?? []).map((id) => s.locations.find((l) => l.id === id)).filter(Boolean) as Location[];
  const library = { characters: s.characters.filter((c) => c.style === style).slice(0, 24).map(castSummary), locations: s.locations.filter((l) => l.style === style).slice(0, 16).map(locationSummary) };
  const showContext = show ? showContinuity(s, show, season) : undefined;

  const what = req.kind === 'SHOW' ? 'a new SHOW (series): the concept and the first season\'s first 3–6 episodes as the structure'
    : req.kind === 'SEASON' ? `the NEXT SEASON (season ${(showContext?.seasons.length ?? 0) + 1}) of the show described below: the structure is its 3–8 episodes in order, each continuing the last; the premise is the season's arc`
    : req.kind === 'EPISODE' ? 'the NEXT EPISODE of the show described below: the structure is its 3–6 scenes'
    : req.kind === 'SHORT' ? 'a SHORT FILM: the structure is its 3–6 scenes'
    : 'a MUSIC VIDEO: the structure is its 3–6 visual sections, and it needs a song (title, a one-sentence musical caption describing genre/tempo/instrumentation/voice, and complete lyrics with [verse]/[chorus]/[bridge] tags, one blank line between sections)';
  const continuityRules = showContext ? `CONTINUITY RULES for this show: keep its language (${language}${dialect ? `, ${DIALECT_LABELS[dialect].en}` : ''}) and direction; the story continues from "lastEpisode.endsWith" and "previousSeason.endedWith" — never restart from nothing or contradict the bible's timeline; pick up at least one of the bible's unresolved storylines (bible.unresolved) when there are any; reuse returning cast and places by their ids (their identities are locked and must not be redescribed); introduce a new character or place only when this story genuinely needs it, and say why.` : '';
  const user = `Propose ${what}.
Target running time: about ${durationSeconds} seconds. ${req.kind === 'MUSIC_VIDEO' ? `Treatment: ${prefs.concept ?? 'PERFORMANCE'} (PERFORMANCE = the singer performs on screen; NARRATIVE = a story illustrates the song; MIXED = both).` : ''}
${prefs.mood ? `Requested mood: ${prefs.mood}.` : ''}
${req.brief ? `The producer's own idea (build on it exactly): """${req.brief}"""` : 'The producer gave no premise: invent one that is fresh, specific and emotionally clear, set in a concrete place with a cultural texture that fits the language.'}
${mustCast.length ? `These existing characters MUST be in it (reference them by existingCharacterId): ${compact(mustCast.map(castSummary))}` : ''}
${mustLocs.length ? `These existing locations MUST be used (reference them by existingLocationId): ${compact(mustLocs.map(locationSummary))}` : ''}
${showContext ? `${continuityRules}\nShow context (reuse its returning cast and places by existingCharacterId / existingLocationId; propose at most one or two newcomers this ${req.kind === 'SEASON' ? 'season' : 'episode'} needs — a guest character or a new place): ${compact(showContext)}` : `Studio library you may reuse by id when a character or place genuinely fits (otherwise invent new ones): ${compact(library)}`}
Return JSON with exactly these keys: title, titleAr (optional), logline, premise (2–4 paragraphs), genre, mood, structure (array of {title, summary}), cast (array of {existingCharacterId?, name, role, reason, sex, ageYears, appearance, personality}), locations (array of {existingLocationId?, name, description, kind})${req.kind === 'MUSIC_VIDEO' ? ', song {title, caption, lyrics}' : ''}.
For a new character "appearance" is one dense sentence of how they look (age, build, face, hair, skin, eyes, wardrobe, one distinguishing detail).`;

  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(style)}\n\n${LANGUAGE_RULES(language, dialect)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(ProposalSchema, messages, { ...opts, maxTokens: 6000, temperature: 0.9 });
  opts.onResult?.(r.result);
  const out = r.data;
  // a library id from the model is trusted only when the name agrees with it (the model has returned a wrong id with
  // the right name); otherwise the name decides, and an unknown name is a new character
  const same = (a: string, b: string) => { const n = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a)); };
  const resolveChar = (id: string | undefined, name: string) => { const byId = id ? s.characters.find((x) => x.id === id) : undefined; if (byId && (same(byId.name, name) || (byId.nameAr && same(byId.nameAr, name)))) return byId; return s.characters.find((x) => same(x.name, name) || (x.nameAr ? same(x.nameAr, name) : false)); };
  const resolveLoc = (id: string | undefined, name: string) => { const byId = id ? s.locations.find((x) => x.id === id) : undefined; if (byId && (same(byId.name, name) || (byId.nameAr && same(byId.nameAr, name)))) return byId; return s.locations.find((x) => same(x.name, name) || (x.nameAr ? same(x.nameAr, name) : false)); };
  const cast = out.cast.map((c, i) => {
    const existing = resolveChar(c.existingCharacterId, c.name);
    const fromPreference = Boolean(existing && mustCast.some((m) => m.id === existing.id));
    return { key: existing ? `c-${existing.id}` : `new-c-${i}`, characterId: existing?.id, name: existing?.name ?? c.name, role: existing?.role ?? c.role, reason: c.reason ?? (existing ? 'Returning from the library.' : 'New to this story.'), isNew: !existing, fromPreference, sex: c.sex ?? existing?.sex, ageYears: c.ageYears ?? existing?.ageYears, appearance: c.appearance, personality: c.personality };
  });
  // anything the producer required that the model dropped is added back
  for (const m of mustCast) if (!cast.some((c) => c.characterId === m.id)) cast.unshift({ key: `c-${m.id}`, characterId: m.id, name: m.name, role: m.role, reason: 'You asked for this character.', isNew: false, fromPreference: true, sex: m.sex, ageYears: m.ageYears, appearance: undefined, personality: undefined });
  // an episode belongs to its show: the regulars are offered (the producer unticks whoever sits this one out)
  if (show) {
    const returning = `Returning cast of ${show.title}.`;
    for (const c of cast) if (c.characterId && show.castIds.includes(c.characterId) && !c.fromPreference) c.reason = c.reason && c.reason !== returning ? `${returning} ${c.reason}` : returning;
    for (const id of show.castIds.slice(0, 6)) { const m = s.characters.find((x) => x.id === id); if (m && !cast.some((c) => c.characterId === id)) cast.push({ key: `c-${id}`, characterId: id, name: m.name, role: m.role, reason: returning, isNew: false, fromPreference: false, sex: m.sex, ageYears: m.ageYears, appearance: undefined, personality: undefined }); }
  }
  // two of the model's places that resolve to the same existing location are one offer (one key, one checkbox)
  const locations: IdeaProposal['locations'] = [];
  out.locations.forEach((l, i) => {
    const existing = resolveLoc(l.existingLocationId, l.name);
    if (existing && locations.some((x) => x.locationId === existing.id)) return;
    locations.push({ key: existing ? `l-${existing.id}` : `new-l-${i}`, locationId: existing?.id, name: existing?.name ?? l.name, description: existing?.description ?? l.description, isNew: !existing, fromPreference: Boolean(existing && mustLocs.some((m) => m.id === existing.id)), kind: l.kind ?? existing?.kind });
  });
  for (const m of mustLocs) if (!locations.some((l) => l.locationId === m.id)) locations.unshift({ key: `l-${m.id}`, locationId: m.id, name: m.name, description: m.description, isNew: false, fromPreference: true, kind: m.kind });
  if (show) for (const id of show.locationIds.slice(0, 3)) { const m = s.locations.find((x) => x.id === id); if (m && !locations.some((l) => l.locationId === id)) locations.push({ key: `l-${id}`, locationId: id, name: m.name, description: m.description, isNew: false, fromPreference: false, kind: m.kind }); }
  return { sample: false, title: out.title, titleAr: out.titleAr, logline: out.logline, premise: out.premise, genre: out.genre, mood: prefs.mood?.trim() || out.mood, style, language, dialect, durationSeconds, structure: out.structure, cast, locations, concept: req.kind === 'MUSIC_VIDEO' ? prefs.concept ?? 'PERFORMANCE' : undefined, song: req.kind === 'MUSIC_VIDEO' && out.song ? { title: out.song.title, caption: out.song.caption ?? '', lyrics: out.song.lyrics } : undefined };
}

// ------------------------------------------------------------------------------------------- Continuity Writer

const ContinuitySchema = z.object({
  events: z.array(z.string().min(3).max(300)).max(12),
  relationships: z.array(z.string().min(3).max(200)).max(10).optional(),
  unresolved: z.array(z.string().min(3).max(200)).max(10),
  resolved: z.array(z.string().min(3).max(200)).max(10).optional(),
});
export type ContinuityUpdate = z.infer<typeof ContinuitySchema>;

/** After an episode is cut: what happened (for the show's timeline), what changed between people, which storylines
 *  it left open and which of the open ones it closed. Written in the show's language of record-keeping (English,
 *  so every department reads it). */
export async function continuityUpdate(s: StudioState, show: StudioState['shows'][number], p: Production, cast: Character[], opts: EngineOptions = {}): Promise<ContinuityUpdate> {
  const season = s.seasons.find((x) => x.id === p.seasonId);
  const scenes = p.scenes.map((sc) => ({ number: sc.number, title: sc.title, purpose: sc.purpose, entryState: sc.entryState, exitState: sc.exitState, characters: sc.characterIds.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean), lines: sc.beats.flatMap((b) => b.lines).slice(0, 6).map((l) => `${cast.find((c) => c.id === l.characterId)?.name ?? '?'}: ${l.text}`) }));
  const user = `The episode "${p.title}" (season ${season?.number ?? '?'}, episode ${p.episodeNumber ?? '?'}) of the show "${show.title}" has been cut. Record it for the show's bible.
Synopsis: ${p.synopsis}
Scenes: ${compact(scenes)}
The bible so far: ${compact(show.bible ?? {})}
Return JSON: { events: [3–8 one-sentence facts that later episodes must respect, each starting with "S${season?.number ?? '?'}E${p.episodeNumber ?? '?'}:"], relationships: [changed relationships, one sentence each, only when something changed], unresolved: [the storylines this episode leaves open, including still-open ones from the bible], resolved: [bible.unresolved items this episode closed] }. English only; names exactly as in the cast.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\nYou are the Continuity Writer: you keep the story bible. Record facts, not opinions.`, opts), { role: 'user', content: user }];
  const r = await llmJson(ContinuitySchema, messages, { ...opts, maxTokens: 2500, temperature: 0.3 });
  opts.onResult?.(r.result);
  return r.data;
}

// ------------------------------------------------------------------------------------------- Character design

const CharacterDesignSchema = z.object({
  name: z.string().min(1).max(80), nameAr: z.string().max(80).optional(), role: z.string().min(1).max(120),
  sex: z.enum(['FEMALE', 'MALE']), ageYears: z.number().int().min(1).max(120), species: z.string().max(60).optional(),
  build: z.string().min(2).max(200), face: z.string().min(2).max(300), hair: z.string().min(2).max(200), skin: z.string().min(2).max(120), eyes: z.string().min(2).max(120),
  distinguishing: z.array(z.string().max(120)).max(6), wardrobe: z.string().min(2).max(300), personality: z.string().min(2).max(400),
  voice: z.object({ pitch: z.enum(['LOW', 'MID', 'HIGH']), pace: z.enum(['SLOW', 'MEASURED', 'QUICK']), timbre: z.string().max(120), notes: z.string().max(200).optional() }).optional(),
});
export type CharacterDesign = z.infer<typeof CharacterDesignSchema>;

/** A character from a one-line brief: every appearance field filled so the portrait and the voice can be made. */
export async function designCharacter(s: StudioState, req: { brief: string; name?: string; style: Style; language: Language; dialect?: Dialect; world?: string }, opts: EngineOptions = {}): Promise<CharacterDesign> {
  const existing = s.characters.filter((c) => c.style === req.style).slice(0, 20).map((c) => ({ name: c.name, role: c.role, look: castSummary(c).look }));
  const user = `Design ONE new original character for ${req.style.toLowerCase()} production in ${req.language === 'AR' ? `Arabic${req.dialect ? ` (${DIALECT_LABELS[req.dialect].en})` : ''}` : 'English'}.
Brief: """${req.brief}"""${req.name ? `\nName to use: ${req.name}` : ''}${req.world ? `\nThe world they belong to: ${req.world}` : ''}
Existing characters (do not duplicate a look or a name): ${compact(existing)}
Return JSON: { name, nameAr?, role, sex, ageYears, species?, build, face, hair, skin, eyes, distinguishing[], wardrobe, personality, voice: { pitch, pace, timbre, notes? } }. Describe the look concretely (a picture is drawn from these words); one distinguishing detail that survives every shot.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(req.style)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(CharacterDesignSchema, messages, { ...opts, maxTokens: 2500, temperature: 0.9 });
  opts.onResult?.(r.result);
  return r.data;
}

// ----------------------------------------------------------------------------------------------- Manual Brief

export interface DevelopResult {
  logline: string; synopsis: string; genre?: string; mood?: string; titleAr?: string;
  newCharacters: Array<{ name: string; role: string; sex: 'FEMALE' | 'MALE'; design: z.infer<typeof DevelopSchema>['newCharacters'][number]['design'] }>;
  newLocations: Array<{ name: string; design: z.infer<typeof DevelopSchema>['newLocations'][number]['design'] }>;
  scenes: z.infer<typeof DevelopSchema>['scenes'];
}

/** Library characters a story may borrow. A short or music video may draw on the whole library (same style); a
 *  show's episode is cast from its regulars, and library people from outside the show are offered only when this
 *  episode's own brief names them (at most two) — otherwise the model fills every episode with the whole studio.
 *  The handler resolves scene names against the same list, so a name the model adds anyway is dropped. */
export function libraryGuests(s: StudioState, p: Production, cast: Character[]): Character[] {
  const show = p.showId ? s.shows.find((x) => x.id === p.showId) : undefined;
  const mentioned = `${p.brief.text ?? ''} ${p.logline} ${p.synopsis}`.toLowerCase();
  return s.characters
    .filter((c) => c.style === p.style && !cast.some((x) => x.id === c.id))
    .filter((c) => !show || mentioned.includes(c.name.toLowerCase()) || (c.nameAr ? mentioned.includes(c.nameAr) : false))
    .slice(0, show ? 2 : 12);
}

/** From a brief (and whatever cast/places are already attached) to a developed story with a scene breakdown. */
export async function developStory(s: StudioState, p: Production, cast: Character[], world: Location[], opts: EngineOptions = {}): Promise<DevelopResult> {
  const show = p.showId ? s.shows.find((x) => x.id === p.showId) : undefined;
  const libraryChars = libraryGuests(s, p, cast).map(castSummary);
  const libraryLocs = s.locations.filter((l) => l.style === p.style && !world.some((x) => x.id === l.id)).slice(0, 10).map(locationSummary);
  const kind = p.kind === 'MUSIC_VIDEO' ? 'music video' : p.kind === 'SHORT' ? 'short film' : 'episode';
  const sceneBudget = Math.max(1, Math.min(24, Math.round(p.targetSeconds / (p.kind === 'MUSIC_VIDEO' ? 20 : 45))));
  const user = `Develop this ${kind} from the producer's brief.
Title: ${p.title}${p.titleAr ? ` / ${p.titleAr}` : ''}
Brief: """${p.brief.text || p.logline || p.synopsis || '(none — invent a strong premise that fits the title)'}"""
${p.logline ? `Existing logline: ${p.logline}` : ''}${p.synopsis ? `\nExisting synopsis (keep its facts): ${p.synopsis}` : ''}
Target running time: ${p.targetSeconds} seconds → plan about ${sceneBudget} scene(s), each with targetSeconds that add up to roughly the total.
${show ? `Part of the show "${show.title}" (${show.logline}). Show synopsis: ${show.synopsis ?? ''}. Bible: ${compact(show.bible ?? {})}.
This is an EPISODE of that show: its regulars (${s.characters.filter((c) => show.castIds.includes(c.id)).map((c) => c.name).join(', ') || 'see the cast below'}) carry every episode; the leads named in the brief or synopsis must appear. Characters from outside the show are guests: at most two, only when this episode's story needs them, never replacing a regular.` : ''}
Cast already attached (use them; refer to them by exact name): ${compact(cast.map(castSummary))}
Places already attached (use them; refer to them by exact name): ${compact(world.map(locationSummary))}
${libraryChars.length ? `Other studio characters you MAY bring in by exact name if they fit: ${compact(libraryChars)}` : ''}
${libraryLocs.length ? `Other studio places you MAY use by exact name: ${compact(libraryLocs)}` : ''}
If the story needs people or places that do not exist yet, create them in newCharacters / newLocations with full designs (then use their names in scenes). Keep new characters to the minimum the story needs.
${p.kind === 'MUSIC_VIDEO' && p.song ? `The song (${p.song.title}, ${p.song.durationSeconds}s): caption "${p.song.caption}". Sections: ${compact(p.song.sections.map((x) => ({ kind: x.kind, from: x.from, to: x.to, text: x.textAr || x.text })))}. Scenes should map onto song sections.` : ''}
Return JSON: { logline, synopsis (3–6 paragraphs, present tense), genre, mood, titleAr?, newCharacters: [{name, role, sex, design:{build, face, hair, skin, eyes, distinguishing[], wardrobe, personality, ageYears, nameAr?, canon:{heightCm?, accessories[]?, visualRestrictions[]?, agePresentation?, speech?}}}], newLocations: [{name, design:{description, kind, landmarks[], props[], lighting[], nameAr?, layout:{geography?, architecture?, materials[]?, cameraZones[]?, entrances[]?, spatial?}}}], scenes: [{title, locationName, timeOfDay, characterNames[], purpose, emotionalObjective, entryState, exitState, targetSeconds}] }.
timeOfDay must be one of DAWN, MORNING, MIDDAY, AFTERNOON, GOLDEN_HOUR, DUSK, NIGHT. locationName must match an attached, library or new location exactly; characterNames likewise.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(DevelopSchema, messages, { ...opts, maxTokens: 8000, temperature: 0.8 });
  opts.onResult?.(r.result);
  return r.data;
}

// ------------------------------------------------------------------------------------------------------ script

export interface ScriptResult { scenes: Array<{ sceneId: string; beats: Array<{ action: string; lines: Array<{ characterName: string; text: string; textAr?: string; delivery?: string }> }> }> }

export async function writeScript(_s: StudioState, p: Production, scenes: Scene[], cast: Character[], world: Location[], opts: EngineOptions = {}): Promise<ScriptResult> {
  const sceneCards = scenes.map((sc) => ({ sceneId: sc.id, number: sc.number, title: sc.title, location: world.find((l) => l.id === sc.locationId)?.name ?? '(unspecified)', timeOfDay: sc.timeOfDay, characters: sc.characterIds.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean), purpose: sc.purpose, emotionalObjective: sc.emotionalObjective, entryState: sc.entryState, exitState: sc.exitState, existingBeats: sc.beats.map((b) => ({ action: b.action, lines: b.lines.map((l) => `${cast.find((c) => c.id === l.characterId)?.name ?? '?'}: ${l.textAr || l.text}`) })) }));
  const perScene = Math.round(p.targetSeconds / Math.max(1, p.scenes.length));
  const user = `Write the script for these scenes of "${p.title}" (${p.kind === 'MUSIC_VIDEO' ? 'music video' : p.kind === 'SHORT' ? 'short film' : 'episode'}).
Logline: ${p.logline}
Synopsis: ${p.synopsis}
Cast (voices, personalities; use exact names as characterName): ${compact(cast.map(castSummary))}
Places: ${compact(world.map(locationSummary))}
Scenes to write (keep sceneId): ${compact(sceneCards)}
Each scene plays for about ${perScene} seconds, so 2–6 beats per scene; a beat is one piece of action (what we see, present tense, specific and filmable in a few seconds) followed by 0–4 short dialogue lines. Lines are short (spoken in under 6 seconds). ${p.kind === 'MUSIC_VIDEO' ? 'This is a music video: beats describe performance and imagery synced to the song; keep spoken lines to none or very few.' : ''}
If a scene already has beats, improve and complete them rather than discarding what is there.
Return JSON: { scenes: [{ sceneId, beats: [{ action, lines: [{ characterName, text, textAr?, delivery? }] }] }] }. "delivery" is a short performance note (e.g. "quietly, not looking up").${p.language === 'AR' ? ' For every line: "textAr" is the spoken Arabic line in the dialect; "text" is its English translation for the producer (English words only, never Arabic script).' : ''}`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(ScriptSchema, messages, { ...opts, maxTokens: 9000, temperature: 0.8 });
  opts.onResult?.(r.result);
  // Arabic that landed in the English slot moves to textAr; the English gloss is then asked for separately
  for (const sc of r.data.scenes) for (const b of sc.beats) for (const l of b.lines) if (ARABIC.test(l.text) && !l.textAr) l.textAr = l.text;
  const lines = r.data.scenes.flatMap((sc) => sc.beats.flatMap((b) => b.lines));
  // the gloss is a translation utility with its own fixed prompt: the screenwriter's instructions and skills stay out
  const glosses = await glossLines(lines.map((l) => ({ text: l.text, textAr: l.textAr })), p.dialect, { ...opts, agentId: undefined });
  for (const [i, l] of lines.entries()) if (glosses[i]) l.text = glosses[i];
  return r.data;
}

const ARABIC = /[؀-ۿ]/;
const GlossSchema = z.object({ lines: z.array(z.object({ n: z.number().int(), english: z.string() })) });

/** English glosses for Arabic lines whose "text" slot still holds Arabic (the model skipped the gloss). Returns one
 *  entry per input line: the English, or '' when the line needs none / the model gave none. Never throws: a failed
 *  gloss leaves the Arabic in place, which the producer can edit. */
export async function glossLines(lines: Array<{ text: string; textAr?: string }>, dialect: Dialect | undefined, opts: EngineOptions = {}): Promise<string[]> {
  const out = lines.map(() => '');
  const todo = lines.map((l, n) => ({ n, textAr: l.textAr || l.text })).filter((x) => ARABIC.test(lines[x.n].text));
  if (!todo.length) return out;
  const messages: LlmMessage[] = [
    { role: 'system', content: `You translate ${dialect ? DIALECT_LABELS[dialect].en : 'Arabic'} film dialogue into natural spoken English for subtitles. Keep each line short and faithful; English words only. Answer with ONE JSON object only.` },
    { role: 'user', content: `Translate every line. Return JSON: { lines: [{ n, english }] } with the same n values.\n${compact(todo)}` },
  ];
  try {
    const r = await llmJson(GlossSchema, messages, { ...opts, maxTokens: 3000, temperature: 0.2 });
    opts.onResult?.(r.result);
    for (const g of r.data.lines) { const english = g.english.trim(); if (g.n >= 0 && g.n < out.length && english && !ARABIC.test(english)) out[g.n] = english; }
  } catch { /* the Arabic stays in the English slot */ }
  return out;
}

// ------------------------------------------------------------------------------------------------------- shots

/** When a scene returns to a place the story has already shown, the planner is told what was established there:
 *  the place's own layout, what state it was last left in and which props were seen, so the return reuses the same
 *  world (the plates are reused by id regardless; this keeps the staging and props consistent too). Architecture may
 *  not change; light, weather, time of day and movable things may. */
export function establishedAt(p: Production, scene: Scene): string {
  if (!scene.locationId) return '';
  const earlier = p.shots.filter((sh) => { const sc = p.scenes.find((x) => x.id === sh.sceneId); return sc && sc.number < scene.number && sc.locationId === scene.locationId && sh.continuity; });
  if (!earlier.length) return '';
  const last = earlier[earlier.length - 1];
  const scenes = Array.from(new Set(earlier.map((sh) => p.scenes.find((x) => x.id === sh.sceneId)?.number))).filter(Boolean);
  const props = Array.from(new Set(earlier.flatMap((sh) => sh.continuity?.props.map((pr) => `${pr.name}${pr.position ? ` (${pr.position})` : ''}`) ?? []))).slice(0, 12);
  return `RETURNING LOCATION: this place already appeared in scene${scenes.length > 1 ? 's' : ''} ${scenes.join(', ')}. It is the same place with the same architecture, layout and fixed features; do not redesign it. Last seen: ${compact({ environment: last.continuity?.environment, camera: last.continuity?.camera })}. Props established here: ${props.join('; ') || 'none noted'}. Only light, weather, time of day and movable things may differ now, and the shots should say how.`;
}

export interface PlannedShot { purpose: string; action: string; framing: ShotPlanOut['shots'][number]['framing']; cameraMove: ShotPlanOut['shots'][number]['cameraMove']; durationSeconds: number; characterIds: string[]; dialogue: Array<{ id: string; characterId: string; text: string; textAr?: string }>; transition: ShotPlanOut['shots'][number]['transition']; continuity: Omit<ContinuityState, 'version'>; prompt: string }

/** A scene's planned shots before the timing fit, with the running-time budget and per-shot cap they are fitted to. */
export interface ShotPlanDraft { shots: PlannedShot[]; budget: number; maxShot: number }

/** The scene's shots, fitted to its budget (the Shot Planner's step in the worker does the fit separately). */
export async function planShots(s: StudioState, p: Production, scene: Scene, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string }, opts: EngineOptions = {}): Promise<PlannedShot[]> {
  const draft = await planShotsDraft(s, p, scene, cast, world, previous, opts);
  return fitDurations(draft.shots, draft.budget, draft.maxShot);
}

export async function planShotsDraft(_s: StudioState, p: Production, scene: Scene, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string } , opts: EngineOptions = {}): Promise<ShotPlanDraft> {
  const loc = world.find((l) => l.id === scene.locationId);
  const present = scene.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[];
  const lines = scene.beats.flatMap((b) => b.lines.map((l) => ({ characterName: cast.find((c) => c.id === l.characterId)?.name ?? '?', characterId: l.characterId, text: l.text, textAr: l.textAr, id: l.id })));
  const d = styleDirection(p.style);
  const budget = Math.max(4, Math.round(p.targetSeconds * (scene.beats.length || 1) / Math.max(1, p.scenes.reduce((a, sc) => a + (sc.beats.length || 1), 0))));
  const maxShot = 10;
  const user = `Plan the shots for Scene ${scene.number} "${scene.title}" of "${p.title}". Aspect ${p.aspect}. The scene should run about ${budget} seconds in ${Math.max(1, Math.round(budget / 6))}–${Math.max(2, Math.round(budget / 4))} shots of 3–${maxShot} seconds (each shot becomes one video generation of that length; a dialogue line needs about 0.4 s per word plus a beat).
Location: ${loc ? compact(locationSummary(loc)) : '(none set — describe a plausible place consistent with the story and keep it identical across shots)'}
Time of day: ${scene.timeOfDay}. Purpose: ${scene.purpose ?? ''}. Emotional objective: ${scene.emotionalObjective ?? ''}. Entry state: ${scene.entryState ?? previous.sceneExit ?? ''}. Exit state: ${scene.exitState ?? ''}.
Characters present (exact names; include their look so prompts can describe them): ${compact(present.map(castSummary))}
Beats and lines of the scene, in order: ${compact(scene.beats.map((b, i) => ({ beat: i + 1, action: b.action, lines: b.lines.map((l) => `${cast.find((c) => c.id === l.characterId)?.name ?? '?'}: ${l.textAr || l.text}`) })))}
Dialogue lines indexed (use the index numbers in dialogueLineIndexes; every line must be assigned to exactly one shot, in order): ${compact(lines.map((l, i) => ({ index: i, who: l.characterName, line: l.textAr || l.text })))}
${previous.shot ? `The previous shot (from the preceding scene or earlier in this scene) ended like this; keep continuity or mark a clear transition: ${compact({ action: previous.shot.action, continuity: previous.shot.continuity })}` : 'This is the first shot of the production.'}
${establishedAt(p, scene)}
Camera rules for this direction: ${d.camera}
For each shot write "prompt": a complete video-generation prompt in English, 60–160 words, in this order: the production direction look ("${d.visual.slice(0, 80)}…" is prepended automatically, do not repeat it), then the setting with its landmarks, then each visible character described by name-free appearance (never the character's name, always their look: age, build, hair, skin, wardrobe, distinguishing detail), what they do and feel, the camera framing and movement, the light. ${p.language === 'AR' ? 'If the shot has dialogue, add at the end: <d>[Arabic] الجملة </d> for each line in speaking order (the exact Arabic text).' : 'If the shot has dialogue, add at the end: <d>[English] the line </d> for each line in speaking order.'} Do not describe what to avoid.
Continuity for each shot: characters (wardrobe, pose, position in frame, screenDirection LEFT/RIGHT/TOWARD/AWAY/NEUTRAL, eyeline, emotion, holding), props (name, owner, state, position), environment (timeOfDay, weather, lighting, state), camera (lensIntent, angle), relationToPrevious: CONTINUATION (same action continues from the previous shot), CUT (new framing of the same moment), STORY_TRANSITION (place/time/state changes). Keep the 180° line: once a character faces LEFT they keep facing LEFT until a visible turn or a STORY_TRANSITION.
Return JSON: { shots: [{ purpose, action, framing, cameraMove, durationSeconds, characterNames[], dialogueLineIndexes[], transition, continuity:{characters[],props[],environment{},camera{},relationToPrevious,notes?}, prompt }] }.
Example of ONE complete shot (shape only; write your own content): {"purpose":"Establish the yard and her hesitation","action":"She stops at the gate, hand on the latch, then pushes it open.","framing":"WIDE","cameraMove":"STATIC","durationSeconds":5,"characterNames":["Layla"],"dialogueLineIndexes":[0],"transition":"CUT","continuity":{"characters":[{"characterName":"Layla","wardrobe":"green coat, red scarf","pose":"standing, hand on latch","position":"left third, facing right","screenDirection":"RIGHT","eyeline":"at the gate","emotion":"hesitant","holding":["canvas bag"]}],"props":[{"name":"canvas bag","ownerCharacterName":"Layla","state":"full","position":"on her shoulder"}],"environment":{"timeOfDay":"GOLDEN_HOUR","weather":"clear","lighting":"low warm sun from the right, long shadows","state":"gate closed, leaves on the path"},"camera":{"lensIntent":"35mm, eye level","angle":"slightly low"},"relationToPrevious":"CUT","notes":"Her scarf stays over the left shoulder in every shot."},"prompt":"A full prompt for this video clip in the production's visual language, describing the place, the people by appearance (never by name), the action, the camera and the light."}
Every continuity.characters entry must use the key "characterName" with the exact character name. relationToPrevious ∈ CONTINUATION (same moment continues), CUT (new angle in the same scene), STORY_TRANSITION (time or place changes). Use null for nothing; never omit required keys.
framing ∈ EXTREME_WIDE, WIDE, MEDIUM_WIDE, MEDIUM, MEDIUM_CLOSE_UP, CLOSE_UP, EXTREME_CLOSE_UP, INSERT, TWO_SHOT, OVER_THE_SHOULDER. cameraMove ∈ STATIC, PUSH_IN, PULL_BACK, PAN_LEFT, PAN_RIGHT, TILT_UP, TILT_DOWN, TRUCK_LEFT, TRUCK_RIGHT, HANDHELD, FOLLOW, ORBIT, CRANE_UP, CRANE_DOWN, RACK_FOCUS. transition ∈ CUT, EXTEND, DISSOLVE, FADE (use CUT unless the story asks otherwise; never use a dissolve to hide a continuity problem).`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}`, opts), { role: 'user', content: user }];
  // a scene's running time needs enough shots at ≤ maxShot seconds each; a one-shot scene is sent back for more
  const minShots = Math.max(1, Math.min(14, Math.ceil(budget / maxShot)));
  const schema = ShotPlanSchema.refine((d) => d.shots.length >= minShots, { message: `at least ${minShots} shots are needed to cover about ${budget} seconds at 3–${maxShot} seconds each; return more shots`, path: ['shots'] });
  const r = await llmJson(schema, messages, { ...opts, maxTokens: 9000, temperature: 0.6 });
  opts.onResult?.(r.result);
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
  const byName = (name: string) => { const n = norm(name); return cast.find((c) => norm(c.name) === n || c.nameAr?.trim() === name.trim()) ?? cast.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n) || (c.nameAr && name.includes(c.nameAr))); };
  const used = new Set<number>();
  const shots: PlannedShot[] = r.data.shots.map((sh) => {
    const dialogue = (sh.dialogueLineIndexes ?? []).filter((i) => i >= 0 && i < lines.length && !used.has(i)).map((i) => { used.add(i); const l = lines[i]; return { id: l.id || nid('line'), characterId: l.characterId, text: l.text, textAr: l.textAr }; });
    // who is in frame: the names given, else the continuity entries, else whoever speaks in the shot
    const named = sh.characterNames.map((n) => byName(n)?.id).filter((x): x is string => Boolean(x));
    const fromContinuity = sh.continuity.characters.map((c) => byName(c.characterName)?.id).filter((x): x is string => Boolean(x));
    const characterIds = Array.from(new Set([...named, ...(named.length ? [] : fromContinuity), ...dialogue.map((d) => d.characterId)]));
    const cont = sh.continuity;
    const continuity: Omit<ContinuityState, 'version'> = {
      characters: cont.characters.map((c) => ({ characterId: byName(c.characterName)?.id ?? c.characterName, wardrobe: c.wardrobe, pose: c.pose, position: c.position, screenDirection: c.screenDirection, eyeline: c.eyeline, emotion: c.emotion, holding: c.holding })),
      props: cont.props.map((pr) => ({ name: pr.name, ownerCharacterId: pr.ownerCharacterName ? byName(pr.ownerCharacterName)?.id : undefined, state: pr.state, position: pr.position })),
      environment: { locationId: scene.locationId, timeOfDay: cont.environment.timeOfDay ?? scene.timeOfDay, weather: cont.environment.weather, lighting: cont.environment.lighting, state: cont.environment.state },
      camera: { framing: sh.framing, move: sh.cameraMove, lensIntent: cont.camera.lensIntent, angle: cont.camera.angle },
      relationToPrevious: cont.relationToPrevious, notes: cont.notes,
    };
    return { purpose: sh.purpose, action: sh.action, framing: sh.framing, cameraMove: sh.cameraMove, durationSeconds: Math.min(maxShot, Math.max(3, Math.round(sh.durationSeconds))), characterIds, dialogue, transition: sh.transition, continuity, prompt: sh.prompt?.trim() ?? '' };
  });
  if (shots.length === 0) throw new StudioError('PROVIDER', 'The story engine returned no shots.');
  // lines the model forgot: spread in script order over the shots, each line going to the next shot (from where the
  // previous forgotten line went) that holds its speaker — or simply the next shot — so dialogue is not piled on one
  const forgotten = lines.map((l, i) => ({ l, i })).filter(({ i }) => !used.has(i));
  if (forgotten.length) {
    const unassigned = shots.every((sh) => sh.dialogue.length === 0);
    let cursor = 0;
    for (const [k, { l }] of forgotten.entries()) {
      const target = unassigned ? Math.min(shots.length - 1, Math.floor((k * shots.length) / forgotten.length)) : (() => { for (let j = 0; j < shots.length; j++) { const idx = (cursor + j) % shots.length; if (shots[idx].characterIds.includes(l.characterId)) return idx; } return Math.min(shots.length - 1, cursor); })();
      cursor = target;
      const sh = shots[target];
      sh.dialogue.push({ id: l.id || nid('line'), characterId: l.characterId, text: l.text, textAr: l.textAr });
      if (!sh.characterIds.includes(l.characterId)) sh.characterIds.push(l.characterId);
    }
  }
  return { shots, budget, maxShot };
}

/** The model plans shots near the short end of the range, so a scene comes out well under its running time.
 *  Stretch every shot by the same factor (rounded to whole seconds, never above maxShot) until the scene fills at
 *  least 90 % of its budget; a plan that already fits is left alone. Longer shots mean longer generations, not more. */
export function fitDurations<T extends { durationSeconds: number }>(shots: T[], budget: number, maxShot = 10, minShot = 3): T[] {
  const sum = shots.reduce((a, s) => a + s.durationSeconds, 0);
  if (!shots.length || sum <= 0 || sum >= budget * 0.9) return shots;
  const factor = budget / sum;
  let out = shots.map((s) => ({ ...s, durationSeconds: Math.min(maxShot, Math.max(minShot, Math.round(s.durationSeconds * factor))) }));
  // rounding and the cap may leave a gap: hand spare seconds to the shots with room, one at a time, in order
  let gap = budget - out.reduce((a, s) => a + s.durationSeconds, 0);
  for (let i = 0; gap > 0 && out.some((s) => s.durationSeconds < maxShot); i = (i + 1) % out.length) if (out[i].durationSeconds < maxShot) { out[i] = { ...out[i], durationSeconds: out[i].durationSeconds + 1 }; gap--; }
  return out;
}

// ------------------------------------------------------------------------------------------ performance plan

export async function planPerformance(p: Production, cast: Character[], opts: EngineOptions = {}): Promise<Array<{ sectionId: string; mode: 'SOLO' | 'DUET' | 'ALTERNATING' | 'ENSEMBLE' | 'LISTENER' | 'INSTRUMENTAL'; singerIds: string[]; lines?: Array<{ singerId: string; text: string }> }>> {
  if (!p.song) throw new StudioError('INVALID', 'This music video has no song.');
  const singers = cast.filter((c) => p.song!.singerIds.includes(c.id));
  // a project fresh from the wizard lists every performer on every section: that is a placeholder, not a decision
  const everyoneEverywhere = singers.length > 1 && p.song.sections.every((x) => singers.every((c) => x.singerIds.includes(c.id)));
  const user = `Assign the singing in "${p.song.title}" (treatment ${p.concept ?? 'PERFORMANCE'}). Performers (exact names): ${compact(singers.map((c) => ({ name: c.name, voice: `${c.voice.pitch} ${c.voice.timbre}`, role: c.role })))}.
Story: ${p.logline} ${p.synopsis}
Sections: ${compact(p.song.sections.map((x) => ({ sectionId: x.id, kind: x.kind, from: x.from, to: x.to, lyrics: x.textAr || x.text, ...(everyoneEverywhere ? {} : { currentSingers: x.singerIds.map((id) => cast.find((c) => c.id === id)?.name) }) })))}
Rules: instrumental sections are INSTRUMENTAL with no singers. A section sung by one performer is SOLO. Two performers singing together is DUET; taking turns line by line is ALTERNATING (then give "lines": [{singerName, text}] splitting the lyrics in order); three or more together is ENSEMBLE. ${everyoneEverywhere ? 'Decide who sings each section from the lyrics and the story (a lead usually carries the verses; others join where the story brings them in); do not give every section to everyone unless the song is truly sung together throughout.' : 'Keep current singer assignments unless they are clearly wrong.'} Only a performer assigned to a section sings in it; nobody else mouths the words.
Return JSON: { sections: [{ sectionId, mode, singerNames[], lines?[] }] }.`;
  const messages: LlmMessage[] = [system(STUDIO_RULES, opts), { role: 'user', content: user }];
  const r = await llmJson(PerformancePlanSchema, messages, { ...opts, maxTokens: 4000, temperature: 0.3 });
  opts.onResult?.(r.result);
  const byName = (n: string) => singers.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())?.id;
  return r.data.sections.map((sec) => ({ sectionId: sec.sectionId, mode: sec.mode, singerIds: sec.singerNames.map(byName).filter((x): x is string => Boolean(x)), lines: sec.lines?.map((l) => ({ singerId: byName(l.singerName) ?? '', text: l.text })).filter((l) => l.singerId) }));
}

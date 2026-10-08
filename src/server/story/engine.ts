import { z } from 'zod';
import { BOUNDARY_RELATION, RELATION_BOUNDARY, type Character, type ContinuityState, type IdeaPreferences, type IdeaProposal, type Location, type Production, type Scene, type ShotBoundary, type ShotStaging, type StudioState, type WorldBible } from '@/domain/types';
import { closeFramingFor, limitCuts, reconcileCast, scrubSpeech, timeBeats } from './beats';
import { worldForPlanner, worldForStory } from '@/domain/world';
import type { Dialect, Language, Style } from '@/domain/vocabulary';
import { DIALECT_LABELS, DURATIONS } from '@/domain/vocabulary';
import { nid } from '@/domain/ids';
import { StudioError } from '@/domain/errors';
import { primaryImageOf } from '@/domain/identity';
import { editorialTransition } from '@/domain/editorial';
import { isTruncatedAnswer, json as llmJson, outputRoom, type LlmMessage, type LlmOptions, type LlmResult } from '../providers/llm';
import { styleDirection } from './style';
import { DevelopSchema, PerformancePlanSchema, ProposalSchema, ScriptSchema, ShotPlanSchema, type ShotPlanOut } from './schemas';
import { CharacterDesignFromReferenceSchema, designSex, voicePace, voicePitch, LOOK_FIELDS, REFERENCE_LOOK_BRIEF, isReferenceLookBrief, type LookField } from './schemas';
import { agentPrompt } from '../org/skills';
import type { PictureFacts } from '../workflows/canonical-image';
import { intentDirective } from './development/intent';
import { TIMELINE_RULES } from './development/timeline';
import { keepBriefLook } from './brief-look';
import { log } from '../log';

/** The accepted Auto Idea's development intent (audience, tone, hook, ending) as fixed instructions for every later
 *  story call of that production — developing, scripting and planning never rewrite what the producer accepted. */
const intentBlock = (p: Pick<Production, 'brief'>): string => { const d = intentDirective(p.brief?.development); return d ? `\n\n${d}` : ''; };

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
  return { id: c.id, name: c.name, nameAr: c.nameAr, role: c.role, sex: c.sex, ageYears: c.ageYears, bornAbout: new Date().getUTCFullYear() - c.ageYears, species: c.species, look: [c.build, c.face, c.hair, c.eyes && `${c.eyes} eyes`, c.skin && `${c.skin} skin`].filter(Boolean).join('; '), wardrobe: c.wardrobe, distinguishing: c.distinguishing, personality: c.personality, language: c.language, dialect: c.dialect, voice: `${c.voice.pitch} ${c.voice.pace} ${c.voice.timbre}`.trim(), hasAppearance: Boolean(primaryImageOf(c)) };
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

/** The local design's shape. Sex and the voice's pitch and pace are read from the model's words (`designSex`,
 *  `voicePitch`, `voicePace`): the strict enums here cost a repair round on every local design (MODEL-EVAL-2026-10 §3). */
/*  The caps are the character record's own (src/domain/commands.ts ProfileBase: 400 per look field, a role of 200, a
 *  timbre of 200): a cap tighter than what the studio stores only fails good answers — Qwen3.8 writes 130–250
 *  character look fields and cannot count characters, so a 120 cap cost every repair round and failed whole jobs
 *  (Phase 1, 2026-10-07: "skin/eyes too big" three times running). The prompt asks for the length it should aim at. */
export const CharacterDesignSchema = z.object({
  name: z.string().min(1).max(80), nameAr: z.string().max(80).optional(), role: z.string().min(1).max(200),
  sex: designSex, ageYears: z.number().int().min(1).max(120), species: z.string().max(60).optional(),
  build: z.string().min(2).max(400), face: z.string().min(2).max(400), hair: z.string().min(2).max(400), skin: z.string().min(2).max(400), eyes: z.string().min(2).max(400),
  distinguishing: z.array(z.string().max(120)).max(6), wardrobe: z.string().min(2).max(400), personality: z.string().min(2).max(400),
  voice: z.object({ pitch: voicePitch, pace: voicePace, timbre: z.string().max(200), notes: z.string().max(400).optional() }).optional(),
});
export type CharacterDesign = z.infer<typeof CharacterDesignSchema>;
type ReferenceDesign = z.infer<typeof CharacterDesignFromReferenceSchema>;

/** A character from a one-line brief: every appearance field filled so the portrait and the voice can be made.
 *
 *  REFERENCE mode (`lookFrom: 'REFERENCE'`, or the brief carries REFERENCE_LOOK_BRIEF — the CREATE_CHARACTER
 *  orchestrator's marker, the only channel through the DESIGN_CHARACTER job): the look is the producer's picture and
 *  the story model is text-only, so it designs who the character is (role, personality, sex/age, the voice
 *  description) and none of the look. The chain reads the picture first (D15) and adds what the vision model saw
 *  (REFERENCE_SEEN_PREFIX: apparent age and sex, what is visibly worn): the design takes sex and age from it and never
 *  contradicts it; without it, from the producer's words or the name. The look fields come back empty — empty means
 *  "as in the reference picture" — so a merge keeps whatever the producer wrote and invents nothing else; the
 *  canonical image is drawn from the picture (images.ts), and the profile shows those fields as "from the reference
 *  picture" until the producer writes them. */
export async function designCharacter(s: StudioState, req: { brief: string; name?: string; style: Style; language: Language; dialect?: Dialect; world?: string; lookFrom?: 'REFERENCE' }, opts: EngineOptions = {}): Promise<CharacterDesign> {
  if (req.lookFrom === 'REFERENCE' || isReferenceLookBrief(req.brief)) return designCharacterFromReference(req, opts);
  const existing = s.characters.filter((c) => c.style === req.style).slice(0, 20).map((c) => ({ name: c.name, role: c.role, look: castSummary(c).look }));
  const user = `Design ONE new original character for ${req.style.toLowerCase()} production in ${req.language === 'AR' ? `Arabic${req.dialect ? ` (${DIALECT_LABELS[req.dialect].en})` : ''}` : 'English'}.
Brief: """${req.brief}"""${req.name ? `\nName to use: ${req.name}` : ''}${req.world ? `\nThe world they belong to: ${req.world}` : ''}
Existing characters (do not duplicate a look or a name): ${compact(existing)}
Return JSON: { name, nameAr?, role, sex, ageYears, species?, build, face, hair, skin, eyes, distinguishing[], wardrobe, personality, voice: { pitch, pace, timbre, notes? } }. Each look field (build, face, hair, skin, eyes, wardrobe) is ONE short sentence about that part only (under 200 characters; never more than 400); each distinguishing detail under 120 characters. Describe the look concretely (a picture is drawn from these words); one distinguishing detail that survives every shot. State facial hair exactly ("a grey moustache only, clean-shaven chin", "a full beard", "clean-shaven") and give a culturally specific garment its cut and length ("an ankle-length grey dishdasha"). The look fields are the PHYSICAL look only — never an expression, a smile or a mood ("a warm, approachable expression", "eyes crinkling when he laughs" belong to personality): the identity picture is drawn with a neutral face, and each shot gives the face its own expression.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(req.style)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(CharacterDesignSchema, messages, { ...opts, maxTokens: 2500, temperature: 0.9 });
  opts.onResult?.(r.result);
  // the look the brief names is kept (acceptance 2026-10-05, item 11: the "grey moustache" was dropped): a feature no
  // look field mentions is carried over in the producer's own words, first among the distinguishing details
  const kept = keepBriefLook(req.brief, r.data);
  if (kept.carried.length || kept.moved.length) log.info({ carried: kept.carried, movedOutOfWardrobe: kept.moved, name: kept.design.name }, 'character design: look features kept in the look fields');
  return kept.design;
}

/** The orchestrator's second line in a REFERENCE design brief (D15): what the vision model saw in the producer's
 *  picture (apparent age, sex, what is visibly worn), as JSON on one line, read by `designCharacterFromReference`. */
export const REFERENCE_SEEN_PREFIX = 'SEEN IN THE REFERENCE PICTURE (vision model): ';
export const referenceSeenBrief = (f: PictureFacts): string => `${REFERENCE_SEEN_PREFIX}${JSON.stringify(f)}`;

/** The facts line out of a brief (malformed JSON is ignored), and the producer's words without it. */
export function parseReferenceSeen(brief: string): { facts?: PictureFacts; rest: string } {
  let facts: PictureFacts | undefined;
  const rest = brief.split('\n').filter((line) => {
    if (!line.startsWith(REFERENCE_SEEN_PREFIX)) return true;
    try {
      const v = JSON.parse(line.slice(REFERENCE_SEEN_PREFIX.length)) as Record<string, unknown>;
      const age = typeof v.apparentAge === 'string' ? v.apparentAge.trim().slice(0, 20) : '';
      facts = { ...(age ? { apparentAge: age } : {}), ...(v.sex === 'male' || v.sex === 'female' ? { sex: v.sex } : {}), visible: Array.isArray(v.visible) ? v.visible.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 12) : [] };
    } catch { /* not ours to repair: no facts */ }
    return false;
  });
  return { facts, rest: rest.join('\n').trim() };
}

/** "60-70" → [60, 70]; "about 45" → [40, 50]; the age words a description uses → a range; otherwise undefined. */
export function ageBounds(apparentAge: string | undefined): [number, number] | undefined {
  const a = (apparentAge ?? '').toLowerCase();
  const range = /(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})/.exec(a);
  if (range) { const lo = Number(range[1]), hi = Number(range[2]); return lo <= hi ? [lo, hi] : [hi, lo]; }
  const one = /(\d{1,3})/.exec(a);
  if (one) { const n = Number(one[1]); return [Math.max(1, n - 5), n + 5]; }
  if (/elderly|\bold\b|senior/.test(a)) return [65, 90];
  if (/middle-aged/.test(a)) return [40, 60];
  if (/teen|adolescent/.test(a)) return [13, 19];
  if (/child|kid/.test(a)) return [5, 12];
  return undefined;
}

const YOUNG_WORDS = ['young', 'younger', 'youthful', 'youngster', 'teen', 'teens', 'teenage', 'teenaged', 'teenager', 'adolescent', 'kid', 'child', 'childish', 'boy', 'girl', 'schoolboy', 'schoolgirl'];
const OLD_WORDS = ['elderly', 'aged', 'ageing', 'aging', 'senior', 'retired', 'retiree', 'grandfather', 'grandmother', 'grandpa', 'grandma', 'grandparent', 'middle-aged', 'widow', 'widower', 'veteran'];
const FEMALE_WORDS = ['woman', 'women', 'girl', 'lady', 'she', 'her', 'hers', 'herself', 'mother', 'grandmother', 'wife', 'daughter', 'sister', 'aunt', 'niece', 'queen', 'princess', 'actress', 'waitress', 'heroine', 'matriarch', 'businesswoman', 'seamstress', 'feminine'];
const MALE_WORDS = ['man', 'men', 'boy', 'gentleman', 'he', 'him', 'his', 'himself', 'father', 'grandfather', 'husband', 'son', 'brother', 'uncle', 'nephew', 'king', 'prince', 'actor', 'waiter', 'hero', 'patriarch', 'businessman', 'masculine'];
/** The words that would contradict what the picture shows (age and sex), minus the producer's own words. */
function contradictingWords(f: PictureFacts, producerWords: string): string[] {
  const bounds = ageBounds(f.apparentAge);
  const words = [
    ...(bounds && bounds[0] >= 40 ? YOUNG_WORDS : []),
    ...(bounds && bounds[1] <= 25 ? OLD_WORDS : []),
    ...(f.sex === 'male' ? FEMALE_WORDS : f.sex === 'female' ? MALE_WORDS : []),
  ];
  const own = new Set(producerWords.toLowerCase().match(/[a-z-]+/g) ?? []);
  return [...new Set(words)].filter((w) => !own.has(w));
}
const wordsIn = (text: string, words: string[]) => (text.toLowerCase().match(/[a-z-]+/g) ?? []).filter((w) => words.includes(w));
const ADJECTIVES = new Set(['young', 'younger', 'youthful', 'teenage', 'teenaged', 'elderly', 'aged', 'ageing', 'aging', 'middle-aged', 'feminine', 'masculine']);

/** Never contradict the picture (D15): the sex is the picture's, the age is inside its apparent range, and a role,
 *  personality or voice phrase the model wrote with a contradicting word is repaired — an age or sex adjective is
 *  dropped ("A young, curious explorer" → "A curious explorer"); a role that still contradicts it is left for the
 *  producer, a personality sentence that does is dropped. The producer's own words are never touched. Pure. */
export function reconcileWithPicture(d: ReferenceDesign, f: PictureFacts, producerWords = ''): { design: ReferenceDesign; changed: string[] } {
  const changed: string[] = [];
  const out: ReferenceDesign = { ...d };
  if (f.sex) { const sex = f.sex === 'male' ? 'MALE' : 'FEMALE'; if (out.sex !== sex) { changed.push(`sex ${out.sex} → ${sex}`); out.sex = sex; } }
  const bounds = ageBounds(f.apparentAge);
  if (bounds && (out.ageYears < bounds[0] || out.ageYears > bounds[1])) { const age = Math.round((bounds[0] + bounds[1]) / 2); changed.push(`age ${out.ageYears} → ${age}`); out.ageYears = age; }
  const bad = contradictingWords(f, producerWords);
  if (!bad.length) return { design: out, changed };
  const dropAdjectives = (s: string) => s.replace(/\b([A-Za-z-]+)\b(\s*,)?\s*/g, (m, w: string) => (ADJECTIVES.has(w.toLowerCase()) && bad.includes(w.toLowerCase()) ? '' : m)).replace(/\s{2,}/g, ' ').trim();
  // an article before a dropped adjective is fixed only where one was dropped ("an elderly man" → "a man")
  const repair = (s: string) => { const d2 = dropAdjectives(s); return d2 === s ? s : d2.replace(/\b(A|a)n?\s+(\w)/g, (_whole, a: string, ch: string) => `${a}${/[aeiou]/i.test(ch) ? 'n' : ''} ${ch}`); };
  if (wordsIn(out.role, bad).length) {
    const role = repair(out.role);
    const next = wordsIn(role, bad).length || !role ? 'To be decided by the producer' : role.charAt(0).toUpperCase() + role.slice(1);
    changed.push(`role "${out.role}" → "${next}"`); out.role = next;
  }
  if (wordsIn(out.personality, bad).length) {
    const kept = out.personality.split(/(?<=[.;!?])\s+/).map(repair).filter((s) => s && !wordsIn(s, bad).length).join(' ');
    changed.push('personality: contradicting words removed'); out.personality = kept;
  }
  if (out.voice) {
    const v = { ...out.voice, timbre: repair(out.voice.timbre), ...(out.voice.notes ? { notes: repair(out.voice.notes) } : {}) };
    if (v.timbre !== out.voice.timbre || v.notes !== out.voice.notes) { changed.push('voice: contradicting words removed'); out.voice = v; }
  }
  return { design: out, changed };
}

/** The REFERENCE-mode design: the non-visual half of the sheet, from words only — and, when the creation chain could
 *  read the picture first (D15), from what the vision model saw: the apparent age and sex and what is visibly worn,
 *  which the design must never contradict (`reconcileWithPicture` holds it to them). */
async function designCharacterFromReference(req: { brief: string; name?: string; style: Style; language: Language; dialect?: Dialect; world?: string }, opts: EngineOptions): Promise<CharacterDesign> {
  const { facts, rest } = parseReferenceSeen(req.brief.split(REFERENCE_LOOK_BRIEF).join(''));
  const brief = rest.trim();
  const bounds = ageBounds(facts?.apparentAge);
  const roleGiven = /\brole:\s*\S/i.test(brief);
  const seen = facts && (facts.apparentAge || facts.sex || facts.visible.length)
    ? `\nA vision model looked at the picture for you. It saw: ${[facts.apparentAge ? `apparent age ${facts.apparentAge}` : '', facts.sex ? `a ${facts.sex === 'male' ? 'man' : 'woman'}` : '', facts.visible.length ? `visible: ${facts.visible.join('; ')}` : ''].filter(Boolean).join('; ')}.
This is what the producer's picture shows: never contradict it.${facts.sex ? ` The character is ${facts.sex === 'male' ? 'MALE' : 'FEMALE'}.` : ''}${bounds ? ` Their age is between ${bounds[0]} and ${bounds[1]}.` : ''} The role, personality and voice must suit a person who looks like this — no "young" for someone who looks sixty, no role that needs another age, sex or body, nothing the visible clothing rules out.${roleGiven ? '' : ' No role was given: choose a plain, everyday role that fits this person and the world (what they wear is a clue); invent no adventure the picture does not support.'}`
    : '';
  const user = `Design ONE new original character for ${req.style.toLowerCase()} production in ${req.language === 'AR' ? `Arabic${req.dialect ? ` (${DIALECT_LABELS[req.dialect].en})` : ''}` : 'English'}.
Their LOOK is a reference picture the producer uploaded. You cannot see that picture. Do not describe or guess the face, hair, skin, eyes, build, wardrobe, accessories or any visible mark: the picture is the look and the portrait is drawn from it.${seen}
Design only who they are: their role, their personality (temperament, habits, how they speak), sex and age (${seen ? 'as the vision model saw them' : "take them from the producer's words or the name; when nothing says, choose what fits the role"}), and the voice description.
${brief ? `The producer's words: """${brief}"""` : 'The producer gave no words beyond the picture.'}${req.name ? `\nName to use: ${req.name}` : ''}${req.world ? `\nThe world they belong to: ${req.world}` : ''}
Return JSON: { name, nameAr?, role, sex, ageYears, species?, personality, voice: { pitch, pace, timbre, notes? } }. No look fields.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(req.style)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(CharacterDesignFromReferenceSchema, messages, { ...opts, maxTokens: 1500, temperature: 0.8 });
  opts.onResult?.(r.result);
  const held = facts ? reconcileWithPicture(r.data, facts, brief).design : r.data;
  // the look is the picture's: nothing is invented for it (empty = "as in the reference picture")
  const look = Object.fromEntries(LOOK_FIELDS.map((k) => [k, ''])) as Record<LookField, string>;
  return { ...held, ...look, distinguishing: [] };
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

/** From a brief (and whatever cast/places are already attached) to a developed story with a scene breakdown. An
 *  episode develops inside its show's World Bible (`bible`: rules, relationships, timeline, open storylines, places). */
export async function developStory(s: StudioState, p: Production, cast: Character[], world: Location[], opts: EngineOptions = {}, bible?: WorldBible): Promise<DevelopResult> {
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
${show ? `Part of the show "${show.title}" (${show.logline}). Show synopsis: ${show.synopsis ?? ''}. ${bible ? `World Bible (respect every fact; reuse its places as they are): ${compact(worldForStory(bible))}` : `Bible: ${compact(show.bible ?? {})}`}.
This is an EPISODE of that show: its regulars (${s.characters.filter((c) => show.castIds.includes(c.id)).map((c) => c.name).join(', ') || 'see the cast below'}) carry every episode; the leads named in the brief or synopsis must appear. Characters from outside the show are guests: at most two, only when this episode's story needs them, never replacing a regular.` : ''}
Cast already attached (use them; refer to them by exact name): ${compact(cast.map(castSummary))}
Places already attached (use them; refer to them by exact name): ${compact(world.map(locationSummary))}
${libraryChars.length ? `Other studio characters you MAY bring in by exact name if they fit: ${compact(libraryChars)}` : ''}
${libraryLocs.length ? `Other studio places you MAY use by exact name: ${compact(libraryLocs)}` : ''}
If the story needs people or places that do not exist yet, create them in newCharacters / newLocations with full designs (then use their names in scenes). Keep new characters to the minimum the story needs.
${p.kind === 'MUSIC_VIDEO' && p.song ? `The song (${p.song.title}, ${p.song.durationSeconds}s): caption "${p.song.caption}". Sections: ${compact(p.song.sections.map((x) => ({ kind: x.kind, from: x.from, to: x.to, text: x.textAr || x.text })))}. Scenes should map onto song sections.` : ''}
Return JSON: { logline, synopsis (3–6 paragraphs, present tense), genre, mood, titleAr?, newCharacters: [{name, role, sex, design:{build, face, hair, skin, eyes, distinguishing[], wardrobe, personality, ageYears, nameAr?, canon:{heightCm?, accessories[]?, visualRestrictions[]?, agePresentation?, speech?}}}], newLocations: [{name, design:{description, kind, landmarks[], props[], lighting[], nameAr?, layout:{geography?, architecture?, materials[]?, cameraZones[]?, entrances[]?, spatial?, light:{key (where the main light comes from and its quality), practicals[] (lamps, signs, windows that light the set), palette[] (3–5 colours), byTime:{<TIME_OF_DAY>: the light at that time, for each time in lighting[]}}}}}], scenes: [{title, locationName, timeOfDay, characterNames[], purpose, emotionalObjective, entryState, exitState, targetSeconds}] }.
timeOfDay must be one of DAWN, MORNING, MIDDAY, AFTERNOON, GOLDEN_HOUR, DUSK, NIGHT. locationName must match an attached, library or new location exactly; characterNames likewise.`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}\n\n${TIMELINE_RULES}${intentBlock(p)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(DevelopSchema, messages, { ...opts, maxTokens: ANSWER_TOKENS.develop, temperature: 0.8 });
  opts.onResult?.(r.result);
  return r.data;
}

// ------------------------------------------------------------------------------------------------------ script

/** The answer budgets of the long story calls (tokens): the tool call around each is bounded from them at the
 *  planner's measured speed (src/server/jobs/deadlines.ts llmCallMs). A script batch also asks for its glosses. */
export const ANSWER_TOKENS = { develop: 8000, script: 9000, gloss: 3000 } as const;

/** HOW MANY BEATS A SCENE NEEDS (pure, tested): one beat is one new piece of action, about 5–8 seconds on screen, so
 *  a scene's running time asks for about one beat per 7 seconds. A flat "2–6 beats" wrote 3 beats for a 45-second scene
 *  and the shot planner had to fill 45 seconds from them: five near-identical "he prepares to act" shots (2026-10-07,
 *  ep-3fef2fe042 scene 1). */
export function beatsForSeconds(seconds: number): { min: number; max: number } {
  const n = Math.max(2, Math.min(12, Math.round(seconds / 7)));
  return { min: Math.max(2, n - 1), max: Math.min(14, n + 1) };
}

export interface ScriptFacts { events?: string[]; knowledge?: Array<{ characterName: string; text: string }>; changes?: Array<{ subject: string; key?: string; text: string }> }
export interface ScriptResult { scenes: Array<{ sceneId: string; beats: Array<{ action: string; lines: Array<{ characterName: string; text: string; textAr?: string; delivery?: string }> }>; facts?: ScriptFacts }> }

/** What the script writer is told from the World Bible: the world's rules, the relationships, the latest timeline
 *  facts and the open storylines (the same block story development reads, from the production's pinned revision). */
export function scriptWorld(bible: WorldBible | undefined): string {
  if (!bible) return '';
  const w = worldForStory(bible);
  return `World Bible (respect every fact; nobody contradicts it): ${compact({ rules: w.rules, relationships: w.relationships, timeline: w.timeline, openStorylines: w.openStorylines, styleNotes: w.styleNotes, stillTrue: w.stillTrue, knownBy: w.knownBy })}`;
}

export async function writeScript(_s: StudioState, p: Production, scenes: Scene[], cast: Character[], world: Location[], opts: EngineOptions = {}, bible?: WorldBible): Promise<ScriptResult> {
  const sceneCards = scenes.map((sc) => ({ sceneId: sc.id, number: sc.number, title: sc.title, location: world.find((l) => l.id === sc.locationId)?.name ?? '(unspecified)', timeOfDay: sc.timeOfDay, characters: sc.characterIds.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean), purpose: sc.purpose, emotionalObjective: sc.emotionalObjective, entryState: sc.entryState, exitState: sc.exitState, existingBeats: sc.beats.map((b) => ({ action: b.action, lines: b.lines.map((l) => `${cast.find((c) => c.id === l.characterId)?.name ?? '?'}: ${l.textAr || l.text}`) })) }));
  const perScene = Math.round(p.targetSeconds / Math.max(1, p.scenes.length));
  const beats = beatsForSeconds(perScene);
  const user = `Write the script for these scenes of "${p.title}" (${p.kind === 'MUSIC_VIDEO' ? 'music video' : p.kind === 'SHORT' ? 'short film' : 'episode'}).
Logline: ${p.logline}
Synopsis: ${p.synopsis}
${scriptWorld(bible)}
Cast (voices, personalities; use exact names as characterName): ${compact(cast.map(castSummary))}
Places: ${compact(world.map(locationSummary))}
Scenes to write (keep sceneId): ${compact(sceneCards)}
Each scene plays for about ${perScene} seconds, so about ${beats.min}–${beats.max} beats per scene: a beat is one NEW piece of action (what we see, present tense, specific and filmable in 5–8 seconds — something happens, is revealed or is answered; never the same action again in other words) followed by 0–4 short dialogue lines. Lines are short (spoken in under 6 seconds). ${p.kind === 'MUSIC_VIDEO' ? 'This is a music video: beats describe performance and imagery synced to the song; keep spoken lines to none or very few.' : ''}
If a scene already has beats, improve and complete them rather than discarding what is there.
For each scene also record what it establishes for the rest of the series, in "facts" (English): events (1–3 things that happened and matter later), knowledge (who now knows something they did not before: characterName + what they know), changes (lasting physical changes later scenes must show: subject is a character's exact name, a prop or the place's exact name; key is the aspect that a later change would replace, e.g. "left arm", "shop window"; text is the new state). Only real story facts; empty arrays when the scene establishes none.
Return JSON: { scenes: [{ sceneId, beats: [{ action, lines: [{ characterName, text, textAr?, delivery? }] }], facts: { events: [], knowledge: [{ characterName, text }], changes: [{ subject, key, text }] } }] }. "delivery" is a short performance note (e.g. "quietly, not looking up").${p.language === 'AR' ? ' For every line: "textAr" is the spoken Arabic line in the dialect; "text" is its English translation for the producer (English words only, never Arabic script).' : ''}`;
  const messages: LlmMessage[] = [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}\n\n${TIMELINE_RULES}${intentBlock(p)}`, opts), { role: 'user', content: user }];
  const r = await llmJson(ScriptSchema, messages, { ...opts, maxTokens: ANSWER_TOKENS.script, temperature: 0.8 });
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
    const r = await llmJson(GlossSchema, messages, { ...opts, maxTokens: ANSWER_TOKENS.gloss, temperature: 0.2 });
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

export interface PlannedShot { purpose: string; action: string; framing: ShotPlanOut['shots'][number]['framing']; cameraMove: ShotPlanOut['shots'][number]['cameraMove']; durationSeconds: number; characterIds: string[]; dialogue: Array<{ id: string; characterId: string; text: string; textAr?: string }>; transition: ShotPlanOut['shots'][number]['transition']; continuity: Omit<ContinuityState, 'version'>; prompt: string; /** how the shot joins the one before it (src/domain/types.ts ShotBoundary) */ boundary?: ShotBoundary; /** the staging inside the shot (src/domain/types.ts ShotStaging) */ staging?: ShotStaging; /** what the shaping changed, for the planner's record */ notes?: string[] }

/** A scene's planned shots before the timing fit, with the running-time budget and per-shot cap they are fitted to. */
export interface ShotPlanDraft { shots: PlannedShot[]; budget: number; maxShot: number }

/** The planner's world block for a scene: the World Bible's (rules, a returning place with its established frames and
 *  last state, props and wardrobe last seen) and, when the bible has no return to say, the production's own earlier
 *  shots at the place (`establishedAt`). */
export function planningWorld(p: Production, scene: Scene, bible?: WorldBible): string {
  const fromBible = bible ? worldForPlanner(bible, p, scene) : '';
  return [fromBible, /RETURNING LOCATION/.test(fromBible) ? '' : establishedAt(p, scene)].filter(Boolean).join('\n');
}

/** The running time a scene (or a run of its beats) is planned to: the production's target shared by written beats. */
export function sceneBudget(p: Pick<Production, 'targetSeconds' | 'scenes'>, beats: number): number {
  return Math.max(4, Math.round(p.targetSeconds * (beats || 1) / Math.max(1, p.scenes.reduce((a, sc) => a + (sc.beats.length || 1), 0))));
}

/** What one shot of a plan costs in output tokens, at most: measured on Gemma 4 31B, the English plan 5 shots in
 *  ≈ 5,000 tokens and the Arabic plan 6 shots in 6,330 (1,055 per shot) — and 13 shots cut off at 9,000
 *  (MODEL-EVAL-2026-10 §3, `ar-plan-run2`). 1,100 per shot plus the object around them. */
export const PLAN_TOKENS_PER_SHOT = 1250; // + start/end pose, motion, side, constraints per person (2026-10-06): an estimate on top of the measured 1,100, to re-measure on the planner A/B
const PLAN_TOKENS_FIXED = 400;
/** The output a plan of `budget` seconds needs when the model takes the most shots it is offered (budget / 4). */
export const planOutputTokens = (budget: number) => PLAN_TOKENS_FIXED + PLAN_TOKENS_PER_SHOT * Math.max(2, Math.round(budget / 4));
/** How deep a scene is halved when its plan does not fit one answer: at most 2³ = 8 parts. */
const MAX_PLAN_SPLITS = 3;

/** THE SHOT COUNT A RUN IS OFFERED (pure, tested). `floor`: the fewest shots that can cover the time at ≤ maxShot
 *  seconds each (the schema enforces it). The range asked for starts at the larger of that floor and the written beats
 *  and ends at one shot per 6 seconds, never under the start: the old "one shot per 4–6 seconds" asked 8–11 shots of
 *  three beats, and the planner filled them with repeats. */
export function shotCountFor(budget: number, beats: number, maxShot: number): { floor: number; min: number; max: number } {
  const floor = Math.max(1, Math.min(14, Math.ceil(budget / maxShot)));
  const min = Math.max(floor, Math.min(beats, 14));
  return { floor, min, max: Math.max(min, Math.round(budget / 6)) };
}

/** A scene's beats in two runs, in order, for planning in two calls (the first holds the extra beat). */
export function halveBeats<T>(beats: T[]): [T[], T[]] { const k = Math.ceil(beats.length / 2); return [beats.slice(0, k), beats.slice(k)]; }

/** THE SCENE'S SHOT PLAN. One call plans the whole scene when its plan fits the room the engine has for an answer
 *  (`outputRoom`: on the local Ollama, the context OLLAMA_CONTEXT_LENGTH minus the prompt); the call is given that
 *  whole room as its budget. When the most shots the scene may take (`planOutputTokens`) would not fit — or an answer
 *  is cut off anyway (TruncatedAnswerError) — the scene is planned in PARTS: its beats halved (up to 8 parts), each
 *  part with its share of the running time and its own lines, the second part continuing from the first part's last
 *  shot. A cut-off plan is never shaped or kept: it is planned again smaller, or the job fails (a scene of one beat
 *  that does not fit). */
export async function planShotsDraft(_s: StudioState, p: Production, scene: Scene, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string } , opts: EngineOptions = {}, bible?: WorldBible): Promise<ShotPlanDraft> {
  const budget = sceneBudget(p, scene.beats.length);
  const maxShot = 10;
  const shots = await planBeats(p, scene, { from: 0, beats: scene.beats }, cast, world, previous, opts, bible, 0);
  return { shots, budget, maxShot };
}

interface BeatRun { from: number; beats: Scene['beats'] }

async function planBeats(p: Production, scene: Scene, run: BeatRun, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string }, opts: EngineOptions, bible: WorldBible | undefined, depth: number): Promise<PlannedShot[]> {
  const budget = sceneBudget(p, run.beats.length);
  const maxShot = 10;
  const messages = shotPlanMessages(p, scene, run, budget, maxShot, cast, world, previous, opts, bible);
  const room = outputRoom(messages);
  const canSplit = run.beats.length > 1 && depth < MAX_PLAN_SPLITS;
  const split = async (): Promise<PlannedShot[]> => {
    const [a, b] = halveBeats(run.beats);
    const first = await planBeats(p, scene, { from: run.from, beats: a }, cast, world, previous, opts, bible, depth + 1);
    const second = await planBeats(p, scene, { from: run.from + a.length, beats: b }, cast, world, { shot: first[first.length - 1] }, opts, bible, depth + 1);
    return [...first, ...second];
  };
  if (canSplit && planOutputTokens(budget) > room) return split();
  // a run's running time needs enough shots at ≤ maxShot seconds each; a one-shot answer is sent back for more
  const minShots = shotCountFor(budget, run.beats.length, maxShot).floor;
  const schema = ShotPlanSchema.refine((d) => d.shots.length >= minShots, { message: `at least ${minShots} shots are needed to cover about ${budget} seconds at 3–${maxShot} seconds each; return more shots`, path: ['shots'] });
  let r: Awaited<ReturnType<typeof llmJson<ShotPlanOut>>>;
  try { r = await llmJson(schema, messages, { ...opts, maxTokens: room, temperature: 0.6 }); } catch (e) {
    if (isTruncatedAnswer(e) && canSplit) return split();
    throw e;
  }
  opts.onResult?.(r.result);
  const runScene: Scene = { ...scene, beats: run.beats };
  const lines = planLines(run.beats, cast);
  return shapeShotPlan(r.data, { cast, scene: runScene, lines, maxShot, firstOfProduction: !previous.shot, locations: world, musicVideo: p.kind === 'MUSIC_VIDEO', opensScene: run.from === 0 });
}

const planLines = (beats: Scene['beats'], cast: Character[]): PlanLine[] => beats.flatMap((b) => b.lines.map((l) => ({ characterName: cast.find((c) => c.id === l.characterId)?.name ?? '?', characterId: l.characterId, text: l.text, textAr: l.textAr, id: l.id })));

function shotPlanMessages(p: Production, scene: Scene, run: BeatRun, budget: number, maxShot: number, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string }, opts: EngineOptions, bible: WorldBible | undefined): LlmMessage[] {
  const loc = world.find((l) => l.id === scene.locationId);
  const present = scene.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[];
  const lines = planLines(run.beats, cast);
  const d = styleDirection(p.style);
  const whole = run.from === 0 && run.beats.length === scene.beats.length;
  const last = run.from + run.beats.length;
  const next = scene.beats[last];
  const part = whole ? '' : ` — PART: beats ${run.from + 1}–${last} of the scene's ${scene.beats.length} (the other beats are planned separately; plan only these, ${run.from === 0 ? 'starting the scene' : 'continuing straight on from the previous shot below'}${next ? `, ending where beat ${last + 1} begins: "${next.action.slice(0, 160)}"` : ', ending the scene'})`;
  const count = shotCountFor(budget, run.beats.length, maxShot);
  const user = `Plan the shots for Scene ${scene.number} "${scene.title}" of "${p.title}"${part}. Aspect ${p.aspect}. ${whole ? 'The scene' : 'This part'} should run about ${budget} seconds in ${count.min}–${count.max} shots of 3–${maxShot} seconds (each shot becomes one video generation of that length; a dialogue line needs about 0.4 s per word plus a beat).
EVERY SHOT SHOWS SOMETHING NEW — an action, a reveal, a reaction to what just happened, a new angle that tells us something. Never repeat or paraphrase an earlier shot ("he prepares", "he readies himself", "he is ready to act" are one moment, not three). When the beats hold little action for the running time, let the shots that carry real action run longer and hold on them; never invent a filler shot.
Location: ${loc ? compact(locationSummary(loc)) : '(none set — describe a plausible place consistent with the story and keep it identical across shots)'}
Time of day: ${scene.timeOfDay}. Purpose: ${scene.purpose ?? ''}. Emotional objective: ${scene.emotionalObjective ?? ''}. Entry state: ${run.from === 0 ? scene.entryState ?? previous.sceneExit ?? '' : '(mid-scene: as the previous shot ends)'}. Exit state: ${next ? '(mid-scene: the scene goes on after these beats)' : scene.exitState ?? ''}.
Characters present (exact names; include their look so prompts can describe them): ${compact(present.map(castSummary))}
Beats and lines of the ${whole ? 'scene' : 'part'}, in order: ${compact(run.beats.map((b, i) => ({ beat: run.from + i + 1, action: b.action, lines: b.lines.map((l) => `${cast.find((c) => c.id === l.characterId)?.name ?? '?'}: ${l.textAr || l.text}`) })))}
Dialogue lines indexed (use the index numbers in dialogueLineIndexes; every line must be assigned to exactly one shot, in order): ${compact(lines.map((l, i) => ({ index: i, who: l.characterName, line: l.textAr || l.text })))}
${previous.shot ? `The previous shot (from the preceding scene or earlier in this scene) ended like this; keep continuity or mark a clear transition: ${compact({ action: previous.shot.action, continuity: previous.shot.continuity })}` : 'This is the first shot of the production.'}
${planningWorld(p, scene, bible)}
Camera rules for this direction: ${d.camera}
For each shot write "prompt": a complete video-generation prompt in English, 60–160 words, in this order: the production direction look ("${d.visual.slice(0, 80)}…" is prepended automatically, do not repeat it), then the setting with its landmarks, then each visible character described by name-free appearance (never the character's name, always their look: age, build, hair, skin, wardrobe, distinguishing detail), what they do and feel, the camera framing and movement, the light. If the shot has dialogue, do not write the spoken words or any <d> tag: say who speaks (by appearance) and how they deliver it; the studio appends the exact script lines. Do not describe what to avoid.
Continuity for each shot: characters (wardrobe, pose, position in frame, frameSide LEFT/CENTER/RIGHT, screenDirection LEFT/RIGHT/TOWARD/AWAY/NEUTRAL, eyeline, emotion, holding, startPose and endPose — the exact pose they begin and end THIS shot in —, motion {direction LEFT_TO_RIGHT/RIGHT_TO_LEFT/TOWARD_CAMERA/AWAY_FROM_CAMERA/STILL, path}, condition (wet, injured, out of breath — only what shows), interactingWith (names)), props (name, owner, state, position), environment (timeOfDay, weather, lighting, state), camera (lensIntent, angle, crossesLine), constraints (short facts that must hold, e.g. "the cup stays in her right hand"), relationToPrevious: CONTINUATION (same action continues from the previous shot), CUT (new framing of the same moment), STORY_TRANSITION (place/time/state changes). THE SHOT LIST: every shot gives each person's startPose and endPose; a continuous shot or a cut on the same moment starts exactly in the previous shot's endPose (match on action). Keep the 180° line: two people keep their left/right order (frameSide) for the whole scene, and a person facing or moving LEFT keeps facing or moving LEFT across cuts until a visible turn, a TOWARD/AWAY angle, or a STORY_TRANSITION; only set camera.crossesLine true when a shot deliberately crosses the line.
THE BOUNDARY of each shot ("boundary"), how it joins the shot before it — decide it deliberately, it decides how the shot is filmed: "continuous" = the same action carries straight on without a cut (the previous shot's last moment is handed to this one; the camera may keep moving but nothing jumps); "cut" = an editorial cut on the same moment — same people, same place, same story state, an intentional new camera setup (a reverse, a closer size, an insert); "transition" = a new place or a new time (the story moves on; the first shot of a scene is always a transition). Use "continuous" only when the action truly flows and the previous shot is in this scene; prefer "cut" for a change of angle; never hide a jump in time or place behind "continuous".
WHO IS IN FRAME ("characterNames"): only the people the camera SEES in this shot. A line may be spoken by someone who is not in frame - the classic reverse on the listener: list only the listener, give the speaker's line index in dialogueLineIndexes, and the line is heard off-screen. Never put a person in frame only because they speak, are spoken to, looked at or mentioned.
THE STAGING inside each shot: "beats" — 2 to 6 observable actions in order, each with "seconds" timed by how long the action really takes (a glance about 1 s, opening a door 3–4 s, crossing a room 5 s or more, a spoken line about 3 words a second), uneven, never equal slices; "actions" — every discrete visible action the shot covers (a comma list is several); "pace" — DWELL (one moment expanded, no cuts), NORMAL, or MONTAGE (a run of distinct actions); a beat may carry "cut": {"camera": "…", "location": "…"} when the story needs a new angle or a new place INSIDE the shot — at most two, never in the first or last 3 seconds, never to hide a jump; "pov": the character whose eyes the camera is (only when a barrier justifies it — a peephole, a door crack; they are not seen); "extras": unnamed people present, as groups described in words ({"description": "four tired shoppers in winter coats", "count": 4}) — never invent a named character and never make a group look like a cast member. Stage the events, never the telling: shoot the listener, not the talker; show a place in use. Everyone who acts in a beat is in characterNames. A shot with no dialogue line names no speech at all: no "says", no "whispers", no quoted words, not even as a trailing scrap. With a character on screen the framing is MEDIUM, MEDIUM_CLOSE_UP or CLOSE_UP (or TWO_SHOT / OVER_THE_SHOULDER for two) — never WIDE for a speaking face; nobody looks at the camera.
Return JSON: { shots: [{ purpose, action, framing, cameraMove, durationSeconds, characterNames[], dialogueLineIndexes[], transition, boundary, beats:[{seconds,action,cut?}], actions[], pace, pov?, extras:[{description,count}], continuity:{characters[],props[],environment{},camera{},relationToPrevious,notes?,constraints[]}, prompt }] }.
Example of ONE complete shot (shape only; write your own content): {"purpose":"Establish the yard and her hesitation","action":"She stops at the gate, hand on the latch, then pushes it open.","framing":"WIDE","cameraMove":"STATIC","durationSeconds":5,"characterNames":["Layla"],"dialogueLineIndexes":[0],"transition":"CUT","boundary":"transition","beats":[{"seconds":1.5,"action":"She stops at the gate, hand on the latch."},{"seconds":3.5,"action":"She pushes the gate open and steps through."}],"actions":["stops at the gate","pushes the gate open","steps through"],"pace":"NORMAL","extras":[],"continuity":{"characters":[{"characterName":"Layla","wardrobe":"green coat, red scarf","pose":"standing, hand on latch","position":"left third, facing right","frameSide":"LEFT","screenDirection":"RIGHT","eyeline":"at the gate","emotion":"hesitant","holding":["canvas bag"],"startPose":"standing at the closed gate, hand on the latch","endPose":"one step inside the yard, gate open behind her","motion":{"direction":"LEFT_TO_RIGHT","path":"through the gate into the yard"}}],"props":[{"name":"canvas bag","ownerCharacterName":"Layla","state":"full","position":"on her shoulder"}],"environment":{"timeOfDay":"GOLDEN_HOUR","weather":"clear","lighting":"low warm sun from the right, long shadows","state":"gate closed, leaves on the path"},"camera":{"lensIntent":"35mm, eye level","angle":"slightly low"},"relationToPrevious":"CUT","notes":"Her scarf stays over the left shoulder in every shot.","constraints":["the canvas bag stays on her right shoulder"]},"prompt":"A full prompt for this video clip in the production's visual language, describing the place, the people by appearance (never by name), the action, the camera and the light."}
Every continuity.characters entry must use the key "characterName" with the exact character name. boundary ∈ continuous, cut, transition (and relationToPrevious ∈ CONTINUATION, CUT, STORY_TRANSITION says the same thing). Use null for nothing; never omit required keys.
framing ∈ EXTREME_WIDE, WIDE, MEDIUM_WIDE, MEDIUM, MEDIUM_CLOSE_UP, CLOSE_UP, EXTREME_CLOSE_UP, INSERT, TWO_SHOT, OVER_THE_SHOULDER. A CLOSE_UP and an EXTREME_CLOSE_UP are of a FACE; a hand, a foot, a shoe or an object filling the frame is an INSERT (a "close-up" of a slipping shoe was framed on the face, and the video engine cut inside the take to reach the shoe). cameraMove ∈ STATIC, PUSH_IN, PULL_BACK, PAN_LEFT, PAN_RIGHT, TILT_UP, TILT_DOWN, TRUCK_LEFT, TRUCK_RIGHT, HANDHELD, FOLLOW, ORBIT, CRANE_UP, CRANE_DOWN, RACK_FOCUS. transition: always "CUT" (the studio derives the editorial join from the boundary; there are no dissolves or fades).`;
  return [system(`${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}\n\n${TIMELINE_RULES}${intentBlock(p)}`, opts), { role: 'user', content: user }];
}

/** A script line as the planner indexes it. */
export interface PlanLine { id: string; characterId: string; characterName: string; text: string; textAr?: string }

/** THE PLANNER'S OUTPUT, SHAPED (pure, so fixture plans are tested without a model): names resolved to the cast,
 *  lines assigned once each (forgotten lines spread in script order), durations clamped, the continuity built, and
 *  THE BOUNDARY set on every shot — the planner's explicit `boundary`, else its `relationToPrevious`; the first shot
 *  of a scene is never `continuous` (it opens the scene: a transition), and `continuity.relationToPrevious` is kept
 *  in step with the boundary for the readers of older plans. */
export function shapeShotPlan(data: ShotPlanOut, ctx: { cast: Character[]; scene: Scene; lines: PlanLine[]; maxShot: number; firstOfProduction?: boolean; locations?: Location[]; musicVideo?: boolean; /** false for a later part of a scene planned in parts: its first shot continues the part before */ opensScene?: boolean }): PlannedShot[] {
  const { cast, scene, lines, maxShot } = ctx;
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
  const byName = (name: string) => { const n = norm(name); return cast.find((c) => norm(c.name) === n || c.nameAr?.trim() === name.trim()) ?? cast.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n) || (c.nameAr && name.includes(c.nameAr))); };
  const locByName = (name?: string) => (name ? ctx.locations?.find((l) => norm(l.name) === norm(name) || l.nameAr?.trim() === name.trim()) : undefined);
  const used = new Set<number>();
  const shots: PlannedShot[] = data.shots.map((sh, i) => {
    const notes: string[] = [];
    const dialogue = (sh.dialogueLineIndexes ?? []).filter((k) => k >= 0 && k < lines.length && !used.has(k)).map((k) => { used.add(k); const l = lines[k]; return { id: l.id || nid('line'), characterId: l.characterId, text: l.text, textAr: l.textAr }; });
    // who is in frame: the names given, else the continuity entries, else whoever speaks in the shot. A speaker the
    // plan does not put in frame is HEARD OFF-SCREEN (a reverse on the listener): never added to the cast — every
    // speaker used to be, and a close-up of the listener was drawn with the speaker in it (continuity recovery
    // 2026-10-08)
    const named = sh.characterNames.map((n) => byName(n)?.id).filter((x): x is string => Boolean(x));
    const fromContinuity = sh.continuity.characters.map((c) => byName(c.characterName)?.id).filter((x): x is string => Boolean(x));
    const inFrame = named.length ? named : fromContinuity;
    let characterIds = Array.from(new Set([...inFrame, ...dialogue.filter((d) => !inFrame.length || inFrame.includes(d.characterId)).map((d) => d.characterId)]));
    const cont = sh.continuity;
    // the boundary: explicit, else from the relation; a scene's first shot opens it (a transition), never continues
    let boundary: ShotBoundary = sh.boundary ?? RELATION_BOUNDARY[cont.relationToPrevious];
    if (i === 0 && ctx.opensScene !== false && boundary !== 'transition') boundary = 'transition';
    const durationSeconds = Math.min(maxShot, Math.max(3, Math.round(sh.durationSeconds)));
    // THE STAGING (src/server/story/beats.ts): timed beats tiled over the shot, cuts policed, the point of view and
    // the extras resolved, the discrete actions kept
    const pace = sh.pace;
    const drafted = (sh.beats ?? []).map((b) => ({ seconds: b.seconds ?? 1, action: b.action, cut: b.cut ? { camera: b.cut.camera || 'a new angle', ...(locByName(b.cut.locationName) ? { locationId: locByName(b.cut.locationName)!.id } : {}) } : undefined }));
    const cutsAsked = drafted.filter((b) => b.cut).length;
    const beats = limitCuts(timeBeats(drafted, durationSeconds), durationSeconds, { pace });
    const cutsKept = beats.filter((b) => b.cut).length;
    if (cutsAsked > cutsKept) notes.push(`${cutsAsked - cutsKept} in-take cut(s) dropped (inside the margins, over the limit of two, or a dwell)`);
    const pov = sh.pov ? byName(sh.pov)?.id : undefined;
    if (pov && !characterIds.includes(pov)) characterIds.push(pov);
    const extras = (sh.extras ?? []).map((e) => ({ description: e.description, ...(e.count ? { count: e.count } : {}) }));
    // THE CAST AGAINST THE ACTIONS: whoever acts is in the shot
    const reconciled = reconcileCast(characterIds, [sh.action, sh.prompt ?? '', ...beats.map((b) => b.action), ...(sh.actions ?? [])], cast);
    if (reconciled.added.length) { notes.push(`added to the cast from the actions: ${reconciled.added.map((id) => cast.find((c) => c.id === id)?.name ?? id).join(', ')}`); characterIds = reconciled.characterIds; }
    // a line whose speaker is not in frame is heard off-screen (after the cast is settled: a speaker who acts is in it)
    for (const d of dialogue) if (!characterIds.includes(d.characterId)) (d as { offscreen?: boolean }).offscreen = true;
    const offscreen = [...new Set(dialogue.filter((d) => (d as { offscreen?: boolean }).offscreen).map((d) => d.characterId))];
    if (offscreen.length) notes.push(`heard off-screen: ${offscreen.map((id) => cast.find((c) => c.id === id)?.name ?? id).join(', ')}`);
    // A SILENT SHOT carries no speech in its words: the model invents dialogue from a speech verb (C1)
    const silent = !ctx.musicVideo && dialogue.length === 0;
    const scrub = (s: string) => (silent && /\b(say|says|said|speak|speaks|talk|talks|whisper|whispers|shout|shouts|ask|asks|repl(?:y|ies)|tell|tells|mutter|mutters|call|calls|sing|sings|laugh|laughs|dialogue|conversation)\b/i.test(s) ? scrubSpeech(s) : s);
    const action = scrub(sh.action);
    const prompt = scrub(sh.prompt?.trim() ?? '');
    const scrubbedBeats = beats.map((b) => ({ ...b, action: scrub(b.action) }));
    if (silent && (action !== sh.action || prompt !== (sh.prompt?.trim() ?? '') || scrubbedBeats.some((b, k) => b.action !== beats[k].action))) notes.push('speech words scrubbed from a silent shot');
    // A SPEAKING FACE IS FRAMED CLOSE
    const framing = closeFramingFor(sh.framing, { people: characterIds.filter((id) => id !== pov).length, dialogue: dialogue.length > 0 });
    if (framing !== sh.framing) notes.push(`framing ${sh.framing} → ${framing} (a speaking face is framed close)`);
    const staging: ShotStaging | undefined = scrubbedBeats.length || pace || pov || extras.length || sh.actions?.length ? { ...(scrubbedBeats.length ? { beats: scrubbedBeats } : {}), ...(pace ? { pace } : {}), ...(pov ? { pov } : {}), ...(extras.length ? { extras } : {}), ...(sh.actions?.length ? { actions: sh.actions } : {}) } : undefined;
    const continuity: Omit<ContinuityState, 'version'> = {
      // THE SHOT LIST'S DISCIPLINE (schemas.ts ContinuitySchema): side of frame, start and end pose, travel, condition
      // and partners kept as data, names resolved to the cast (a partner who is not in the shot is dropped)
      characters: cont.characters.map((c) => {
        const partners = (c.interactingWith ?? []).map((n) => byName(n)?.id).filter((id): id is string => Boolean(id) && characterIds.includes(id!));
        return { characterId: byName(c.characterName)?.id ?? c.characterName, wardrobe: c.wardrobe, pose: c.pose, position: c.position, ...(c.frameSide ? { frameSide: c.frameSide } : {}), screenDirection: c.screenDirection, eyeline: c.eyeline, emotion: c.emotion, holding: c.holding, ...(c.startPose ? { startPose: c.startPose } : {}), ...(c.endPose ? { endPose: c.endPose } : {}), ...(c.motion?.direction || c.motion?.path ? { motion: { ...(c.motion.direction ? { direction: c.motion.direction } : {}), ...(c.motion.path ? { path: c.motion.path } : {}) } } : {}), ...(c.condition ? { condition: c.condition } : {}), ...(partners.length ? { interactingWith: partners } : {}) };
      }),
      props: cont.props.map((pr) => ({ name: pr.name, ownerCharacterId: pr.ownerCharacterName ? byName(pr.ownerCharacterName)?.id : undefined, state: pr.state, position: pr.position })),
      environment: { locationId: scene.locationId, timeOfDay: cont.environment.timeOfDay ?? scene.timeOfDay, weather: cont.environment.weather, lighting: cont.environment.lighting, state: cont.environment.state },
      camera: { framing, move: sh.cameraMove, lensIntent: cont.camera.lensIntent, angle: cont.camera.angle, ...(cont.camera.crossesLine ? { crossesLine: true } : {}) },
      relationToPrevious: BOUNDARY_RELATION[boundary], notes: cont.notes,
      ...(cont.constraints?.length ? { constraints: cont.constraints } : {}),
    };
    // the editorial join follows the boundary (src/domain/editorial.ts): the model's dissolve or fade is not kept
    return { purpose: sh.purpose, action, framing, cameraMove: sh.cameraMove, durationSeconds, characterIds, dialogue, transition: editorialTransition({ boundary, continuity: { ...continuity, version: 0 } }), continuity, prompt, boundary, ...(staging ? { staging } : {}), ...(notes.length ? { notes } : {}) };
  });
  if (shots.length === 0) throw new StudioError('PROVIDER', 'The story engine returned no shots.');
  // lines the model forgot: spread in script order over the shots, each line going to the next shot (from where the
  // previous forgotten line went) that holds its speaker — or simply the next shot — so dialogue is not piled on one
  const forgotten = lines.map((l, k) => ({ l, k })).filter(({ k }) => !used.has(k));
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
  return shots;
}

/** The model plans shots near the short end of the range, so a scene comes out well under its running time.
 *  Stretch every shot by the same factor (rounded to whole seconds, never above maxShot) until the scene fills at
 *  least 90 % of its budget; a plan that already fits is left alone. Longer shots mean longer generations, not more. */
export function fitDurations<T extends { durationSeconds: number; staging?: ShotStaging }>(shots: T[], budget: number, maxShot = 10, minShot = 3): T[] {
  const sum = shots.reduce((a, s) => a + s.durationSeconds, 0);
  if (!shots.length || sum <= 0 || sum >= budget * 0.9) return shots;
  const factor = budget / sum;
  let out = shots.map((s) => ({ ...s, durationSeconds: Math.min(maxShot, Math.max(minShot, Math.round(s.durationSeconds * factor))) }));
  // rounding and the cap may leave a gap: hand spare seconds to the shots with room, one at a time, in order
  let gap = budget - out.reduce((a, s) => a + s.durationSeconds, 0);
  for (let i = 0; gap > 0 && out.some((s) => s.durationSeconds < maxShot); i = (i + 1) % out.length) if (out[i].durationSeconds < maxShot) { out[i] = { ...out[i], durationSeconds: out[i].durationSeconds + 1 }; gap--; }
  // the timed beats keep their ratios on the stretched shot (the cuts' margins were judged on the ratios too)
  return out.map((s, i) => (s.staging?.beats?.length && s.durationSeconds !== shots[i].durationSeconds ? { ...s, staging: { ...s.staging, beats: s.staging.beats.map((b) => ({ ...b, at: Number(((b.at * s.durationSeconds) / shots[i].durationSeconds).toFixed(3)) })) } } : s));
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

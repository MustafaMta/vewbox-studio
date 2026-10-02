import { z } from 'zod';
import type { Character, ContinuityState, IdeaPreferences, IdeaProposal, Location, Production, Scene, StudioState } from '@/domain/types';
import type { Dialect, Language, Style } from '@/domain/vocabulary';
import { DIALECT_LABELS, DURATIONS } from '@/domain/vocabulary';
import { nid } from '@/domain/ids';
import { StudioError } from '@/domain/errors';
import { json as llmJson, type LlmMessage, type LlmOptions, type LlmResult } from '../providers/llm';
import { styleDirection } from './style';
import { DevelopSchema, PerformancePlanSchema, ProposalSchema, ScriptSchema, ShotPlanSchema, type ShotPlanOut } from './schemas';

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

export interface EngineOptions extends LlmOptions { onResult?: (r: LlmResult) => void }

// --------------------------------------------------------------------------------------------------- Auto Idea

export async function proposeIdea(s: StudioState, req: { kind: 'SHOW' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; preferences: IdeaPreferences; brief?: string }, opts: EngineOptions = {}): Promise<IdeaProposal> {
  const prefs = req.preferences;
  const show = req.showId ? s.shows.find((x) => x.id === req.showId) : undefined;
  const season = req.seasonId ? s.seasons.find((x) => x.id === req.seasonId) : undefined;
  const d = s.settings.defaults;
  const language = prefs.language ?? show?.language ?? d.language;
  const dialect = language === 'AR' ? prefs.dialect ?? show?.dialect ?? d.dialect : undefined;
  const style = prefs.style ?? show?.style ?? d.style;
  const episodes = show ? s.productions.filter((p) => p.showId === show.id) : [];
  const avgDuration = episodes.length ? Math.round(episodes.reduce((a, p) => a + p.targetSeconds, 0) / episodes.length) : undefined;
  const durations = DURATIONS[req.kind === 'SHOW' ? 'EPISODE' : req.kind];
  const durationSeconds = prefs.durationSeconds ?? avgDuration ?? durations[1];
  const mustCast = (prefs.castIds ?? []).map((id) => s.characters.find((c) => c.id === id)).filter(Boolean) as Character[];
  const mustLocs = (prefs.locationIds ?? []).map((id) => s.locations.find((l) => l.id === id)).filter(Boolean) as Location[];
  const library = { characters: s.characters.filter((c) => c.style === style).slice(0, 24).map(castSummary), locations: s.locations.filter((l) => l.style === style).slice(0, 16).map(locationSummary) };
  const showContext = show ? { title: show.title, logline: show.logline, genre: show.genre, synopsis: show.synopsis, bible: show.bible, season: season ? { number: season.number, title: season.title, arc: season.arc } : undefined, returningCast: show.castIds.map((id) => s.characters.find((c) => c.id === id)).filter(Boolean).map((c) => castSummary(c!)), returningLocations: show.locationIds.map((id) => s.locations.find((l) => l.id === id)).filter(Boolean).map((l) => locationSummary(l!)), previousEpisodes: episodes.slice(-6).map((p) => ({ number: p.episodeNumber, title: p.title, logline: p.logline, synopsis: p.synopsis.slice(0, 500) })) } : undefined;

  const what = req.kind === 'SHOW' ? 'a new SHOW (series): the concept and the first season\'s first 3–6 episodes as the structure' : req.kind === 'EPISODE' ? 'the NEXT EPISODE of the show described below: the structure is its 3–6 scenes' : req.kind === 'SHORT' ? 'a SHORT FILM: the structure is its 3–6 scenes' : 'a MUSIC VIDEO: the structure is its 3–6 visual sections, and it needs a song (title, a one-sentence musical caption describing genre/tempo/instrumentation/voice, and complete lyrics with [verse]/[chorus]/[bridge] tags, one blank line between sections)';
  const user = `Propose ${what}.
Target running time: about ${durationSeconds} seconds. ${req.kind === 'MUSIC_VIDEO' ? `Treatment: ${prefs.concept ?? 'PERFORMANCE'} (PERFORMANCE = the singer performs on screen; NARRATIVE = a story illustrates the song; MIXED = both).` : ''}
${prefs.mood ? `Requested mood: ${prefs.mood}.` : ''}
${req.brief ? `The producer's own idea (build on it exactly): """${req.brief}"""` : 'The producer gave no premise: invent one that is fresh, specific and emotionally clear, set in a concrete place with a cultural texture that fits the language.'}
${mustCast.length ? `These existing characters MUST be in it (reference them by existingCharacterId): ${compact(mustCast.map(castSummary))}` : ''}
${mustLocs.length ? `These existing locations MUST be used (reference them by existingLocationId): ${compact(mustLocs.map(locationSummary))}` : ''}
${showContext ? `Show context (reuse its returning cast and places by id; propose at most two newcomers and only if the story needs them): ${compact(showContext)}` : `Studio library you may reuse by id when a character or place genuinely fits (otherwise invent new ones): ${compact(library)}`}
Return JSON with exactly these keys: title, titleAr (optional), logline, premise (2–4 paragraphs), genre, mood, structure (array of {title, summary}), cast (array of {existingCharacterId?, name, role, reason, sex, ageYears, appearance, personality}), locations (array of {existingLocationId?, name, description, kind})${req.kind === 'MUSIC_VIDEO' ? ', song {title, caption, lyrics}' : ''}.
For a new character "appearance" is one dense sentence of how they look (age, build, face, hair, skin, eyes, wardrobe, one distinguishing detail).`;

  const messages: LlmMessage[] = [{ role: 'system', content: `${STUDIO_RULES}\n\n${STYLE_RULES(style)}\n\n${LANGUAGE_RULES(language, dialect)}` }, { role: 'user', content: user }];
  const r = await llmJson(ProposalSchema, messages, { ...opts, maxTokens: 6000, temperature: 0.9 });
  opts.onResult?.(r.result);
  const out = r.data;
  const cast = out.cast.map((c, i) => {
    const existing = c.existingCharacterId ? s.characters.find((x) => x.id === c.existingCharacterId) : undefined;
    const fromPreference = Boolean(existing && mustCast.some((m) => m.id === existing.id));
    return { key: existing ? `c-${existing.id}` : `new-c-${i}`, characterId: existing?.id, name: existing?.name ?? c.name, role: existing?.role ?? c.role, reason: c.reason, isNew: !existing, fromPreference, sex: c.sex ?? existing?.sex, ageYears: c.ageYears ?? existing?.ageYears, appearance: c.appearance, personality: c.personality };
  });
  // anything the producer required that the model dropped is added back
  for (const m of mustCast) if (!cast.some((c) => c.characterId === m.id)) cast.unshift({ key: `c-${m.id}`, characterId: m.id, name: m.name, role: m.role, reason: 'You asked for this character.', isNew: false, fromPreference: true, sex: m.sex, ageYears: m.ageYears, appearance: undefined, personality: undefined });
  const locations = out.locations.map((l, i) => {
    const existing = l.existingLocationId ? s.locations.find((x) => x.id === l.existingLocationId) : undefined;
    return { key: existing ? `l-${existing.id}` : `new-l-${i}`, locationId: existing?.id, name: existing?.name ?? l.name, description: existing?.description ?? l.description, isNew: !existing, fromPreference: Boolean(existing && mustLocs.some((m) => m.id === existing.id)), kind: l.kind ?? existing?.kind };
  });
  for (const m of mustLocs) if (!locations.some((l) => l.locationId === m.id)) locations.unshift({ key: `l-${m.id}`, locationId: m.id, name: m.name, description: m.description, isNew: false, fromPreference: true, kind: m.kind });
  return { sample: false, title: out.title, titleAr: out.titleAr, logline: out.logline, premise: out.premise, genre: out.genre, mood: prefs.mood?.trim() || out.mood, style, language, dialect, durationSeconds, structure: out.structure, cast, locations, concept: req.kind === 'MUSIC_VIDEO' ? prefs.concept ?? 'PERFORMANCE' : undefined, song: req.kind === 'MUSIC_VIDEO' ? out.song : undefined };
}

// ----------------------------------------------------------------------------------------------- Manual Brief

export interface DevelopResult {
  logline: string; synopsis: string; genre?: string; mood?: string; titleAr?: string;
  newCharacters: Array<{ name: string; role: string; sex: 'FEMALE' | 'MALE'; design: z.infer<typeof DevelopSchema>['newCharacters'][number]['design'] }>;
  newLocations: Array<{ name: string; design: z.infer<typeof DevelopSchema>['newLocations'][number]['design'] }>;
  scenes: z.infer<typeof DevelopSchema>['scenes'];
}

/** From a brief (and whatever cast/places are already attached) to a developed story with a scene breakdown. */
export async function developStory(s: StudioState, p: Production, cast: Character[], world: Location[], opts: EngineOptions = {}): Promise<DevelopResult> {
  const show = p.showId ? s.shows.find((x) => x.id === p.showId) : undefined;
  const libraryChars = s.characters.filter((c) => c.style === p.style && !cast.some((x) => x.id === c.id)).slice(0, 12).map(castSummary);
  const libraryLocs = s.locations.filter((l) => l.style === p.style && !world.some((x) => x.id === l.id)).slice(0, 10).map(locationSummary);
  const kind = p.kind === 'MUSIC_VIDEO' ? 'music video' : p.kind === 'SHORT' ? 'short film' : 'episode';
  const sceneBudget = Math.max(1, Math.min(24, Math.round(p.targetSeconds / (p.kind === 'MUSIC_VIDEO' ? 20 : 45))));
  const user = `Develop this ${kind} from the producer's brief.
Title: ${p.title}${p.titleAr ? ` / ${p.titleAr}` : ''}
Brief: """${p.brief.text || p.logline || p.synopsis || '(none — invent a strong premise that fits the title)'}"""
${p.logline ? `Existing logline: ${p.logline}` : ''}${p.synopsis ? `\nExisting synopsis (keep its facts): ${p.synopsis}` : ''}
Target running time: ${p.targetSeconds} seconds → plan about ${sceneBudget} scene(s), each with targetSeconds that add up to roughly the total.
${show ? `Part of the show "${show.title}" (${show.logline}). Show synopsis: ${show.synopsis ?? ''}. Bible: ${compact(show.bible ?? {})}.` : ''}
Cast already attached (use them; refer to them by exact name): ${compact(cast.map(castSummary))}
Places already attached (use them; refer to them by exact name): ${compact(world.map(locationSummary))}
${libraryChars.length ? `Other studio characters you MAY bring in by exact name if they fit: ${compact(libraryChars)}` : ''}
${libraryLocs.length ? `Other studio places you MAY use by exact name: ${compact(libraryLocs)}` : ''}
If the story needs people or places that do not exist yet, create them in newCharacters / newLocations with full designs (then use their names in scenes). Keep new characters to the minimum the story needs.
${p.kind === 'MUSIC_VIDEO' && p.song ? `The song (${p.song.title}, ${p.song.durationSeconds}s): caption "${p.song.caption}". Sections: ${compact(p.song.sections.map((x) => ({ kind: x.kind, from: x.from, to: x.to, text: x.textAr || x.text })))}. Scenes should map onto song sections.` : ''}
Return JSON: { logline, synopsis (3–6 paragraphs, present tense), genre, mood, titleAr?, newCharacters: [{name, role, sex, design:{build, face, hair, skin, eyes, distinguishing[], wardrobe, personality, ageYears, nameAr?, canon:{heightCm?, accessories[]?, visualRestrictions[]?, agePresentation?, speech?}}}], newLocations: [{name, design:{description, kind, landmarks[], props[], lighting[], nameAr?, layout:{geography?, architecture?, materials[]?, cameraZones[]?, entrances[]?, spatial?}}}], scenes: [{title, locationName, timeOfDay, characterNames[], purpose, emotionalObjective, entryState, exitState, targetSeconds}] }.
timeOfDay must be one of DAWN, MORNING, MIDDAY, AFTERNOON, GOLDEN_HOUR, DUSK, NIGHT. locationName must match an attached, library or new location exactly; characterNames likewise.`;
  const messages: LlmMessage[] = [{ role: 'system', content: `${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}` }, { role: 'user', content: user }];
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
Return JSON: { scenes: [{ sceneId, beats: [{ action, lines: [{ characterName, text, textAr?, delivery? }] }] }] }. "delivery" is a short performance note (e.g. "quietly, not looking up").`;
  const messages: LlmMessage[] = [{ role: 'system', content: `${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}` }, { role: 'user', content: user }];
  const r = await llmJson(ScriptSchema, messages, { ...opts, maxTokens: 9000, temperature: 0.8 });
  opts.onResult?.(r.result);
  return r.data;
}

// ------------------------------------------------------------------------------------------------------- shots

export interface PlannedShot { purpose: string; action: string; framing: ShotPlanOut['shots'][number]['framing']; cameraMove: ShotPlanOut['shots'][number]['cameraMove']; durationSeconds: number; characterIds: string[]; dialogue: Array<{ id: string; characterId: string; text: string; textAr?: string }>; transition: ShotPlanOut['shots'][number]['transition']; continuity: Omit<ContinuityState, 'version'>; prompt: string }

export async function planShots(_s: StudioState, p: Production, scene: Scene, cast: Character[], world: Location[], previous: { shot?: PlannedShot; sceneExit?: string } , opts: EngineOptions = {}): Promise<PlannedShot[]> {
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
Camera rules for this direction: ${d.camera}
For each shot write "prompt": a complete video-generation prompt in English, 60–160 words, in this order: the production direction look ("${d.visual.slice(0, 80)}…" is prepended automatically, do not repeat it), then the setting with its landmarks, then each visible character described by name-free appearance (never the character's name, always their look: age, build, hair, skin, wardrobe, distinguishing detail), what they do and feel, the camera framing and movement, the light. ${p.language === 'AR' ? 'If the shot has dialogue, add at the end: <d>[Arabic] الجملة </d> for each line in speaking order (the exact Arabic text).' : 'If the shot has dialogue, add at the end: <d>[English] the line </d> for each line in speaking order.'} Do not describe what to avoid.
Continuity for each shot: characters (wardrobe, pose, position in frame, screenDirection LEFT/RIGHT/TOWARD/AWAY/NEUTRAL, eyeline, emotion, holding), props (name, owner, state, position), environment (timeOfDay, weather, lighting, state), camera (lensIntent, angle), relationToPrevious: CONTINUATION (same action continues from the previous shot), CUT (new framing of the same moment), STORY_TRANSITION (place/time/state changes). Keep the 180° line: once a character faces LEFT they keep facing LEFT until a visible turn or a STORY_TRANSITION.
Return JSON: { shots: [{ purpose, action, framing, cameraMove, durationSeconds, characterNames[], dialogueLineIndexes[], transition, continuity:{characters[],props[],environment{},camera{},relationToPrevious,notes?}, prompt }] }.
framing ∈ EXTREME_WIDE, WIDE, MEDIUM_WIDE, MEDIUM, MEDIUM_CLOSE_UP, CLOSE_UP, EXTREME_CLOSE_UP, INSERT, TWO_SHOT, OVER_THE_SHOULDER. cameraMove ∈ STATIC, PUSH_IN, PULL_BACK, PAN_LEFT, PAN_RIGHT, TILT_UP, TILT_DOWN, TRUCK_LEFT, TRUCK_RIGHT, HANDHELD, FOLLOW, ORBIT, CRANE_UP, CRANE_DOWN, RACK_FOCUS. transition ∈ CUT, EXTEND, DISSOLVE, FADE (use CUT unless the story asks otherwise; never use a dissolve to hide a continuity problem).`;
  const messages: LlmMessage[] = [{ role: 'system', content: `${STUDIO_RULES}\n\n${STYLE_RULES(p.style)}\n\n${LANGUAGE_RULES(p.language, p.dialect)}` }, { role: 'user', content: user }];
  const r = await llmJson(ShotPlanSchema, messages, { ...opts, maxTokens: 9000, temperature: 0.6 });
  opts.onResult?.(r.result);
  const byName = (name: string) => cast.find((c) => c.name.toLowerCase() === name.trim().toLowerCase() || c.nameAr === name.trim());
  const used = new Set<number>();
  const shots: PlannedShot[] = r.data.shots.map((sh) => {
    const characterIds = sh.characterNames.map((n) => byName(n)?.id).filter((x): x is string => Boolean(x));
    const dialogue = (sh.dialogueLineIndexes ?? []).filter((i) => i >= 0 && i < lines.length && !used.has(i)).map((i) => { used.add(i); const l = lines[i]; return { id: l.id || nid('line'), characterId: l.characterId, text: l.text, textAr: l.textAr }; });
    const cont = sh.continuity;
    const continuity: Omit<ContinuityState, 'version'> = {
      characters: cont.characters.map((c) => ({ characterId: byName(c.characterName)?.id ?? c.characterName, wardrobe: c.wardrobe, pose: c.pose, position: c.position, screenDirection: c.screenDirection, eyeline: c.eyeline, emotion: c.emotion, holding: c.holding })),
      props: cont.props.map((pr) => ({ name: pr.name, ownerCharacterId: pr.ownerCharacterName ? byName(pr.ownerCharacterName)?.id : undefined, state: pr.state, position: pr.position })),
      environment: { locationId: scene.locationId, timeOfDay: cont.environment.timeOfDay ?? scene.timeOfDay, weather: cont.environment.weather, lighting: cont.environment.lighting, state: cont.environment.state },
      camera: { framing: sh.framing, move: sh.cameraMove, lensIntent: cont.camera.lensIntent, angle: cont.camera.angle },
      relationToPrevious: cont.relationToPrevious, notes: cont.notes,
    };
    return { purpose: sh.purpose, action: sh.action, framing: sh.framing, cameraMove: sh.cameraMove, durationSeconds: Math.min(maxShot, Math.max(3, Math.round(sh.durationSeconds))), characterIds, dialogue, transition: sh.transition, continuity, prompt: sh.prompt };
  });
  // lines the model forgot are attached to the last shot of their speaker (or the last shot)
  lines.forEach((l, i) => { if (used.has(i)) return; const target = [...shots].reverse().find((sh) => sh.characterIds.includes(l.characterId)) ?? shots[shots.length - 1]; if (target) target.dialogue.push({ id: l.id || nid('line'), characterId: l.characterId, text: l.text, textAr: l.textAr }); });
  if (shots.length === 0) throw new StudioError('PROVIDER', 'The story engine returned no shots.');
  return shots;
}

// ------------------------------------------------------------------------------------------ performance plan

export async function planPerformance(p: Production, cast: Character[], opts: EngineOptions = {}): Promise<Array<{ sectionId: string; mode: 'SOLO' | 'DUET' | 'ALTERNATING' | 'ENSEMBLE' | 'LISTENER' | 'INSTRUMENTAL'; singerIds: string[]; lines?: Array<{ singerId: string; text: string }> }>> {
  if (!p.song) throw new StudioError('INVALID', 'This music video has no song.');
  const singers = cast.filter((c) => p.song!.singerIds.includes(c.id));
  const user = `Assign the singing in "${p.song.title}" (treatment ${p.concept ?? 'PERFORMANCE'}). Performers (exact names): ${compact(singers.map((c) => ({ name: c.name, voice: `${c.voice.pitch} ${c.voice.timbre}`, role: c.role })))}.
Sections: ${compact(p.song.sections.map((x) => ({ sectionId: x.id, kind: x.kind, from: x.from, to: x.to, lyrics: x.textAr || x.text, currentSingers: x.singerIds.map((id) => cast.find((c) => c.id === id)?.name) })))}
Rules: instrumental sections are INSTRUMENTAL with no singers. A section sung by one performer is SOLO. Two performers singing together is DUET; taking turns line by line is ALTERNATING (then give "lines": [{singerName, text}] splitting the lyrics in order); three or more together is ENSEMBLE. Keep current singer assignments unless they are clearly wrong. Only a performer assigned to a section sings in it; nobody else mouths the words.
Return JSON: { sections: [{ sectionId, mode, singerNames[], lines?[] }] }.`;
  const messages: LlmMessage[] = [{ role: 'system', content: STUDIO_RULES }, { role: 'user', content: user }];
  const r = await llmJson(PerformancePlanSchema, messages, { ...opts, maxTokens: 4000, temperature: 0.3 });
  opts.onResult?.(r.result);
  const byName = (n: string) => singers.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())?.id;
  return r.data.sections.map((sec) => ({ sectionId: sec.sectionId, mode: sec.mode, singerIds: sec.singerNames.map(byName).filter((x): x is string => Boolean(x)), lines: sec.lines?.map((l) => ({ singerId: byName(l.singerName) ?? '', text: l.text })).filter((l) => l.singerId) }));
}

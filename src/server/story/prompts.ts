import type { Character, Location, Production, Shot } from '@/domain/types';
import type { Framing } from '@/domain/vocabulary';
import { performanceFor, shotWindows, sungLinesFor } from '@/domain/timeline';
import { styleDirection } from './style';
import { nonHumanSpecies } from '@/domain/identity';
import { describeIdentity, identityFacts, locationIdentity } from '@/domain/location';
import { hasHealedScar, healedMark } from '@/domain/scars';
import { sceneStateLine, type SceneState } from '@/domain/scene-state';
import { contextLines, poseWithoutSpeech, type ProductionContext } from '@/domain/production-context';
import { shotPerformers } from '@/domain/music-performance';
import { facingAway } from '@/domain/blocking';
import { cutTime, markTime, scrubSpeech } from './beats';

/** PROMPT COMPOSITION — the one place that turns studio records into the text a model sees. Characters are always
 *  described by appearance (never by name), the production direction's visual language goes first, and dialogue is
 *  tagged the way MiniMax H3 expects (`<d>[Language] … </d>`). */

const clean = (s?: string | false) => (s || '').replace(/\s+/g, ' ').trim();

export function describeCharacter(c: Character): string {
  // "Human" is not a species to draw (D6): a person is described by age and sex
  const species = nonHumanSpecies(c.species);
  const age = species ? `${species}` : `${c.ageYears}-year-old ${c.sex === 'FEMALE' ? 'woman' : 'man'}`;
  const parts = [age, c.build, c.face, c.hair && `${c.hair} hair`, c.skin && c.skin !== '—' && `${c.skin} skin`, c.eyes && `${c.eyes} eyes`, c.wardrobe && `wearing ${c.wardrobe}`, ...(c.distinguishing ?? []).slice(0, 3), ...(c.canon?.accessories ?? []).slice(0, 2)].map(clean).filter(Boolean);
  return parts.join(', ');
}

/** A place in words: its identity line (the Location Bible — description, architecture, layout, materials, fixed
 *  features, permanent props, entrances, camera zones; src/domain/location.ts) and the time of day. Every prompt
 *  that shows the place says the same identity, whichever picture it is given. */
export function describeLocation(l: Location, timeOfDay?: string): string {
  const parts = [describeIdentity(l), timeOfDay ? `time of day: ${timeOfDay.toLowerCase().replace('_', ' ')}` : ''].filter(Boolean);
  return parts.join('. ');
}

const LANG_TAG: Record<string, string> = { EN: 'English', AR: 'Arabic' };

/** How a speaker is named before a line: by default a two-descriptor appearance in parentheses; in a reference prompt
 *  the bound subject and its speaker id (`<Subject 1> (S1)`). Never a name. */
export type SpeakerLabel = (characterId: string) => string;
const describedSpeaker = (cast: Character[]): SpeakerLabel => (id) => { const c = cast.find((x) => x.id === id); return c ? `(${describeCharacter(c).split(',').slice(0, 2).join(',')})` : ''; };

/** The text inside a `<d>` tag: the exact line, whitespace normalised, ended by a terminal mark (the H3 skill's rule:
 *  "end statements with appropriate terminal marks before </d>"); the words are never touched. */
const spoken = (text: string) => { const t = clean(text); return /[.!?…؟!。»”"')\]]$/.test(t) ? t : `${t}.`; };

/** The language tag of one spoken line: the line's own script when it has only one (an Iraqi line written in Arabic
 *  inside an English production is `[Arabic]`, an English line inside an Arabic production `[English]`); a mixed or
 *  letterless line keeps the production's language. Found by the acceptance run 2026-10-05: shot 1.2 of "Tea at
 *  Mutanabbi" went to H3 as `<d>[English] هلا بيج عيني…</d>`. */
export function lineLanguageTag(text: string, productionLanguage: string): string {
  const arabic = /\p{Script=Arabic}/u.test(text);
  const latin = /[A-Za-zÀ-ɏ]{2,}/.test(text);
  if (arabic && !latin) return 'Arabic';
  if (latin && !arabic) return 'English';
  return LANG_TAG[productionLanguage] ?? 'English';
}

export function dialogueTags(p: Production, sh: Shot, cast: Character[], speaker: SpeakerLabel = describedSpeaker(cast), verb = ''): string {
  if (!sh.dialogue.length) return '';
  return sh.dialogue.map((d) => {
    const text = p.language === 'AR' ? (d.textAr || d.text) : d.text;
    // a line heard while its speaker is not in the picture: the voice is named as off-screen, the speaker is never
    // described (a description drew the person into the frame)
    if (isOffscreenLine(sh, d)) return `A voice from off-screen${verb ? ` ${verb}` : ''} <d>[${lineLanguageTag(text, p.language)}] ${spoken(text)}</d> (the speaker is never shown; the people in the picture listen with their mouths closed while it plays)`;
    const who = speaker(d.characterId);
    return `${who}${who && verb ? ` ${verb}` : ''} <d>[${lineLanguageTag(text, p.language)}] ${spoken(text)}</d>`.trim();
  }).join(' ');
}

/** WHEN THE LINES ARE HEARD (continuity recovery 2026-10-08, "The Relief" 1.5: "Duty calls." — a 1 s line in a clip
 *  that cannot be shorter than ~5 s — was said at 0.05 s and again at 1.8 s, the told-once rule notwithstanding): the
 *  recorded lines' windows on the clip's clock, and the silence after the last one, in the timed-beat form H3 follows.
 *  `times` in seconds of the clip. Pure (tested). */
export function lineTiming(times: Array<{ from: number; to: number }>): string {
  const t = (s: number) => `0:${Math.max(0, s).toFixed(1).padStart(4, '0')}`;
  const spans = [...times].sort((a, b) => a.from - b.from);
  const end = Math.max(...spans.map((x) => x.to));
  const said = spans.map((x) => `${t(x.from)}–${t(x.to)}`).join(', ');
  return `Timing: the ${spans.length === 1 ? 'line is' : 'lines are'} spoken at ${said} and at no other moment; from ${t(end)} to the last frame nobody speaks and every mouth stays closed.`;
}

/** What follows the lines of a speaking shot: every line is said once, and the silence around it stays silent. */
export const SAID_ONCE = 'Each line is said exactly once, in the order written; no word is repeated or added, and before and after the lines the mouths stay closed while the action goes on in silence.';

/** A line heard off-screen: marked so by the plan, or spoken by someone who is not in the shot's cast. Pure. */
export const isOffscreenLine = (sh: Pick<Shot, 'characterIds'>, d: Pick<Shot['dialogue'][number], 'characterId' | 'offscreen'>): boolean => Boolean(d.offscreen) || !sh.characterIds.includes(d.characterId);

/** Music video: the lines the shot's window covers, sung by their assigned performer (described, never named), and
 *  nobody else. Listeners are told not to mouth the words; an instrumental window says so. */
export function singingTags(p: Production, sh: Shot, cast: Character[], speaker: SpeakerLabel = describedSpeaker(cast)): string {
  if (p.kind !== 'MUSIC_VIDEO' || !p.song) return '';
  const w = shotWindows(p).get(sh.id);
  if (!w) return '';
  const perf = sh.performance ?? performanceFor(p.song, w);
  const lang = LANG_TAG[p.language] ?? 'English';
  if (!perf || perf.mode === 'INSTRUMENTAL') return 'Instrumental passage: nobody sings or mouths words.';
  const who = speaker;
  // only performers who are actually in the shot sing on camera; an assigned singer who is off screen is heard, not seen
  // THE PERFORMANCE PLAN (src/domain/music-performance.ts): the lead singers of the window carry the words, backing
  // singers harmonise softly without the lead's words, everyone else on screen keeps their lips closed
  const plan = shotPerformers(p.song, w, sh.characterIds);
  // A SINGER SEEN FROM BEHIND is never asked to sing on camera: H3 answers a sung `<d>` line on a back-turned performer by
  // cutting to their face (shot 1 of "Harbour Lights", 2026-10-10: a locked-off wide from behind became a montage of
  // close-ups). The song is heard; the performer stays as framed and does not turn.
  const away = new Set(facingAway(sh));
  const onScreen = perf.singerIds.filter((id) => sh.characterIds.includes(id) && !plan.backing.includes(id) && !away.has(id));
  const fromBehind = perf.singerIds.filter((id) => sh.characterIds.includes(id) && away.has(id)).map(who).filter(Boolean);
  const lines = sungLinesFor(p.song, w, p.language).filter((l) => onScreen.includes(l.singerId) && l.role !== 'BACKING');
  const sung = lines.map((l) => `${who(l.singerId)} sings <d>[${lang}] ${clean(p.language === 'AR' ? l.textAr || l.text : l.text)}</d>`).join(' ');
  const backing = plan.backing.filter((id) => !away.has(id)).map(who).filter(Boolean);
  const listeners = (perf.listenerIds ?? []).filter((id) => sh.characterIds.includes(id)).map(who).filter(Boolean);
  const silent = sh.characterIds.filter((id) => !perf.singerIds.includes(id) && !plan.backing.includes(id) && !(perf.listenerIds ?? []).includes(id)).map(who).filter(Boolean);
  const performing = onScreen.length ? (sung || `${onScreen.map(who).join(' and ')} performing the song, singing in sync with the music.`) : fromBehind.length ? `The song plays over the shot. ${fromBehind.join(' and ')} ${fromBehind.length === 1 ? 'is' : 'are'} seen from behind the whole time and never turn${fromBehind.length === 1 ? 's' : ''} to the camera; the singing is heard, not seen.` : 'The song continues off camera: nobody on screen sings or mouths words.';
  return [performing, backing.length ? `${backing.join(' and ')} sing${backing.length === 1 ? 's' : ''} soft backing harmonies, not the lead words.` : '', listeners.length ? `${listeners.join(' and ')} listen, lips closed.` : '', silent.length ? `${silent.join(' and ')} do not sing; their lips stay closed.` : ''].filter(Boolean).join(' ');
}

/** The planner's dialogue tags, removed: the script is the only source of spoken words, and a planner's `<d>` is a
 *  paraphrase (a take said "سأصلحه، لا تقلق" for the scripted "سأصلح هذا… لكل أحد"). Only the tag goes, with a speaker
 *  label written IMMEDIATELY before it — a parenthesised descriptor `(34-year-old woman, petite)`, `<Subject 1> (S1)`,
 *  a speech verb (`says,`) or a capitalised `Name:`. Nothing else before the tag is touched (a label never starts
 *  inside a word, and the words before a speech verb stay): the old pattern ate up to 80 characters of picture
 *  direction in front of every tag ("tall man slumps on counter …" became "tall man s"). */
export function stripDialogueTags(text: string): string {
  const start = String.raw`(?<![\p{L}\p{N}])`;
  const label = String.raw`(?:<Subject \d+>\s*)?(?:\((?:S\d+|[^()<>\n]{1,80})\)\s*)?(?:${start}(?:says|sings|asks|replies|whispers|shouts|continues)\s*[,:]?\s*|${start}\p{Lu}[\p{L}'’-]*\s*:\s*)?`;
  const re = new RegExp(String.raw`[ \t]*${label}<d>[\s\S]*?</d>[ \t]*\.?`, 'gu');
  return text.replace(re, ' ').replace(/<\/?d>/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,;:])/g, '$1').trim();
}

/** THE CAMERA, ALWAYS SAID (acceptance 2026-10-06: planned static shots pushed in under both H3 tiers — Tea 1.2 a
 *  "two-shot · static" that pushes in and loses Clara; the image engineer's static WIDE). The camera sentence was only
 *  in the body written from the shot; a shot with the planner's own prompt carried no camera move at all, and "static
 *  camera" alone did not hold. Every take now states the move, a static one as a locked-off frame that never changes. */
export function cameraDirection(sh: Pick<Shot, 'framing' | 'cameraMove'>): string {
  const framing = sh.framing.toLowerCase().replace(/_/g, ' ');
  if (sh.cameraMove === 'STATIC') return `Camera: ${framing}, locked off on a tripod: no zoom, no push-in, no pull-back, no pan, no tilt, no dolly; the framing of the first frame holds to the last frame, and the people move inside it.`;
  return `Camera: ${framing}, ${sh.cameraMove.toLowerCase().replace(/_/g, ' ')}: one smooth, steady move through the shot and no other camera movement.`;
}

/** How close a framing is, for the direction of a camera move between two framings. */
const CLOSENESS: Record<string, number> = { EXTREME_WIDE: 0, WIDE: 1, MEDIUM_WIDE: 2, MEDIUM: 3, TWO_SHOT: 3, OVER_THE_SHOULDER: 3, MEDIUM_CLOSE_UP: 4, CLOSE_UP: 5, INSERT: 6, EXTREME_CLOSE_UP: 6 };

/** A planner's text without its sentences that hold the camera still ("Camera: 50mm lens, eye-level, static two-shot.",
 *  "The camera is locked off."). Pure (tested). */
export function withoutStaticCamera(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((s) => !(/\bcamera\b/i.test(s) && /\b(static|still|locked[- ]off|tripod|fixed|holds? the framing)\b/i.test(s))).join(' ').trim();
}

/** Two framings at the same distance from the people (a medium and a two-shot). Pure. */
export const sameDistance = (a: Framing, b: Framing): boolean => a === b || (CLOSENESS[a] ?? -1) === (CLOSENESS[b] ?? -2);

/** The move that takes a continuous shot from the previous shot's framing to its own. Pure (tested). */
export const continuousMoveBetween = (from: Framing, to: Framing): 'PUSH_IN' | 'PULL_BACK' => ((CLOSENESS[to] ?? 3) > (CLOSENESS[from] ?? 3) ? 'PUSH_IN' : 'PULL_BACK');

/** THE CAMERA OF A CONTINUOUS SHOT (continuity recovery 2026-10-08, "The Relief" 1.3): told both "it continues the
 *  previous shot without a cut" (its first frames are the previous take's end, Elena alone, medium wide) and "a two-shot,
 *  locked off: the framing of the first frame holds", H3 cut inside the take to a static two-shot. A continuous shot
 *  starts where the previous one ended; a new framing is reached by ONE smooth move from there, never by a cut. Pure. */
export function continuationCamera(sh: Pick<Shot, 'framing' | 'cameraMove'>, fromFraming?: Framing): string {
  const framing = sh.framing.toLowerCase().replace(/_/g, ' ');
  const start = 'Camera: it carries on exactly where the previous shot ended (the first frames), from the same camera position, with no cut and no jump';
  // the same distance (a measured "medium" and a planned "two shot") is the same framing: the camera holds
  if (!fromFraming || sameDistance(fromFraming, sh.framing)) return `${start}; ${sh.cameraMove === 'STATIC' ? 'the framing then holds' : `then one smooth ${sh.cameraMove.toLowerCase().replace(/_/g, ' ')}`}.`;
  const closer = (CLOSENESS[sh.framing] ?? 3) > (CLOSENESS[fromFraming] ?? 3);
  return `${start}, then ${closer ? 'pushes in' : 'pulls back'} slowly and smoothly until it frames a ${framing}: one continuous camera move, never a cut.`;
}
/** The shot's middle: the planner's (or producer's) prompt with its dialogue tags stripped, else one written from the
 *  shot: setting, people by appearance, action, light. The camera is said apart (cameraDirection). */
function shotBody(sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, stripTags: boolean): string {
  const people = cast.filter((c) => sh.characterIds.includes(c.id));
  const insert = sh.framing === 'INSERT';
  // an insert stays on the detail: the whole person described (or a planner's prose naming the room) invited H3 to cut
  // to a wide of the whole man ("The Relief" 1.6, 2026-10-08)
  const stays = insert ? 'The whole shot stays on the hands and the object at this distance: no face appears, nobody else enters, and the camera never cuts away.' : '';
  if (sh.prompt?.trim()) return [stripTags ? stripDialogueTags(sh.prompt.trim()) : sh.prompt.trim(), stays].filter(Boolean).join(' ');
  return [
    loc ? `Setting: ${insert ? `inside ${clean(loc.name)}, out of focus behind the hands` : describeLocation(loc, scene?.timeOfDay)}.` : '',
    ...(insert ? people.map((c) => `The hands and sleeves of a person wearing ${clean(c.wardrobe ?? 'their clothes').replace(/\.$/, '')}.`) : people.map((c) => `A ${describeCharacter(c)}.`)),
    `Action: ${clean(sh.action).replace(/\.+$/, '')}.`,
    sh.continuity?.environment.lighting ? `Light: ${sh.continuity.environment.lighting}.` : '',
    stays,
  ].filter(Boolean).join(' ');
}

/** The full prompt for a first-frame (FL2VA) or text-only take: look + setting + people + action + camera + dialogue.
 *  The shot's own `prompt` (written by the story engine or the producer) replaces the generated middle when present;
 *  its dialogue tags are replaced by the exact script lines. */
export function takePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, opts: { includeDialogue?: boolean; /** the scene state the shot is filmed in (src/domain/scene-state.ts) */ sceneState?: SceneState; /** the production context (src/domain/production-context.ts) */ context?: ProductionContext; /** the take starts from a drawn opening frame: who stands where, holding what, is the frame's to show */ fromFrame?: boolean } = {}): string {
  const d = styleDirection(p.style);
  const dialogue = opts.includeDialogue === false ? '' : p.kind === 'MUSIC_VIDEO' ? singingTags(p, sh, cast) : dialogueTags(p, sh, cast);
  const body = shotBody(sh, cast, loc, scene, opts.includeDialogue !== false);
  const described = (id: string) => { const c = cast.find((x) => x.id === id); return !c ? undefined : sh.framing === 'INSERT' ? 'the person whose hands are in the frame' : `the ${describeCharacter(c).split(',').slice(0, 2).join(',')}`; };
  const state = opts.sceneState ? sceneStateLine(opts.sceneState, described, { environmentOnly: Boolean(opts.fromFrame) }) : '';
  const context = opts.context ? contextLines(opts.context, described, contextOptions(sh, cast, Boolean(opts.fromFrame))) : '';
  return [d.visual + '.', body, cameraDirection(sh), state, context, dialogue, d.avoid].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** What the context lines may say in this shot (src/domain/production-context.ts ContextLineOptions): from a frame,
 *  the frame shows the start; an insert is hands and an object; a constraint naming someone outside the shot belongs to
 *  another shot. */
export function contextOptions(sh: Pick<Shot, 'framing' | 'characterIds'>, cast: Character[], fromFrame: boolean) {
  return { fromFrame, insert: sh.framing === 'INSERT', absentNames: cast.filter((c) => !sh.characterIds.includes(c.id)).flatMap((c) => nameForms(c, cast)) };
}

// -------------------------------------------------------------------------------- MiniMax H3 reference grammar

/** What the reference graph is given, in connection order, and how the prompt names it. Pictures are numbered by the
 *  tokenizer in the order they are connected (`<Picture i>: ` before each one, comfy/text_encoders/minimax.py); a
 *  `<Subject k>` is plain text the prompt defines in `subject_definitions:` (the installed multiframe template and
 *  MiniMax-H3 skills/h3-prompt-writing references/ref-en.txt). Subject k is Picture k: characters first (their
 *  canonical front full-body image), then the place (its plate). A shot-specific production asset (the drawn opening
 *  frame) is a picture but never a subject — it is not an identity. */
export interface H3Binding {
  /** LOCAL: `<Picture i>` / `<Audio j>` (ComfyUI node); HOSTED: `Image i` / `Audio j` (hosted node tooltips; UNTESTED, no key) */
  labels: 'LOCAL' | 'HOSTED';
  /** the characters bound to pictures, in connection order (Subject k ↔ Picture k) */
  subjects: Array<{ characterId: string; picture: number }>;
  location?: { picture: number };
  /** "establish here" (src/domain/types.ts Scene.establishLocation): the place has no plate yet and is declared from
   *  its identity line alone — this take's first frame becomes its plate */
  describedLocation?: boolean;
  /** what the clip starts from: the drawn opening frame (as a picture and/or anchored at frame 0), or the previous
   *  take's tail anchored at frame 0 (a continuation), or nothing */
  opening?: { kind: 'FRAME'; picture?: number } | { kind: 'TAIL'; seconds: number };
  /** an ending frame anchored at the last frame */
  ending?: boolean;
  /** voice-timbre clips connected as reference audio, in order (`<Audio j>` ↔ the j-th) */
  audioRefs?: Array<{ characterId: string }>;
  /** characters in the shot with no picture (no canonical image, or beyond the budget): declared from their
   *  description as weak_reference subjects after the pictured ones, so nobody silently vanishes or appears unbound */
  described?: Array<{ characterId: string }>;
  /** a close crop of a pictured character's face, derived from their canonical image (src/domain/face-reference.ts):
   *  the same subject, never a subject of its own */
  faceRefs?: Array<{ characterId: string; picture: number }>;
}

export type ShotRelationKind = 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION';

const pictureLabel = (b: H3Binding, i: number) => (b.labels === 'LOCAL' ? `<Picture ${i}>` : `Image ${i}`);
const audioLabel = (b: H3Binding, j: number) => (b.labels === 'LOCAL' ? `<Audio ${j}>` : `Audio ${j}`);

/** Speaker ids in the order of the vocal events (the skill: "Assign (Sx) once according to the order of actual vocal
 *  events in the target video"). */
export function speakerIds(p: Production, sh: Shot): Map<string, number> {
  const order: string[] = [];
  if (p.kind === 'MUSIC_VIDEO') { for (const id of sh.performance?.singerIds ?? []) if (sh.characterIds.includes(id) && !order.includes(id)) order.push(id); }
  else for (const d of sh.dialogue) if (!order.includes(d.characterId)) order.push(d.characterId);
  return new Map(order.map((id, i) => [id, i + 1]));
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** `fromFrame`: the clip starts from a drawn frame or the previous take's tail, which already shows where each person
 *  stands, which way they face and how they start: those words are left out. Said again, they contradicted the frame and
 *  H3 cut inside the take to match them (continuity recovery 2026-10-08, "The Relief" 1.4: "is center, faces screen
 *  left" over a frame with her on the right; the take jumped to a centred close-up at 0.46 s). */
function continuitySentence(sh: Shot, cast: Character[], subjectOf: (id: string) => string | undefined, body = '', opts: { fromFrame?: boolean } = {}): string {
  const c = sh.continuity;
  if (!c) return '';
  // only the people in the shot: a continuity entry left over from a cast edit was described in words and drawn as a
  // stranger ("The Relief" 1.6, Elena taken out of the insert)
  const parts = c.characters.filter((x) => !sh.characterIds || sh.characterIds.includes(x.characterId)).map((x) => {
    const who = subjectOf(x.characterId) ?? (cast.find((k) => k.id === x.characterId) ? `(${describeCharacter(cast.find((k) => k.id === x.characterId)!).split(',').slice(0, 2).join(',')})` : '');
    if (!who) return '';
    // no "wears": a character's wardrobe is its canonical image; the planner's words for it ("tweed jacket" for a man in
    // a cardigan) drew a third person into a two-shot (D30)
    // HOW THEY ARE IN THIS MOMENT, said, never left to the reference picture: the planner's emotion, condition and
    // starting pose were dropped here, and the frames copied the canonical portrait's smile into a strained, soaked
    // climb (2026-10-08, "The Last Crossing" 1.1–1.2). Wardrobe stays the canonical image's (D30); a state such as
    // "soaked" arrives through the condition.
    const pose = poseWithoutSpeech(x.startPose || x.pose || '', (sh.dialogue ?? []).some((d) => d.characterId === x.characterId));
    const placed = !opts.fromFrame;
    const bits = [placed && pose && clean(pose).toLowerCase(), placed && x.position && `is ${clean(x.position)}`, placed && x.screenDirection && x.screenDirection !== 'NEUTRAL' && `faces ${x.screenDirection === 'TOWARD' ? 'the camera' : x.screenDirection === 'AWAY' ? 'away from the camera' : `screen ${x.screenDirection.toLowerCase()}`}`, x.eyeline && `looks ${clean(x.eyeline).replace(/^at\b/, 'at')}`, x.holding?.length && `holds ${x.holding.map(clean).join(' and ')}`, x.emotion && `with a ${clean(x.emotion).toLowerCase()} expression`, x.condition && `${clean(x.condition).toLowerCase()}`].filter(Boolean);
    return bits.length ? `${who} ${bits.join(', ')}.` : '';
  }).filter(Boolean);
  const props = c.props.filter((x) => x.position || x.state).map((x) => `${clean(x.name)}${x.state ? ` (${clean(x.state)})` : ''}${x.position ? ` ${clean(x.position)}` : ''}`);
  const light = c.environment.lighting && !body.includes(clean(c.environment.lighting)) ? `Light: ${clean(c.environment.lighting)}.` : '';
  return [parts.join(' '), props.length ? `Props: ${props.join('; ')}.` : '', light].filter(Boolean).join(' ');
}

/** THE MOMENT'S STATE, AS AN EDIT (2026-10-08 frame lab, "The Last Crossing" 1.2): composed from the canonical portrait,
 *  a frame keeps the portrait's expression whatever the prompt says (three prompt variants, all smiling); one edit pass
 *  on the drawn frame, with that frame as the only picture, changes the expression and condition and keeps the rest
 *  (SFace 0.44–0.47 against the canonical image: the same person; the strained face itself lowers it). The instruction
 *  for one person's emotion and condition, or undefined when the moment names neither. Pure (tested). */
export function momentEditPrompt(x: { emotion?: string; condition?: string } | undefined, keep?: string): string | undefined {
  const emotion = clean(x?.emotion ?? '').toLowerCase();
  const condition = clean(x?.condition ?? '').toLowerCase();
  if (!emotion && !condition) return undefined;
  const parts = [emotion && `the expression becomes ${emotion}`, condition && `the person is ${condition}, and it shows on the face, hair and clothes`].filter(Boolean);
  // the person's OWN hair and facial hair named (`keep`, from the design record): "the same facial hair" still shaved
  // the beard (SFace 0.44); "Close-cropped black hair with silver greying…; a neatly trimmed short beard" kept it
  // (SFace 0.52, PASS — frame lab 2026-10-08)
  const own = clean(keep ?? '').replace(/[.;\s]+$/, '');
  return `Edit this picture. Change only the person's face and condition: ${parts.join('; ')}. Keep everything else exactly as it is: ${own ? `${own}; ` : ''}the same person and face shape, the same facial hair and hair colour, every mark on the face, the same clothes, place, framing, light and colours.`;
}

/** What of a person's look an expression edit must not touch: their hair and their facial hair, in the design
 *  record's own words (the face description's beard/moustache clause only — never its expression words). Pure. */
export function identityKeepOf(c: Pick<Character, 'hair' | 'face'>): string {
  const facial = (c.face ?? '').split(/[,;]/).map((s) => s.trim()).find((s) => /\b(beard|moustache|mustache|stubble|goatee|clean-shaven|sideburns)\b/i.test(s));
  return [clean(c.hair ?? '').replace(/[.]+$/, ''), facial].filter(Boolean).join('; ');
}

/** The continuity of a storyboard frame: each person named by the reference picture that shows them ("the person of
 *  image 2"), never described a second time in words; `peopleToo: false` keeps only props and light (the previous
 *  shot's state carried into a CUT — its people at other places drew duplicates, D30). */
export const frameContinuityLine = (sh: Shot, cast: Character[], imageOf: Map<string, number>, opts: { peopleToo?: boolean } = {}): string =>
  continuitySentence(sh, cast, (id) => (opts.peopleToo === false ? '' : imageOf.has(id) ? `the person of image ${imageOf.get(id)}` : ''));

/** THE REFERENCE PROMPT (Ref2VA) — the six sections MiniMax H3's reference checkpoint was trained on, in order:
 *  subject_definitions, summary (with its task type), retention_analysis, detailed_description, overall_soundscape,
 *  non_diegetic_music. Every connected picture is named; each character's canonical image is bound to a subject, the
 *  plate to the place; dialogue is `<Subject k> (Sx) says, <d>[Language] exact line.</d>`; people are described by
 *  appearance, never by name. */
/** Cast names in a planner's or producer's text, replaced by the bound subject (`<Subject k>`) or the described
 *  person: people are never named in a prompt (the lint's `no-names` rule), and a bound subject keeps its identity. */
export function bindNames(text: string, cast: Character[], subjectOf: (id: string) => string | undefined): string {
  let out = text;
  // every form of every name, longest first (the full name before the given name it starts with)
  const forms = cast.flatMap((c) => nameForms(c, cast).map((name) => ({ c, name }))).sort((x, y) => y.name.length - x.name.length);
  for (const { c, name } of forms) {
    const who = subjectOf(c.id) ?? `the ${describeCharacter(c).split(',').slice(0, 2).join(',')}`;
    out = out.replace(new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'gu'), `$1${who}`);
  }
  return out;
}

/** The ways a text names a character: the full name, the Arabic name, and the given name alone ("Clara" for "Clara
 *  Hughes": acceptance 2026-10-06, a G13 action "Clara lifts the glass" reached H3 as "clara lifts…") when no other
 *  cast member shares it. */
export function nameForms(c: Pick<Character, 'id' | 'name' | 'nameAr'>, cast: Array<Pick<Character, 'id' | 'name'>>): string[] {
  const forms = [c.name, c.nameAr].filter((n): n is string => Boolean(n && n.trim().length > 1)).map((n) => n.trim());
  const words = c.name.trim().split(/\s+/);
  // a kunya or a title is not a given name ("Abu Haidar", "Umm Salam", "Dr Moss")
  const particle = /^(abu|abou|umm|um|al|el|bin|ibn|mr|mrs|ms|miss|dr|sir|lady|lord|uncle|aunt|sheikh|hajji?)\.?$/i;
  const given = words.length > 1 && words[0].length >= 3 && !particle.test(words[0]) ? words[0] : undefined;
  if (given && !cast.some((o) => o.id !== c.id && o.name.trim().split(/\s+/)[0] === given)) forms.push(given);
  return [...new Set(forms)];
}

/** THE LAST NAME PASS (acceptance 2026-10-05, open item 2: "character names leak into H3 prompts; the app only
 *  warns"). A producer's own prompt, a planner body or a carried continuity note can still name a person; the whole
 *  prompt is bound once more before it is linted — outside the spoken `<d>…</d>` lines, whose words are the script
 *  and are never rewritten (a line may say a name aloud). Returns the prompt and the names it replaced. */
export function bindNamesOutsideDialogue(prompt: string, cast: Character[], subjectOf: (id: string) => string | undefined): { prompt: string; replaced: string[] } {
  const replaced = new Set<string>();
  const parts = prompt.split(/(<d>[\s\S]*?<\/d>)/g);
  const out = parts.map((part) => {
    if (part.startsWith('<d>')) return part;
    const bound = bindNames(part, cast, subjectOf);
    if (bound !== part) for (const c of cast) for (const n of nameForms(c, cast)) if (new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u').test(part)) replaced.add(n);
    return bound;
  }).join('');
  return { prompt: out, replaced: [...replaced] };
}

export function h3ReferencePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string; entryState?: string } | undefined, b: H3Binding, opts: { relation: ShotRelationKind; includeDialogue?: boolean; body?: string; /** every place of the world, to name the place an in-take cut goes to */ locations?: Location[]; /** the scene state the shot is filmed in (src/domain/scene-state.ts), written after the shot's own continuity */ sceneState?: SceneState; /** the production context (src/domain/production-context.ts): condition, emotion, interaction, start → end pose, motion, persistent changes, constraints */ context?: ProductionContext; /** the previous shot's framing: a continuous shot reaches its own framing by a move from it */ previousFraming?: Framing; /** the recorded lines' windows on the clip's clock (seconds): said at those moments only */ lineTimes?: Array<{ from: number; to: number }> } = { relation: 'CUT' }): string {
  const d = styleDirection(p.style);
  const ids = speakerIds(p, sh);
  // SUBJECT NUMBERING: the pictured characters (Subject k = Picture k), the place, then the characters declared from
  // their description (no picture), then the extras — every person in the shot is a subject, pictured or not
  const subjectNo = new Map(b.subjects.map((s, i) => [s.characterId, i + 1]));
  // the place is a subject with its plate as its picture, or (establishing it) from its identity line alone
  const placeDescribed = Boolean(!b.location && b.describedLocation && loc);
  const placeNo = b.location || placeDescribed ? b.subjects.length + 1 : undefined;
  const described = (b.described ?? []).filter((x) => !subjectNo.has(x.characterId) && cast.some((c) => c.id === x.characterId) && sh.characterIds.includes(x.characterId));
  let next = b.subjects.length + (placeNo ? 1 : 0);
  for (const x of described) subjectNo.set(x.characterId, ++next);
  const extras = sh.staging?.extras ?? [];
  const extraNo = extras.map(() => ++next);
  const subjectOf = (id: string) => { const k = subjectNo.get(id); if (!k) return undefined; const s = ids.get(id); return `<Subject ${k}>${s ? ` (S${s})` : ''}`; };
  const speaker: SpeakerLabel = (id) => subjectOf(id) ?? describedSpeaker(cast)(id);
  const plainSubject = (id: string) => { const k = subjectNo.get(id); return k ? `<Subject ${k}>` : undefined; };
  const bind = (text: string) => bindNames(text, cast, plainSubject);
  const tasks: string[] = [];
  const anchored = Boolean(b.opening || b.ending);
  if (anchored) tasks.push('keyframe completion');
  tasks.push('reference generation');
  if (b.audioRefs?.length) tasks.push('audio reference');
  // THE SHOTS INSIDE THE TAKE (an in-take hard cut, `[Shot N] At MM:SS.mmm`): only on the local engine, whose prompt
  // grammar was trained on them; the hosted request keeps the beats as point marks
  const beats = sh.staging?.beats ?? [];
  const cutsAllowed = b.labels === 'LOCAL';
  const shotNoOfBeat: number[] = []; let shotCount = 1;
  for (const bt of beats) { if (bt.cut && cutsAllowed && bt.at > 0) shotCount++; shotNoOfBeat.push(shotCount); }
  const shotTags = Array.from({ length: shotCount }, (_, i) => `[Shot ${i + 1}]`).join(', ');
  const pov = sh.staging?.pov && subjectNo.has(sh.staging.pov) ? sh.staging.pov : undefined;
  // subject_definitions
  const defs: string[] = [];
  for (const [i, s] of b.subjects.entries()) {
    const c = cast.find((x) => x.id === s.characterId);
    if (!c) continue;
    // every scar is described healed (src/domain/scars.ts): "The Relief" 1.8 drew fresh cuts on both faces from the
    // stored "A small, healed scar on his left eyebrow"
    const [first, ...rest] = describeCharacter(c).split(', ').map(healedMark);
    defs.push(`<Subject ${i + 1}> is the ${first} in ${pictureLabel(b, s.picture)}${rest.length ? `, featuring ${rest.join(', ')}` : ''}.`);
  }
  // THE PLACE'S IDENTITY LINE (the Location Bible, src/domain/location.ts) rides with the plate on every shot: the
  // same words for the same place, whichever plate or established frame the picture is
  if (loc && placeNo) {
    const identity = locationIdentity(loc);
    const kind = loc.kind === 'INTERIOR' ? 'interior' : 'exterior';
    if (b.location) defs.push(`<Subject ${placeNo}> is the ${kind} environment in ${pictureLabel(b, b.location.picture)}${identity.line ? `, featuring ${identity.line}` : ''} (place identity v${identity.version}).`);
    else defs.push(`<Subject ${placeNo}> is the ${kind} environment${identity.line ? `: ${identity.line}` : ''} (place identity v${identity.version}); no reference picture: this shot establishes the place, exactly as described, the same architecture in every frame.`);
  }
  // a derived face crop is the SAME subject seen close (never a new person): its picture is defined, the subject is not
  const faceRefs = (b.faceRefs ?? []).filter((f) => b.subjects.some((s) => s.characterId === f.characterId));
  for (const f of faceRefs) {
    const s = b.subjects.find((x) => x.characterId === f.characterId)!;
    defs.push(`${pictureLabel(b, f.picture)} is a close-up of the face of <Subject ${subjectNo.get(f.characterId)}>, cut from ${pictureLabel(b, s.picture)}: the same person, not another one.`);
  }
  // a character without a picture is declared from the description alone (never silently dropped, never unbound)
  for (const x of described) {
    const c = cast.find((k) => k.id === x.characterId)!;
    const [first, ...rest] = describeCharacter(c).split(', ');
    defs.push(`<Subject ${subjectNo.get(c.id)}> is the ${first}${rest.length ? `, ${rest.join(', ')}` : ''}; no reference picture: render them from this description alone, the same person in every frame.`);
  }
  // crowds and extras are described, never referenced: each one a separate individual, none wearing a cast member's face
  const pictured = b.subjects.map((s) => `<Subject ${subjectNo.get(s.characterId)}>`);
  // in a music video nobody but the performers sings: an extra who mouths the lyrics reads as a random singer (§8)
  const extrasSilent = p.kind === 'MUSIC_VIDEO' ? '; their lips stay closed: they never sing or mouth the lyrics' : '';
  extras.forEach((e, i) => defs.push(`<Subject ${extraNo[i]}> is the group of ${e.count ? `${e.count} ` : ''}${clean(e.description)}; each one a separate individual with their own face, hair and clothes${pictured.length ? `, none of them sharing the face, hair or clothes of ${pictured.join(' or ')}` : ''}${extrasSilent}; no reference picture.`));
  const action = lowerFirst(clean(bind(sh.action)).replace(/\.$/, ''));
  if (b.opening?.kind === 'FRAME' && b.opening.picture) defs.push(`${pictureLabel(b, b.opening.picture)} is the first frame of [Shot 1], showing how ${action}.`);
  (b.audioRefs ?? []).forEach((a, j) => { const who = subjectOf(a.characterId); if (who) defs.push(`${audioLabel(b, j + 1)} is the voice-timbre reference for ${who}.`); });
  // summary
  const cast2 = [...b.subjects.map((s) => `<Subject ${subjectNo.get(s.characterId)}>`), ...described.map((x) => `<Subject ${subjectNo.get(x.characterId)}>`)].filter((tag) => !pov || tag !== `<Subject ${subjectNo.get(pov)}>`);
  const where = placeNo ? ` in <Subject ${placeNo}>` : '';
  // THE BOUNDARY (src/domain/types.ts ShotBoundary): a continuous shot continues the anchored tail; a cut is a new
  // camera on the same moment (same people, place and state); a transition opens a new place or time from the
  // destination's references and the story state there — nothing of the previous shot
  const storyState = scene?.entryState?.trim() ? ` ${bindNames(clean(scene.entryState), cast, plainSubject).replace(/\.?$/, '.')}` : '';
  const relationLine = opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL'
    ? `It continues the previous shot without a cut: the first ${b.opening.seconds.toFixed(1)} seconds are the end of the previous shot, anchored on the timeline, and the action carries on from there.`
    : b.opening?.kind === 'FRAME' ? `It begins from ${b.opening.picture ? pictureLabel(b, b.opening.picture) : 'the anchored opening frame'}${opts.relation === 'CUT' ? ', a new camera angle on the same moment as the previous shot' : opts.relation === 'STORY_TRANSITION' ? `, the opening of a new scene.${storyState}` : ''}.`.replace(/\.\.$/, '.')
    : opts.relation === 'CUT' ? 'It is a new camera setup on the same moment as the previous shot: the same people, the same place, the same story state; only the camera changes.'
    : opts.relation === 'STORY_TRANSITION' ? `It opens a new scene${placeNo ? ` in <Subject ${placeNo}>` : ''}${scene?.timeOfDay ? ` at ${scene.timeOfDay.toLowerCase().replace('_', ' ')}` : ''}; nothing continues from the previous shot.${storyState}` : '';
  const pace = sh.staging?.pace === 'DWELL' ? ' One continuous moment held in one framing, no cuts.' : sh.staging?.pace === 'MONTAGE' ? ' A run of distinct actions, each one complete before the next.' : '';
  const continuing = opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL';
  const still = continuing ? (opts.previousFraming && !sameDistance(opts.previousFraming, sh.framing) ?` The camera then moves, without a cut, to a ${sh.framing.toLowerCase().replace(/_/g, ' ')}.` : '') : sh.cameraMove === 'STATIC' && shotCount <= 1 ? ' The camera is locked off: the framing never changes.' : '';
  const hardCuts = shotCount > 1 ? ` The take holds ${shotCount} shots; every shot change is a hard cut: no dissolve, no fade, no on-screen text.` : '';
  const summary = `[${tasks.join(' + ')}] The target video shows ${cast2.length ? cast2.join(' and ') : 'the scene'}${where}: ${action}. ${relationLine}${pace}${still}${hardCuts}`.trim();
  // retention_analysis (every subject appears in every shot of the take)
  const ret: string[] = [];
  // THE STORY'S CHANGES TO A PERSON (src/domain/production-context.ts): a wardrobe change the story made is not the
  // canonical image's clothes (the face and body still are); a lasting condition shows on top of the likeness
  const stateOf = (id: string) => opts.context?.characters.find((x) => x.characterId === id);
  for (const [i, s] of b.subjects.entries()) {
    if (s.characterId === pov) { ret.push(`<Subject ${i + 1}> (appears in ${shotTags}): weak_reference - the camera is their own eyes; they are never seen in frame.`); continue; }
    const st = stateOf(s.characterId);
    const condition = (st?.condition ?? []).map((k) => k.text?.replace(/\.$/, '')).filter(Boolean);
    const now = condition.length ? `; as the story has them now: ${condition.join(' and ')}` : '';
    if (st?.wardrobeChange?.text) {
      ret.push(`<Subject ${i + 1}> (appears in ${shotTags}): fully_preserved - the face, hair, skin tone and build of ${pictureLabel(b, s.picture)} are kept exactly${now}.`);
      ret.push(`<Subject ${i + 1}>'s clothes: attribute_transfer - not the clothes of ${pictureLabel(b, s.picture)}: ${st.wardrobeChange.text.replace(/\.$/, '')}.`);
    } else if (sh.framing === 'INSERT') {
      // AN INSERT SHOWS HANDS, NOT A PERSON ("The Relief" 1.6): "fully_preserved - the face, hair … build" sent H3 to a
      // wide of the whole man, with a stranger, and back — three cuts in a take of his hands
      ret.push(`<Subject ${i + 1}> (appears in ${shotTags}): partially_preserved - only the hands, the skin tone and the sleeves of ${pictureLabel(b, s.picture)} appear; the face, head and body stay out of frame for the whole shot${now}.`);
    } else if (b.opening?.kind === 'FRAME' || continuing) {
      // CANONICAL IDENTITY ≠ THE MOMENT'S APPEARANCE (directive 2026-10-08 item 12; scripts/identity-drift.ts: in 5 of 12
      // one-person takes from an edited opening frame the face moved off the frame toward the canonical portrait, told
      // to keep the picture's "face, hair … and wardrobe exactly"): the canonical picture holds WHO they are, the opening
      // frame — or, continuing, the anchored end of the previous shot — holds HOW they are now: hair's state, the clothes'
      // condition, the expression, the pose and WHICH WAY THEY FACE ("The Relief" 1.8, twice: the tail showed them in
      // profile facing the glass, the frontal canonical pictures were to be "kept exactly", and H3 cut at 1.9 s to a
      // frontal two-shot that matched the pictures)
      const anchor = continuing ? 'the anchored first frames (the end of the previous shot)' : `the opening frame${b.opening?.kind === 'FRAME' && b.opening.picture ? ` (${pictureLabel(b, b.opening.picture)})` : ''}`;
      ret.push(`<Subject ${i + 1}> (appears in ${shotTags}): fully_preserved - who they are: the facial features, eyes, skin tone and build of ${pictureLabel(b, s.picture)} are kept exactly; how they are now — the state of the hair, the condition of the clothes (wet, dry, torn, marked), the expression, the pose and which way they face — is as in ${anchor} and holds through the shot; they are not turned to the camera to match ${pictureLabel(b, s.picture)}${now}.`);
    } else ret.push(`<Subject ${i + 1}> (appears in ${shotTags}): fully_preserved - the face, hair, skin tone, build and wardrobe of ${pictureLabel(b, s.picture)} are kept exactly${now}.`);
  }
  if (sh.framing === 'INSERT') ret.push('The whole shot stays on the hands and the object at this distance: no face appears, nobody else enters, and the camera never cuts away.');
  for (const f of faceRefs) ret.push(`${pictureLabel(b, f.picture)} (the face of <Subject ${subjectNo.get(f.characterId)}>): fully_preserved - the facial features, skin tone, eyes and hair of <Subject ${subjectNo.get(f.characterId)}> are kept exactly as in ${pictureLabel(b, f.picture)}; the expression follows the action.`);
  if (b.location && placeNo) ret.push(`<Subject ${placeNo}> (appears in ${shotTags}): partially_preserved - the architecture, layout, materials and fixed props of ${pictureLabel(b, b.location.picture)} are kept; the camera position and framing may differ.`);
  else if (placeNo) ret.push(`<Subject ${placeNo}> (appears in ${shotTags}): weak_reference - described, no picture; the same architecture, layout and fixed features in every frame of the take.`);
  for (const x of described) ret.push(`<Subject ${subjectNo.get(x.characterId)}> (appears in ${shotTags}): weak_reference - ${x.characterId === pov ? 'the camera is their own eyes; they are never seen in frame' : 'described, no picture; the same face, hair and clothes in every frame of the take'}.`);
  extras.forEach((_e, i) => ret.push(`<Subject ${extraNo[i]}> (appears in ${shotTags}): weak_reference - distinct extras, never a cast member's likeness.`));
  if (b.opening?.kind === 'FRAME' && b.opening.picture) ret.push(`${pictureLabel(b, b.opening.picture)} ([Shot 1] first frame): fully_preserved - the video starts exactly from ${pictureLabel(b, b.opening.picture)}'s framing, positions, background and light; where the people stand and what is behind them is what it shows.`);
  (b.audioRefs ?? []).forEach((a, j) => { if (subjectOf(a.characterId)) ret.push(`${audioLabel(b, j + 1)}: reference - guides the voice timbre of ${subjectOf(a.characterId)} without copying the original signal.`); });
  // detailed_description
  const includeDialogue = opts.includeDialogue !== false;
  // a shot without lines says so: continuing from a speaking tail, H3 otherwise invents new words (C1,
  // docs/evidence/minimax-p1: "Talk with her, Patrick. Do you need her?" in a shot with no dialogue) — and its words
  // carry no speech verb either (src/server/story/beats.ts scrubSpeech)
  const silent = includeDialogue && p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length === 0;
  const quiet = (s: string) => (silent ? scrubSpeech(s).replace(/\s*Mouths stay closed; nobody speaks\.$/, '') : s);
  // the planner's own direction (tags stripped), else a body that leans on the bindings: the people and the place are
  // defined above, so the middle is the action, the camera and the light
  // FROM A DRAWN FRAME the frame is the setting: the planner's own scene prose ("… gestures toward the door behind
  // her", over a frame with the lens behind her) drew H3 away from the frame three times ("The Relief" 1.4) — the
  // action alone
  const framed = b.opening?.kind === 'FRAME' && !opts.body;
  const written = quiet(bind(opts.body ?? (sh.prompt?.trim() && !framed ? shotBody(sh, cast, loc, scene, includeDialogue) : `${cast2.length ? cast2.join(' and ') : 'The scene'}${where}: ${action}.`)));
  // a continuous shot's camera is the continuation's (continuationCamera): the planner's own "static two-shot" camera
  // sentence would contradict it again
  const body = continuing && !opts.body ? withoutStaticCamera(written) : written;
  // a take of several shots (in-take hard cuts) holds the camera still inside each shot, not across the cuts
  const camera = continuing ? continuationCamera(sh, opts.previousFraming) : shotCount > 1 && sh.cameraMove === 'STATIC' ? `Camera: ${sh.framing.toLowerCase().replace(/_/g, ' ')}, locked off inside each shot: no zoom, no push-in, no pan between the cuts.` : cameraDirection(sh);
  // A CLOSE SHOT WITHOUT AN OPENING FRAME (acceptance 2026-10-06, G13 shot 1: a planned medium close-up opened on the
  // plate's wide view and pushed in for a second to reach it): the first frame is already at the shot's framing, the
  // place's picture gives its look, never its framing
  const fromFrame = b.opening?.kind === 'FRAME' || (opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL');
  const closer = b.location && !fromFrame && !PLATE_WIDE_FRAMINGS.includes(sh.framing) ? `From its very first frame the shot is a ${sh.framing.toLowerCase().replace(/_/g, ' ')}: the camera is much closer than in ${pictureLabel(b, b.location.picture)}, whose look is kept, not its framing.` : '';
  const opening = opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL' ? 'The shot continues from the anchored end of the previous shot, same camera setup, same positions, same light; from there:' : b.opening?.kind === 'FRAME' ? `The shot begins from ${b.opening.picture ? pictureLabel(b, b.opening.picture) : 'the anchored opening frame'}.` : '';
  const povLine = pov ? `The camera is <Subject ${subjectNo.get(pov)}>'s own eyes: what they see fills the frame, and they are never seen.` : '';
  const cont = continuitySentence(sh, cast, subjectOf, body, { fromFrame });
  // THE SCENE STATE (src/domain/scene-state.ts): the carried facts — time of day, weather, light, the place as the
  // story left it, what people hold, the props — after the shot's own continuity; nothing the body already says
  // from an opening frame, the frame shows the people and props: only the environment is carried in words
  const stateLine = opts.sceneState ? sceneStateLine(opts.sceneState, plainSubject, { environmentOnly: fromFrame }).split(/(?<=\.)\s+/).filter((s) => !cont.includes(s.replace(/^Scene state \([^)]*\): /, '').replace(/\.$/, ''))).join(' ') : '';
  // EACH LINE ONCE (continuity recovery 2026-10-08, "The Relief" 1.4: "Radio's dead. Had to row." in a 7 s shot was
  // heard as "… Had to row. Had to row." — H3 filled the silence by saying it again, as "The Last Crossing" 2.3 did)
  const lines = !includeDialogue ? '' : p.kind === 'MUSIC_VIDEO' ? singingTags(p, sh, cast, speaker) : silent ? 'Nobody speaks in this shot; mouths stay closed.' : `${dialogueTags(p, sh, cast, speaker, 'says,')} ${SAID_ONCE}${opts.lineTimes?.length ? ` ${lineTiming(opts.lineTimes)}` : ''}`;
  // THE TIMED BEATS: `[M:SS]` point marks inside a shot (never read as cuts); a beat with a cut opens the next
  // `[Shot N] At MM:SS.mmm, hard cut to …`
  const marks: string[] = [];
  beats.forEach((bt, i) => {
    const text = quiet(bind(clean(bt.action))).replace(/\.?$/, '.');
    if (bt.cut && cutsAllowed && bt.at > 0 && shotNoOfBeat[i] > (shotNoOfBeat[i - 1] ?? 1)) {
      const place = bt.cut.locationId && bt.cut.locationId !== loc?.id ? opts.locations?.find((l) => l.id === bt.cut!.locationId) : undefined;
      marks.push(`[Shot ${shotNoOfBeat[i]}] At ${cutTime(bt.at)}, hard cut to ${clean(bt.cut.camera)}${place ? ` in ${clean(place.description) || place.name}` : placeNo ? ` in <Subject ${placeNo}>` : ''}. ${text}`);
    } else marks.push(`[${markTime(bt.at)}] ${text}`);
  });
  // THE PRODUCTION CONTEXT (src/domain/production-context.ts): what persists about the people and the place
  const contextLine = opts.context ? contextLines(opts.context, plainSubject, contextOptions(sh, cast, fromFrame)) : '';
  const scarred = hasHealedScar(b.subjects.flatMap((s) => { const c = cast.find((x) => x.id === s.characterId); return c ? [...(c.distinguishing ?? []), c.face] : []; }));
  const noWounds = scarred ? 'Every scar stays an old, healed scar: no fresh wound, no cut, no blood, no red scratch on any face.' : '';
  const detailed = [`${d.visual}.`, '[Shot 1]', opening, povLine, body, camera, closer, cont, stateLine, contextLine, ...marks, lines, b.ending ? 'The shot ends on the anchored ending frame.' : '', noWounds, d.avoid].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // sound
  const soundscape = p.kind === 'MUSIC_VIDEO' ? 'The song carries the shot; quiet room tone under it.' : `${loc ? `${loc.kind === 'INTERIOR' ? 'Indoor' : 'Outdoor'} ambience of the place${scene?.timeOfDay ? ` at ${scene.timeOfDay.toLowerCase().replace('_', ' ')}` : ''}` : 'Natural ambience'}${sh.dialogue.length ? '; the spoken lines are clear and close' : silent ? '; no dialogue and no voices' : ''}.`;
  return [
    'subject_definitions:', ...defs, '',
    'summary:', summary, '',
    'retention_analysis:', ...ret, '',
    'detailed_description:', detailed, '',
    'overall_soundscape:', soundscape, '',
    'non_diegetic_music:', 'N/A',
  ].join('\n');
}

export interface PromptLint { ok: boolean; checks: Array<{ rule: string; ok: boolean; hard: boolean; detail?: string }> }

/** PROMPT LINT before submission: every connected picture and audio is named; no tag names media that is not
 *  connected; every `<Subject k>` used is defined; every script line is present verbatim, once; the dialogue tags are
 *  balanced; no cast name appears (people are described, never named — a soft check); the hosted limit is 7000
 *  characters. A hard failure is a builder bug or a broken producer prompt, refused as PROMPT_AMBIGUITY. */
export function lintH3Prompt(prompt: string, expect: { labels: 'LOCAL' | 'HOSTED'; pictures: number; audios: number; lines: string[]; names?: string[] }): PromptLint {
  const checks: PromptLint['checks'] = [];
  const add = (rule: string, ok: boolean, hard: boolean, detail?: string) => checks.push({ rule, ok, hard, detail });
  const local = expect.labels === 'LOCAL';
  const pics = [...prompt.matchAll(local ? /<Picture (\d+)>/g : /\bImage (\d+)\b/g)].map((m) => Number(m[1]));
  const auds = [...prompt.matchAll(local ? /<Audio (\d+)>/g : /\bAudio (\d+)\b/g)].map((m) => Number(m[1]));
  const unknownPics = [...new Set(pics.filter((n) => n < 1 || n > expect.pictures))];
  add('picture-tags-connected', unknownPics.length === 0, true, unknownPics.length ? `names picture(s) ${unknownPics.join(', ')} of ${expect.pictures} connected` : undefined);
  const unnamedPics = Array.from({ length: expect.pictures }, (_, i) => i + 1).filter((n) => !pics.includes(n));
  add('every-picture-named', unnamedPics.length === 0, true, unnamedPics.length ? `picture(s) ${unnamedPics.join(', ')} connected but never named` : undefined);
  const unknownAud = [...new Set(auds.filter((n) => n < 1 || n > expect.audios))];
  add('audio-tags-connected', unknownAud.length === 0, true, unknownAud.length ? `names audio ${unknownAud.join(', ')} of ${expect.audios} connected` : undefined);
  const unnamedAud = Array.from({ length: expect.audios }, (_, i) => i + 1).filter((n) => !auds.includes(n));
  add('every-audio-named', unnamedAud.length === 0, true, unnamedAud.length ? `audio ${unnamedAud.join(', ')} connected but never named` : undefined);
  // a subject is defined by `<Subject k> is the …` — a pictured one (`… in <Picture i>`), one described from words
  // (`… ; no reference picture`) or a group of extras
  const defined = new Set([...prompt.matchAll(/<Subject (\d+)> is the\b/g)].map((m) => Number(m[1])));
  const usedSubjects = [...new Set([...prompt.matchAll(/<Subject (\d+)>/g)].map((m) => Number(m[1])))];
  const undefinedSubjects = usedSubjects.filter((n) => !defined.has(n));
  add('subjects-defined', undefinedSubjects.length === 0, true, undefinedSubjects.length ? `<Subject ${undefinedSubjects.join('>, <Subject ')}> used but not defined` : undefined);
  const opens = (prompt.match(/<d>/g) ?? []).length; const closes = (prompt.match(/<\/d>/g) ?? []).length;
  add('dialogue-tags-balanced', opens === closes, true, opens === closes ? undefined : `${opens} <d> against ${closes} </d>`);
  // a tag's words: without the [Language] marker and the terminal mark the builder may add
  const norm = (s: string) => clean(s).replace(/^\[[A-Za-z]+\]\s*/, '').replace(/[.!?…؟!]+$/, '').trim();
  const inTags = [...prompt.matchAll(/<d>([\s\S]*?)<\/d>/g)].map((m) => norm(m[1]));
  const wanted = expect.lines.map(norm).filter(Boolean);
  const missing = [...new Set(wanted)].filter((l) => inTags.filter((t) => t === l).length !== wanted.filter((w) => w === l).length);
  add('script-lines-verbatim-once', missing.length === 0, true, missing.length ? `${missing.length} line(s) not present exactly as often as the script says them: ${missing.map((l) => `“${l.slice(0, 40)}”`).join(', ')}` : undefined);
  const named = (expect.names ?? []).map((n) => n.trim()).filter((n) => n.length > 1).filter((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(prompt.replace(/<d>[\s\S]*?<\/d>/g, ' ')));
  add('no-names', named.length === 0, false, named.length ? `names in the prompt: ${named.join(', ')}` : undefined);
  if (!local) add('hosted-length', prompt.length <= 7000, true, `${prompt.length} characters (hosted limit 7000)`);
  return { ok: checks.every((c) => c.ok || !c.hard), checks };
}

/** Prompt for a still frame of the shot (the opening image): same content without dialogue or motion. */
/** WHAT A FRAMING SHOWS, in words a still-image model follows (acceptance 2026-10-05, open item 1: frames were drawn at
 *  the wide plate's framing whatever the shot asked for, and H3 then hard-cut inside the take to reach the planned
 *  framing). The camera distance leads the frame prompt, and a closer framing tells the model the plate is the PLACE,
 *  not the camera. */
export const FRAMING_WORDS: Record<Framing, string> = {
  EXTREME_WIDE: 'an extreme wide shot: the whole place, the people small within it',
  WIDE: 'a wide shot: the people seen head to toe with the room around them',
  MEDIUM_WIDE: 'a medium wide shot: the people from the knees up, the room around them',
  MEDIUM: 'a medium shot: the people from the waist up; the place is the background behind them',
  MEDIUM_CLOSE_UP: 'a medium close-up: head and chest fill most of the frame; the place is a soft background',
  // the subject, not always the face: a close-up of "his shoe slips on a wet step" told "the face fills the frame" was
  // drawn with BOTH — the man on the stair and a giant second face in the lens (2026-10-08, "The Last Crossing" 1.1)
  CLOSE_UP: 'a close-up: what the moment is about fills the frame — the face, or the hand, foot or object the action happens to; one of each person, never a second face; the place is only a blurred background',
  EXTREME_CLOSE_UP: 'an extreme close-up: one detail the moment is about fills the frame — an eye, a mouth, a hand, an object',
  INSERT: 'an insert: one object or hand detail fills the frame; no face and no whole person in the picture',
  TWO_SHOT: 'a two-shot: both people from the waist up, side by side in the frame',
  OVER_THE_SHOULDER: 'an over-the-shoulder shot: the back of one person’s shoulder and head in the foreground, the other person facing the camera',
};
/** Framings at which the drawn frame shows about as much of the place as its wide plate. */
export const PLATE_WIDE_FRAMINGS: readonly Framing[] = ['EXTREME_WIDE', 'WIDE', 'MEDIUM_WIDE'];

/** How much of the wide plate's width a closer framing sees (an edit model keeps image 1's composition: Tea 1.3 kept
 *  the plate's wide view for a medium close-up 2/2 although the prompt said "much closer"). */
export const PLATE_CROP_SHARE: Partial<Record<Framing, number>> = { MEDIUM: 0.62, MEDIUM_CLOSE_UP: 0.5, CLOSE_UP: 0.4, EXTREME_CLOSE_UP: 0.32, INSERT: 0.4, TWO_SHOT: 0.7, OVER_THE_SHOULDER: 0.66 };
/** The part of the plate a closer framing shows, at the plate's own aspect: `PLATE_CROP_SHARE` of its width around
 *  `center` (fractions; default the middle, a little below the centre line where standing people's heads are). None for
 *  a framing that shows the whole plate. Pure. */
export function plateCropFor(framing: Framing, plate: { width: number; height: number }, center: { x: number; y: number } = { x: 0.5, y: 0.55 }): { x: number; y: number; width: number; height: number } | undefined {
  const share = PLATE_CROP_SHARE[framing];
  if (!share || !plate.width || !plate.height) return undefined;
  const width = Math.round(plate.width * share); const height = Math.round(plate.height * share);
  const x = Math.round(Math.min(plate.width - width, Math.max(0, center.x * plate.width - width / 2)));
  const y = Math.round(Math.min(plate.height - height, Math.max(0, center.y * plate.height - height / 2)));
  return { x, y, width, height };
}
/** A one-person framing's extent, in face heights: the frame's height, and where the top of the face sits (a fraction
 *  of the frame's height from the top). */
export const FACE_FRAMING: Partial<Record<Framing, { faces: number; top: number }>> = { MEDIUM: { faces: 4.6, top: 0.1 }, MEDIUM_CLOSE_UP: { faces: 3.0, top: 0.14 }, CLOSE_UP: { faces: 1.9, top: 0.12 }, EXTREME_CLOSE_UP: { faces: 1.3, top: 0.05 } };
/** The smallest crop, as a share of the drawn frame's width: below it the upscale is too soft, so a crop the framing
 *  wants smaller is CLAMPED to it — as close as the picture allows — instead of keeping the frame uncropped
 *  (acceptance 2026-10-06, "The Last Ferry": a MEDIUM drawn as a full figure was kept whole, and H3 travelled from the
 *  full figure to the planned MEDIUM and back). */
export const FRAMING_CROP_FLOOR = 0.5;
/** The part of a drawn one-person frame that shows the planned framing, at the frame's own aspect, placed by the face
 *  box (pixels): the face centred across, its top at the framing's height. A crop the framing wants below
 *  `FRAMING_CROP_FLOOR` of the width is clamped to the floor (`clamped: true`). Undefined when the framing has no face
 *  extent, or when the frame is already as close (the crop would be the whole picture or more). Pure. */
export function framingCropFromFace(framing: Framing, face: { x: number; y: number; width: number; height: number }, image: { width: number; height: number }): { x: number; y: number; width: number; height: number; clamped?: boolean } | undefined {
  const f = FACE_FRAMING[framing];
  if (!f || !(face.height > 0) || !(image.width > 0) || !(image.height > 0)) return undefined;
  const aspect = image.width / image.height;
  let height = face.height * f.faces;
  let width = height * aspect;
  if (width >= image.width * 0.97) return undefined;
  const clamped = width < image.width * FRAMING_CROP_FLOOR;
  if (clamped) width = image.width * FRAMING_CROP_FLOOR;
  width = Math.round(width); height = Math.round(width / aspect);
  const x = Math.round(Math.min(image.width - width, Math.max(0, face.x + face.width / 2 - width / 2)));
  const y = Math.round(Math.min(image.height - height, Math.max(0, face.y - f.top * height)));
  return clamped ? { x, y, width, height, clamped } : { x, y, width, height };
}
/** How much of a canonical full-body figure (head at the top) a framing shows, from the top. */
export const PERSON_CROP_SHARE: Partial<Record<Framing, number>> = { MEDIUM: 0.55, MEDIUM_CLOSE_UP: 0.45, CLOSE_UP: 0.3, EXTREME_CLOSE_UP: 0.2, TWO_SHOT: 0.55, OVER_THE_SHOULDER: 0.5 };
/** The top part of a canonical full-body image a framing shows (the full width). Pure. */
export function personCropFor(framing: Framing, canonical: { width: number; height: number }): { x: number; y: number; width: number; height: number } | undefined {
  const share = PERSON_CROP_SHARE[framing];
  if (!share || !canonical.width || !canonical.height) return undefined;
  return { x: 0, y: 0, width: canonical.width, height: Math.round(canonical.height * share) };
}

const OFFSCREEN = /\b(off[- ]?screen|off[- ]?camera|out of (?:the )?(?:frame|shot|picture)|unseen)\b/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The action as a still frame may draw it (acceptance 2026-10-06, Tea 1.3: "speaks to Abu Haidar, who stands
 *  off-screen across the counter" drew a vendor into a one-person frame): a phrase that addresses a person who is NOT in
 *  the shot ("to/with/at/towards … <name>") is cut, a clause still naming such a person or saying off-screen / out of
 *  frame is dropped, and what remains is the action of the people in the shot. Pure. */
export function stillFrameAction(action: string, absentNames: string[]): string {
  const names = [...new Set(absentNames.flatMap((n) => { const full = n.trim(); const first = full.split(/\s+/)[0]; return [full, ...(first && first !== full && first.length >= 3 ? [first] : [])]; }).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  const nameRe = names.length ? new RegExp(`(^|[^\\p{L}])(${names.map(escapeRe).join('|')})(?=$|[^\\p{L}])`, 'iu') : null;
  const addressRe = names.length ? new RegExp(`\\s*\\b(?:to|with|at|towards|toward|for|from|beside|near|facing|and)\\s+(?:${names.map(escapeRe).join('|')})(?=$|[^\\p{L}])`, 'giu') : null;
  const sentences = clean(action).split(/(?<=[.;!?])\s+/);
  const kept = sentences.map((s) => {
    const clauses = (addressRe ? s.replace(addressRe, '') : s).split(/,\s*/);
    const ok = clauses.filter((c) => !OFFSCREEN.test(c) && !(nameRe?.test(c)));
    let out = ok.join(', ').trim();
    if (out && !/[.;!?]$/.test(out)) out += /[;]$/.test(s.trim()) ? ';' : '.';
    return out;
  }).filter((s) => s.replace(/[.;!?\s]/g, '').length > 0);
  return kept.join(' ').replace(/[;,]\s*$/, '.').replace(/\.\.+$/, '.');
}

/** THE INSERT, FROM WORDS (continuity recovery 2026-10-08, "The Relief" 1.6): from any picture of a person — the
 *  previous end, cut to its hands, or the canonical image cut to the clothes — the edit model drew a face close-up of
 *  the man three times. An insert needs no face identity: it is hands, sleeves and an object, drawn by text to image
 *  from the people's own clothes (the first clause of their wardrobe) and condition, the props as the plan has them and
 *  the place's light. People are named by what they wear, never by name or face. Pure (tested). */
export function detailFramePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined): string {
  const d = styleDirection(p.style);
  const people = cast.filter((c) => sh.characterIds.includes(c.id));
  const worn = (c: Character) => clean((c.wardrobe ?? 'dark clothes').split(/,|;/)[0]).replace(/^(a|an|the)\s+/i, '').replace(/\.$/, '').toLowerCase();
  const who = (id: string) => { const c = cast.find((x) => x.id === id); return c ? `the person in the ${worn(c)}` : undefined; };
  const absent = cast.filter((c) => !sh.characterIds.includes(c.id)).map((c) => c.name);
  const moment = bindNames(stillFrameAction(sh.action, absent), cast, who).replace(/[.;]\s*$/, '');
  // each hand by its own skin and only its own sleeve; each prop once (the first word-drawn 1.6 gave both people pale
  // hands, two thermoses, a suit sleeve with an oilskin cuff, and the lighthouse seen from outside)
  const skin = (c: Character) => clean((c.skin ?? '').split(/,|;|\bwith\b/)[0]).replace(/\.$/, '').toLowerCase();
  const hands = people.map((c) => { const x = sh.continuity?.characters.find((k) => k.characterId === c.id); const s = skin(c); return `the ${s ? `${s} ` : ''}hand and sleeve of ${who(c.id)} (only that sleeve on that arm)${x?.condition ? `, ${clean(x.condition).toLowerCase()}` : ''}${x?.holding?.length ? `, holding ${x.holding.map(clean).join(' and ')}` : ''}`; });
  const seen = new Set<string>();
  const props = (sh.continuity?.props ?? []).filter((x) => { const k = clean(x.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).map((x) => `exactly one ${clean(x.name).toLowerCase()}${x.state ? ` (${clean(x.state)})` : ''}`);
  const light = sh.continuity?.environment.lighting ? clean(sh.continuity.environment.lighting) : '';
  const inside = loc && /interior/i.test(String((loc as { kind?: string }).kind ?? '')) ? 'inside ' : '';
  // the place behind the hands, from its own identity (materials, the first fixed features, its key light and palette):
  // its name alone let text to image invent a room — a desk, a lamp, a square window — that "The Relief" 1.7's
  // continuation then carried on in, instead of the circular lantern room (2026-10-08)
  const f = loc ? identityFacts(loc) : undefined;
  const look = f ? [f.materials.slice(0, 3).join(', '), f.fixedFeatures.slice(0, 2).join(', '), f.light?.key, f.light?.palette.length ? `colours ${f.light.palette.slice(0, 3).join(', ')}` : ''].map((x) => clean(x ?? '').replace(/\.$/, '').toLowerCase()).filter(Boolean).join('; ') : '';
  const behind = loc ? `Behind them, soft and out of focus: ${inside}${clean(loc.name)}${scene?.timeOfDay ? ` at ${scene.timeOfDay.toLowerCase().replace(/_/g, ' ')}` : ''}${light ? `, ${light}` : ''}${look ? ` (${look})` : ''}.` : '';
  return `${d.visual}. An insert: a tight close-up in which hands and an object fill the whole frame. ${moment ? `${moment.charAt(0).toUpperCase()}${moment.slice(1)}.` : ''} In the picture: ${hands.join('; ')}${props.length ? `; ${props.join('; ')}` : ''}. ${behind} Only hands, sleeves and the object are in the picture: no face, no head, no shoulders, no whole person. Single still frame, sharp, no text, no watermark. ${d.avoid}`.replace(/\s+/g, ' ').trim();
}

/** A person in a few words (sex, age, clothes) — to say which face picture is whom, never by name. Pure. */
export function appearanceShort(c: Pick<Character, 'sex' | 'ageYears' | 'wardrobe'>): string {
  const first = (s?: string) => (s ?? '').split(/[,;.]/)[0].trim().toLowerCase().replace(/^(a|an)\s+/, '');
  return [c.sex === 'FEMALE' ? 'woman' : c.sex === 'MALE' ? 'man' : 'person', c.ageYears ? `of about ${c.ageYears}` : '', c.wardrobe ? `in the ${first(c.wardrobe)}` : ''].filter(Boolean).join(' ');
}

/** THE SAME MOMENT, A SECOND CAMERA (producer 2026-10-09, "The Relief" 1.8): the frame of a cut inside the scene, drawn
 *  from the previous take's actual end (image 1). The words carry only the new camera and the moment's action — the
 *  room, the light, the people's places, clothes and props are image 1's, never re-described (a described room is
 *  rebuilt as another room). Pure. */
export function sameMomentFramePrompt(p: Production, sh: Shot, cast: Character[], angle: string): string {
  const d = styleDirection(p.style);
  const who = (id: string) => { const c = cast.find((x) => x.id === id); return c ? `the ${appearanceShort(c)}` : undefined; };
  const action = bindNames(clean(sh.action).replace(/\.+$/, ''), cast, who);
  return `${d.visual}. The same moment as image 1, filmed by a second camera: ${angle}. ${action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}.` : ''} Nothing in the room, the light, the weather or the people changes from image 1 except the camera's position and the moment's small movement. Single still frame, sharp, no text, no watermark. ${d.avoid}`.replace(/\s+/g, ' ').trim();
}

export function framePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, opts: { pictured?: Set<string> } = {}): string {
  const d = styleDirection(p.style);
  const camera = `Camera: ${FRAMING_WORDS[sh.framing] ?? sh.framing.toLowerCase().replace(/_/g, ' ')}.${PLATE_WIDE_FRAMINGS.includes(sh.framing) ? '' : ' The camera is much closer than in the reference picture of the place: keep the place’s look, not its framing.'}`;
  // a person shown by a reference picture is described by that picture's note alone: a second description in words
  // read as a second person (D30)
  const people = cast.filter((c) => sh.characterIds.includes(c.id) && !opts.pictured?.has(c.id));
  // a person who is not in the shot is never drawn: the moment loses the phrases that place them (stillFrameAction)
  const absent = cast.filter((c) => !sh.characterIds.includes(c.id)).map((c) => c.name);
  const moment = stillFrameAction(sh.action, absent).replace(/[.;]\s*$/, '');
  // an insert shows hands, never a face: a person described in full ("a 41-year-old man… square jawline") was drawn
  // face and all into "The Relief" 1.6 — in an insert a person is their hands and sleeves
  const described = sh.framing === 'INSERT' ? people.map((c) => `The hands and sleeves of a person wearing ${clean(c.wardrobe ?? 'their clothes').replace(/\.$/, '')}.`) : people.map((c) => `A ${describeCharacter(c)}.`);
  const body = [loc ? `Setting: ${describeLocation(loc, scene?.timeOfDay)}.` : '', ...described, moment ? `Moment: ${moment}.` : '', sh.continuity?.environment.lighting ? `Light: ${sh.continuity.environment.lighting}.` : ''].filter(Boolean).join(' ');
  return `${d.visual}. ${camera} ${body} Single still frame, sharp, no text, no watermark. ${d.avoid}`.replace(/\s+/g, ' ');
}

/** Plates describe an unoccupied place in positive terms. Negations ("no people") are unreliable for a diffusion
 *  model, and with the Lightning LoRAs (cfg 1) the negative prompt has no effect at all; the first rooftop plates
 *  came back with a child standing in them because the visual direction itself mentions "characters". */
export function locationPrompt(l: Location, view: 'MASTER' | 'VIEW' | 'STATE', timeOfDay?: string, note?: string): string {
  const d = styleDirection(l.style);
  const visual = d.visual.replace(/stylized CG characters[^,.]*[,.]\s*/i, 'stylized CG environment art, ').replace(/characters?/gi, 'scenery');
  const empty = 'An unoccupied, deserted place: pure environment and props, the scene before anyone arrives';
  const v = view === 'MASTER' ? `wide establishing master plate of the whole space, eye level. ${empty}` : view === 'VIEW' ? `a second camera angle of the same place${note ? ` (${note})` : ''}, same architecture and props. ${empty}` : `the same place at ${timeOfDay?.toLowerCase().replace('_', ' ') ?? 'another time of day'}${note ? `, ${note}` : ''}, same architecture and props. ${empty}`;
  return `${visual}. ${d.environment} ${describeLocation(l, timeOfDay)}. ${v}. ${d.avoid}`.replace(/\s+/g, ' ');
}

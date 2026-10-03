import type { Character, Location, Production, Shot } from '@/domain/types';
import { performanceFor, shotWindows, sungLinesFor } from '@/domain/timeline';
import { styleDirection } from './style';

/** PROMPT COMPOSITION — the one place that turns studio records into the text a model sees. Characters are always
 *  described by appearance (never by name), the production direction's visual language goes first, and dialogue is
 *  tagged the way MiniMax H3 expects (`<d>[Language] … </d>`). */

const clean = (s?: string | false) => (s || '').replace(/\s+/g, ' ').trim();

export function describeCharacter(c: Character): string {
  const age = c.species ? `${c.species}` : `${c.ageYears}-year-old ${c.sex === 'FEMALE' ? 'woman' : 'man'}`;
  const parts = [age, c.build, c.face, c.hair && `${c.hair} hair`, c.skin && c.skin !== '—' && `${c.skin} skin`, c.eyes && `${c.eyes} eyes`, c.wardrobe && `wearing ${c.wardrobe}`, ...(c.distinguishing ?? []).slice(0, 3), ...(c.canon?.accessories ?? []).slice(0, 2)].map(clean).filter(Boolean);
  return parts.join(', ');
}

export function describeLocation(l: Location, timeOfDay?: string): string {
  const parts = [l.kind === 'INTERIOR' ? 'interior' : 'exterior', clean(l.description), l.landmarks.length ? `landmarks: ${l.landmarks.slice(0, 4).join('; ')}` : '', l.props.length ? `props present: ${l.props.slice(0, 5).join(', ')}` : '', timeOfDay ? `time of day: ${timeOfDay.toLowerCase().replace('_', ' ')}` : ''].filter(Boolean);
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

export function dialogueTags(p: Production, sh: Shot, cast: Character[], speaker: SpeakerLabel = describedSpeaker(cast), verb = ''): string {
  if (!sh.dialogue.length) return '';
  const lang = LANG_TAG[p.language] ?? 'English';
  return sh.dialogue.map((d) => { const text = p.language === 'AR' ? (d.textAr || d.text) : d.text; const who = speaker(d.characterId); return `${who}${who && verb ? ` ${verb}` : ''} <d>[${lang}] ${spoken(text)}</d>`.trim(); }).join(' ');
}

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
  const onScreen = perf.singerIds.filter((id) => sh.characterIds.includes(id));
  const lines = sungLinesFor(p.song, w, p.language).filter((l) => onScreen.includes(l.singerId));
  const sung = lines.map((l) => `${who(l.singerId)} sings <d>[${lang}] ${clean(p.language === 'AR' ? l.textAr || l.text : l.text)}</d>`).join(' ');
  const listeners = (perf.listenerIds ?? []).filter((id) => sh.characterIds.includes(id)).map(who).filter(Boolean);
  const silent = sh.characterIds.filter((id) => !perf.singerIds.includes(id) && !(perf.listenerIds ?? []).includes(id)).map(who).filter(Boolean);
  const performing = onScreen.length ? (sung || `${onScreen.map(who).join(' and ')} performing the song, singing in sync with the music.`) : 'The song continues off camera: nobody on screen sings or mouths words.';
  return [performing, listeners.length ? `${listeners.join(' and ')} listen, lips closed.` : '', silent.length ? `${silent.join(' and ')} do not sing.` : ''].filter(Boolean).join(' ');
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

/** The shot's middle: the planner's (or producer's) prompt with its dialogue tags stripped, else one written from the
 *  shot: setting, people by appearance, action, camera, light. */
function shotBody(sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, stripTags: boolean): string {
  const people = cast.filter((c) => sh.characterIds.includes(c.id));
  if (sh.prompt?.trim()) return stripTags ? stripDialogueTags(sh.prompt.trim()) : sh.prompt.trim();
  return [
    loc ? `Setting: ${describeLocation(loc, scene?.timeOfDay)}.` : '',
    ...people.map((c) => `A ${describeCharacter(c)}.`),
    `Action: ${clean(sh.action)}.`,
    `Camera: ${sh.framing.toLowerCase().replace(/_/g, ' ')}, ${sh.cameraMove === 'STATIC' ? 'static camera' : sh.cameraMove.toLowerCase().replace(/_/g, ' ')}.`,
    sh.continuity?.environment.lighting ? `Light: ${sh.continuity.environment.lighting}.` : '',
  ].filter(Boolean).join(' ');
}

/** The full prompt for a first-frame (FL2VA) or text-only take: look + setting + people + action + camera + dialogue.
 *  The shot's own `prompt` (written by the story engine or the producer) replaces the generated middle when present;
 *  its dialogue tags are replaced by the exact script lines. */
export function takePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, opts: { includeDialogue?: boolean } = {}): string {
  const d = styleDirection(p.style);
  const dialogue = opts.includeDialogue === false ? '' : p.kind === 'MUSIC_VIDEO' ? singingTags(p, sh, cast) : dialogueTags(p, sh, cast);
  const body = shotBody(sh, cast, loc, scene, opts.includeDialogue !== false);
  return [d.visual + '.', body, dialogue, d.avoid].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
  /** what the clip starts from: the drawn opening frame (as a picture and/or anchored at frame 0), or the previous
   *  take's tail anchored at frame 0 (a continuation), or nothing */
  opening?: { kind: 'FRAME'; picture?: number } | { kind: 'TAIL'; seconds: number };
  /** an ending frame anchored at the last frame */
  ending?: boolean;
  /** voice-timbre clips connected as reference audio, in order (`<Audio j>` ↔ the j-th) */
  audioRefs?: Array<{ characterId: string }>;
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

function continuitySentence(sh: Shot, cast: Character[], subjectOf: (id: string) => string | undefined, body = ''): string {
  const c = sh.continuity;
  if (!c) return '';
  const parts = c.characters.map((x) => {
    const who = subjectOf(x.characterId) ?? (cast.find((k) => k.id === x.characterId) ? `(${describeCharacter(cast.find((k) => k.id === x.characterId)!).split(',').slice(0, 2).join(',')})` : '');
    if (!who) return '';
    const bits = [x.position && `is ${clean(x.position)}`, x.screenDirection && x.screenDirection !== 'NEUTRAL' && `faces ${x.screenDirection === 'TOWARD' ? 'the camera' : x.screenDirection === 'AWAY' ? 'away from the camera' : `screen ${x.screenDirection.toLowerCase()}`}`, x.eyeline && `looks ${clean(x.eyeline).replace(/^at\b/, 'at')}`, x.holding?.length && `holds ${x.holding.map(clean).join(' and ')}`, x.wardrobe && `wears ${clean(x.wardrobe)}`].filter(Boolean);
    return bits.length ? `${who} ${bits.join(', ')}.` : '';
  }).filter(Boolean);
  const props = c.props.filter((x) => x.position || x.state).map((x) => `${clean(x.name)}${x.state ? ` (${clean(x.state)})` : ''}${x.position ? ` ${clean(x.position)}` : ''}`);
  const light = c.environment.lighting && !body.includes(clean(c.environment.lighting)) ? `Light: ${clean(c.environment.lighting)}.` : '';
  return [parts.join(' '), props.length ? `Props: ${props.join('; ')}.` : '', light].filter(Boolean).join(' ');
}

/** A shot's continuity state in words (positions, screen direction, eyeline, what each person holds and wears, props,
 *  light), people described by appearance — for an opening frame drawn as a CUT of the previous shot's moment. */
export const continuityLine = (sh: Shot, cast: Character[]): string => continuitySentence(sh, cast, () => undefined);

/** THE REFERENCE PROMPT (Ref2VA) — the six sections MiniMax H3's reference checkpoint was trained on, in order:
 *  subject_definitions, summary (with its task type), retention_analysis, detailed_description, overall_soundscape,
 *  non_diegetic_music. Every connected picture is named; each character's canonical image is bound to a subject, the
 *  plate to the place; dialogue is `<Subject k> (Sx) says, <d>[Language] exact line.</d>`; people are described by
 *  appearance, never by name. */
export function h3ReferencePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, b: H3Binding, opts: { relation: ShotRelationKind; includeDialogue?: boolean; body?: string } = { relation: 'CUT' }): string {
  const d = styleDirection(p.style);
  const ids = speakerIds(p, sh);
  const subjectNo = new Map(b.subjects.map((s, i) => [s.characterId, i + 1]));
  const placeNo = b.location ? b.subjects.length + 1 : undefined;
  const subjectOf = (id: string) => { const k = subjectNo.get(id); if (!k) return undefined; const s = ids.get(id); return `<Subject ${k}>${s ? ` (S${s})` : ''}`; };
  const speaker: SpeakerLabel = (id) => subjectOf(id) ?? describedSpeaker(cast)(id);
  const tasks: string[] = [];
  const anchored = Boolean(b.opening || b.ending);
  if (anchored) tasks.push('keyframe completion');
  tasks.push('reference generation');
  if (b.audioRefs?.length) tasks.push('audio reference');
  // subject_definitions
  const defs: string[] = [];
  for (const [i, s] of b.subjects.entries()) {
    const c = cast.find((x) => x.id === s.characterId);
    if (!c) continue;
    const [first, ...rest] = describeCharacter(c).split(', ');
    defs.push(`<Subject ${i + 1}> is the ${first} in ${pictureLabel(b, s.picture)}${rest.length ? `, featuring ${rest.join(', ')}` : ''}.`);
  }
  if (b.location && loc) {
    const features = [clean(loc.description), loc.landmarks.length ? loc.landmarks.slice(0, 4).map(clean).join(', ') : '', loc.props.length ? loc.props.slice(0, 5).map(clean).join(', ') : ''].filter(Boolean).join('; ');
    defs.push(`<Subject ${placeNo}> is the ${loc.kind === 'INTERIOR' ? 'interior' : 'exterior'} environment in ${pictureLabel(b, b.location.picture)}${features ? `, featuring ${features}` : ''}.`);
  }
  const action = lowerFirst(clean(sh.action).replace(/\.$/, ''));
  if (b.opening?.kind === 'FRAME' && b.opening.picture) defs.push(`${pictureLabel(b, b.opening.picture)} is the first frame of [Shot 1], showing how ${action}.`);
  (b.audioRefs ?? []).forEach((a, j) => { const who = subjectOf(a.characterId); if (who) defs.push(`${audioLabel(b, j + 1)} is the voice-timbre reference for ${who}.`); });
  // summary
  const cast2 = b.subjects.map((s) => `<Subject ${subjectNo.get(s.characterId)}>`);
  const where = placeNo ? ` in <Subject ${placeNo}>` : '';
  const relationLine = opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL'
    ? `It continues the previous shot without a cut: the first ${b.opening.seconds.toFixed(1)} seconds are the end of the previous shot, anchored on the timeline, and the action carries on from there.`
    : b.opening?.kind === 'FRAME' ? `It begins from ${b.opening.picture ? pictureLabel(b, b.opening.picture) : 'the anchored opening frame'}${opts.relation === 'CUT' ? ', a new camera angle on the same moment as the previous shot' : ''}.` : '';
  const summary = `[${tasks.join(' + ')}] The target video shows ${cast2.length ? cast2.join(' and ') : 'the scene'}${where}: ${action}. ${relationLine}`.trim();
  // retention_analysis
  const ret: string[] = [];
  for (const [i, s] of b.subjects.entries()) ret.push(`<Subject ${i + 1}> (appears in [Shot 1]): fully_preserved - the face, hair, skin tone, build and wardrobe of ${pictureLabel(b, s.picture)} are kept exactly.`);
  if (b.location && placeNo) ret.push(`<Subject ${placeNo}> (appears in [Shot 1]): partially_preserved - the architecture, layout, materials and fixed props of ${pictureLabel(b, b.location.picture)} are kept; the camera position and framing may differ.`);
  if (b.opening?.kind === 'FRAME' && b.opening.picture) ret.push(`${pictureLabel(b, b.opening.picture)} ([Shot 1] first frame): fully_preserved - the video starts exactly from ${pictureLabel(b, b.opening.picture)}'s framing, positions and light.`);
  (b.audioRefs ?? []).forEach((a, j) => { if (subjectOf(a.characterId)) ret.push(`${audioLabel(b, j + 1)}: reference - guides the voice timbre of ${subjectOf(a.characterId)} without copying the original signal.`); });
  // detailed_description
  const includeDialogue = opts.includeDialogue !== false;
  // the planner's own direction (tags stripped), else a body that leans on the bindings: the people and the place are
  // defined above, so the middle is the action, the camera and the light
  const body = opts.body ?? (sh.prompt?.trim() ? shotBody(sh, cast, loc, scene, includeDialogue) : [`${cast2.length ? cast2.join(' and ') : 'The scene'}${where}: ${action}.`, `Camera: ${sh.framing.toLowerCase().replace(/_/g, ' ')}, ${sh.cameraMove === 'STATIC' ? 'static camera' : sh.cameraMove.toLowerCase().replace(/_/g, ' ')}.`].join(' '));
  const opening = opts.relation === 'CONTINUATION' && b.opening?.kind === 'TAIL' ? 'The shot continues from the anchored end of the previous shot, same camera setup, same positions, same light; from there:' : b.opening?.kind === 'FRAME' ? `The shot begins from ${b.opening.picture ? pictureLabel(b, b.opening.picture) : 'the anchored opening frame'}.` : '';
  const cont = continuitySentence(sh, cast, subjectOf, body);
  // a shot without lines says so: continuing from a speaking tail, H3 otherwise invents new words (C1,
  // docs/evidence/minimax-p1: "Talk with her, Patrick. Do you need her?" in a shot with no dialogue)
  const silent = includeDialogue && p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length === 0;
  const lines = !includeDialogue ? '' : p.kind === 'MUSIC_VIDEO' ? singingTags(p, sh, cast, speaker) : silent ? 'Nobody speaks in this shot.' : dialogueTags(p, sh, cast, speaker, 'says,');
  const detailed = [`${d.visual}.`, '[Shot 1]', opening, body, cont, lines, b.ending ? 'The shot ends on the anchored ending frame.' : '', d.avoid].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
export function framePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined): string {
  const d = styleDirection(p.style);
  const people = cast.filter((c) => sh.characterIds.includes(c.id));
  const body = [loc ? `Setting: ${describeLocation(loc, scene?.timeOfDay)}.` : '', ...people.map((c) => `A ${describeCharacter(c)}.`), `Moment: ${clean(sh.action)}.`, `Framing: ${sh.framing.toLowerCase().replace(/_/g, ' ')}.`, sh.continuity?.environment.lighting ? `Light: ${sh.continuity.environment.lighting}.` : ''].filter(Boolean).join(' ');
  return `${d.visual}. ${body} Single still frame, sharp, no text, no watermark. ${d.avoid}`.replace(/\s+/g, ' ');
}

/** Prompt for a character's portrait / reference view. */
export function characterPrompt(c: Character, view: 'PORTRAIT' | 'FRONT' | 'THREE_QUARTER' | 'SIDE' | 'BACK' | 'FULL_BODY' | 'EXPRESSION' | 'OUTFIT' | 'FACE'): string {
  const d = styleDirection(c.style);
  const views: Record<typeof view, string> = {
    PORTRAIT: 'head-and-shoulders portrait, facing camera, neutral calm expression, soft even studio light, plain neutral background',
    FACE: 'tight face close-up, facing camera, neutral expression, soft even light, plain neutral background',
    FRONT: 'full front view, standing, arms relaxed, facing camera, neutral expression, even light, plain neutral background, character reference sheet',
    THREE_QUARTER: 'three-quarter view turned 45 degrees to the left, standing, neutral expression, even light, plain neutral background, character reference sheet',
    SIDE: 'exact profile side view facing left, standing, neutral expression, even light, plain neutral background, character reference sheet',
    BACK: 'back view, standing, even light, plain neutral background, character reference sheet',
    FULL_BODY: 'full-body front view head to toe, standing, shoes visible, even light, plain neutral background, character reference sheet',
    EXPRESSION: 'expression sheet: the same face four times in a 2x2 grid showing joy, worry, anger and surprise, even light, plain neutral background',
    OUTFIT: 'full-body view showing the complete wardrobe in detail, even light, plain neutral background, costume reference',
  };
  return `${d.visual}. ${d.character} A ${describeCharacter(c)}. ${views[view]}. ${d.avoid}`.replace(/\s+/g, ' ');
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

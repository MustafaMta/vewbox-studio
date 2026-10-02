import type { Character, Location, Production, Shot } from '@/domain/types';
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

export function dialogueTags(p: Production, sh: Shot, cast: Character[]): string {
  if (!sh.dialogue.length) return '';
  const lang = LANG_TAG[p.language] ?? 'English';
  return sh.dialogue.map((d) => { const c = cast.find((x) => x.id === d.characterId); const who = c ? `(${describeCharacter(c).split(',').slice(0, 2).join(',')})` : ''; const text = p.language === 'AR' ? (d.textAr || d.text) : d.text; return `${who} <d>[${lang}] ${clean(text)}</d>`; }).join(' ');
}

/** The full prompt for a video take: look + setting + people + action + camera + dialogue. The shot's own `prompt`
 *  (written by the story engine or the producer) replaces the generated middle when present. */
export function takePrompt(p: Production, sh: Shot, cast: Character[], loc: Location | undefined, scene: { timeOfDay?: string } | undefined, opts: { includeDialogue?: boolean } = {}): string {
  const d = styleDirection(p.style);
  const people = cast.filter((c) => sh.characterIds.includes(c.id));
  const middle = sh.prompt?.trim() || [
    loc ? `Setting: ${describeLocation(loc, scene?.timeOfDay)}.` : '',
    ...people.map((c) => `A ${describeCharacter(c)}.`),
    `Action: ${clean(sh.action)}.`,
    `Camera: ${sh.framing.toLowerCase().replace(/_/g, ' ')}, ${sh.cameraMove === 'STATIC' ? 'static camera' : sh.cameraMove.toLowerCase().replace(/_/g, ' ')}.`,
    sh.continuity?.environment.lighting ? `Light: ${sh.continuity.environment.lighting}.` : '',
  ].filter(Boolean).join(' ');
  const dialogue = opts.includeDialogue === false ? '' : dialogueTags(p, sh, cast);
  const hasTagsAlready = /<d>/.test(middle);
  return [d.visual + '.', middle, hasTagsAlready ? '' : dialogue, d.avoid].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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

export function locationPrompt(l: Location, view: 'MASTER' | 'VIEW' | 'STATE', timeOfDay?: string, note?: string): string {
  const d = styleDirection(l.style);
  const v = view === 'MASTER' ? 'wide establishing master plate of the whole space, eye level, no people' : view === 'VIEW' ? `a second camera angle of the same place${note ? ` (${note})` : ''}, same architecture and props, no people` : `the same place at ${timeOfDay?.toLowerCase().replace('_', ' ') ?? 'another time of day'}${note ? `, ${note}` : ''}, same architecture and props, no people`;
  return `${d.visual}. ${d.environment} ${describeLocation(l, timeOfDay)}. ${v}. ${d.avoid}`.replace(/\s+/g, ' ');
}

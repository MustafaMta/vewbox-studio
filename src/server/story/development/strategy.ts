import type { StoryStrategy } from '@/domain/development';
import { DIALECT_LABELS, type Dialect, type Language } from '@/domain/vocabulary';
import type { IdeaContext } from './context';

/** FORMAT STRATEGIES (contract §2) — how a short, a show, a continuing season or episode and a music video are each
 *  built, the engagement standard every format shares, and how a story is written in its language. These are the
 *  rules the Creative Concept Agent, the Screenwriter and both reviewers are given; the structure bounds are also
 *  checked in code by the Story Editor (rubric.ts). */

/** How many structure items a proposal has: scenes of a short or an episode, episodes of a season or a new show's
 *  first season, visual sections of a music video. A short scales with its running time (about one scene per 20 s). */
export function structureBounds(c: Pick<IdeaContext, 'kind' | 'durationSeconds'>): { min: number; max: number; unit: string } {
  switch (c.kind) {
    case 'SHORT': { const max = Math.max(3, Math.min(6, Math.round(c.durationSeconds / 20))); return { min: Math.min(3, max), max, unit: 'scenes' }; }
    case 'EPISODE': return { min: 3, max: 6, unit: 'scenes' };
    case 'SEASON': return { min: 3, max: 8, unit: 'episodes' };
    case 'SHOW': return { min: 3, max: 6, unit: 'episodes of the first season' };
    case 'MUSIC_VIDEO': return { min: 3, max: 6, unit: 'visual sections, each mapped to a song section' };
  }
}

export const STRATEGY_RULES: Record<StoryStrategy, string> = {
  SHORT_FOCUSED: `FORMAT — SHORT (focused): one clear central character; one recognisable conflict; a hook in the first shot (the first 3–5 seconds give a reason to keep watching); visual storytelling over explanation; escalation; a satisfying or deliberate ending. Scenes and dialogue are scaled to the running time: few scenes, few short lines, no subplots.`,
  SHOW_SERIAL: `FORMAT — NEW SHOW (serial): a premise that can generate many episodes; a recurring cast with clear relationships and wants; a world with its own texture and rules; a season arc; each episode its own conflict that also moves the arc; characters who change over the season; a meaningful season ending. A cliffhanger only when the story has earned it.`,
  SEASON_CONTINUATION: `FORMAT — NEXT SEASON (continuation): continue from where the last season and episode ended — never restart the show and never contradict its timeline; keep its language, dialect, voices and every character's identity; reuse the returning cast and places by id; pick up the open storylines; a newcomer only when the story needs one, with the reason; a season arc that develops the characters, with each episode continuing the last. Current trends may inform a direction, never an unrelated plot.`,
  EPISODE_CONTINUATION: `FORMAT — NEXT EPISODE (continuation): the episode starts from where the last one ended and respects the bible's timeline; the show's regulars carry it; keep its language, dialect, voices and identities; pick up at least one open storyline when there is one; a guest only when the story needs one; its own conflict, resolved or deliberately carried on. Current trends may inform a direction, never an unrelated plot.`,
  MUSIC_FIRST: `FORMAT — MUSIC VIDEO (music first): the song comes first — its lyrics, mood, tempo and rhythm, structure (verse, chorus, bridge), performers and emotional progression; the video's sections map to the song's sections in order; performers sing their assigned sections on screen; visual hooks on the musical accents; the editing rhythm follows the beat. Never a story that ignores the song.`,
};

export const ENGAGEMENT_RULES = `ENGAGEMENT STANDARD: the opening earns attention; the situation is clear; the idea is original; there is emotion and a character to care about; pacing without dead air; a real conflict; curiosity about what happens next; it reads visually; it progresses; the ending pays off. Every scene has a purpose. No arbitrary twists, no constant action for its own sake, no needless cliffhangers, no manipulative retention tricks.`;

export const ORIGINALITY_RULES = `ORIGINALITY: write ORIGINAL characters, places and stories. Research shows what audiences respond to (patterns), never material to copy: never reuse a researched title, a creator's or channel's name, a real celebrity, or a franchise and its characters.`;

/** How the story is written in its language. An Arabic story is written in its dialect from the first word, with an
 *  English gloss for review — never an English story translated word for word. */
export function languageRules(language: Language, dialect?: Dialect): string {
  if (language !== 'AR') return 'LANGUAGE: English. Write natural, vivid English. Leave the Arabic and gloss fields empty.';
  if (dialect === 'IRAQI_BAGHDADI') {
    return `LANGUAGE: Iraqi Arabic, Baghdadi dialect. THINK AND WRITE IN BAGHDADI ARABIC FROM THE FIRST WORD: titles, the hook, the logline, the premise, the structure and any spoken line are written in natural everyday Baghdadi wording — e.g. شلونك، شكو ماكو، هسه، هواية، خوش، اكو/ماكو، شنو، ليش، باچر، يمعود، عيوني — with Iraqi spelling (چ and گ where they are pronounced: چاي، گلب، باچر) and Iraqi humour, warmth and everyday texture (the neighbourhood, the family, the tea, the street). Not Modern Standard Arabic and not Egyptian or Levantine wording. Only after the dialect is written, give a faithful English gloss in the gloss fields for the producer's review. Never write the story in English and translate it.`;
  }
  const label = dialect ? DIALECT_LABELS[dialect].en : 'Arabic';
  return `LANGUAGE: Arabic (${label}). Write the titles, hook, logline, premise, structure and any spoken line in ${dialect === 'MSA' ? 'Modern Standard Arabic' : `natural spoken ${label} Arabic`} from the first word; then a faithful English gloss in the gloss fields for review. Never write in English and translate.`;
}

/** The continuity a season or episode must respect, in the words the model is given. */
export function continuityRules(c: IdeaContext): string {
  if (!c.continuity) return '';
  const k = c.continuity;
  return `SHOW HISTORY — this ${c.kind === 'SEASON' ? 'season' : 'episode'} continues “${k.title}” (${k.genre}). Its language${k.dialect ? ` and dialect (${DIALECT_LABELS[k.dialect].en})` : ''} and direction (${k.style.toLowerCase()}) never change. The story continues from “lastEpisode.endsWith” and “previousSeason.endedWith”; the bible's timeline is fact; pick up the open storylines (bible.unresolved); the returning cast and places are reused by their ids (their identities are locked: never redescribe them).`;
}

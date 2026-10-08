import type { Shot } from './types';

/** IS A CONTINUOUS BOUNDARY FILMABLE? (continuity validation 2026-10-08, "The Relief" 1.7: planned continuous from a
 *  hands-only INSERT into a WIDE two-shot with a person who was not in the insert. H3 cannot open a detail out into a
 *  room with a newcomer in one move: it jumped at the join to a two-shot in an invented room and cut again at 3.4 s.)
 *
 *  A continuous shot starts from the previous take's last frames; its first frames can only show what those showed.
 *  It is not filmable as one camera move when:
 *  - the previous shot is a DETAIL (an insert, an extreme close-up: hands, an object — no room, no faces) and this one is
 *    three or more steps wider (a room, people): the tail holds nothing the wide shot is made of;
 *  - a person is in this shot who was not in the previous one and the action does not bring them in (enters, arrives,
 *    joins, steps in, appears …): they would have to be in a frame that did not show them.
 *  Either is a CUT on the same moment (match on action), not a continuation. Pure. */

const CLOSENESS: Record<string, number> = { EXTREME_WIDE: 0, WIDE: 1, MEDIUM_WIDE: 2, MEDIUM: 3, TWO_SHOT: 3, OVER_THE_SHOULDER: 3, MEDIUM_CLOSE_UP: 4, CLOSE_UP: 5, INSERT: 6, EXTREME_CLOSE_UP: 6 };
const DETAIL = new Set(['INSERT', 'EXTREME_CLOSE_UP']);
const BRINGS_IN = /\b(enter(s|ing)?|arriv(es|ing)|join(s|ing)?|step(s|ping)? (in|into|up)|walk(s|ing)? (in|into|up)|come(s)? (in|into|up)|appear(s|ing)?|into (the )?(frame|room|view|shot))\b/i;

export function continuousProblems(prev: Pick<Shot, 'framing' | 'characterIds' | 'number'>, sh: Pick<Shot, 'framing' | 'characterIds' | 'action'>, nameOf: (id: string) => string = (id) => id): string[] {
  const out: string[] = [];
  const wider = (CLOSENESS[prev.framing] ?? 3) - (CLOSENESS[sh.framing] ?? 3);
  const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');
  const prevWords = prev.framing.toLowerCase().replace(/_/g, ' ');
  if (DETAIL.has(prev.framing) && wider >= 3) out.push(`shot ${prev.number} is ${article(prevWords)} ${prevWords} (a detail, no room or faces): one continuous move cannot open it out to a ${sh.framing.toLowerCase().replace(/_/g, ' ')} — make it a cut on the same moment`);
  const newcomers = sh.characterIds.filter((id) => !prev.characterIds.includes(id));
  if (newcomers.length && !BRINGS_IN.test(sh.action ?? '')) out.push(`${newcomers.map(nameOf).join(' and ')} ${newcomers.length === 1 ? 'is' : 'are'} not in shot ${prev.number} and the action does not bring ${newcomers.length === 1 ? 'them' : 'them'} in — make it a cut on the same moment, or write the entrance`);
  return out;
}

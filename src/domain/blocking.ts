import type { FrameSide, Production, ScreenDirection, Shot, ShotMotion } from './types';
import { relationOf } from './scene-state';

/** BLOCKING AND THE 180° LINE, AS STRUCTURED STATE (final directive 2026-10-06 §9 "blocking; screen direction; action
 *  matching"; §10 shot state "motion direction; camera position; screen direction"). A script supervisor's rule set,
 *  pure, over the shots' stored continuity records — never an LLM's memory:
 *
 *  - THE LINE: once two people are staged on opposite sides of the frame, their LEFT/RIGHT order holds for the rest of
 *    the scene. A shot that swaps them is a crossed line unless it says it crosses (`camera.crossesLine`), which
 *    re-establishes the order from that shot on. A transition (a new scene) starts a new line.
 *  - SCREEN DIRECTION: a person facing screen-left keeps facing screen-left across a cut unless the shot shows a turn
 *    (its action or start pose says so), passes through a neutral facing (toward/away from camera) or crosses the line.
 *  - DIRECTION OF TRAVEL: someone walking left-to-right keeps travelling left-to-right across a cut and a continuation
 *    (exit frame-right, enter frame-left) — the match-on-action rule for movement.
 *  - CARRIED BLOCKING: on a cut or continuation, a person whose own record does not say where they stand keeps the
 *    side and facing they had (people do not teleport between angles of the same moment).
 *
 *  Violations are REVIEW findings for the preflight and the continuity log — never a refusal: a director may break
 *  the line on purpose (and then marks `crossesLine`). The prompt receives the carried facts as sentences about bound
 *  subjects (`blockingLine`). Where H3 can enforce this beyond words (the Fun ControlNet-Union "Layout" control: per-
 *  subject boxes), the same state is what a layout video would be drawn from. */

export type Travel = NonNullable<ShotMotion['direction']>;

export interface BlockingPerson {
  characterId: string;
  /** this shot's own side, else the side carried from the last shot of the scene that said it */
  side?: FrameSide;
  sideCarried?: boolean;
  facing?: ScreenDirection;
  facingCarried?: boolean;
  /** this shot's own direction of travel, else the previous shot's (on a cut: "if they move", on a continuation: they keep moving) */
  travel?: Travel;
  travelCarried?: boolean;
}

export interface BlockingViolation {
  kind: 'SIDES_SWAPPED' | 'FACING_FLIPPED' | 'TRAVEL_REVERSED';
  characterIds: string[];
  /** the shot whose staging this one contradicts */
  againstShotId: string;
  detail: string;
}

/** A left-to-right relation of two people the scene has established (the line). */
export interface LineRelation { leftId: string; rightId: string; sinceShotId: string }

export interface BlockingState {
  shotId: string;
  /** the shot that established (or last re-established, crossing the line) the scene's left/right order */
  lineFrom?: string;
  crossesLine: boolean;
  /** the pairs of THIS shot's people whose order the scene has established */
  relations: LineRelation[];
  people: BlockingPerson[];
  violations: BlockingViolation[];
}

const SIDE_RANK: Record<FrameSide, number> = { LEFT: 0, CENTER: 1, RIGHT: 2 };
const OPPOSITE: Partial<Record<ScreenDirection | Travel, string>> = { LEFT: 'RIGHT', RIGHT: 'LEFT', LEFT_TO_RIGHT: 'RIGHT_TO_LEFT', RIGHT_TO_LEFT: 'LEFT_TO_RIGHT' };

/** The frame side said in a position's words ("left third", "screen right", "in the middle"), ignoring a facing
 *  ("facing right"), a body part ("her left hand") and a side relative to someone ("to his left"). Undefined when the
 *  words say no side or say both. */
export function sideFromWords(text?: string): FrameSide | undefined {
  if (!text) return undefined;
  let t = ` ${text.toLowerCase().replace(/[-_]/g, ' ')} `;
  t = t.replace(/\b(facing|faces|face|looking|looks|look|turned|turning|turns|turn|heading|heads|walking|walks|moving|moves|glancing|glances|gazing|gazes|leaning|leans|pointing|points|travelling|traveling)\s+(towards?\s+|to\s+|toward\s+)?(the\s+)?(screen\s+|frame\s+|camera\s+)?(left|right)\b/g, ' ');
  t = t.replace(/\b(left|right)\s+(hand|hands|arm|arms|shoulder|leg|foot|knee|eye|ear|cheek|hip|wrist|elbow|side of (his|her|their|the) (body|face|head))\b/g, ' ');
  t = t.replace(/\bto\s+(his|her|their|its|my|your)\s+(left|right)\b/g, ' ');
  const left = /\b(left|leftmost)\b/.test(t), right = /\b(right|rightmost)\b/.test(t), centre = /\b(cent(er|re|red|ral)|middle)\b/.test(t);
  if (left && right) return undefined;
  if (left) return 'LEFT';
  if (right) return 'RIGHT';
  return centre ? 'CENTER' : undefined;
}

type Person = NonNullable<Shot['continuity']>['characters'][number];
export const sideOf = (x: Pick<Person, 'frameSide' | 'position'> | undefined): FrameSide | undefined => x?.frameSide ?? sideFromWords(x?.position);

const TURN = /\b(turn|turns|turned|turning|spins?|spun|whirls?|pivots?|faces? the other way|looks? back|swings? round|swings? around|about[- ]face|reverses?)\b/i;
const showsTurn = (sh: Shot, characterId: string): boolean => {
  const mine = sh.continuity?.characters.find((x) => x.characterId === characterId);
  return [sh.action, mine?.startPose, mine?.pose, mine?.motion?.path, ...(sh.staging?.beats ?? []).map((b) => b.action)].some((s) => Boolean(s && TURN.test(s)));
};

const orderedShots = (p: Production): Shot[] => { const n = new Map(p.scenes.map((sc) => [sc.id, sc.number])); return [...p.shots].sort((a, b) => (n.get(a.sceneId) ?? 0) - (n.get(b.sceneId) ?? 0) || a.number - b.number); };
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const words = (d: string) => d.toLowerCase().replace(/_/g, ' ');

interface Known { side?: FrameSide; facing?: ScreenDirection; travel?: Travel; shotId: string }

/** The blocking of a shot (see the module note): the scene's line and each present person's carried side, facing and
 *  travel, judged against every earlier shot of the same scene. Pure. */
export function blockingFor(p: Production, sh: Shot): BlockingState {
  const ordered = orderedShots(p);
  const at = ordered.findIndex((x) => x.id === sh.id);
  // the run of the scene this shot belongs to, from its last transition (a new scene, or a transition inside it)
  let from = at;
  while (from > 0 && ordered[from - 1].sceneId === sh.sceneId && relationOf(p, ordered[from]).relation !== 'STORY_TRANSITION') from--;
  const run = ordered.slice(from, at + 1);
  const pairs = new Map<string, { leftId: string; rightId: string; sinceShotId: string }>();
  const known = new Map<string, Known>();
  let lineFrom: string | undefined;
  let result: BlockingState | undefined;
  for (let i = 0; i < run.length; i++) {
    const s = run[i];
    const prev = i > 0 ? run[i - 1] : undefined;
    const target = s.id === sh.id;
    const relation = relationOf(p, s).relation;
    const crosses = s.continuity?.camera?.crossesLine === true;
    const violations: BlockingViolation[] = [];
    const own = new Map<string, Person>();
    for (const x of s.continuity?.characters ?? []) if (s.characterIds.includes(x.characterId)) own.set(x.characterId, x);
    // THIS SHOT'S SIDES: its own, else carried (a cut or a continuation of the same moment)
    const people: BlockingPerson[] = s.characterIds.map((id) => {
      const mine = own.get(id);
      const k = known.get(id);
      const ownSide = sideOf(mine);
      const ownFacing = mine?.screenDirection;
      const ownTravel = mine?.motion?.direction;
      const carryTravel = !ownTravel && k?.travel && k.travel !== 'STILL' && prev && k.shotId === prev.id ? k.travel : undefined;
      return {
        characterId: id,
        side: ownSide ?? (crosses ? undefined : k?.side), sideCarried: !ownSide && !crosses && Boolean(k?.side),
        facing: ownFacing ?? (crosses ? undefined : k?.facing), facingCarried: !ownFacing && !crosses && Boolean(k?.facing),
        travel: ownTravel ?? (crosses ? undefined : carryTravel), travelCarried: !ownTravel && !crosses && Boolean(carryTravel),
      };
    });
    // THE LINE: every pair this shot stages on different sides, against the order the scene established
    const staged = people.filter((x) => x.side && !x.sideCarried);
    for (let a = 0; a < staged.length; a++) for (let b = a + 1; b < staged.length; b++) {
      const x = staged[a], y = staged[b];
      if (SIDE_RANK[x.side!] === SIDE_RANK[y.side!]) continue;
      const [l, r] = SIDE_RANK[x.side!] < SIDE_RANK[y.side!] ? [x, y] : [y, x];
      const key = pairKey(l.characterId, r.characterId);
      const was = pairs.get(key);
      if (was && was.leftId !== l.characterId && !crosses) violations.push({ kind: 'SIDES_SWAPPED', characterIds: [l.characterId, r.characterId], againstShotId: was.sinceShotId, detail: `the two people swap sides against shot ${ordered.find((o) => o.id === was.sinceShotId)?.number ?? '?'} (the 180° line): mark the shot as crossing the line, or stage them as before` });
      else if (!was || crosses) { pairs.set(key, { leftId: l.characterId, rightId: r.characterId, sinceShotId: s.id }); lineFrom = lineFrom && !crosses ? lineFrom : s.id; }
    }
    // SCREEN DIRECTION and DIRECTION OF TRAVEL against the person's last known staging in the scene
    for (const x of people) {
      const k = known.get(x.characterId);
      if (!k || crosses) continue;
      const mine = own.get(x.characterId);
      const turned = showsTurn(s, x.characterId);
      if (mine?.screenDirection && k.facing && OPPOSITE[k.facing] === mine.screenDirection && !turned) violations.push({ kind: 'FACING_FLIPPED', characterIds: [x.characterId], againstShotId: k.shotId, detail: `faces screen ${words(mine.screenDirection)} after facing screen ${words(k.facing)} in shot ${ordered.find((o) => o.id === k.shotId)?.number ?? '?'} with no turn shown and no neutral angle between (screen direction)` });
      if (mine?.motion?.direction && k.travel && OPPOSITE[k.travel] === mine.motion.direction && !turned && prev && k.shotId === prev.id && relation !== 'STORY_TRANSITION') violations.push({ kind: 'TRAVEL_REVERSED', characterIds: [x.characterId], againstShotId: k.shotId, detail: `travels ${words(mine.motion.direction)} straight after travelling ${words(k.travel)} in shot ${ordered.find((o) => o.id === k.shotId)?.number ?? '?'} (direction of travel across the cut)` });
    }
    if (target) {
      const here = new Set(s.characterIds);
      const relations = [...pairs.values()].filter((r) => here.has(r.leftId) && here.has(r.rightId));
      result = { shotId: s.id, lineFrom, crossesLine: crosses, relations, people, violations };
      break;
    }
    // what this shot leaves for the next: its own facts over the carried ones
    for (const x of people) {
      const mine = own.get(x.characterId);
      const k = known.get(x.characterId);
      known.set(x.characterId, { side: sideOf(mine) ?? x.side ?? k?.side, facing: mine?.screenDirection ?? x.facing ?? k?.facing, travel: mine?.motion?.direction, shotId: s.id });
    }
  }
  return result ?? { shotId: sh.id, crossesLine: false, relations: [], people: [], violations: [] };
}

const SIDE_WORDS: Record<FrameSide, string> = { LEFT: 'the left of the frame', CENTER: 'the centre of the frame', RIGHT: 'the right of the frame' };
/** The people a shot shows from behind (their continuity faces AWAY from the camera): no face to measure. Pure. */
export function facingAway(sh: Pick<Shot, 'continuity'>): string[] {
  return (sh.continuity?.characters ?? []).filter((c) => c.screenDirection === 'AWAY').map((c) => c.characterId);
}

const FACING_WORDS: Partial<Record<ScreenDirection, string>> = { LEFT: 'faces screen left', RIGHT: 'faces screen right', TOWARD: 'faces the camera', AWAY: 'faces away from the camera' };

/** The blocking as prompt sentences about bound subjects (`who`), only what the shot's own continuity does not already
 *  say: the established left/right order of the people in frame, the side and facing carried across the cut, and the
 *  direction of travel carried across it. Empty when nothing is known. */
export function blockingLine(b: BlockingState, who: (characterId: string) => string | undefined, opts: { relation: 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION' }): string {
  if (opts.relation === 'STORY_TRANSITION' && !b.relations.length) return '';
  const out: string[] = [];
  const rel = b.relations.map((r) => { const l = who(r.leftId), rr = who(r.rightId); return l && rr ? `${l} is to the left of ${rr}` : ''; }).filter(Boolean);
  if (rel.length) out.push(`Blocking (the 180° line holds): ${rel.join('; ')}, on screen.`);
  for (const x of b.people) {
    const w = who(x.characterId);
    if (!w) continue;
    const bits = [
      x.sideCarried && x.side && !b.relations.some((r) => r.leftId === x.characterId || r.rightId === x.characterId) && `stays on ${SIDE_WORDS[x.side]}`,
      x.facingCarried && x.facing && FACING_WORDS[x.facing] && `${FACING_WORDS[x.facing]} as before`,
      x.travelCarried && x.travel && x.travel !== 'STILL' && (opts.relation === 'CONTINUATION' ? `keeps moving ${words(x.travel)}` : `if they move, they move ${words(x.travel)} as in the previous shot`),
    ].filter(Boolean);
    if (bits.length) out.push(`${w} ${bits.join(', ')}.`);
  }
  return out.join(' ');
}

/** The compact copy a take records (`params.context.blocking`). */
export const blockingRecord = (b: BlockingState) => ({
  lineFrom: b.lineFrom, crossesLine: b.crossesLine || undefined,
  relations: b.relations.length ? b.relations.map((r) => [r.leftId, r.rightId]) : undefined,
  people: b.people.filter((x) => x.side || x.facing || x.travel).map((x) => ({ characterId: x.characterId, side: x.side, facing: x.facing, travel: x.travel, carried: [x.sideCarried && 'side', x.facingCarried && 'facing', x.travelCarried && 'travel'].filter(Boolean) })),
  violations: b.violations.length ? b.violations.map((v) => ({ kind: v.kind, characterIds: v.characterIds, againstShotId: v.againstShotId })) : undefined,
});

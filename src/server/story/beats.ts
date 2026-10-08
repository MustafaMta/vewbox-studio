import type { Character, ShotBeat, ShotPace } from '@/domain/types';
import type { Framing } from '@/domain/vocabulary';

/** STAGING INSIDE A SHOT — the planning techniques taken from MinimaxStoryBuilder (docs/research/STORYBUILDER-
 *  INTEGRATION.md §d, §e.1 G1–G9; its planner.py and prompts.py were read, nothing is copied: these are the studio's own
 *  implementations of the ideas). Pure functions, so fixture plans prove them without a model:
 *  - `timeBeats`: the planner's beat lengths are RATIOS, rescaled to the shot's real length, every beat at least a
 *    second (time taken from the longest), tiled with no gap or overlap;
 *  - `limitCuts`: an in-take cut (`[Shot N] At MM:SS`) never sits inside the margins at either end, at most two per
 *    take, cuts to another place first, two cuts never closer than the margin;
 *  - `reconcileCast`: whoever the actions name is in the shot's cast;
 *  - `scrubSpeech`: a silent shot's words carry no speech (the model invents dialogue from a speech verb);
 *  - `closeFramingFor`: a speaking face is framed close (identity lives on face pixels);
 *  - `planCoverage`: the scene's written beats each land in some shot. */

export const MIN_BEAT_SECONDS = 1.0;
export const MAX_IN_TAKE_CUTS = 2;

export interface DraftBeat { seconds: number; action: string; cut?: { camera: string; locationId?: string } }

/** Beat lengths as ratios → start times on the shot: rescaled to `total`, floored at a second (the longest beats give
 *  the time), tiled exactly. An empty list stays empty; a single beat spans the shot. */
export function timeBeats(beats: DraftBeat[], total: number, minBeat = MIN_BEAT_SECONDS): ShotBeat[] {
  const n = beats.length;
  if (!n || total <= 0) return [];
  const raw = beats.map((b) => Math.max(0.1, Number(b.seconds) || 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  let lengths = raw.map((s) => (s / sum) * total);
  // the floor: lift short beats, taking the time from the longest ones (never below the floor themselves)
  const floor = Math.min(minBeat, total / n);
  for (let pass = 0; pass < n; pass++) {
    const short = lengths.map((l, i) => (l < floor - 1e-9 ? i : -1)).filter((i) => i >= 0);
    if (!short.length) break;
    let need = short.reduce((a, i) => a + (floor - lengths[i]), 0);
    for (const i of short) lengths[i] = floor;
    const donors = lengths.map((l, i) => ({ l, i })).filter((x) => !short.includes(x.i) && x.l > floor).sort((a, b) => b.l - a.l);
    for (const d of donors) { if (need <= 1e-9) break; const give = Math.min(need, d.l - floor); lengths[d.i] -= give; need -= give; }
  }
  // tile: cumulative starts, the last beat absorbs rounding
  const out: ShotBeat[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) { out.push({ at: Number(t.toFixed(3)), action: beats[i].action.trim(), ...(beats[i].cut ? { cut: beats[i].cut } : {}) }); t += lengths[i]; }
  lengths = lengths.map((l) => Number(l.toFixed(3)));
  return out;
}

/** The margin a cut keeps from either end of the take: the smaller of 3 s and a fifth of it (2.5 s for a montage). */
export const cutMargin = (total: number, pace?: ShotPace): number => Math.min(pace === 'MONTAGE' ? 2.5 : 3.0, 0.2 * total);

/** Cuts policed: none inside the margins, at most `max`, a cut that changes the place ranked first, two cuts never
 *  closer than the margin; a beat that loses its cut keeps its action (it reads as a point mark). A DWELL shot has
 *  no cuts at all. */
export function limitCuts(beats: ShotBeat[], total: number, opts: { pace?: ShotPace; max?: number } = {}): ShotBeat[] {
  const max = opts.max ?? MAX_IN_TAKE_CUTS;
  const margin = cutMargin(total, opts.pace);
  const candidates = beats.map((b, i) => ({ b, i })).filter(({ b, i }) => b.cut && i > 0 && b.at >= margin - 1e-9 && b.at <= total - margin + 1e-9);
  if (opts.pace === 'DWELL') return beats.map(({ cut: _c, ...b }) => b);
  // place changes first, then earlier cuts; keep each only when far enough from the kept ones
  const ranked = [...candidates].sort((x, y) => Number(Boolean(y.b.cut?.locationId)) - Number(Boolean(x.b.cut?.locationId)) || x.b.at - y.b.at);
  const kept: number[] = [];
  for (const c of ranked) { if (kept.length >= max) break; if (kept.every((i) => Math.abs(beats[i].at - c.b.at) >= margin - 1e-9)) kept.push(c.i); }
  return beats.map((b, i) => (kept.includes(i) ? b : (({ cut: _c, ...rest }) => rest)(b)));
}

/** Whoever the action text names AS ACTING is in the shot's cast (a character who acts must be in the shot). Returns
 *  the cast in the shot's order with the named ones added, and who was added. Names are matched whole, in either
 *  script. A name only addressed, looked at or spoken of ("listens to Marcus", "turns toward where Layla stands",
 *  "Marcus's voice", a clause saying off-screen) does not put the person in the picture (continuity recovery
 *  2026-10-08: a mentioned or off-screen character became an extra person in the frame). */
const OFFSCREEN_CLAUSE = /\b(off[- ]?screen|off[- ]?camera|out of (?:the )?(?:frame|shot|picture)|unseen|voice[- ]?over|o\.s\.|v\.o\.)/i;
const ADDRESSED = /(?:\b(?:to|at|towards|toward|for|about|of|from|after|watching|watches|hears|heard|hearing|listens|listening|thinks|remembers)\s+(?:where\s+)?)$/i;
export function reconcileCast(characterIds: string[], texts: string[], cast: Pick<Character, 'id' | 'name' | 'nameAr'>[]): { characterIds: string[]; added: string[] } {
  const clauses = texts.filter(Boolean).join('\n').split(/[\n.;!?]+|,\s+/).map((s) => s.trim()).filter(Boolean).filter((s) => !OFFSCREEN_CLAUSE.test(s));
  const mentioned = (name?: string) => {
    if (!name || name.trim().length <= 1) return false;
    // "Marcus's hand" is Marcus in the picture; "Marcus's voice / photo / letter" is not
    const re = new RegExp(`(^|[^\\p{L}])${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])(['’]s\\s+(?:voice|words|call|cry|shout|photo|photograph|picture|portrait|letter|note|message|name|memory|ghost|shadow)\\b)?`, 'gu');
    return clauses.some((s) => [...s.matchAll(re)].some((m) => !m[2] && !ADDRESSED.test(s.slice(0, m.index! + m[1].length))));
  };
  const added: string[] = [];
  const out = [...characterIds];
  for (const c of cast) if (!out.includes(c.id) && (mentioned(c.name) || mentioned(c.nameAr))) { out.push(c.id); added.push(c.id); }
  return { characterIds: out, added };
}

const SPEECH: Array<[RegExp, string]> = [
  [/\b(whisper|whispers|whispered|whispering)\b/gi, 'leans close'],
  [/\b(shout|shouts|shouted|shouting|yell|yells|yelled|yelling|scream|screams|screamed|screaming)\b/gi, 'gestures sharply'],
  [/\b(ask|asks|asked|asking)\b/gi, 'looks a question at'],
  [/\b(repl(?:y|ies|ied|ying)|answer|answers|answered|answering)\b/gi, 'nods'],
  [/\b(call|calls|called|calling) out\b/gi, 'beckons'],
  [/\b(say|says|said|saying|tell|tells|told|telling|speak|speaks|spoke|speaking|talk|talks|talked|talking|mutter|mutters|muttered|muttering|murmur|murmurs|murmured|murmuring|explain|explains|explained|explaining|argue|argues|argued|arguing|chat|chats|chatted|chatting|sing|sings|sang|singing|hum|hums|hummed|humming|laugh|laughs|laughed|laughing)\b/gi, 'stays silent'],
  [/\b(dialogue|conversation|speech|words|voice-?over|narration)\b/gi, 'silence'],
];

/** A silent shot's text without speech: quoted lines removed, speech verbs turned into silent action, and the clamp
 *  that the mouths stay closed. The words are the planner's; nothing is invented beyond the clamp. */
export function scrubSpeech(text: string): string {
  let out = text.replace(/["“”«»][^"“”«»]{1,400}["“”«»]/g, '').replace(/<d>[\s\S]*?<\/d>/g, '');
  for (const [re, to] of SPEECH) out = out.replace(re, to);
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  return out && !/mouths? (stay|stays|remain|remains) closed/i.test(out) ? `${out.replace(/\.?$/, '.')} Mouths stay closed; nobody speaks.` : out || 'Mouths stay closed; nobody speaks.';
}

/** The framing a speaking shot with people gets: a wide framing on a face loses the identity (E4a), so WIDE sizes
 *  tighten to a medium close-up; two-shots, over-the-shoulder, medium and closer stay. */
export function closeFramingFor(framing: Framing, opts: { people: number; dialogue: boolean }): Framing {
  if (!opts.dialogue || opts.people === 0) return framing;
  return framing === 'EXTREME_WIDE' || framing === 'WIDE' || framing === 'MEDIUM_WIDE' ? (opts.people >= 2 ? 'TWO_SHOT' : 'MEDIUM_CLOSE_UP') : framing;
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4);

/** Which of the scene's written beats no shot covers: a beat is covered when a shot's action, beats or actions list
 *  share enough of its words (half of its longer words, at least two), or carry one of its lines. */
export function planCoverage(sceneBeats: Array<{ id: string; action: string; lines: Array<{ id: string }> }>, shots: Array<{ action: string; dialogue: Array<{ id: string }>; staging?: { beats?: Array<{ action: string }>; actions?: string[] } }>): { uncovered: Array<{ id: string; action: string }> } {
  const uncovered: Array<{ id: string; action: string }> = [];
  for (const b of sceneBeats) {
    const want = Array.from(new Set(words(b.action)));
    const lines = new Set(b.lines.map((l) => l.id));
    const covered = shots.some((sh) => {
      if (sh.dialogue.some((d) => lines.has(d.id))) return true;
      const have = new Set(words([sh.action, ...(sh.staging?.beats ?? []).map((x) => x.action), ...(sh.staging?.actions ?? [])].join(' ')));
      const hit = want.filter((w) => have.has(w)).length;
      return want.length > 0 && hit >= Math.max(2, Math.ceil(want.length / 2));
    });
    if (!covered) uncovered.push({ id: b.id, action: b.action });
  }
  return { uncovered };
}

/** `[M:SS]` for a beat mark, `MM:SS.mmm` for an in-take cut (the H3 grammar's `At 00:05.000`). */
export const markTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const cutTime = (seconds: number): string => { const m = Math.floor(seconds / 60); const s = seconds - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`; };

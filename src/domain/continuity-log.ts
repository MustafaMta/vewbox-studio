import type { FrameSide, Production, ScreenDirection, Shot, StudioState, WorldBible } from './types';
import { canonical, hashString } from './hash';
import { sceneStateFor, type SceneProp, type SceneState } from './scene-state';
import { productionContextFor } from './production-context';
import { takeVerdictOf } from './take-checks';

/** THE CONTINUITY LOG — the script supervisor's record, as a first-class, derived record of the production
 *  (final directive §9 "continuity log"; continuity gaps 2026-10-06 item 7). For every shot in cut order:
 *  - ESTABLISHED: what is true at the end of the shot — each person's side of frame, facing, travel, what they hold,
 *    their wardrobe (and a story's wardrobe change), condition and end pose; the props with state and position; the
 *    time of day, light, weather and the state of the place;
 *  - CHANGES against the shot before (same scene, a cut or a continuation): what changed and whether something explains
 *    it (the shot's action, a persistent story change, a crossed line) — an unexplained change is a FLAG;
 *  - FLAGS: a crossed 180° line, a facing flip, a reversed travel; a held prop gone without an action; a prop whose
 *    state changed unexplained; light or time of day changing inside a scene; a continuous shot with no end pose before
 *    it; the chosen take's REVIEW checks (src/domain/take-checks.ts). A flag the producer accepted
 *    (`continuity.acknowledged`) stays in the log, marked.
 *  Derived — computed from the stored records every time, so it never disagrees with them — and hashed, so a page or
 *  an evidence bundle can say exactly which state it showed. Pure. */

export type LogFlagKind = 'SIDES_SWAPPED' | 'FACING_FLIPPED' | 'TRAVEL_REVERSED' | 'HOLDING_DROPPED' | 'PROP_CHANGED' | 'WARDROBE_CHANGED' | 'LIGHT_CHANGED' | 'TIME_CHANGED' | 'POSE_GAP' | 'TAKE_REVIEW';
export interface LogFlag { key: string; kind: LogFlagKind; detail: string; characterIds?: string[]; acknowledged: boolean }
export interface LogChange { what: string; from?: string; to?: string; explainedBy?: string }
export interface LogPerson { characterId: string; side?: FrameSide; facing?: ScreenDirection; travel?: string; holding?: string[]; wardrobe?: string; wardrobeChange?: string; condition: string[]; endPose?: string }
export interface ContinuityLogEntry {
  shotId: string; sceneId: string; sceneNumber: number; shotNumber: number; boundary: SceneState['boundary'];
  established: { people: LogPerson[]; props: SceneProp[]; timeOfDay?: string; lighting?: string; weather?: string; placeState?: string };
  changes: LogChange[];
  flags: LogFlag[];
  take?: { takeId: string; decision: string; flags: string[] };
  contextHash: string;
}
export interface ContinuityLog { productionId: string; entries: ContinuityLogEntry[]; open: number; hash: string }

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const words = (s?: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
/** How alike two descriptions are (word overlap): paraphrases of the same outfit stay above ~0.3. */
const alike = (a?: string, b?: string) => { const x = words(a), y = words(b); if (!x.size || !y.size) return 1; let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size); };
const shotText = (sh: Shot) => [sh.action, sh.prompt, ...(sh.staging?.beats ?? []).map((b) => b.action), ...(sh.continuity?.characters ?? []).flatMap((c) => [c.startPose, c.endPose, c.pose])].filter(Boolean).join(' ');
const mentions = (text: string, name: string) => { const n = norm(name).split(' ').filter((w) => w.length > 2); return n.length > 0 && n.some((w) => norm(text).includes(w)); };
const HANDLING = /\b(put|puts|putting|set|sets|setting|lay|lays|place|places|drop|drops|dropped|hand|hands|handed|give|gives|gave|leave|leaves|left|throw|throws|pocket|pockets|hide|hides)\b/i;
const LIGHTING = /\b(light|lights|lamp|lamps|switch|switches|dark|darkness|sun|sunset|sunrise|dawn|dusk|candle|curtain|curtains|blinds|flicker|flickers|power|bulb)\b/i;

export function continuityLog(state: Pick<StudioState, 'characters' | 'locations' | 'assets' | 'settings'>, p: Production, opts: { bible?: WorldBible } = {}): ContinuityLog {
  const n = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  const ordered = [...p.shots].sort((a, b) => (n.get(a.sceneId) ?? 0) - (n.get(b.sceneId) ?? 0) || a.number - b.number);
  const entries: ContinuityLogEntry[] = [];
  let prevState: SceneState | undefined;
  let prevShot: Shot | undefined;
  for (const sh of ordered) {
    const st = sceneStateFor(p, sh, { bible: opts.bible, previous: prevState });
    const ctx = productionContextFor(state, p, sh, { bible: opts.bible });
    const bl = ctx.blocking;
    const acked = new Set(sh.continuity?.acknowledged ?? []);
    const flags: LogFlag[] = [];
    const flag = (kind: LogFlagKind, subject: string, detail: string, characterIds?: string[]) => { const key = `${kind}:${subject}`; if (!flags.some((f) => f.key === key)) flags.push({ key, kind, detail, characterIds, acknowledged: acked.has(key) }); };
    const changes: LogChange[] = [];
    const nameOf = (id: string) => state.characters.find((c) => c.id === id)?.name ?? id;
    for (const v of bl.violations) flag(v.kind, v.characterIds.join('+'), `${v.characterIds.map(nameOf).join(' and ')}: ${v.detail}`, v.characterIds);
    const sameScene = Boolean(prevShot && prevShot.sceneId === sh.sceneId && st.relation !== 'STORY_TRANSITION' && prevState);
    const text = shotText(sh);
    if (sameScene && prevState) {
      // what people hold: a prop gone from a hand with nothing in the shot that handles it
      for (const person of st.present) {
        const before = prevState.present.find((x) => x.characterId === person.characterId);
        for (const held of before?.holding ?? []) {
          if ((person.holding ?? []).some((h) => norm(h) === norm(held))) continue;
          const explained = mentions(text, held) && HANDLING.test(text);
          changes.push({ what: `${nameOf(person.characterId)} holds`, from: held, to: (person.holding ?? []).join(', ') || 'nothing', explainedBy: explained ? 'the shot’s action handles it' : undefined });
          if (!explained) flag('HOLDING_DROPPED', `${person.characterId}:${norm(held)}`, `${nameOf(person.characterId)} held ${held} at the end of shot ${prevShot!.number}; here it is gone with no action that puts it down`, [person.characterId]);
        }
        // the clothes, worded differently enough to be another outfit, with no story change behind it
        const ca = ctx.characters.find((x) => x.characterId === person.characterId);
        if (before?.wardrobe && person.wardrobe && alike(before.wardrobe, person.wardrobe) < 0.3) {
          const explained = Boolean(ca?.wardrobeChange);
          changes.push({ what: `${nameOf(person.characterId)} wears`, from: before.wardrobe, to: person.wardrobe, explainedBy: explained ? 'a wardrobe change in the story' : undefined });
          if (!explained) flag('WARDROBE_CHANGED', person.characterId, `${nameOf(person.characterId)}’s clothes read differently from shot ${prevShot!.number} (“${before.wardrobe}” → “${person.wardrobe}”) with no wardrobe change in the story`, [person.characterId]);
        }
      }
      // props whose state changed with nothing in the shot (or the story) that changes them
      for (const pr of st.props) {
        const was = prevState.props.find((x) => norm(x.name) === norm(pr.name));
        if (!was || !was.state || !pr.state || norm(was.state) === norm(pr.state)) continue;
        const story = ctx.story.changes.some((c) => c.subject.kind === 'PROP' && norm(c.subject.name) === norm(pr.name));
        const explained = story || mentions(text, pr.name);
        changes.push({ what: pr.name, from: was.state, to: pr.state, explainedBy: explained ? (story ? 'a persistent story change' : 'the shot’s action') : undefined });
        if (!explained) flag('PROP_CHANGED', norm(pr.name), `${pr.name} was “${was.state}” in shot ${prevShot!.number}, here “${pr.state}”, and nothing in the shot changes it`);
      }
      // light and time inside one scene
      if (prevState.lighting && st.lighting && norm(prevState.lighting) !== norm(st.lighting) && alike(prevState.lighting, st.lighting) < 0.5) {
        const explained = LIGHTING.test(sh.action ?? '');
        changes.push({ what: 'light', from: prevState.lighting, to: st.lighting, explainedBy: explained ? 'the shot’s action' : undefined });
        if (!explained) flag('LIGHT_CHANGED', 'scene', `the light changes inside the scene (“${prevState.lighting}” → “${st.lighting}”) on a ${st.boundary === 'continuous' ? 'continuous shot' : 'cut'} with no action that changes it`);
      }
      if (prevState.timeOfDay && st.timeOfDay && prevState.timeOfDay !== st.timeOfDay) {
        changes.push({ what: 'time of day', from: prevState.timeOfDay, to: st.timeOfDay });
        flag('TIME_CHANGED', 'scene', `the time of day jumps from ${prevState.timeOfDay.toLowerCase()} to ${st.timeOfDay.toLowerCase()} inside a scene: a time jump is a transition`);
      }
    }
    for (const g of ctx.gaps.filter((x) => x.startsWith('shot list:'))) flag('POSE_GAP', g.replace(/^.*for (.+?), so.*$/, '$1'), g.replace(/^shot list: /, ''));
    const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
    let takeInfo: ContinuityLogEntry['take'];
    if (take && take.provider !== 'SAMPLE') {
      const v = takeVerdictOf(take);
      takeInfo = { takeId: take.id, decision: v.decision, flags: v.flags };
      if (v.decision === 'REVIEW') flag('TAKE_REVIEW', take.id, `the chosen take ${take.label} has checks to review: ${v.flags.join(', ')}`);
    }
    const people: LogPerson[] = st.present.map((x) => {
      const ca = ctx.characters.find((c) => c.characterId === x.characterId);
      const b = bl.people.find((y) => y.characterId === x.characterId);
      return { characterId: x.characterId, side: b?.side, facing: b?.facing, travel: b?.travel, holding: x.holding, wardrobe: x.wardrobe, wardrobeChange: ca?.wardrobeChange?.text, condition: (ca?.condition ?? []).map((k) => k.text), endPose: ca?.endPose };
    });
    entries.push({ shotId: sh.id, sceneId: sh.sceneId, sceneNumber: n.get(sh.sceneId) ?? 0, shotNumber: sh.number, boundary: st.boundary, established: { people, props: st.props, timeOfDay: st.timeOfDay, lighting: st.lighting ?? ctx.location?.lighting, weather: st.weather, placeState: st.placeState }, changes, flags, ...(takeInfo ? { take: takeInfo } : {}), contextHash: ctx.hash });
    prevState = st; prevShot = sh;
  }
  const open = entries.reduce((a, e) => a + e.flags.filter((f) => !f.acknowledged).length, 0);
  return { productionId: p.id, entries, open, hash: hashString(canonical(entries)).slice(0, 16) };
}

import type { Asset, Character, Production, Shot, StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { approval, identityStatus, imageJobs } from '@/components/character/identity';
import { productionHref } from '@/studio/selectors';

/** ONE SOURCE OF TRUTH FOR DECISIONS (docs/CONTRACTS-REDESIGN-BACKEND.md B8; docs/DESIGN-SYSTEM-V5.md §6.7) — what
 *  waits for the producer, from real state only, never estimated. The same pure function runs in the shell (on the
 *  browser's snapshot and job list) and on the server (`GET /api/decisions`, src/server/studio/decisions.ts), so the
 *  count is one number wherever it is shown. It lists:
 *    - `stage`     a pipeline gate awaiting approval (STORY, EDIT: the stages with a human approval), for a production
 *                  that is not finished — decided on the Production page;
 *    - `image`     a character's draft canonical image the producer can approve now (drawn, not approved, not locked by
 *                  use in a video, nothing being redrawn) — decided on the character's page;
 *    - `line`      a dialogue line to hear again: recorded by a DIALOGUE_AUDIO job (or by a take) that waits in
 *                  AWAITING_REVIEW, whose recording drifted from the script or could not be heard back — decided in the
 *                  shot workspace;
 *    - `take`      a take with a REVIEW verdict (its speech could not be verified) from a GENERATE_TAKE job awaiting
 *                  review — decided in the shot workspace;
 *    - `pass`      a production pass (PRODUCE) parked for review — decided on the production map;
 *    - `character` a CREATE_CHARACTER run awaiting review (a step failed or waits), unless its draft image is already
 *                  listed or the identity was approved or locked by use since (nothing left to decide) — decided on
 *                  the character's page.
 *  When the pipeline has not answered, its part is unknown and only what is known is counted (`complete: false`). */

export interface PipelineRow { productionId: string; stages: Array<{ id: string; status: string; at: string | null }> }

export type DecisionKind = 'stage' | 'image' | 'line' | 'take' | 'pass' | 'character';

/** The ids a page needs to open and decide the item. */
export interface DecisionSubject { productionId?: string; stage?: string; characterId?: string; shotId?: string; lineId?: string; takeId?: string; jobId?: string }

export interface Decision {
  kind: DecisionKind;
  /** stable: `stage:{production}:{stage}`, `image:{character}`, `line:{job}:{line}`, `take:{job}:{take}`, `pass:{job}`, `character:{job}` */
  id: string;
  /** what it is about, as the item reads it: the production's title, the character's name, the line's words */
  title: string;
  titleAr?: string;
  subject: DecisionSubject;
  /** when it started waiting (ISO), when known */
  since: string | null;
  /** the route to decide it */
  href: string;
}

export interface Decisions { items: Decision[]; count: number; /** false while the pipeline's part is not known */ complete: boolean }

export type DecisionState = Pick<StudioState, 'productions' | 'characters' | 'shows' | 'assets'>;

const imageWaiting = (c: Character, jobs: Job[]) => approval(identityStatus(c), Boolean(imageJobs(c, jobs).running)).can;
const titleOf = (p: Production) => (p.kind === 'MUSIC_VIDEO' ? (p.song?.title || p.title) : p.title);
const sinceOf = (j: Job) => j.finishedAt ?? j.updatedAt ?? j.createdAt ?? null;
const shotHref = (p: Production, shotId: string) => `${productionHref(p)}/shots/${encodeURIComponent(shotId)}`;
const mapHref = (p: Production) => `${productionHref(p)}/production`;

/** A recording that needs a human ear: its check (src/worker/handlers/voice.ts LineCheck) failed, or there was none. */
const needsEar = (a: Asset | undefined): boolean => Boolean(a) && (!('check' in (a!.provenance ?? {})) || a!.provenance?.check === null || (a!.provenance?.check as { ok?: boolean } | null | undefined)?.ok === false);

/** The lines a job recorded (their current recording carries the job's id) that still need a human ear. */
function linesToHear(p: Production, assets: Asset[], jobId: string): Array<{ shot: Shot; lineId: string; text: string; textAr?: string; characterId: string }> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out: Array<{ shot: Shot; lineId: string; text: string; textAr?: string; characterId: string }> = [];
  for (const sh of p.shots) for (const d of sh.dialogue) {
    const a = d.audioAssetId ? byId.get(d.audioAssetId) : undefined;
    if (a && a.jobId === jobId && needsEar(a)) out.push({ shot: sh, lineId: d.id, text: d.text, textAr: d.textAr, characterId: d.characterId });
  }
  return out;
}

export function waitingDecisions(state: DecisionState, pipeline: PipelineRow[] | null, jobs: Job[]): Decisions {
  const items: Decision[] = [];
  const nameOf = (id: string) => state.characters.find((c) => c.id === id);

  // ---- pipeline gates ----
  for (const p of state.productions) {
    if (p.stage === 'COMPLETE') continue;
    const row = pipeline?.find((r) => r.productionId === p.id);
    const stage = row?.stages.find((s) => s.status === 'AWAITING_APPROVAL');
    if (!stage) continue;
    // the decision is made on its card in Production (it opens the card; it never approves from here)
    items.push({ kind: 'stage', id: `stage:${p.id}:${stage.id}`, title: titleOf(p), titleAr: p.titleAr, subject: { productionId: p.id, stage: stage.id }, since: stage.at, href: '/production#needs-you' });
  }
  // ---- draft images ----
  const imaged = new Set<string>();
  for (const c of state.characters) {
    if (!imageWaiting(c, jobs)) continue;
    imaged.add(c.id);
    items.push({ kind: 'image', id: `image:${c.id}`, title: c.name, titleAr: c.nameAr, subject: { characterId: c.id }, since: c.canonicalImage?.generatedAt ?? null, href: `/characters/${encodeURIComponent(c.id)}` });
  }
  // ---- what the jobs parked for a person, oldest first ----
  const review = jobs.filter((j) => j.status === 'AWAITING_REVIEW').sort((a, b) => (sinceOf(a) ?? '').localeCompare(sinceOf(b) ?? ''));
  for (const j of review) {
    const p = j.productionId ? state.productions.find((x) => x.id === j.productionId) : undefined;
    if (j.type === 'DIALOGUE_AUDIO' || j.type === 'GENERATE_TAKE') {
      if (!p) continue;
      const r = (j.result ?? {}) as { takeId?: string; takeUnverified?: boolean; flagged?: number; unverified?: number };
      const lines = linesToHear(p, state.assets, j.id);
      for (const l of lines) {
        const who = nameOf(l.characterId);
        items.push({ kind: 'line', id: `line:${j.id}:${l.lineId}`, title: who ? `${who.name}: “${l.text}”` : l.text, titleAr: l.textAr ? `${who?.nameAr ?? who?.name ?? ''}${who ? ': ' : ''}«${l.textAr}»` : undefined, subject: { productionId: p.id, shotId: l.shot.id, lineId: l.lineId, characterId: l.characterId, jobId: j.id }, since: sinceOf(j), href: shotHref(p, l.shot.id) });
      }
      if (j.type === 'GENERATE_TAKE' && j.shotId && (r.takeUnverified || lines.length === 0)) {
        items.push({ kind: 'take', id: `take:${j.id}:${r.takeId ?? 'take'}`, title: titleOf(p), titleAr: p.titleAr, subject: { productionId: p.id, shotId: j.shotId, takeId: r.takeId, jobId: j.id }, since: sinceOf(j), href: shotHref(p, j.shotId) });
      } else if (j.type === 'DIALOGUE_AUDIO' && lines.length === 0) {
        // the job says lines wait but their recordings were replaced since: one item for the job, so nothing is lost
        items.push({ kind: 'line', id: `line:${j.id}`, title: titleOf(p), titleAr: p.titleAr, subject: { productionId: p.id, jobId: j.id }, since: sinceOf(j), href: mapHref(p) });
      }
    } else if (j.type === 'PRODUCE') {
      if (!p) continue;
      items.push({ kind: 'pass', id: `pass:${j.id}`, title: titleOf(p), titleAr: p.titleAr, subject: { productionId: p.id, jobId: j.id }, since: sinceOf(j), href: mapHref(p) });
    } else if (j.type === 'CREATE_CHARACTER') {
      const cid = j.characterId ?? (j.result as { characterId?: string } | undefined)?.characterId;
      const c = cid ? nameOf(cid) : undefined;
      // nothing to decide when the draft is already listed, or the identity was approved (or locked by use) since
      if (!c || imaged.has(c.id)) continue;
      const kind = identityStatus(c).kind;
      if (kind === 'APPROVED' || kind === 'LOCKED') continue;
      items.push({ kind: 'character', id: `character:${j.id}`, title: c.name, titleAr: c.nameAr, subject: { characterId: c.id, jobId: j.id }, since: sinceOf(j), href: `/characters/${encodeURIComponent(c.id)}` });
    }
  }
  return { items, count: items.length, complete: pipeline !== null };
}

/** The count per kind, for a page that groups them. */
export const decisionCounts = (d: Decisions): Record<DecisionKind, number> => d.items.reduce((acc, x) => ({ ...acc, [x.kind]: acc[x.kind] + 1 }), { stage: 0, image: 0, line: 0, take: 0, pass: 0, character: 0 } as Record<DecisionKind, number>);

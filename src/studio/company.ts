import type { HandoffRow, OrgAgent, OrgResponse, StageDef } from './org';
import { agentForJobType } from './org';

/** THE STUDIO COMPANY, DERIVED — everything the constellation, the inspector and the phone spine show, computed from
 *  the organisation response and nothing else. Pure functions (no React), so the rules are pinned by unit tests:
 *  - a department lights only while one of its agents has an open run;
 *  - a connection exists only where a handoff was recorded (no handoff, no line);
 *  - the orchestrator's state and its production rings come from the jobs, positions and approvals.
 *  The geometry is docs/DESIGN-SYSTEM-V3.md §9.1: one orbit around the orchestrator, the departments in pipeline
 *  order clockwise from the top. */

/** The ring order follows the flow of a production. */
export const RING = ['EXECUTIVE', 'STORY', 'CASTING', 'WORLD', 'PREPRODUCTION', 'SOUND', 'VIDEO', 'QA', 'POST'] as const;

export type OrchestratorState = 'IDLE' | 'READY' | 'COORDINATING' | 'PRODUCING' | 'AWAITING_REVIEW' | 'BLOCKED';
export type NodeState = 'idle' | 'working' | 'waiting' | 'blocked';
export type EdgeState = 'used' | 'recent' | 'waiting' | 'refused';

const GPU_JOBS = new Set(['GENERATE_TAKE', 'SHOT_FRAMES', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS', 'LOCATION_PLATES', 'VOICE_BUILD', 'VOICE_PREVIEW', 'DIALOGUE_AUDIO', 'GENERATE_SONG']);
export const RUNNING_STATUSES = new Set(['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING']);
/** "Recent" for a handoff path: the last 90 minutes. */
export const RECENT_MS = 90 * 60_000;

// -------------------------------------------------------------------------------------------------- geometry

/** The stage's coordinate frame (the SVG viewBox; nodes are placed in the same coordinates). */
export const VIEW = { w: 1000, h: 775, cx: 500, cy: 388, rx: 300, ry: 280 } as const;

export type Placement = 'above' | 'below' | 'beside';
export interface Seat { id: string; index: number; theta: number; x: number; y: number; placement: Placement; /** physical side of the centre the seat is on */ side: 'left' | 'right' | 'centre' }

/** Department i at θ = −90° + i·40° on the orbit. Labels sit outside the orbit: above when
 *  sin θ < −0.5, below when sin θ > 0.6, beside otherwise — never inside, where the connections run. */
export function seats(): Seat[] {
  return RING.map((id, index) => {
    const theta = -90 + index * 40;
    const th = (theta * Math.PI) / 180;
    const y = VIEW.cy + VIEW.ry * Math.sin(th);
    const x = round(VIEW.cx + VIEW.rx * Math.cos(th));
    const s = Math.sin(th);
    const placement: Placement = s < -0.5 ? 'above' : s > 0.6 ? 'below' : 'beside';
    const side = Math.abs(x - VIEW.cx) < 1 ? 'centre' : x > VIEW.cx ? 'right' : 'left';
    return { id, index, theta, x, y: round(y), placement, side };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
type Pt = { x: number; y: number };
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y) || 1;
const unit = (a: Pt): Pt => mul(a, 1 / len(a));

/** A handoff path: a quadratic Bézier from the producer's disc edge to the receiver's, its control point pulled
 *  halfway to the centre (C = M + 0.5·(O − M)), so every path bends toward the orchestrator that coordinates it —
 *  hierarchical bundling through the hub. `bend` shifts the control point sideways when two paths share a pair.
 *  Lengths are in viewBox units. */
export function edgeGeometry(P: Pt, Q: Pt, rStart: number, rEnd: number, arrow: number, bend = 0) {
  const O = { x: VIEW.cx, y: VIEW.cy };
  const M = mul(add(P, Q), 0.5);
  let C = add(M, mul(sub(O, M), 0.5));
  if (bend) { const d = unit(sub(Q, P)); C = add(C, mul({ x: -d.y, y: d.x }, bend)); }
  const s = add(P, mul(unit(sub(C, P)), rStart));
  const e = add(Q, mul(unit(sub(C, Q)), rEnd));
  const t = unit(sub(e, C));
  const n = { x: -t.y, y: t.x };
  const back = sub(e, mul(t, arrow));
  const a1 = add(back, mul(n, arrow * 0.7));
  const a2 = sub(back, mul(n, arrow * 0.7));
  const mid = add(add(mul(s, 0.25), mul(C, 0.5)), mul(e, 0.25));
  // the curve's length, sampled (for the travelling light)
  let length = 0; let prev = s;
  for (let i = 1; i <= 24; i++) { const k = i / 24; const p = add(add(mul(s, (1 - k) ** 2), mul(C, 2 * (1 - k) * k)), mul(e, k * k)); length += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  const f = (p: Pt) => `${round(p.x)},${round(p.y)}`;
  return { d: `M${f(s)} Q${f(C)} ${f(e)}`, arrow: `M${f(a1)} L${f(e)} L${f(a2)}`, mid, length };
}

// ------------------------------------------------------------------------------------------------ the record

export interface CompanyEdge { key: string; from: string; to: string; stages: string[]; handoffs: HandoffRow[]; latest: HandoffRow; state: EdgeState; recentCount: number }
export interface InFlight { productionId: string; done: number; total: number; running: boolean; current?: { id: string; status: string } }

/** The departments that own a stage (Cast & world belongs to two). */
export function stageOwners(org: Pick<OrgResponse, 'departments'>, stage: StageDef): string[] {
  const owners = org.departments.filter((d) => (d.stages as string[]).includes(stage.id)).map((d) => d.id as string);
  return owners.length ? owners : [stage.department];
}

/** A department's place in the pipeline, from the stage graph: whom its stages depend on, who depends on them, and
 *  whether that link passes one of your approval gates. */
export function pipelineNeighbours(org: Pick<OrgResponse, 'departments' | 'pipeline'>, dept: string): { from: Array<{ id: string; gate: boolean }>; to: Array<{ id: string; gate: boolean }> } {
  const owned = org.pipeline.filter((s) => stageOwners(org, s).includes(dept));
  const from = new Map<string, boolean>(); const to = new Map<string, boolean>();
  for (const s of owned) for (const dep of s.dependsOn) { const ds = org.pipeline.find((x) => x.id === dep); if (!ds) continue; for (const o of stageOwners(org, ds)) if (o !== dept) from.set(o, (from.get(o) ?? false) || ds.approval === 'HUMAN'); }
  for (const s of org.pipeline) { if (!s.dependsOn.some((dep) => owned.some((o) => o.id === dep))) continue; const gate = owned.some((o) => s.dependsOn.includes(o.id) && o.approval === 'HUMAN'); for (const o of stageOwners(org, s)) if (o !== dept) to.set(o, (to.get(o) ?? false) || gate); }
  const order = (id: string) => RING.indexOf(id as (typeof RING)[number]);
  const list = (m: Map<string, boolean>) => Array.from(m, ([id, gate]) => ({ id, gate })).sort((a, b) => order(a.id) - order(b.id));
  return { from: list(from), to: list(to) };
}

/** The record of a handoff path: the producing and the receiving department. An Edit handoff goes to the
 *  producer's cut approval, drawn as Post-Production → Executive Office. A department handing to itself, or to
 *  nobody, draws nothing. */
export function handoffPair(h: HandoffRow): { from: string; to: string } | null {
  const from = h.producerDepartment;
  const to = h.stage === 'EDIT' ? 'EXECUTIVE' : h.receiverDepartment;
  if (!to || to === from) return null;
  return { from, to };
}

export function deriveCompany(org: OrgResponse, activeProductionIds: string[], now = Date.now()) {
  const running = org.jobs.filter((j) => RUNNING_STATUSES.has(j.status));
  const queued = org.jobs.filter((j) => j.status === 'QUEUED');
  const failedJobs = org.jobs.filter((j) => j.status === 'FAILED');

  // who is working: an agent with an open run (its stats count it) or the owner of a running job
  const workingAgents = new Map<string, Set<string>>();
  const mark = (a: OrgAgent | undefined) => { if (!a) return; const s = workingAgents.get(a.department) ?? new Set<string>(); s.add(a.id); workingAgents.set(a.department, s); };
  for (const s of org.stats) if (s.running > 0) mark(org.agents.find((a) => a.id === s.agentId));
  for (const j of running) mark(agentForJobType(org.agents, j.type));
  const activeDepts = new Set(Array.from(workingAgents.keys()));

  const positions = org.positions.filter((p) => activeProductionIds.includes(p.productionId));
  const awaiting = positions.flatMap((p) => p.stages.filter((s) => s.status === 'AWAITING_APPROVAL').map((s) => ({ productionId: p.productionId, stage: s.id, department: s.department, at: s.at })));
  const blocked = positions.flatMap((p) => p.stages.filter((s) => s.status === 'INVALID' || s.status === 'REJECTED').map((s) => ({ productionId: p.productionId, stage: s.id, department: s.department, failed: s.failed, status: s.status })));
  const state: OrchestratorState = running.some((j) => GPU_JOBS.has(j.type)) ? 'PRODUCING' : running.length || queued.length ? 'COORDINATING' : awaiting.length ? 'AWAITING_REVIEW' : blocked.length ? 'BLOCKED' : activeProductionIds.length ? 'READY' : 'IDLE';
  const nodeState = (dept: string): NodeState => activeDepts.has(dept) ? 'working' : awaiting.some((a) => a.department === dept) ? 'waiting' : blocked.some((b) => b.department === dept) ? 'blocked' : 'idle';

  // the productions in flight, for the orchestrator's rings
  const inFlight: InFlight[] = positions.map((p) => ({ productionId: p.productionId, done: p.stages.filter((s) => s.status === 'DONE').length, total: p.stages.length || 1, running: running.some((j) => j.productionId === p.productionId), current: p.stages.find((s) => s.status !== 'DONE') }));

  // connections: only from recorded handoffs
  const groups = new Map<string, HandoffRow[]>();
  for (const h of [...org.handoffs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const pair = handoffPair(h); if (!pair) continue;
    const key = `${pair.from}>${pair.to}`;
    const g = groups.get(key) ?? []; g.push(h); groups.set(key, g);
  }
  const edges: CompanyEdge[] = Array.from(groups, ([key, hs]) => {
    const [from, to] = key.split('>');
    const latest = hs[0];
    const recentCount = hs.filter((h) => now - new Date(h.createdAt).getTime() < RECENT_MS).length;
    const gate = positions.find((p) => p.productionId === latest.productionId)?.stages.find((s) => s.id === latest.stage);
    const state: EdgeState = latest.qualityStatus !== 'VALIDATED' ? 'refused' : gate?.status === 'AWAITING_APPROVAL' ? 'waiting' : now - new Date(latest.createdAt).getTime() < RECENT_MS ? 'recent' : 'used';
    return { key, from, to, stages: Array.from(new Set(hs.map((h) => h.stage))), handoffs: hs, latest, state, recentCount };
  });
  const edgesOf = (dept: string) => edges.filter((e) => e.from === dept || e.to === dept);
  const neighbours = (dept: string) => new Set(edgesOf(dept).flatMap((e) => [e.from, e.to]));
  return { state, running, queued, failedJobs, activeDepts, workingAgents, awaiting, blocked, inFlight, nodeState, edges, edgesOf, neighbours };
}
export type Company = ReturnType<typeof deriveCompany>;

/** A department's team in seat order for the dots: the director in the middle of the arc, the others around it. */
export function teamOrder<A extends Pick<OrgAgent, 'id'>>(agents: A[], directorId: string): A[] {
  const director = agents.find((a) => a.id === directorId);
  const rest = agents.filter((a) => a.id !== directorId);
  if (!director) return rest;
  const mid = Math.floor(rest.length / 2);
  return [...rest.slice(0, mid), director, ...rest.slice(mid)];
}

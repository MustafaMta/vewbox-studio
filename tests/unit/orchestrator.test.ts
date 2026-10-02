import { describe, expect, it } from 'vitest';
import { RING, VIEW, deriveCompany, edgeGeometry, handoffPair, pipelineNeighbours, seats, teamOrder } from '@/studio/company';
import { AGENTS, DEPARTMENTS, PIPELINE, SKILLS, TOOLS } from '@/server/org/model';
import type { HandoffRow, OrgResponse } from '@/studio/org';

/** The Studio Company is derived from records, never from a timer or the static pipeline: a job in flight, a
 *  handoff, an approval. These tests pin the derivation and the constellation's geometry (DESIGN-SYSTEM-V3 §9.1). */

const base = (over: Partial<OrgResponse> = {}): OrgResponse => ({
  version: 4, departments: DEPARTMENTS, agents: AGENTS, tools: TOOLS, skills: SKILLS.map((s) => ({ ...s, instructions: null, updatedAt: '' })), pipeline: PIPELINE,
  stats: [], events: [], queue: { queued: 0, running: 0, failed24h: 0, completed24h: 0 }, hours: 24, handoffs: [], approvals: [], positions: [], jobs: [], ...over,
});
const stages = (status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED', id = 'STORY', department = 'STORY') => [{ id, department, status, at: null, failed: status === 'INVALID' ? ['every-line-assigned-once'] : [] }];
const handoff = (over: Partial<HandoffRow>): HandoffRow => ({ id: 'h', productionId: 'p1', stage: 'STORY', producerDepartment: 'STORY', receiverDepartment: 'CASTING', artifactIds: ['s1'], validation: { ok: true, checks: [] }, qualityStatus: 'VALIDATED', remainingDependencies: [], jobId: null, createdAt: new Date().toISOString(), ...over });

describe('deriveCompany', () => {
  it('is Idle with no productions and nothing running; nothing lights and nothing is connected', () => {
    const c = deriveCompany(base(), []);
    expect(c.state).toBe('IDLE');
    expect(c.edges).toEqual([]);
    expect(c.activeDepts.size).toBe(0);
    expect(c.inFlight).toEqual([]);
  });
  it('is Ready with a production and nothing running; nothing lights up', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('READY') }] }), ['p1']);
    expect(c.state).toBe('READY');
    for (const d of DEPARTMENTS) expect(c.nodeState(d.id)).toBe('idle');
    expect(c.inFlight).toEqual([{ productionId: 'p1', done: 0, total: 1, running: false, current: expect.objectContaining({ id: 'STORY' }) }]);
  });
  it('is Producing while a GPU job runs, lights the department that owns the job and names the agent at work', () => {
    const c = deriveCompany(base({ jobs: [{ id: 'j', type: 'GENERATE_TAKE', status: 'GENERATING', attempts: 1, maxAttempts: 3, createdAt: '' }] }), ['p1']);
    expect(c.state).toBe('PRODUCING');
    expect(c.nodeState('VIDEO')).toBe('working');
    expect(Array.from(c.workingAgents.get('VIDEO') ?? [])).toEqual(['minimax-video-specialist']);
    expect(c.nodeState('STORY')).toBe('idle');
  });
  it('is Coordinating while an LLM job runs; an agent with an open run lights its department too', () => {
    const c = deriveCompany(base({ jobs: [{ id: 'j', type: 'PLAN_SHOTS', status: 'GENERATING', attempts: 1, maxAttempts: 3, createdAt: '' }], stats: [{ agentId: 'music-director', runs: 1, completed: 0, failed: 0, cancelled: 0, running: 1, firstAttemptOk: 0, firstAttempts: 0, p50Ms: null, lastRunAt: null, toolCalls: 0, toolFailures: 0 }] }), ['p1']);
    expect(c.state).toBe('COORDINATING');
    expect(c.nodeState('PREPRODUCTION')).toBe('working');
    expect(c.nodeState('SOUND')).toBe('working');
  });
  it('waits for you on the department whose stage awaits approval', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('AWAITING_APPROVAL') }] }), ['p1']);
    expect(c.state).toBe('AWAITING_REVIEW');
    expect(c.nodeState('STORY')).toBe('waiting');
    expect(c.awaiting).toHaveLength(1);
  });
  it('is Blocked on a refused handoff, naming the department', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('INVALID', 'SHOT_PLAN', 'PREPRODUCTION') }] }), ['p1']);
    expect(c.state).toBe('BLOCKED');
    expect(c.nodeState('PREPRODUCTION')).toBe('blocked');
    expect(c.blocked[0].failed).toContain('every-line-assigned-once');
  });
  it('draws a connection only where a handoff was recorded, never from the static pipeline', () => {
    const c = deriveCompany(base({ handoffs: [handoff({})] }), ['p1']);
    expect(c.edges.map((e) => e.key)).toEqual(['STORY>CASTING']);
    expect(c.edges[0].state).toBe('recent');
    expect(c.edges[0].recentCount).toBe(1);
  });
  it('ages a path to "used" after 90 minutes, marks refusals, and dashes a path whose stage waits for you', () => {
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    const used = deriveCompany(base({ handoffs: [handoff({ createdAt: old })] }), ['p1']);
    expect(used.edges[0].state).toBe('used');
    const refused = deriveCompany(base({ handoffs: [handoff({ qualityStatus: 'INVALID', validation: { ok: false, checks: [{ name: 'cast resolved', ok: false }] } })] }), ['p1']);
    expect(refused.edges[0].state).toBe('refused');
    const waiting = deriveCompany(base({ handoffs: [handoff({})], positions: [{ productionId: 'p1', stages: stages('AWAITING_APPROVAL') }] }), ['p1']);
    expect(waiting.edges[0].state).toBe('waiting');
  });
  it('sends an Edit handoff to the Executive Office (the cut approval) and draws nothing for self-handoffs', () => {
    expect(handoffPair(handoff({ stage: 'EDIT', producerDepartment: 'POST', receiverDepartment: 'POST' }))).toEqual({ from: 'POST', to: 'EXECUTIVE' });
    expect(handoffPair(handoff({ stage: 'STORYBOARD', producerDepartment: 'PREPRODUCTION', receiverDepartment: 'PREPRODUCTION' }))).toBeNull();
    expect(handoffPair(handoff({ stage: 'EXPORT', producerDepartment: 'POST', receiverDepartment: null }))).toBeNull();
  });
});

describe('the constellation', () => {
  it('seats the nine departments on one orbit in pipeline order, clockwise from the top', () => {
    const s = seats(false);
    expect(s.map((x) => x.id)).toEqual([...RING]);
    expect(s[0]).toMatchObject({ x: 500, y: VIEW.cy - VIEW.ry, placement: 'above' });
    expect(s[2].x).toBeGreaterThan(VIEW.cx); // Casting on the right in LTR
    for (const x of s) expect(((x.x - VIEW.cx) / VIEW.rx) ** 2 + ((x.y - VIEW.cy) / VIEW.ry) ** 2).toBeCloseTo(1, 3);
  });
  it('places every label outside the orbit: above, below or beside, by the seat angle', () => {
    expect(seats(false).map((x) => x.placement)).toEqual(['above', 'above', 'beside', 'beside', 'below', 'below', 'beside', 'beside', 'above']);
  });
  it('mirrors the orbit in Arabic, so the pipeline runs with the reading direction', () => {
    const ltr = seats(false); const rtl = seats(true);
    for (let i = 0; i < ltr.length; i++) { expect(rtl[i].x).toBeCloseTo(VIEW.w - ltr[i].x, 1); expect(rtl[i].y).toBe(ltr[i].y); }
    expect(rtl[2].side).toBe('left');
  });
  it('bends every path toward the orchestrator and ends it at the receiver disc with an arrow', () => {
    const [a, b] = [seats(false)[1], seats(false)[4]];
    const g = edgeGeometry(a, b, 40, 40, 8);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // the curve's midpoint lies between the chord and the centre
    expect(Math.hypot(g.mid.x - VIEW.cx, g.mid.y - VIEW.cy)).toBeLessThan(Math.hypot(m.x - VIEW.cx, m.y - VIEW.cy));
    expect(g.d.startsWith('M')).toBe(true);
    expect(g.arrow.split('L')).toHaveLength(3);
    expect(g.length).toBeGreaterThan(0);
  });
  it('puts the director in the middle of the team arc', () => {
    const team = AGENTS.filter((a) => a.department === 'CASTING');
    const order = teamOrder(team, 'casting-director');
    expect(order[Math.floor((order.length - 1) / 2)].id).toBe('casting-director');
  });
  it('knows a department\'s place in the pipeline from the stage graph', () => {
    const p = pipelineNeighbours(base(), 'CASTING');
    expect(p.from).toEqual([{ id: 'STORY', gate: true }]);
    expect(p.to.map((x) => x.id)).toEqual(['PREPRODUCTION', 'SOUND']);
    expect(pipelineNeighbours(base(), 'EXECUTIVE')).toEqual({ from: [], to: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { deriveCompany } from '@/components/studio/Orchestrator';
import { AGENTS, DEPARTMENTS, PIPELINE, SKILLS, TOOLS } from '@/server/org/model';
import type { OrgResponse } from '@/studio/org';

/** The orchestrator's state and the departments' lights come from records, never from a timer: a job in flight,
 *  a handoff, an approval. These tests pin the derivation. */

const base = (over: Partial<OrgResponse> = {}): OrgResponse => ({
  version: 3, departments: DEPARTMENTS, agents: AGENTS, tools: TOOLS, skills: SKILLS.map((s) => ({ ...s, instructions: null, updatedAt: '' })), pipeline: PIPELINE,
  stats: [], events: [], queue: { queued: 0, running: 0, failed24h: 0, completed24h: 0 }, hours: 24, handoffs: [], approvals: [], positions: [], jobs: [], ...over,
});
const stages = (status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED', id = 'STORY', department = 'STORY') => [{ id, department, status, at: null, failed: status === 'INVALID' ? ['every-line-assigned-once'] : [] }];

describe('deriveCompany', () => {
  it('is Idle with no productions and nothing running', () => {
    expect(deriveCompany(base(), []).state).toBe('IDLE');
  });
  it('is Ready with a production and nothing running; nothing lights up', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('READY') }] }), ['p1']);
    expect(c.state).toBe('READY');
    for (const d of DEPARTMENTS) expect(c.nodeState(d.id)).toBe('idle');
  });
  it('is Producing while a GPU job runs and lights the department that owns the job', () => {
    const c = deriveCompany(base({ jobs: [{ id: 'j', type: 'GENERATE_TAKE', status: 'GENERATING', attempts: 1, maxAttempts: 3, createdAt: '' }] }), ['p1']);
    expect(c.state).toBe('PRODUCING');
    expect(c.nodeState('VIDEO')).toBe('active');
    expect(c.nodeState('STORY')).toBe('idle');
  });
  it('is Coordinating while an LLM job runs', () => {
    const c = deriveCompany(base({ jobs: [{ id: 'j', type: 'PLAN_SHOTS', status: 'GENERATING', attempts: 1, maxAttempts: 3, createdAt: '' }] }), ['p1']);
    expect(c.state).toBe('COORDINATING');
    expect(c.nodeState('PREPRODUCTION')).toBe('active');
  });
  it('is Awaiting review when a gated stage waits, and the Executive Office turns gold', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('AWAITING_APPROVAL') }] }), ['p1']);
    expect(c.state).toBe('AWAITING_REVIEW');
    expect(c.nodeState('EXECUTIVE')).toBe('awaiting');
    expect(c.awaiting).toHaveLength(1);
  });
  it('is Blocked on a refused handoff, naming the department', () => {
    const c = deriveCompany(base({ positions: [{ productionId: 'p1', stages: stages('INVALID', 'SHOT_PLAN', 'PREPRODUCTION') }] }), ['p1']);
    expect(c.state).toBe('BLOCKED');
    expect(c.nodeState('PREPRODUCTION')).toBe('blocked');
    expect(c.blocked[0].failed).toContain('every-line-assigned-once');
  });
  it('connections follow the pipeline and light only from recorded handoffs', () => {
    const now = new Date().toISOString();
    const c = deriveCompany(base({ handoffs: [{ id: 'h', productionId: 'p1', stage: 'STORY', producerDepartment: 'STORY', receiverDepartment: 'CASTING', artifactIds: ['s1'], validation: { ok: true, checks: [] }, qualityStatus: 'VALIDATED', remainingDependencies: [], jobId: null, createdAt: now }] }), ['p1']);
    const keys = c.edges.map((e) => `${e.from}>${e.to}`);
    expect(keys).toEqual(expect.arrayContaining(['STORY>CASTING', 'STORY>PREPRODUCTION', 'PREPRODUCTION>SOUND', 'SOUND>VIDEO', 'VIDEO>QA', 'QA>POST', 'EXECUTIVE>STORY']));
    expect(c.edges.find((e) => e.from === 'STORY' && e.to === 'CASTING')?.lit).toBe('active');
    expect(c.edges.find((e) => e.from === 'VIDEO' && e.to === 'QA')?.lit).toBe('idle');
  });
});

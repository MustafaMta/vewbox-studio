'use client';

import { useEffect, useState } from 'react';
import { useStudio } from './store';
import type { AgentDef, DepartmentDef, SkillDef, StageDef, ToolDef } from '@/server/org/model';
import type { AgentRunRow, AgentStat, ReliabilitySummary, StudioEventRow } from '@/server/org/runs';

/** THE BROWSER'S VIEW OF THE ORGANISATION — the departments, agents, tools, skills and the live record of their
 *  work, fetched from the API and refetched whenever the studio records activity. Types come from the server
 *  modules (type-only imports; nothing of the server runs here). */

export type OrgSkill = SkillDef & { instructions: string | null; updatedAt: string };
export interface OrgResponse { version: number; departments: DepartmentDef[]; agents: AgentDef[]; tools: ToolDef[]; skills: OrgSkill[]; pipeline: StageDef[]; stats: AgentStat[]; events: StudioEventRow[]; queue: { queued: number; running: number; failed24h: number; completed24h: number }; hours: number }
export interface AgentResponse { agent: AgentDef; department?: DepartmentDef; tools: ToolDef[]; skills: OrgSkill[]; runs: AgentRunRow[]; stats: AgentStat | null; events: StudioEventRow[] }
export interface StageStatusRow extends Omit<StageDef, 'approval'> { status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED'; handoff: HandoffRow | null; approval: ApprovalRow | null; dependencies: Array<{ stage: string; done: boolean }> }
export interface HandoffRow { id: string; productionId: string; stage: string; producerDepartment: string; receiverDepartment: string | null; artifactIds: string[]; validation: { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }; qualityStatus: string; remainingDependencies: string[]; jobId: string | null; createdAt: string }
export interface QaReportRow { id: string; productionId: string | null; subjectKind: string; subjectId: string; inspectorId: string; checks: Array<{ name: string; ok: boolean; value?: string | number; threshold?: string | number; detail?: string }>; failureClass: string | null; decision: string; evidenceAssetIds: string[]; notes: string | null; jobId: string | null; createdAt: string }
export interface ApprovalRow { id: string; productionId: string; stage: string; subjectKind: string; subjectId: string; decision: string; by: string; note: string | null; createdAt: string }
export interface ProductionPipelineResponse { productionId: string; stages: StageStatusRow[]; handoffs: HandoffRow[]; qa: QaReportRow[]; approvals: ApprovalRow[]; runs: AgentRunRow[]; events: StudioEventRow[] }
export type { AgentDef, DepartmentDef, ToolDef, StageDef, AgentStat, AgentRunRow, StudioEventRow, ReliabilitySummary };

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

/** Fetch once, then again on every activity event (debounced) and every 30 s while the page is open. */
export function useLive<T>(url: string | null, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const { activityTick } = useStudio();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let on = true;
    const t = setTimeout(() => { get<T>(url).then((d) => { if (on) { setData(d); setError(null); } }).catch((e) => { if (on) setError((e as Error).message); }); }, 150);
    return () => { on = false; clearTimeout(t); };
  }, [url, activityTick, n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  return { data, error, reload: () => setN((x) => x + 1) };
}

export const useOrg = () => useLive<OrgResponse>('/api/studio/org');
export const useAgent = (id: string) => useLive<AgentResponse>(`/api/studio/org/agents/${encodeURIComponent(id)}`);
export const useReliability = (hours = 24 * 7) => useLive<ReliabilitySummary>(`/api/studio/org/reliability?hours=${hours}`);
export const useProductionPipeline = (id: string | null) => useLive<ProductionPipelineResponse>(id ? `/api/studio/org/productions/${encodeURIComponent(id)}` : null);
export const useEvents = (q: { department?: string; agent?: string; production?: string; limit?: number }) => {
  const sp = new URLSearchParams();
  if (q.department) sp.set('department', q.department);
  if (q.agent) sp.set('agent', q.agent);
  if (q.production) sp.set('production', q.production);
  if (q.limit) sp.set('limit', String(q.limit));
  return useLive<{ events: StudioEventRow[] }>(`/api/studio/org/events?${sp}`);
};

export async function approveStage(productionId: string, body: { stage: string; decision: 'APPROVED' | 'REJECTED' | 'CHANGES'; note?: string; by?: string }): Promise<{ approvalId: string }> {
  const r = await fetch(`/api/studio/org/productions/${encodeURIComponent(productionId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`approval failed: ${r.status}`);
  return (await r.json()) as { approvalId: string };
}

'use client';

import { useEffect, useState } from 'react';
import { useStudio } from './store';
import type { AgentDef, DepartmentDef, SkillDef, StageDef, ToolDef } from '@/server/org/model';
import type { AgentRunRow, AgentStat, ReliabilitySummary, StudioEventRow } from '@/server/org/runs';

/** THE BROWSER'S VIEW OF THE ORGANISATION — the departments, agents, tools, skills and the live record of their
 *  work, fetched from the API and refetched whenever the studio records activity. Types come from the server
 *  modules (type-only imports; nothing of the server runs here).
 *
 *  This file is the one place the pages get organisation data from. The types below describe the **v5 shape** of
 *  docs/CONTRACTS-PHASE2-STUDIO.md (§2 R1–R6, §4): agents with delegated `steps`, tools with a JSON Schema
 *  `contract`, skills with `kind` / computed `status` / `evidence`, departments with `plannedRoles`, runs with
 *  `parentRunId` / `purpose`, and the Arabic fields. Every v5 field is optional, so the pages render today's (v4)
 *  API and the v5 API alike; the readers further down (`stepsOf`, `plannedRolesOf`, `skillStatusOf`…) are the only
 *  code that interprets them, so merging the backend is a change here, not in the components. */

// ------------------------------------------------------------------------------------------------- v5 shape

/** A JSON Schema as `z.toJSONSchema` emits it (the subset the pages read). */
export interface JsonSchema { type?: string | string[]; title?: string; description?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema | JsonSchema[]; enum?: unknown[]; const?: unknown; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; allOf?: JsonSchema[]; $ref?: string; format?: string; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; additionalProperties?: boolean | JsonSchema; $defs?: Record<string, JsonSchema>; default?: unknown }
/** R4: a tool's typed contract, validated before and after every call. */
export interface ToolContract { input: JsonSchema; output: JsonSchema }
/** R1(b): a delegated step an agent performs inside another agent's job. `where` is the handler that calls it. */
export interface AgentStep { id: string; name: string; nameAr?: string; where?: string; purpose?: string }
/** R5: how a skill is used and the evidence behind its computed status. */
export type SkillKind = 'PROMPT' | 'PROCEDURE';
export type SkillStatus = 'VERIFIED' | 'UNAVAILABLE' | 'DRAFT' | 'VALIDATED';
export interface SkillEvidence { implementedBy?: string[]; verifiedBy?: string[]; injectedInto?: string[]; reason?: string }
/** R2: a role the company will have but does not staff yet — no profile, tools, skills, model, status or activity. */
export interface PlannedRole { id?: string; name: string; nameAr?: string; department?: string; would?: string; wouldAr?: string; does?: string; description?: string; why?: string; whyAr?: string; reason?: string; phase?: string }

export type OrgAgent = AgentDef & { steps?: AgentStep[]; nameAr?: string; roleAr?: string; descriptionAr?: string; responsibility?: string; responsibilityAr?: string };
export type OrgTool = ToolDef & { contract?: ToolContract | null; nameAr?: string; descriptionAr?: string };
export type OrgSkill = Omit<SkillDef, 'status'> & { status: SkillStatus; kind?: SkillKind; evidence?: SkillEvidence; statusReason?: string; instructions: string | null; updatedAt: string };
export type OrgDepartment = DepartmentDef & { plannedRoles?: PlannedRole[]; responsibilityAr?: string };
export type OrgRun = AgentRunRow & { parentRunId?: string | null; purpose?: string | null };

export interface LiveJob { id: string; type: string; status: string; productionId?: string; shotId?: string; attempts: number; maxAttempts: number; progress?: { phase?: string; message?: string; percent?: number | null } | null; createdAt: string }
export interface ProductionPosition { productionId: string; stages: Array<{ id: string; department: string; status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED'; at: string | null; failed: string[] }> }
export interface OrgResponse { version: number; departments: OrgDepartment[]; agents: OrgAgent[]; tools: OrgTool[]; skills: OrgSkill[]; pipeline: StageDef[]; stats: AgentStat[]; events: StudioEventRow[]; queue: { queued: number; running: number; failed24h: number; completed24h: number }; hours: number; handoffs: HandoffRow[]; approvals: ApprovalRow[]; positions: ProductionPosition[]; jobs: LiveJob[]; /** v5 may also list the planned roles at the top level, each with its `department` */ plannedRoles?: PlannedRole[] }
export interface FailureRow { id: string; jobId: string; jobType: string; productionId: string | null; shotId: string | null; attempt: number; failureClass: string; failureMessage: string | null; changeMade: string | null; resolved: boolean; createdAt: string }
export interface AgentResponse { agent: OrgAgent; department?: OrgDepartment; tools: OrgTool[]; skills: OrgSkill[]; runs: OrgRun[]; stats: AgentStat | null; events: StudioEventRow[]; failures: FailureRow[]; current: OrgRun | null; /** v5: runs this agent performed as a delegated step, when the API lists them apart */ delegated?: OrgRun[] }
export interface StageStatusRow extends Omit<StageDef, 'approval'> { status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED'; handoff: HandoffRow | null; approval: ApprovalRow | null; dependencies: Array<{ stage: string; done: boolean }> }
export interface HandoffRow { id: string; productionId: string; stage: string; producerDepartment: string; receiverDepartment: string | null; artifactIds: string[]; validation: { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }; qualityStatus: string; remainingDependencies: string[]; jobId: string | null; createdAt: string }
export interface QaReportRow { id: string; productionId: string | null; subjectKind: string; subjectId: string; inspectorId: string; checks: Array<{ name: string; ok: boolean; value?: string | number; threshold?: string | number; detail?: string }>; failureClass: string | null; decision: string; evidenceAssetIds: string[]; notes: string | null; jobId: string | null; createdAt: string }
export interface ApprovalRow { id: string; productionId: string; stage: string; subjectKind: string; subjectId: string; decision: string; by: string; note: string | null; createdAt: string }
export interface ProductionPipelineResponse { productionId: string; stages: StageStatusRow[]; handoffs: HandoffRow[]; qa: QaReportRow[]; approvals: ApprovalRow[]; runs: OrgRun[]; events: StudioEventRow[] }
export interface DepartmentResponse { department: OrgDepartment; agents: OrgAgent[]; tools: OrgTool[]; skills: OrgSkill[]; activeRuns: OrgRun[]; recentRuns: OrgRun[]; handoffs: HandoffRow[]; reports: QaReportRow[]; events: StudioEventRow[]; plannedRoles?: PlannedRole[] }
export type { AgentDef, DepartmentDef, ToolDef, StageDef, AgentStat, AgentRunRow, StudioEventRow, ReliabilitySummary };

// --------------------------------------------------------------------------------------------- fetching

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

/** Fetch once, then again on every activity event (debounced) and every 30 s while the page is open. The last good
 *  answer is kept when a later one fails (`error` says so and `at` says how old the data is). */
export function useLive<T>(url: string | null, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void; at: number | null } {
  const { activityTick } = useStudio();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let on = true;
    const t = setTimeout(() => { get<T>(url).then((d) => { if (on) { setData(d); setError(null); setAt(Date.now()); } }).catch((e) => { if (on) setError((e as Error).message); }); }, 150);
    return () => { on = false; clearTimeout(t); };
  }, [url, activityTick, n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  return { data, error, reload: () => setN((x) => x + 1), at };
}

export const useOrg = () => useLive<OrgResponse>('/api/studio/org');
export const useDepartment = (id: string) => useLive<DepartmentResponse>(`/api/studio/org/departments/${encodeURIComponent(id)}`);
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

// ----------------------------------------------------------------------------------- readers of the v5 shape

type Lang = 'en' | 'ar';
/** The Arabic text when the interface is Arabic and the organisation has it; otherwise the English. */
export const loc = (lang: Lang, en: string, ar?: string | null): string => (lang === 'ar' && ar ? ar : en);
export const deptName = (d: Pick<DepartmentDef, 'name' | 'nameAr'>, lang: Lang) => loc(lang, d.name, d.nameAr);
export const deptResponsibility = (d: OrgDepartment, lang: Lang) => loc(lang, d.responsibility, d.responsibilityAr);
export const agentName = (a: OrgAgent, lang: Lang) => loc(lang, a.name, a.nameAr);
export const agentRole = (a: OrgAgent, lang: Lang) => loc(lang, a.role, a.roleAr);
export const agentDescription = (a: OrgAgent, lang: Lang) => loc(lang, a.responsibility ?? a.description, a.responsibilityAr ?? a.descriptionAr);

/** R1: the delegated steps an agent performs (none before v5). */
export const stepsOf = (a: OrgAgent): AgentStep[] => a.steps ?? [];
/** R1: an agent is on the pages because code executes it — it owns job types or performs a delegated step. */
export const hasExecutionPath = (a: OrgAgent) => a.jobTypes.length > 0 || stepsOf(a).length > 0;
/** The agent that runs a job type, from the agents' own declarations. */
export const agentForJobType = (agents: OrgAgent[], type: string) => agents.find((a) => (a.jobTypes as string[]).includes(type));

/** R2: the roles a department will have but does not staff yet (per department in v5, or top-level with a
 *  `department`). Read tolerantly: the fields are named in prose in the contract. */
export function plannedRolesOf(d: OrgDepartment, org?: { plannedRoles?: PlannedRole[] } | null): Array<{ key: string; name: string; would: string; why: string; phase: string }> {
  const raw = d.plannedRoles ?? org?.plannedRoles?.filter((r) => r.department === d.id) ?? [];
  return raw.map((r, i) => ({ key: r.id ?? `${d.id}-${i}`, name: r.name, would: r.would ?? r.does ?? r.description ?? '', why: r.why ?? r.reason ?? '', phase: r.phase ?? '' }));
}
export function plannedRoleText(r: PlannedRole, lang: Lang) { return { name: loc(lang, r.name, r.nameAr), would: loc(lang, r.would ?? r.does ?? r.description ?? '', r.wouldAr), why: loc(lang, r.why ?? r.reason ?? '', r.whyAr) }; }

/** R5: a skill's status as a word key and a tone. Today's hand-written VALIDATED has no evidence behind it, so it is
 *  shown as "marked validated", never as verified. */
export function skillStatusOf(s: OrgSkill): { key: 'VERIFIED' | 'UNAVAILABLE' | 'DRAFT' | 'MARKED'; tone: 'ok' | 'warn' | 'neutral'; reason: string | null } {
  const reason = s.statusReason ?? s.evidence?.reason ?? s.note ?? null;
  if (s.status === 'VERIFIED') return { key: 'VERIFIED', tone: 'ok', reason: null };
  if (s.status === 'UNAVAILABLE') return { key: 'UNAVAILABLE', tone: 'warn', reason };
  if (s.status === 'DRAFT') return { key: 'DRAFT', tone: 'neutral', reason };
  return { key: 'MARKED', tone: 'neutral', reason: s.evidence ? null : reason };
}

/** R4: a contract's top-level fields as rows (name, type in words, required) for the Technical details. */
export function schemaFields(schema: JsonSchema | null | undefined): Array<{ name: string; type: string; required: boolean; description?: string }> {
  if (!schema) return [];
  const root = schema.$ref && schema.$defs ? schema.$defs[schema.$ref.replace(/^#\/\$defs\//, '')] ?? schema : schema;
  const req = new Set(root.required ?? []);
  return Object.entries(root.properties ?? {}).map(([name, p]) => ({ name, type: schemaType(p), required: req.has(name), description: p.description }));
}
export function schemaType(p: JsonSchema | undefined): string {
  if (!p) return 'any';
  if (p.enum) return p.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (p.const !== undefined) return JSON.stringify(p.const);
  const alts = p.anyOf ?? p.oneOf;
  if (alts) return alts.map(schemaType).join(' | ');
  if (p.$ref) return p.$ref.replace(/^#\/\$defs\//, '');
  const t = Array.isArray(p.type) ? p.type.join(' | ') : p.type;
  if (t === 'array') return `${schemaType(Array.isArray(p.items) ? p.items[0] : p.items)}[]`;
  if (t === 'object' && p.properties) return `{ ${Object.keys(p.properties).slice(0, 4).join(', ')}${Object.keys(p.properties).length > 4 ? ', …' : ''} }`;
  return t ?? 'any';
}

/** v5: the runs an agent performed as a delegated step (a child run with a parent), apart from the jobs it owns. */
export const isDelegated = (r: OrgRun) => Boolean(r.parentRunId);

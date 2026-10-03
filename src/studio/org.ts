'use client';

import { useEffect, useState } from 'react';
import { useStudio } from './store';
import type { AgentDef, DepartmentDef, PlannedRole, StageDef, StepDef, ToolDef } from '@/server/org/model';
import type { OrgAgent, OrgDepartment, OrgSkill, OrgTool } from '@/server/org/registry';
import type { AgentRunRow, AgentStat, ReliabilitySummary, StudioEventRow } from '@/server/org/runs';

/** THE BROWSER'S VIEW OF THE ORGANISATION — the departments (with their planned, unstaffed roles), agents (with their
 *  job types and delegated steps), tools (with their contracts as JSON Schema), skills (with their computed status
 *  and evidence) and the live record of their work, fetched from the API and refetched whenever the studio records
 *  activity. Types come from the server modules (type-only imports; nothing of the server runs here).
 *
 *  This file is the one place the pages get organisation data from, and the readers at the end of it are the only
 *  code that interprets the v5 shape (docs/CONTRACTS-PHASE2-STUDIO.md §2 R1–R6, §4): what an agent executes, its
 *  Arabic fields, a planned role, a skill's status and evidence, a tool's contract. */

export type { OrgAgent, OrgDepartment, OrgSkill, OrgTool, PlannedRole, StepDef };
export interface LiveJob { id: string; type: string; status: string; productionId?: string; shotId?: string; attempts: number; maxAttempts: number; progress?: { phase?: string; message?: string; percent?: number | null } | null; createdAt: string }
export interface ProductionPosition { productionId: string; stages: Array<{ id: string; department: string; status: 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED'; at: string | null; failed: string[] }> }
export interface OrgResponse { version: number; departments: OrgDepartment[]; agents: OrgAgent[]; tools: OrgTool[]; skills: OrgSkill[]; pipeline: StageDef[]; stats: AgentStat[]; events: StudioEventRow[]; queue: { queued: number; running: number; failed24h: number; completed24h: number }; hours: number; handoffs: HandoffRow[]; approvals: ApprovalRow[]; positions: ProductionPosition[]; jobs: LiveJob[] }
export interface FailureRow { id: string; jobId: string; jobType: string; productionId: string | null; shotId: string | null; attempt: number; failureClass: string; failureMessage: string | null; changeMade: string | null; resolved: boolean; createdAt: string }
export interface AgentResponse { agent: OrgAgent; department?: OrgDepartment; tools: OrgTool[]; skills: OrgSkill[]; runs: AgentRunRow[]; stats: AgentStat | null; events: StudioEventRow[]; failures: FailureRow[]; current: AgentRunRow | null }
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

export interface DepartmentResponse { department: OrgDepartment; agents: OrgAgent[]; tools: OrgTool[]; skills: OrgSkill[]; activeRuns: AgentRunRow[]; recentRuns: AgentRunRow[]; handoffs: HandoffRow[]; reports: QaReportRow[]; events: StudioEventRow[] }
export const useOrg = () => useLive<OrgResponse>('/api/studio/org');
export const useDepartment = (id: string) => useLive<DepartmentResponse>(`/api/studio/org/departments/${encodeURIComponent(id)}`);
export const useAgent = (id: string) => useLive<AgentResponse>(`/api/studio/org/agents/${encodeURIComponent(id)}`);
export const useReliability = (hours = 24 * 7) => useLive<ReliabilitySummary>(`/api/studio/org/reliability?hours=${hours}`);
export const useProductionPipeline = (id: string | null) => useLive<ProductionPipelineResponse>(id ? `/api/studio/org/productions/${encodeURIComponent(id)}` : null);

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
export const deptResponsibility = (d: Pick<DepartmentDef, 'responsibility'> & { responsibilityAr?: string }, lang: Lang) => loc(lang, d.responsibility, d.responsibilityAr);
export const agentName = (a: Pick<AgentDef, 'name'> & { nameAr?: string }, lang: Lang) => loc(lang, a.name, a.nameAr);
export const agentRole = (a: Pick<AgentDef, 'role'> & { roleAr?: string }, lang: Lang) => loc(lang, a.role, a.roleAr);
export const agentDescription = (a: Pick<AgentDef, 'description'> & { descriptionAr?: string }, lang: Lang) => loc(lang, a.description, a.descriptionAr);
export const stepName = (s: StepDef, lang: Lang) => loc(lang, s.name, s.nameAr);

/** R1: the delegated steps an agent performs inside other agents' jobs. */
export const stepsOf = (a: Pick<AgentDef, 'steps'>): StepDef[] => a.steps ?? [];
/** The agent that runs a job type, from the agents' own declarations. */
export const agentForJobType = <A extends Pick<AgentDef, 'jobTypes'>>(agents: A[], type: string): A | undefined => agents.find((a) => (a.jobTypes as string[]).includes(type));

/** R2: the roles a department will have but does not staff yet — a name, what it would do, why not yet, the phase. */
export function plannedRolesOf(d: Pick<OrgDepartment, 'id'> & { plannedRoles?: OrgDepartment['plannedRoles'] }, lang: Lang): Array<{ key: string; name: string; would: string; reason: string; phase: string }> {
  return (d.plannedRoles ?? []).map((r) => ({ key: r.id, name: loc(lang, r.name, r.nameAr), would: r.would, reason: loc(lang, r.reason, r.reasonAr), phase: r.phase }));
}

/** R5: a skill's computed status as a word key, a tone and the reason the registry gave. */
export function skillStatusOf(s: Pick<OrgSkill, 'status' | 'note'>): { key: 'VERIFIED' | 'UNAVAILABLE' | 'DRAFT'; tone: 'ok' | 'warn' | 'neutral'; reason: string | null } {
  if (s.status === 'VERIFIED') return { key: 'VERIFIED', tone: 'ok', reason: null };
  if (s.status === 'UNAVAILABLE') return { key: 'UNAVAILABLE', tone: 'warn', reason: s.note ?? null };
  return { key: 'DRAFT', tone: 'neutral', reason: s.note ?? null };
}

/** The subset of JSON Schema the Technical details read (the API sends `z.toJSONSchema` output). */
export interface JsonSchema { type?: string | string[]; description?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema | JsonSchema[]; enum?: unknown[]; const?: unknown; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; $ref?: string; $defs?: Record<string, JsonSchema>; additionalProperties?: boolean | JsonSchema }

/** R4: a contract's top-level fields as rows (name, type, required, description). */
export function schemaFields(raw: unknown): Array<{ name: string; type: string; required: boolean; description?: string }> {
  const schema = raw as JsonSchema | null | undefined;
  if (!schema || typeof schema !== 'object') return [];
  const root = schema.$ref && schema.$defs ? schema.$defs[schema.$ref.replace(/^#\/\$defs\//, '')] ?? schema : schema;
  const req = new Set(root.required ?? []);
  return Object.entries(root.properties ?? {}).map(([name, p]) => ({ name, type: schemaType(p), required: req.has(name), description: p.description }));
}
export function schemaType(p: JsonSchema | undefined): string {
  if (!p || typeof p !== 'object') return 'any';
  if (p.enum) return p.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (p.const !== undefined) return JSON.stringify(p.const);
  const alts = p.anyOf ?? p.oneOf;
  if (alts) return Array.from(new Set(alts.map(schemaType))).join(' | ');
  if (p.$ref) return p.$ref.replace(/^#\/\$defs\//, '');
  const t = Array.isArray(p.type) ? p.type.join(' | ') : p.type;
  if (t === 'array') return `${schemaType(Array.isArray(p.items) ? p.items[0] : p.items)}[]`;
  if (t === 'object' && p.properties) { const k = Object.keys(p.properties); return `{ ${k.slice(0, 4).join(', ')}${k.length > 4 ? ', …' : ''} }`; }
  return t ?? 'any';
}

/** v5: a run performed as a delegated step inside another agent's job (it has a parent run). */
export const isDelegated = (r: Pick<AgentRunRow, 'parentRunId'>) => Boolean(r.parentRunId);

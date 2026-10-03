import { asc, notInArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { log } from '../log';
import { AGENTS, DEPARTMENTS, JOB_AGENT, ORG_VERSION, PLANNED_ROLES, SKILLS, TOOLS, callsModel, type AgentDef, type DepartmentDef, type PlannedRole, type SkillDef, type SkillStatus, type ToolDef } from './model';
import { CONTRACTS, SCHEMAS, contractJsonSchema, type JsonSchema } from './contracts';
import { computeSkillStatus, declaredTools, envPresent, fileExists, readSkill, skillEvidence, skillFile, skillVersionOf, sourceTreePresent, type SkillEvidence, type SkillFile } from './skills';

/** THE ORGANISATION REGISTRY — the code-defined company (model.ts) persisted to Postgres with its version, so the
 *  Studio pages, the API and the history read one organisation. On every boot (worker and web): the organisation is
 *  checked (every reference resolves, every agent has an execution path, every director satisfies R1, every SKILL.md
 *  conforms to the Agent Skills spec), written, and whatever is no longer in code is deleted (past runs keep their
 *  agent ids). Skill statuses are computed here from evidence, never written by hand. */

/** Every rule the organisation must satisfy before it is persisted; a violation stops the sync (and the boot). */
export function checkOrganisation(): string[] {
  const errors: string[] = [];
  const toolIds = new Set(TOOLS.map((t) => t.id));
  const skillIds = new Set(SKILLS.map((s) => s.id));
  const agentIds = new Set<string>();
  for (const a of AGENTS) {
    if (agentIds.has(a.id)) errors.push(`agent ${a.id} is defined twice`);
    agentIds.add(a.id);
    if (!DEPARTMENTS.some((d) => d.id === a.department)) errors.push(`agent ${a.id} belongs to unknown department ${a.department}`);
    for (const t of a.tools) if (!toolIds.has(t)) errors.push(`agent ${a.id} lists unknown tool ${t}`);
    for (const s of a.skills) if (!skillIds.has(s)) errors.push(`agent ${a.id} lists unknown skill ${s}`);
    // R1: an execution path — job types, a payload route, or delegated steps
    if (!a.jobTypes.length && !a.payloadRoutes?.length && !a.steps.length) errors.push(`agent ${a.id} has no execution path (no job type, payload route or step)`);
    const stepIds = new Set<string>();
    for (const s of a.steps) {
      if (stepIds.has(s.id)) errors.push(`agent ${a.id} declares step ${s.id} twice`);
      stepIds.add(s.id);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) errors.push(`agent ${a.id} step id ${s.id} is not a slug`);
      if (!s.where.startsWith('src/worker/')) errors.push(`agent ${a.id} step ${s.id}: where must be a file in src/worker`);
    }
    for (const r of a.payloadRoutes ?? []) if (!JOB_AGENT[r.jobType]) errors.push(`agent ${a.id} routes ${r.jobType}, which no agent owns`);
  }
  for (const t of TOOLS) {
    if (!CONTRACTS[t.id]) errors.push(`tool ${t.id} has no contract`);
    if (!SCHEMAS[t.inputSchema] || !SCHEMAS[t.outputSchema]) errors.push(`tool ${t.id} names a schema contracts.ts does not export`);
  }
  // R2: planned roles are never staffed
  for (const r of PLANNED_ROLES) {
    if (agentIds.has(r.id)) errors.push(`planned role ${r.id} is also an agent`);
    if (!DEPARTMENTS.some((d) => d.id === r.department)) errors.push(`planned role ${r.id} belongs to unknown department ${r.department}`);
  }
  // R3: every department's director is a staffed agent of that department with an execution path
  for (const d of DEPARTMENTS) {
    const dir = AGENTS.find((a) => a.id === d.directorId);
    if (!dir) errors.push(`department ${d.id} has no director ${d.directorId}`);
    else if (dir.department !== d.id) errors.push(`department ${d.id}'s director ${dir.id} sits in ${dir.department}`);
  }
  return errors;
}

/** Each SKILL.md against the spec and against model.ts (one source for the tools: `allowed-tools` == requiredTools). */
export function checkSkillFiles(read: (def: SkillDef) => SkillFile | null = readSkill): { errors: string[]; files: Map<string, SkillFile | null> } {
  const errors: string[] = [];
  const files = new Map<string, SkillFile | null>();
  for (const s of SKILLS) {
    const f = read(s);
    files.set(s.id, f);
    if (!f) continue; // a missing file is a DRAFT skill, reported by its status
    for (const e of f.errors) errors.push(`skills/${f.folder}/SKILL.md: ${e}`);
    const declared = declaredTools(f).slice().sort().join(' ');
    const required = s.requiredTools.slice().sort().join(' ');
    if (declared !== required) errors.push(`skills/${f.folder}/SKILL.md: allowed-tools "${declared}" differs from model.ts requiredTools "${required}"`);
    for (const t of s.requiredTools) if (!TOOLS.some((x) => x.id === t)) errors.push(`skill ${s.id} requires unknown tool ${t}`);
    if (!f.frontmatter.metadata?.version) errors.push(`skills/${f.folder}/SKILL.md: metadata.version is required (it is recorded on every run)`);
    const kind = f.frontmatter.metadata?.kind;
    if (kind && kind !== s.kind) errors.push(`skills/${f.folder}/SKILL.md: metadata.kind ${kind} differs from model.ts kind ${s.kind}`);
    if (s.kind === 'REFERENCE' && declared) errors.push(`skills/${f.folder}/SKILL.md: reference knowledge must not declare allowed-tools`);
  }
  return { errors, files };
}

export async function syncOrg(): Promise<{ departments: number; agents: number; tools: number; skills: number; skillsMissing: string[]; skillStatuses: Record<string, SkillStatus> }> {
  const now = new Date().toISOString();
  const problems = checkOrganisation();
  // the standalone web image ships without skills/ and src/: it persists the organisation but leaves the skills
  // (and their computed statuses) to a process that can see the evidence
  const withSkills = sourceTreePresent();
  const { errors: skillErrors, files } = withSkills ? checkSkillFiles() : { errors: [], files: new Map<string, SkillFile | null>() };
  if (problems.length || skillErrors.length) throw new Error(`the organisation does not hold together:\n- ${[...problems, ...skillErrors].join('\n- ')}`);
  const skillsMissing: string[] = [];
  const skillStatuses: Record<string, SkillStatus> = {};
  const skillRows: Array<typeof schema.skills.$inferInsert> = [];
  if (withSkills) {
    for (const s of SKILLS) {
      const f = files.get(s.id) ?? null;
      skillFile(s.id, { fresh: true });
      if (!f) skillsMissing.push(s.id);
      const ev = skillEvidence(s, fileExists);
      const { status, reason } = computeSkillStatus(s, { file: Boolean(f), ev, env: envPresent });
      skillStatuses[s.id] = status;
      skillRows.push({ id: s.id, name: s.name, path: s.path, source: s.source, sourceVersion: skillVersionOf(f), supportedModels: s.supportedModels, requiredTools: s.requiredTools, status, note: s.note ? `${reason}. ${s.note}` : reason, kind: s.kind, evidence: { implementedBy: ev.implementedBy, verifiedBy: ev.verifiedBy, usedBy: ev.usedBy, injectedInto: ev.injectedInto }, instructions: f ? f.body : null, orgVersion: ORG_VERSION, updatedAt: now });
    }
  }
  await db().transaction(async (tx) => {
    for (const d of DEPARTMENTS) {
      const plannedRoles = PLANNED_ROLES.filter((r) => r.department === d.id).map((r) => ({ id: r.id, name: r.name, would: r.would, reason: r.reason, phase: r.phase }));
      const r: typeof schema.departments.$inferInsert = { id: d.id, name: d.name, directorId: d.directorId, responsibility: d.responsibility, stages: d.stages, order: d.order, plannedRoles, orgVersion: ORG_VERSION, updatedAt: now };
      await tx.insert(schema.departments).values(r).onConflictDoUpdate({ target: schema.departments.id, set: r });
    }
    for (const a of AGENTS) {
      const r: typeof schema.agents.$inferInsert = { id: a.id, name: a.name, departmentId: a.department, role: a.role, description: a.description, steps: a.steps, payloadRoutes: a.payloadRoutes ?? [], systemInstructions: a.systemInstructions, model: a.model, skills: a.skills, tools: a.tools, inputSchema: a.inputSchema, outputSchema: a.outputSchema, limits: a.limits, version: a.version, qualityRequirements: a.qualityRequirements, jobTypes: a.jobTypes, orgVersion: ORG_VERSION, updatedAt: now };
      await tx.insert(schema.agents).values(r).onConflictDoUpdate({ target: schema.agents.id, set: r });
    }
    for (const t of TOOLS) { const r: typeof schema.tools.$inferInsert = { id: t.id, name: t.name, description: t.description, version: t.version, inputSchema: t.inputSchema, outputSchema: t.outputSchema, permissions: t.permissions, timeoutMs: t.timeoutMs, resource: t.resource, vramMb: t.vramMb ?? null, errors: t.errors, orgVersion: ORG_VERSION, updatedAt: now }; await tx.insert(schema.tools).values(r).onConflictDoUpdate({ target: schema.tools.id, set: r }); }
    for (const r of skillRows) await tx.insert(schema.skills).values(r).onConflictDoUpdate({ target: schema.skills.id, set: r });
    // R6: what is no longer in code is no longer in the organisation (agent runs keep their ids)
    await tx.delete(schema.departments).where(notInArray(schema.departments.id, DEPARTMENTS.map((d) => d.id)));
    await tx.delete(schema.agents).where(notInArray(schema.agents.id, AGENTS.map((a) => a.id)));
    await tx.delete(schema.tools).where(notInArray(schema.tools.id, TOOLS.map((t) => t.id)));
    if (withSkills) await tx.delete(schema.skills).where(notInArray(schema.skills.id, SKILLS.map((s) => s.id)));
  });
  if (!withSkills) log.warn('source tree not present: skills were not synced (their statuses need the SKILL.md files and the evidence)');
  if (skillsMissing.length) log.warn({ skillsMissing }, 'skills without a SKILL.md are recorded as DRAFT');
  log.info({ departments: DEPARTMENTS.length, agents: AGENTS.length, tools: TOOLS.length, skills: SKILLS.length, plannedRoles: PLANNED_ROLES.length, skillStatuses, version: ORG_VERSION }, 'organisation synced');
  return { departments: DEPARTMENTS.length, agents: AGENTS.length, tools: TOOLS.length, skills: SKILLS.length, skillsMissing, skillStatuses };
}

// ------------------------------------------------------------------------------------------------------- read

export type OrgDepartment = DepartmentDef & { plannedRoles: Array<Omit<PlannedRole, 'department'>> };
/** `instructionsReachModel`: the system instructions are injected into this agent's model calls (otherwise they
 *  document the rules its code applies and steer no model). */
export type OrgAgent = AgentDef & { instructionsReachModel: boolean };
export type OrgTool = ToolDef & { contract: { input: JsonSchema; output: JsonSchema } | null };
export type OrgSkill = Omit<SkillDef, 'note'> & { status: SkillStatus; /** the reason for the status (and the skill's own note) */ note?: string; version: string; evidence: Omit<SkillEvidence, 'kind'> | null; instructions: string | null; updatedAt: string };
export interface OrgSnapshot { version: number; departments: OrgDepartment[]; agents: OrgAgent[]; tools: OrgTool[]; skills: OrgSkill[] }

/** The organisation as persisted (what the pages show), with each tool's contract as JSON Schema. */
export async function readOrg(): Promise<OrgSnapshot> {
  const [deps, ags, tls, sks] = await Promise.all([
    db().select().from(schema.departments).orderBy(asc(schema.departments.order)),
    db().select().from(schema.agents).orderBy(asc(schema.agents.name)),
    db().select().from(schema.tools).orderBy(asc(schema.tools.id)),
    db().select().from(schema.skills).orderBy(asc(schema.skills.name)),
  ]);
  return {
    version: deps[0]?.orgVersion ?? ORG_VERSION,
    departments: deps.map((d) => ({ id: d.id as DepartmentDef['id'], name: d.name, directorId: d.directorId, responsibility: d.responsibility, stages: d.stages as DepartmentDef['stages'], order: d.order, plannedRoles: (d.plannedRoles ?? []).map((r) => ({ id: r.id, name: r.name, would: r.would, reason: r.reason, phase: r.phase })) })),
    agents: ags.map((a) => {
      const def: AgentDef = { id: a.id, name: a.name, department: a.departmentId as AgentDef['department'], role: a.role, description: a.description, systemInstructions: a.systemInstructions, model: a.model, skills: a.skills, tools: a.tools, inputSchema: a.inputSchema, outputSchema: a.outputSchema, limits: a.limits as AgentDef['limits'], version: a.version, qualityRequirements: a.qualityRequirements, jobTypes: a.jobTypes as AgentDef['jobTypes'], payloadRoutes: (a.payloadRoutes ?? []) as AgentDef['payloadRoutes'], steps: (a.steps ?? []).map((s) => ({ id: s.id, name: s.name, where: s.where })) };
      return { ...def, instructionsReachModel: callsModel(def) };
    }),
    tools: tls.map((t) => ({ id: t.id, name: t.name, description: t.description, version: t.version, inputSchema: t.inputSchema, outputSchema: t.outputSchema, permissions: t.permissions, timeoutMs: t.timeoutMs, resource: t.resource as ToolDef['resource'], vramMb: t.vramMb ?? undefined, errors: t.errors, contract: contractJsonSchema(t.id) })),
    skills: sks.map((s) => {
      const def = SKILLS.find((x) => x.id === s.id);
      return { id: s.id, name: s.name, path: s.path, source: s.source, supportedModels: s.supportedModels, requiredTools: s.requiredTools, kind: (s.kind ?? def?.kind ?? 'PROCEDURE') as SkillDef['kind'], implementedBy: def?.implementedBy ?? [], verifiedBy: def?.verifiedBy ?? [], requires: def?.requires, status: s.status as SkillStatus, note: s.note ?? undefined, version: s.sourceVersion, evidence: s.evidence ?? null, instructions: s.instructions, updatedAt: s.updatedAt };
    }),
  };
}

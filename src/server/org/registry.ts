import fsp from 'node:fs/promises';
import path from 'node:path';
import { asc } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { log } from '../log';
import { AGENTS, DEPARTMENTS, ORG_VERSION, SKILLS, TOOLS, type AgentDef, type DepartmentDef, type SkillDef, type ToolDef } from './model';

/** THE ORGANISATION REGISTRY — the code-defined company (model.ts) persisted to Postgres with its version, so the
 *  Studio pages, the API and the history read one organisation. Skills are read from their SKILL.md on disk at sync
 *  time; a skill whose file is missing is recorded as such (never displayed as if it existed). Synced by the worker
 *  and the web process on boot. */

const skillsRoot = () => process.env.SKILLS_DIR || path.resolve(process.cwd(), 'skills');

/** Read a SKILL.md (Anthropic Agent Skills format): frontmatter between `---` lines, then the body. */
export async function readSkillFile(skill: SkillDef): Promise<{ frontmatter: Record<string, string>; body: string; file: string } | null> {
  const file = path.join(skillsRoot(), path.basename(skill.path), 'SKILL.md');
  let text: string;
  try { text = await fsp.readFile(file, 'utf8'); } catch { return null; }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const frontmatter: Record<string, string> = {};
  if (m) for (const line of m[1].split(/\r?\n/)) { const kv = /^([\w-]+):\s*(.*)$/.exec(line); if (kv) frontmatter[kv[1]] = kv[2].trim(); }
  return { frontmatter, body: m ? m[2] : text, file };
}

export async function syncOrg(): Promise<{ departments: number; agents: number; tools: number; skills: number; skillsMissing: string[] }> {
  const now = new Date().toISOString();
  // referential checks: an agent may only list registered tools and skills; a department's director must exist
  for (const a of AGENTS) {
    for (const t of a.tools) if (!TOOLS.some((x) => x.id === t)) throw new Error(`agent ${a.id} lists unknown tool ${t}`);
    for (const s of a.skills) if (!SKILLS.some((x) => x.id === s)) throw new Error(`agent ${a.id} lists unknown skill ${s}`);
    if (!DEPARTMENTS.some((d) => d.id === a.department)) throw new Error(`agent ${a.id} belongs to unknown department ${a.department}`);
  }
  // a director is a registered agent; the Quality Director sits in the Executive Office and heads QA (independence)
  for (const d of DEPARTMENTS) if (!AGENTS.some((a) => a.id === d.directorId)) throw new Error(`department ${d.id} has no director ${d.directorId}`);
  const skillsMissing: string[] = [];
  const skillRows: Array<typeof schema.skills.$inferInsert> = [];
  for (const s of SKILLS) {
    const f = await readSkillFile(s);
    if (!f) skillsMissing.push(s.id);
    skillRows.push({ id: s.id, name: s.name, path: s.path, source: s.source, sourceVersion: s.sourceVersion, supportedModels: s.supportedModels, requiredTools: s.requiredTools, status: f ? s.status : 'DRAFT', note: f ? s.note ?? null : `SKILL.md missing at ${s.path}`, instructions: f ? f.body : null, orgVersion: ORG_VERSION, updatedAt: now });
  }
  await db().transaction(async (tx) => {
    for (const d of DEPARTMENTS) { const r: typeof schema.departments.$inferInsert = { id: d.id, name: d.name, nameAr: d.nameAr, directorId: d.directorId, responsibility: d.responsibility, stages: d.stages, order: d.order, orgVersion: ORG_VERSION, updatedAt: now }; await tx.insert(schema.departments).values(r).onConflictDoUpdate({ target: schema.departments.id, set: r }); }
    for (const a of AGENTS) { const r: typeof schema.agents.$inferInsert = { id: a.id, name: a.name, departmentId: a.department, role: a.role, description: a.description, systemInstructions: a.systemInstructions, model: a.model, skills: a.skills, tools: a.tools, inputSchema: a.inputSchema, outputSchema: a.outputSchema, limits: a.limits, version: a.version, qualityRequirements: a.qualityRequirements, jobTypes: a.jobTypes, orgVersion: ORG_VERSION, updatedAt: now }; await tx.insert(schema.agents).values(r).onConflictDoUpdate({ target: schema.agents.id, set: r }); }
    for (const t of TOOLS) { const r: typeof schema.tools.$inferInsert = { id: t.id, name: t.name, description: t.description, version: t.version, inputSchema: t.inputSchema, outputSchema: t.outputSchema, permissions: t.permissions, timeoutMs: t.timeoutMs, resource: t.resource, vramMb: t.vramMb ?? null, errors: t.errors, orgVersion: ORG_VERSION, updatedAt: now }; await tx.insert(schema.tools).values(r).onConflictDoUpdate({ target: schema.tools.id, set: r }); }
    for (const r of skillRows) await tx.insert(schema.skills).values(r).onConflictDoUpdate({ target: schema.skills.id, set: r });
  });
  if (skillsMissing.length) log.warn({ skillsMissing }, 'skills without a SKILL.md are recorded as DRAFT');
  log.info({ departments: DEPARTMENTS.length, agents: AGENTS.length, tools: TOOLS.length, skills: SKILLS.length, version: ORG_VERSION }, 'organisation synced');
  return { departments: DEPARTMENTS.length, agents: AGENTS.length, tools: TOOLS.length, skills: SKILLS.length, skillsMissing };
}

export interface OrgSnapshot { version: number; departments: DepartmentDef[]; agents: AgentDef[]; tools: ToolDef[]; skills: Array<SkillDef & { instructions: string | null; updatedAt: string }> }

/** The organisation as persisted (what the pages show). */
export async function readOrg(): Promise<OrgSnapshot> {
  const [deps, ags, tls, sks] = await Promise.all([
    db().select().from(schema.departments).orderBy(asc(schema.departments.order)),
    db().select().from(schema.agents).orderBy(asc(schema.agents.name)),
    db().select().from(schema.tools).orderBy(asc(schema.tools.id)),
    db().select().from(schema.skills).orderBy(asc(schema.skills.name)),
  ]);
  return {
    version: deps[0]?.orgVersion ?? ORG_VERSION,
    departments: deps.map((d) => ({ id: d.id as DepartmentDef['id'], name: d.name, nameAr: d.nameAr ?? '', directorId: d.directorId, responsibility: d.responsibility, stages: d.stages as DepartmentDef['stages'], order: d.order })),
    agents: ags.map((a) => ({ id: a.id, name: a.name, department: a.departmentId as AgentDef['department'], role: a.role, description: a.description, systemInstructions: a.systemInstructions, model: a.model, skills: a.skills, tools: a.tools, inputSchema: a.inputSchema, outputSchema: a.outputSchema, limits: a.limits as AgentDef['limits'], version: a.version, qualityRequirements: a.qualityRequirements, jobTypes: a.jobTypes as AgentDef['jobTypes'] })),
    tools: tls.map((t) => ({ id: t.id, name: t.name, description: t.description, version: t.version, inputSchema: t.inputSchema, outputSchema: t.outputSchema, permissions: t.permissions, timeoutMs: t.timeoutMs, resource: t.resource as ToolDef['resource'], vramMb: t.vramMb ?? undefined, errors: t.errors })),
    skills: sks.map((s) => ({ id: s.id, name: s.name, path: s.path, source: s.source, sourceVersion: s.sourceVersion, supportedModels: s.supportedModels, requiredTools: s.requiredTools, status: s.status as SkillDef['status'], note: s.note ?? undefined, instructions: s.instructions, updatedAt: s.updatedAt })),
  };
}

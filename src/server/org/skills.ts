import fs from 'node:fs';
import path from 'node:path';
import { AGENTS, agentById, callsModel, skillById, type AgentDef, type SkillDef, type SkillStatus } from './model';

/** SKILLS AT RUN TIME — the SKILL.md files (Agent Skills format, agentskills.io) read from disk, validated against
 *  the spec, their status computed from evidence, and the loader that puts an LLM agent's instructions and PROMPT
 *  skills into the system prompt of the calls it makes. `allowed-tools` in a SKILL.md is documentation of what the
 *  procedure calls; it never grants anything (grants are the agents' allow-lists in model.ts). */

export const skillsRoot = () => process.env.SKILLS_DIR || path.resolve(process.cwd(), 'skills');
/** The repository root the evidence paths are relative to (the worker and the dev server run from it). */
export const repoRoot = () => process.env.STUDIO_SOURCE_ROOT || process.cwd();
/** True when the source tree is present (the standalone web image ships without it: evidence cannot be checked there). */
export const sourceTreePresent = () => fs.existsSync(path.join(repoRoot(), 'src', 'server', 'org', 'model.ts'));

// --------------------------------------------------------------------------------------------- frontmatter

export interface Frontmatter { name?: string; description?: string; license?: string; compatibility?: string; 'allowed-tools'?: string; metadata?: Record<string, string>; [key: string]: unknown }
export interface SkillFile { file: string; folder: string; frontmatter: Frontmatter; body: string; errors: string[] }

const unquote = (v: string) => {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  return t;
};

/** The YAML subset Agent Skills frontmatter uses: `key: scalar` (plain or quoted), block scalars (`>`/`|`, with `-`),
 *  and one level of nested string map (`metadata:`). Anything else (sequences, flow collections, deeper nesting) is
 *  an error, never silently dropped. */
export function parseFrontmatter(src: string): { data: Frontmatter; errors: string[] } {
  const data: Frontmatter = {};
  const errors: string[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const top = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!top) { errors.push(`line ${i + 1}: not a "key: value" line: ${line.trim().slice(0, 60)}`); continue; }
    const key = top[1]; const rest = (top[2] ?? '').trim();
    if (rest === '' ) {
      // a nested map of strings (metadata)
      const map: Record<string, string> = {};
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        i++;
        const kv = /^\s+([A-Za-z][\w.-]*):\s*(.*)$/.exec(lines[i]);
        if (!kv) { errors.push(`line ${i + 1}: "${key}" may only hold "key: value" pairs`); continue; }
        if (/^[[{]/.test(kv[2].trim())) { errors.push(`line ${i + 1}: ${key}.${kv[1]} must be a string`); continue; }
        map[kv[1]] = unquote(kv[2]);
      }
      data[key] = map;
    } else if (/^[>|][+-]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) { i++; block.push(lines[i].trim()); }
      while (block.length && block[block.length - 1] === '') block.pop();
      data[key] = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n');
    } else if (/^[[{]/.test(rest)) {
      errors.push(`line ${i + 1}: "${key}" uses a flow collection; write a plain string`);
    } else data[key] = unquote(rest);
  }
  return { data, errors };
}

/** The spec's rules (agentskills.io/specification + the Claude platform's: no XML tags, reserved words). */
export function validateFrontmatter(fm: Frontmatter, folder: string): string[] {
  const errors: string[] = [];
  const name = typeof fm.name === 'string' ? fm.name : undefined;
  if (!name) errors.push('name is required');
  else {
    if (name.length > 64) errors.push('name is longer than 64 characters');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) errors.push('name must be lowercase letters, digits and single hyphens');
    if (name !== folder) errors.push(`name "${name}" must equal the folder name "${folder}"`);
    if (/anthropic|claude/.test(name)) errors.push('name uses a reserved word');
  }
  const description = typeof fm.description === 'string' ? fm.description : undefined;
  if (!description) errors.push('description is required');
  else if (description.length > 1024) errors.push('description is longer than 1024 characters');
  for (const [k, v] of [['name', name], ['description', description]] as const) if (v && /<\/?[A-Za-z][^>]*>/.test(v)) errors.push(`${k} contains an XML tag`);
  if (fm.compatibility !== undefined && (typeof fm.compatibility !== 'string' || fm.compatibility.length > 500)) errors.push('compatibility must be a string of at most 500 characters');
  if (fm.metadata !== undefined && (typeof fm.metadata !== 'object' || Object.values(fm.metadata).some((v) => typeof v !== 'string'))) errors.push('metadata must map strings to strings');
  if (fm['allowed-tools'] !== undefined && typeof fm['allowed-tools'] !== 'string') errors.push('allowed-tools must be a space-separated string');
  return errors;
}

/** Read and validate one SKILL.md; null when the file does not exist. */
export function readSkill(def: Pick<SkillDef, 'path'>): SkillFile | null {
  const folder = path.basename(def.path);
  const file = path.join(skillsRoot(), folder, 'SKILL.md');
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { file, folder, frontmatter: {}, body: text, errors: ['no frontmatter between --- lines'] };
  const parsed = parseFrontmatter(m[1]);
  return { file, folder, frontmatter: parsed.data, body: m[2].trim(), errors: [...parsed.errors, ...validateFrontmatter(parsed.data, folder)] };
}

/** The tools a SKILL.md says its procedure calls (`allowed-tools`, space-separated); documentation only. */
export const declaredTools = (f: SkillFile) => (typeof f.frontmatter['allowed-tools'] === 'string' ? f.frontmatter['allowed-tools'].split(/\s+/).filter(Boolean) : []);
export const skillVersionOf = (f: SkillFile | null) => f?.frontmatter.metadata?.version ?? 'unversioned';

// ------------------------------------------------------------------------------------------------- status

export interface SkillEvidence {
  kind: SkillDef['kind'];
  implementedBy: Array<{ path: string; present: boolean }>;
  verifiedBy: Array<{ path: string; present: boolean }>;
  /** agents that list the skill */
  usedBy: string[];
  /** PROMPT: the agents whose model calls receive the body */
  injectedInto: string[];
}

/** The agents whose LLM calls receive a PROMPT skill: they list it and they call the model. */
export const injectedInto = (skillId: string, agents: AgentDef[] = AGENTS) => agents.filter((a) => a.skills.includes(skillId) && callsModel(a)).map((a) => a.id);

export function skillEvidence(def: SkillDef, exists: (p: string) => boolean, agents: AgentDef[] = AGENTS): SkillEvidence {
  return {
    kind: def.kind,
    implementedBy: def.implementedBy.map((p) => ({ path: p, present: exists(p) })),
    verifiedBy: def.verifiedBy.map((p) => ({ path: p, present: exists(p) })),
    usedBy: agents.filter((a) => a.skills.includes(def.id)).map((a) => a.id),
    injectedInto: def.kind === 'PROMPT' ? injectedInto(def.id, agents) : [],
  };
}

/** Status from evidence, never by hand: VERIFIED (SKILL.md + implementation or injection + tests), UNAVAILABLE (needs
 *  something this machine lacks; reference knowledge is never executed), DRAFT (anything missing). */
export function computeSkillStatus(def: SkillDef, facts: { file: boolean; ev: SkillEvidence; env: (name: string) => boolean }): { status: SkillStatus; reason: string } {
  if (!facts.file) return { status: 'DRAFT', reason: `SKILL.md missing at ${def.path}` };
  if (def.kind === 'REFERENCE') return { status: 'UNAVAILABLE', reason: def.requires ? (facts.env(def.requires.env) ? 'read-only reference knowledge: never executed or injected in this studio' : def.requires.reason) : 'read-only reference knowledge: never executed or injected in this studio' };
  if (def.requires && !facts.env(def.requires.env)) return { status: 'UNAVAILABLE', reason: def.requires.reason };
  const missingCode = facts.ev.implementedBy.filter((x) => !x.present).map((x) => x.path);
  const missingTests = facts.ev.verifiedBy.filter((x) => !x.present).map((x) => x.path);
  if (!facts.ev.implementedBy.length) return { status: 'DRAFT', reason: 'no implementing code is named' };
  if (missingCode.length) return { status: 'DRAFT', reason: `implementation missing: ${missingCode.join(', ')}` };
  if (def.kind === 'PROMPT' && !facts.ev.injectedInto.length) return { status: 'DRAFT', reason: 'no agent that calls the model lists it, so it is injected nowhere' };
  if (!facts.ev.verifiedBy.length) return { status: 'DRAFT', reason: 'no test is named' };
  if (missingTests.length) return { status: 'DRAFT', reason: `test missing: ${missingTests.join(', ')}` };
  return { status: 'VERIFIED', reason: def.kind === 'PROMPT' ? `injected into the model calls of ${facts.ev.injectedInto.join(', ')}` : `implemented by ${def.implementedBy.length} file(s), checked by ${def.verifiedBy.length} test file(s)` };
}

export const fileExists = (rel: string) => fs.existsSync(path.join(repoRoot(), rel));
export const envPresent = (name: string) => Boolean(process.env[name]?.trim());

// ------------------------------------------------------------------------------------------------- loader

const cache = new Map<string, SkillFile | null>();
/** A skill's file, read once per process (sync re-reads it, so a changed file is picked up on the next boot). */
export function skillFile(id: string, opts: { fresh?: boolean } = {}): SkillFile | null {
  if (!opts.fresh && cache.has(id)) return cache.get(id)!;
  const def = skillById(id);
  const f = def ? readSkill(def) : null;
  cache.set(id, f);
  return f;
}

/** What an agent's model calls are told about who is calling and how it works: its role and instructions, then the
 *  body of each PROMPT skill it lists. Empty for an agent that does not call the model (and for no agent), so those
 *  prompts are unchanged. Appended to the system message by the story engine. */
export function agentPrompt(agentId: string | undefined): string {
  if (!agentId) return '';
  const a = agentById(agentId);
  if (!a || !callsModel(a)) return '';
  const parts = [`YOUR ROLE: ${a.name} — ${a.role}.\n${a.systemInstructions}`];
  for (const id of a.skills) {
    const def = skillById(id);
    if (def?.kind !== 'PROMPT') continue;
    const f = skillFile(id);
    if (f?.body) parts.push(`SKILL: ${def.name}\n${f.body}`);
  }
  return `\n\n${parts.join('\n\n')}`;
}

/** The PROMPT skills' bodies an agent's calls receive (empty for agents that do not call the model). */
export function skillPrompt(agentId: string | undefined): string[] {
  const a = agentId ? agentById(agentId) : undefined;
  if (!a || !callsModel(a)) return [];
  return a.skills.map((id) => skillById(id)).filter((d): d is SkillDef => d?.kind === 'PROMPT').map((d) => skillFile(d.id)?.body ?? '').filter(Boolean);
}

/** The versions a run used: the agent's skills (SKILL.md metadata.version) and its tools (ToolDef.version). */
export function skillVersions(a: Pick<AgentDef, 'skills'>): Record<string, string> {
  return Object.fromEntries(a.skills.map((id) => [id, skillVersionOf(skillFile(id))]));
}

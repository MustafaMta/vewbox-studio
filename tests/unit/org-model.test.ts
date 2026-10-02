import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTS, DEPARTMENTS, JOB_AGENT, ORG_VERSION, PENDING_STEPS, PIPELINE, PLANNED_ROLES, REMOVED_TOOLS, SKILLS, TOOLS, agentIdForJob, callsModel, type SkillDef } from '@/server/org/model';
import { CONTRACTS, SCHEMAS } from '@/server/org/contracts';
import { checkOrganisation, checkSkillFiles } from '@/server/org/registry';
import { computeSkillStatus, fileExists, skillEvidence } from '@/server/org/skills';
import { JOB_TYPES } from '@/domain/jobs';
import { classifyFailure, RETRYABLE_CLASSES, retryNeedsChange } from '@/server/org/runs';
import { StudioError } from '@/domain/errors';

/** The organisation is code; these tests keep it honest (docs/CONTRACTS-PHASE2-STUDIO.md): every agent has an
 *  execution path that the code really takes, every declared step is really invoked (or explicitly pending), every
 *  allow-list is exactly what the agent's code calls, every tool has a contract, every skill's status follows from
 *  evidence, and planned roles are never staffed. The code checks are static scans of src/worker. */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments (a tool id or a step in a comment is not a call). */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const workerFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { const rel = `${dir}/${e.name}`; if (e.isDirectory()) walk(rel); else if (rel.endsWith('.ts')) out.push(rel); } };
  walk('src/worker');
  return out;
};

/** The index of the parenthesis closing the one at `open`, skipping strings and template literals. */
function closeParen(src: string, open: number): number {
  let depth = 0;
  const modes: Array<{ m: 'code' | 'sq' | 'dq' | 'tpl' | 'expr'; braces: number }> = [{ m: 'code', braces: 0 }];
  for (let i = open; i < src.length; i++) {
    const ch = src[i]; const top = modes[modes.length - 1];
    if (top.m === 'sq' || top.m === 'dq') { if (ch === '\\') i++; else if ((ch === "'" && top.m === 'sq') || (ch === '"' && top.m === 'dq')) modes.pop(); continue; }
    if (top.m === 'tpl') { if (ch === '\\') i++; else if (ch === '`') modes.pop(); else if (ch === '$' && src[i + 1] === '{') { modes.push({ m: 'expr', braces: 0 }); i++; } continue; }
    if (ch === "'") modes.push({ m: 'sq', braces: 0 });
    else if (ch === '"') modes.push({ m: 'dq', braces: 0 });
    else if (ch === '`') modes.push({ m: 'tpl', braces: 0 });
    else if (ch === '{') top.braces++;
    else if (ch === '}') { if (top.m === 'expr' && top.braces === 0) modes.pop(); else top.braces--; }
    else if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced parentheses');
}

interface StepCall { file: string; agentId: string; stepId: string; text: string }
/** Every `step(ctx, '<agent>', '<step id>…', fn)` in src/worker, with the full call text. */
function stepCalls(): StepCall[] {
  const calls: StepCall[] = [];
  for (const file of workerFiles()) {
    const src = code(file);
    for (const m of src.matchAll(/\bstep\(\s*ctx\s*,\s*'([a-z0-9-]+)'\s*,\s*[`'"]([a-z0-9-]+)/g)) {
      const open = m.index! + m[0].indexOf('(');
      calls.push({ file, agentId: m[1], stepId: m[2], text: src.slice(m.index!, closeParen(src, open) + 1) });
    }
  }
  return calls;
}
const toolIdsIn = (text: string) => TOOLS.map((t) => t.id).filter((id) => text.includes(`'${id}'`) || text.includes(`"${id}"`));

/** Top-level functions of the handler files and their source regions (step calls removed: they are other agents'). */
function handlerFunctions(steps: StepCall[]): Map<string, Array<{ file: string; region: string }>> {
  const fns = new Map<string, Array<{ file: string; region: string }>>();
  const top = /^(export\s|async\s+function\s|function\s|const\s|let\s|type\s|interface\s|class\s|import\s|registerUnloader)/;
  for (const file of workerFiles().filter((f) => f.startsWith('src/worker/handlers/'))) {
    let src = code(file);
    for (const s of steps.filter((x) => x.file === file)) src = src.replace(s.text, 'step(/* delegated */)');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(lines[i]) ?? /^(?:export\s+)?const\s+(\w+)\s*(?::\s*[\w<>]+\s*)?=\s*(?:async\s*)?(?:\(|function)/.exec(lines[i]);
      if (!m) continue;
      let j = i + 1;
      while (j < lines.length && !top.test(lines[j])) j++;
      fns.set(m[1], [...(fns.get(m[1]) ?? []), { file, region: lines.slice(i, j).join('\n') }]);
    }
  }
  return fns;
}

/** The tools a job handler reaches through the handler functions it calls (branch-insensitive). */
function toolsReachedBy(handler: string, fns: ReturnType<typeof handlerFunctions>): Set<string> {
  const seen = new Set<string>(); const tools = new Set<string>();
  const visit = (name: string, fromFile?: string) => {
    const defs = fns.get(name); if (!defs) return;
    const def = defs.find((d) => d.file === fromFile) ?? defs[0];
    const key = `${def.file}#${name}`; if (seen.has(key)) return; seen.add(key);
    for (const t of toolIdsIn(def.region)) tools.add(t);
    for (const c of def.region.matchAll(/\b(\w+)\(/g)) if (c[1] !== name && fns.has(c[1])) visit(c[1], def.file);
  };
  visit(handler);
  return tools;
}

/** job type → handler function name, from the HANDLERS table. */
function handlerTable(): Record<string, string> {
  const src = code('src/worker/handlers/index.ts');
  const body = src.slice(src.indexOf('export const HANDLERS'));
  return Object.fromEntries(Array.from(body.slice(0, body.indexOf('};')).matchAll(/\b([A-Z_]+):\s*(\w+)/g)).map((m) => [m[1], m[2]]));
}

const PENDING_FILES = ['src/worker/handlers/character.ts', 'src/worker/handlers/voice.ts', 'src/worker/handlers/images.ts'];

describe('the studio organisation (ORG_VERSION 5)', () => {
  it('holds together: every reference resolves, every agent has an execution path, directors are real', () => {
    expect(ORG_VERSION).toBe(5);
    expect(checkOrganisation()).toEqual([]);
    expect(DEPARTMENTS.map((d) => d.id)).toEqual(['EXECUTIVE', 'STORY', 'CASTING', 'WORLD', 'PREPRODUCTION', 'VIDEO', 'SOUND', 'POST', 'QA']);
    for (const a of AGENTS) expect(a.jobTypes.length + (a.payloadRoutes?.length ?? 0) + a.steps.length, `${a.id} has no execution path`).toBeGreaterThan(0);
    const directors = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.directorId]));
    expect(directors).toEqual({ EXECUTIVE: 'executive-producer', STORY: 'head-of-story', CASTING: 'casting-director', WORLD: 'art-director', PREPRODUCTION: 'film-director', VIDEO: 'minimax-video-specialist', SOUND: 'dialogue-director', POST: 'video-editor', QA: 'quality-director' });
    for (const d of DEPARTMENTS) expect(AGENTS.find((a) => a.id === d.directorId)!.department, `${d.id} director`).toBe(d.id);
    expect(AGENTS).toHaveLength(29);
  });

  it('every job type is executed by exactly one agent; a payload route narrows PLAN_SHOTS to the singing agent', () => {
    for (const t of JOB_TYPES) {
      const owners = AGENTS.filter((a) => a.jobTypes.includes(t));
      expect(owners.map((a) => a.id), `${t}`).toHaveLength(1);
      expect(JOB_AGENT[t]).toBe(owners[0].id);
    }
    expect(agentIdForJob({ type: 'PLAN_SHOTS', payload: { performanceOnly: true } })).toBe('singing-performance');
    expect(agentIdForJob({ type: 'PLAN_SHOTS', payload: {} })).toBe('film-director');
    expect(agentIdForJob({ type: 'VOICE_PREVIEW', payload: {} })).toBe('voice-casting');
    expect(agentIdForJob({ type: 'MEDIA_PROBE', payload: {} })).toBe('technical-media-inspector');
  });

  it('every declared step is invoked by step(ctx, <agent>, <step>…) in its file — or listed as pending in a file another engineer owns', () => {
    const calls = stepCalls();
    // every call names a declared step of that agent
    for (const c of calls) expect(AGENTS.find((a) => a.id === c.agentId)?.steps.some((s) => s.id === c.stepId), `${c.file}: step(ctx, '${c.agentId}', '${c.stepId}') is not declared`).toBe(true);
    const pending = new Set(PENDING_STEPS.map((p) => `${p.agentId}/${p.stepId}`));
    for (const a of AGENTS) for (const s of a.steps) {
      const invoked = calls.filter((c) => c.agentId === a.id && c.stepId === s.id);
      if (pending.has(`${a.id}/${s.id}`)) {
        expect(invoked, `${a.id}/${s.id} is wired now: remove it from PENDING_STEPS`).toHaveLength(0);
        expect(PENDING_FILES, `${a.id}/${s.id} may only be pending in a file the fixer owns`).toContain(s.where);
      } else {
        expect(invoked.map((c) => c.file), `${a.id}/${s.id} is never invoked`).toContain(s.where);
      }
    }
    // nothing is pending since the character, voice and image handlers were wired
    expect([...pending]).toEqual([]);
    for (const p of PENDING_STEPS) expect(AGENTS.find((a) => a.id === p.agentId)?.steps.some((s) => s.id === p.stepId)).toBe(true);
    // every agent has a LIVE execution path: a job type, a payload route or a step that is really invoked
    const live = (id: string) => { const a = AGENTS.find((x) => x.id === id)!; return a.jobTypes.length > 0 || Boolean(a.payloadRoutes?.length) || a.steps.some((s) => !pending.has(`${a.id}/${s.id}`)); };
    expect(AGENTS.filter((a) => !live(a.id)).map((a) => a.id)).toEqual([]);
    // the reference picture check runs before a portrait is drawn and before a character is created from a picture
    expect(calls.filter((c) => c.stepId === 'reference-picture-check').map((c) => c.file).sort()).toEqual(['src/worker/handlers/character.ts', 'src/worker/handlers/images.ts']);
  });

  it('every allow-list is exactly the tools the agent’s handlers and steps call (static scan)', () => {
    const calls = stepCalls();
    const fns = handlerFunctions(calls);
    const table = handlerTable();
    // reached statically but only on a branch that runs as another agent: PLAN_SHOTS performanceOnly is the singing agent's
    const branchOnly: Record<string, string[]> = { 'film-director': ['speech.transcribe', 'lyrics.align'] };
    for (const a of AGENTS) {
      const used = new Set<string>();
      for (const t of [...a.jobTypes, ...(a.payloadRoutes ?? []).map((r) => r.jobType)]) { expect(table[t], `handler for ${t}`).toBeTruthy(); for (const x of toolsReachedBy(table[t], fns)) used.add(x); }
      for (const c of calls.filter((x) => x.agentId === a.id)) for (const x of toolIdsIn(c.text)) used.add(x);
      for (const x of branchOnly[a.id] ?? []) { expect(a.tools, `${a.id} must not hold ${x}`).not.toContain(x); used.delete(x); }
      expect([...a.tools].sort(), `${a.id} allow-list`).toEqual([...used].sort());
    }
  });

  it('every tool has a contract; schema names are real; removed tools are gone everywhere', () => {
    for (const t of TOOLS) {
      expect(CONTRACTS[t.id], t.id).toBeDefined();
      expect(SCHEMAS[t.inputSchema], `${t.id} input ${t.inputSchema}`).toBe(CONTRACTS[t.id].input);
      expect(SCHEMAS[t.outputSchema], `${t.id} output ${t.outputSchema}`).toBe(CONTRACTS[t.id].output);
    }
    expect(Object.keys(CONTRACTS).sort()).toEqual(TOOLS.map((t) => t.id).sort());
    for (const id of REMOVED_TOOLS) {
      expect(TOOLS.some((t) => t.id === id)).toBe(false);
      for (const a of AGENTS) expect(a.tools).not.toContain(id);
      for (const s of SKILLS) expect(s.requiredTools).not.toContain(id);
      for (const f of workerFiles()) expect(code(f).includes(`'${id}'`), `${f} calls ${id}`).toBe(false);
    }
    // every registered tool is called somewhere in the worker
    const all = workerFiles().map(code).join('\n');
    for (const t of TOOLS) expect(all.includes(`'${t.id}'`), `${t.id} has no call site`).toBe(true);
  });

  it('planned roles are listed, explained, in Arabic too, and never staffed', () => {
    expect(PLANNED_ROLES).toHaveLength(22);
    const ids = new Set(AGENTS.map((a) => a.id));
    for (const r of PLANNED_ROLES) {
      expect(ids.has(r.id), `${r.id} is staffed`).toBe(false);
      expect(DEPARTMENTS.some((d) => d.id === r.department)).toBe(true);
      expect(r.would.length).toBeGreaterThan(10); expect(r.reason.length).toBeGreaterThan(10); expect(r.phase.length).toBeGreaterThan(3);
      expect(r.nameAr).toMatch(/[؀-ۿ]/); expect(r.reasonAr).toMatch(/[؀-ۿ]/);
    }
    expect(new Set(PLANNED_ROLES.map((r) => r.id)).size).toBe(PLANNED_ROLES.length);
  });

  it('the organisation has Arabic for every name, role, responsibility and step', () => {
    const ar = /[؀-ۿ]/;
    for (const d of DEPARTMENTS) { expect(d.nameAr, d.id).toMatch(ar); expect(d.responsibilityAr, d.id).toMatch(ar); }
    for (const a of AGENTS) {
      expect(a.nameAr, a.id).toMatch(ar); expect(a.roleAr, a.id).toMatch(ar); expect(a.descriptionAr, a.id).toMatch(ar);
      for (const s of a.steps) expect(s.nameAr, `${a.id}/${s.id}`).toMatch(ar);
    }
  });

  it('the pipeline is a DAG whose stages belong to the departments that own them', () => {
    const ids = PIPELINE.map((s) => s.id);
    for (const s of PIPELINE) {
      for (const d of s.dependsOn) expect(ids.indexOf(d), `${s.id} depends on later ${d}`).toBeLessThan(ids.indexOf(s.id));
      const dept = DEPARTMENTS.find((x) => x.id === s.department)!;
      expect(dept.stages, `${dept.id} owns ${s.id}`).toContain(s.id);
      for (const t of s.jobTypes) expect(DEPARTMENTS.find((d) => d.id === AGENTS.find((a) => a.id === JOB_AGENT[t])!.department)!.stages, `${t} runs in a department owning ${s.id}`).toContain(s.id);
    }
    expect(PIPELINE.filter((s) => s.approval === 'HUMAN').map((s) => s.id)).toEqual(['STORY', 'EDIT']);
  });
});

describe('skills', () => {
  it('every SKILL.md conforms to the Agent Skills spec and agrees with model.ts (one source for the tools)', () => {
    const { errors, files } = checkSkillFiles();
    expect(errors).toEqual([]);
    for (const s of SKILLS) expect(files.get(s.id), `${s.id} SKILL.md`).toBeTruthy();
    // every tool a skill needs is held by an agent that lists it (reference knowledge needs none)
    for (const s of SKILLS) for (const t of s.requiredTools) expect(AGENTS.some((a) => a.skills.includes(s.id) && a.tools.includes(t)), `${s.id} needs ${t}`).toBe(true);
    for (const s of SKILLS.filter((x) => x.kind === 'REFERENCE')) expect(AGENTS.some((a) => a.skills.includes(s.id)), `${s.id} is reference knowledge`).toBe(false);
  });

  it('statuses are computed from evidence: PROMPT skills reach a model, procedures have code and tests, references are unavailable', () => {
    const noKey = () => false;
    const status = (s: SkillDef) => computeSkillStatus(s, { file: true, ev: skillEvidence(s, fileExists), env: noKey });
    const got = Object.fromEntries(SKILLS.map((s) => [s.id, status(s).status]));
    expect(got).toEqual({
      'h3-prompting': 'VERIFIED', 'audio-first-dialogue': 'VERIFIED', 'iraqi-dialogue': 'VERIFIED', 'shot-planning': 'VERIFIED', screenwriting: 'VERIFIED', 'character-design': 'VERIFIED', 'voice-identity': 'VERIFIED',
      'world-continuity': 'VERIFIED', 'singing-performance': 'VERIFIED', 'audio-mix-policy': 'VERIFIED', 'take-inspection': 'VERIFIED', 'minimax-multimodal-toolkit': 'UNAVAILABLE', 'minimax-music-gen': 'UNAVAILABLE',
    });
    expect(SKILLS.filter((s) => s.kind === 'PROMPT').map((s) => s.id).sort()).toEqual(['character-design', 'screenwriting', 'shot-planning']);
    for (const s of SKILLS.filter((x) => x.kind === 'PROMPT')) expect(skillEvidence(s, fileExists).injectedInto.length, `${s.id} is injected nowhere`).toBeGreaterThan(0);
    expect(status(SKILLS.find((s) => s.id === 'minimax-music-gen')!).reason).toMatch(/MINIMAX_API_KEY/);
  });

  it('the status rules: a missing file, missing code, missing tests or no injection is DRAFT with the reason', () => {
    const base: SkillDef = { id: 'x', name: 'X', path: 'skills/x', source: 's', supportedModels: [], requiredTools: [], kind: 'PROCEDURE', implementedBy: ['src/a.ts'], verifiedBy: ['tests/a.test.ts'] };
    const ev = (over: Partial<ReturnType<typeof skillEvidence>> = {}) => ({ kind: base.kind, implementedBy: [{ path: 'src/a.ts', present: true }], verifiedBy: [{ path: 'tests/a.test.ts', present: true }], usedBy: ['a'], injectedInto: [], ...over });
    const env = () => true;
    expect(computeSkillStatus(base, { file: false, ev: ev(), env })).toEqual({ status: 'DRAFT', reason: 'SKILL.md missing at skills/x' });
    expect(computeSkillStatus(base, { file: true, ev: ev(), env }).status).toBe('VERIFIED');
    expect(computeSkillStatus(base, { file: true, ev: ev({ implementedBy: [{ path: 'src/a.ts', present: false }] }), env })).toMatchObject({ status: 'DRAFT', reason: expect.stringMatching(/implementation missing/) });
    expect(computeSkillStatus(base, { file: true, ev: ev({ verifiedBy: [] }), env })).toMatchObject({ status: 'DRAFT', reason: 'no test is named' });
    expect(computeSkillStatus({ ...base, kind: 'PROMPT' }, { file: true, ev: ev(), env })).toMatchObject({ status: 'DRAFT', reason: expect.stringMatching(/injected nowhere/) });
    expect(computeSkillStatus({ ...base, kind: 'PROMPT' }, { file: true, ev: ev({ injectedInto: ['screenwriter'] }), env }).status).toBe('VERIFIED');
    expect(computeSkillStatus({ ...base, requires: { env: 'K', reason: 'needs K' } }, { file: true, ev: ev(), env: () => false })).toEqual({ status: 'UNAVAILABLE', reason: 'needs K' });
    expect(computeSkillStatus({ ...base, kind: 'REFERENCE' }, { file: true, ev: ev(), env }).status).toBe('UNAVAILABLE');
  });

  it('only the agents that call the model receive instructions and skills', () => {
    expect(AGENTS.filter(callsModel).map((a) => a.id).sort()).toEqual(['casting-director', 'continuity-writer', 'film-director', 'head-of-story', 'screenwriter', 'singing-performance']);
  });
});

describe('failure classification', () => {
  it('maps errors to the directive’s classes and allows blind retries only for transient ones', () => {
    expect(classifyFailure(new StudioError('INVALID', 'Shot not found'))).toBe('INVALID_INPUT');
    expect(classifyFailure(new StudioError('UNAVAILABLE', 'ComfyUI is not reachable'))).toBe('INFRASTRUCTURE');
    expect(classifyFailure(new StudioError('PROVIDER', 'MiniMax answered 502'))).toBe('PROVIDER');
    expect(classifyFailure(new Error('CUDA out of memory'))).toBe('RESOURCE_EXHAUSTION');
    expect(classifyFailure(new Error('the shot has characters but no portrait to hold their identity'))).toBe('MISSING_REFERENCE');
    expect(classifyFailure(new Error('The export failed validation: not decodable'))).toBe('OUTPUT_CORRUPTION');
    expect(classifyFailure(Object.assign(new Error('x'), { failureClass: 'LIP_SYNC_FAILURE' }))).toBe('LIP_SYNC_FAILURE');
    expect(classifyFailure(Object.assign(new Error('cancelled'), { name: 'Cancelled' }))).toBe('CANCELLED');
    expect(RETRYABLE_CLASSES).toEqual(['INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION']);
    expect(RETRYABLE_CLASSES).not.toContain('MISSING_REFERENCE');
  });
  it('a manual retry needs a stated change unless the failure was transient (or the job was cancelled)', () => {
    const failed = (failureClass?: string, retryable?: boolean) => ({ status: 'FAILED' as const, error: { code: 'X', message: 'm', retryable, details: failureClass ? { failureClass } : undefined } });
    expect(retryNeedsChange(failed('MISSING_REFERENCE'))).toEqual({ needed: true, failureClass: 'MISSING_REFERENCE' });
    expect(retryNeedsChange(failed('WRONG_PARAMETERS'))).toEqual({ needed: true, failureClass: 'WRONG_PARAMETERS' });
    expect(retryNeedsChange(failed('PROVIDER'))).toEqual({ needed: false, failureClass: 'PROVIDER' });
    expect(retryNeedsChange(failed('INFRASTRUCTURE'))).toEqual({ needed: false, failureClass: 'INFRASTRUCTURE' });
    expect(retryNeedsChange(failed(undefined, true)).needed).toBe(false);
    expect(retryNeedsChange(failed(undefined, false)).needed).toBe(true);
    expect(retryNeedsChange({ status: 'CANCELLED', error: undefined }).needed).toBe(false);
  });
});

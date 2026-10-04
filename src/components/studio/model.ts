import { JOB_LABELS, type JobType } from '@/domain/jobs';
import type { AgentStat, HandoffRow, OrgAgent, OrgDepartment, OrgResponse, OrgSkill, OrgTool } from '@/studio/org';
import { RING } from '@/studio/company';
import { countWord, parseTime, plural, shortWhen } from '@/components/home/model';

/** THE STUDIO COMPANY'S READING OF THE RECORD (docs/DESIGN-SYSTEM-V5.md §8.9) — pure, so every word and number the
 *  company pages show comes from the organisation API and can be tested. Nothing here is estimated: a figure with no
 *  run behind it is `null`, and the page says so in words instead of showing a zero. */

export { countWord, plural, shortWhen, parseTime };

/** 0.4 s · 40 s · 3 min 6 s · 1 h 12 min */
export function duration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.max(0.1, Math.round(ms / 100) / 10)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

/** 97% — or null when nothing was counted. */
export const percent = (n: number, d: number): string | null => (d > 0 ? `${Math.round((n / d) * 100)}%` : null);

/** A job type in words ("Draw the character image"); an unknown constant becomes lower-case words. */
export const jobWords = (t: string): string => JOB_LABELS[t as JobType] ?? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

const FAILURE: Record<string, string> = {
  INVALID_INPUT: 'Invalid input', UNSUPPORTED_CAPABILITY: 'Not supported by the engine', MISSING_REFERENCE: 'Missing reference',
  INCONSISTENT_PLAN: 'Inconsistent plan', PROMPT_AMBIGUITY: 'Ambiguous prompt', WRONG_PARAMETERS: 'Wrong parameters',
  INFRASTRUCTURE: 'Infrastructure', PROVIDER: 'Engine or provider error', RESOURCE_EXHAUSTION: 'Out of resources',
  CHARACTER_INCONSISTENCY: 'Character drift', ENVIRONMENT_INCONSISTENCY: 'Environment drift', VOICE_MISMATCH: 'Voice mismatch',
  LIP_SYNC_FAILURE: 'Lip-sync failure', AUDIO_DUPLICATION: 'Doubled audio', OUTPUT_CORRUPTION: 'Corrupt output', CANCELLED: 'Cancelled',
  UNKNOWN: 'Unknown cause', UNAVAILABLE: 'Engine unavailable', TIMEOUT: 'Took too long',
};
/** A failure class in words (the constant stays in the element's title, for the record). */
export const failureWords = (c: string): string => FAILURE[c] ?? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

const RESOURCE: Record<string, string> = { LLM: 'Language model', GPU_IMAGE: 'GPU, pictures', GPU_VIDEO: 'GPU, video', TTS: 'Speech engine', ASR: 'Transcription engine', CPU: 'Processor', HOSTED: 'Hosted service', NONE: 'No engine' };
export const resourceWords = (r: string): string => RESOURCE[r] ?? r;

const SKILL_KIND: Record<string, string> = { PROMPT: 'Read by the model', PROCEDURE: 'Carried out by code', REFERENCE: 'Reference only' };
export const skillKindWords = (k: string): string => SKILL_KIND[k] ?? k.toLowerCase();

// ------------------------------------------------------------------------------------------------- the departments

/** The departments in pipeline order (the ring's order). */
export const departmentsInOrder = (org: Pick<OrgResponse, 'departments'>): OrgDepartment[] =>
  RING.map((id) => org.departments.find((d) => d.id === id)).filter((d): d is OrgDepartment => Boolean(d));

/** A department's two-letter mark, from its name ("Story Development" → SD); a mark already taken uses the name's
 *  first two letters ("Post-Production" → PO after "Pre-Production" → PP). */
export function departmentCodes(depts: Array<Pick<OrgDepartment, 'id' | 'name'>>): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const d of depts) {
    const words = d.name.split(/[\s&·-]+/).filter((w) => /^\p{L}/u.test(w) && !/^(and|of|the)$/i.test(w));
    let code = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : d.name.slice(0, 2).toUpperCase();
    if (taken.has(code)) code = d.name.replace(/[^\p{L}]/gu, '').slice(0, 2).toUpperCase();
    taken.add(code);
    out.set(d.id, code);
  }
  return out;
}

/** The department's agents, director first. */
export const teamOf = (agents: OrgAgent[], d: Pick<OrgDepartment, 'id' | 'directorId'>): OrgAgent[] => {
  const xs = agents.filter((a) => a.department === d.id);
  return [...xs.filter((a) => a.id === d.directorId), ...xs.filter((a) => a.id !== d.directorId)];
};

export interface RunRecord { runs: number; completed: number; failed: number; running: number; firstOk: number; firsts: number; medianMs: number | null; lastRunAt: string | null }

/** A team's record from the agents' run statistics: totals, and the slowest agent median as the department's median
 *  (a department is as quick as its slowest step). Null figures stay null. */
export function recordOf(stats: AgentStat[], agentIds: ReadonlyArray<string>): RunRecord {
  const xs = stats.filter((s) => agentIds.includes(s.agentId));
  const medians = xs.map((s) => s.p50Ms).filter((m): m is number => typeof m === 'number');
  const last = xs.map((s) => s.lastRunAt).filter((t): t is string => Boolean(t)).sort((a, b) => (parseTime(b)?.getTime() ?? 0) - (parseTime(a)?.getTime() ?? 0))[0] ?? null;
  return {
    runs: xs.reduce((n, s) => n + s.runs, 0), completed: xs.reduce((n, s) => n + s.completed, 0), failed: xs.reduce((n, s) => n + s.failed, 0), running: xs.reduce((n, s) => n + s.running, 0),
    firstOk: xs.reduce((n, s) => n + s.firstAttemptOk, 0), firsts: xs.reduce((n, s) => n + s.firstAttempts, 0),
    medianMs: medians.length ? Math.max(...medians) : null, lastRunAt: last,
  };
}

/** The skills a team uses (each once), from the agents' own declarations. */
export const skillsOfTeam = (skills: OrgSkill[], team: OrgAgent[]): OrgSkill[] => { const ids = new Set(team.flatMap((a) => a.skills)); return skills.filter((s) => ids.has(s.id)); };
export const toolsOfTeam = (tools: OrgTool[], team: OrgAgent[]): OrgTool[] => { const ids = new Set(team.flatMap((a) => a.tools)); return tools.filter((t) => ids.has(t.id)); };

/** "Story", "Cast & world" — the pipeline's own stage names. */
export const stageName = (org: Pick<OrgResponse, 'pipeline'>, id: string): string => org.pipeline.find((s) => s.id === id)?.name ?? id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, ' ');

/** Where a handoff went: the receiving department, or the producer for the cut (an Edit handoff) and the export. */
export function handoffTarget(org: Pick<OrgResponse, 'departments'>, h: Pick<HandoffRow, 'stage' | 'receiverDepartment'>): string {
  if (h.stage === 'EDIT') return 'you, for approval';
  if (!h.receiverDepartment) return 'the finished film';
  return org.departments.find((d) => d.id === h.receiverDepartment)?.name ?? h.receiverDepartment;
}
export const departmentName = (org: Pick<OrgResponse, 'departments'>, id: string | null | undefined): string => (id ? org.departments.find((d) => d.id === id)?.name ?? id : '');

/** "9 of 9 checks passed" */
export const checksLine = (checks: Array<{ ok: boolean }>): string | null => (checks.length ? `${checks.filter((c) => c.ok).length} of ${checks.length} checks passed` : null);

/** The run state of an agent, in words. */
export function agentStateWords(stat: AgentStat | null | undefined): { tone: 'running' | 'idle' | 'failed'; words: string } {
  if (stat?.running) return { tone: 'running', words: 'Working now' };
  if (stat && stat.runs > 0) {
    const when = shortWhen(stat.lastRunAt);
    return { tone: stat.failed > 0 && stat.failed >= stat.completed ? 'failed' : 'idle', words: when ? `Last ran ${when}` : 'Has run' };
  }
  return { tone: 'idle', words: 'Has not run yet' };
}

/** A run's outcome in words and tone. */
export function outcomeWords(o: string | null): { tone: 'running' | 'done' | 'failed' | 'waiting' | 'idle'; words: string } {
  if (o === null) return { tone: 'running', words: 'Running' };
  if (o === 'FAILED') return { tone: 'failed', words: 'Failed' };
  if (o === 'CANCELLED') return { tone: 'idle', words: 'Cancelled' };
  if (o === 'AWAITING_REVIEW') return { tone: 'waiting', words: 'Waits for review' };
  return { tone: 'done', words: 'Done' };
}

/** The span of the run record the API counted, in words: "the last 30 days", "the last 7 days", "the last 24 hours". */
export const spanWords = (hours: number): string => (hours % 24 === 0 ? (hours === 24 ? 'the last 24 hours' : `the last ${hours / 24} days`) : `the last ${hours} hours`);

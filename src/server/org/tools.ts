import { StudioError } from '@/domain/errors';
import type { Job } from '@/domain/jobs';
import type { Logger } from '../log';
import { agentById, toolById, type AgentDef, type FailureClass } from './model';
import { CONTRACTS, issuesOf } from './contracts';
import { classifyFailure, finishRun, recordToolCall, startDelegatedRun, studioEvent } from './runs';
import { raceAbort, withSignal } from '../jobs/context';

/** TOOL CONTRACTS AT RUN TIME — a handler gets `ctx.tool(id, fn, { input })`: the call is refused when the tool is not
 *  on the agent's allow-list or not registered; the declared input is validated against the tool's contract before
 *  the call (WRONG_PARAMETERS) and the result after it (OUTPUT_CORRUPTION, contracts.ts); the call is bounded by the
 *  tool's timeout, timed, logged and recorded on the agent run with its outcome and failure class. */

export interface ToolOptions { label?: string; /** what the call is given (its contract's input); validated before the call */ input?: unknown }
export interface ToolRunner { <T>(toolId: string, fn: () => Promise<T>, opts?: ToolOptions): Promise<T> }

const contractError = (message: string, failureClass: FailureClass, details: Record<string, unknown>) => Object.assign(new StudioError('INVALID', message, { ...details, failureClass }), { failureClass, retryable: false });

export function makeToolRunner(agent: AgentDef, runId: string, log: Logger): ToolRunner {
  return async (toolId, fn, opts = {}) => {
    const def = toolById(toolId);
    if (!def) throw new StudioError('INVALID', `Tool ${toolId} is not registered.`);
    if (!agent.tools.includes(toolId)) throw new StudioError('INVALID', `${agent.name} may not call ${toolId} (allowed: ${agent.tools.join(', ') || 'none'}).`, { agentId: agent.id, toolId });
    const contract = CONTRACTS[toolId];
    const at = new Date().toISOString();
    const t0 = Date.now();
    const record = (ok: boolean, extra: { error?: string; failureClass?: FailureClass } = {}) => void recordToolCall(runId, { tool: toolId, version: def.version, ms: Date.now() - t0, ok, at, ...extra }).catch(() => undefined);
    if (opts.input !== undefined && contract) {
      const parsed = contract.input.safeParse(opts.input);
      if (!parsed.success) {
        const why = issuesOf(parsed.error);
        log.warn({ tool: toolId, label: opts.label, issues: why }, 'tool call refused: wrong parameters');
        record(false, { error: `wrong parameters: ${why}`.slice(0, 300), failureClass: 'WRONG_PARAMETERS' });
        throw contractError(`${def.name}: wrong parameters — ${why}`, 'WRONG_PARAMETERS', { toolId });
      }
    }
    // THE TOOL TIMEOUT ABORTS THE WORK (audit H5): the call runs under its own signal (the job's AND this timer's),
    // so at the timeout its ffmpeg children are killed, its requests aborted and its ComfyUI prompt cancelled — the
    // GPU lease is not released while the engine still renders. Work that ignores the signal is let go of 2 s later.
    const toolCtrl = new AbortController();
    const timer = setTimeout(() => toolCtrl.abort(Object.assign(new StudioError('UNAVAILABLE', `${def.name} did not finish within ${Math.round(def.timeoutMs / 1000)} s.`, { failureClass: 'INFRASTRUCTURE' }), { failureClass: 'INFRASTRUCTURE' })), def.timeoutMs);
    let out: Awaited<ReturnType<typeof fn>>;
    try {
      out = await raceAbort(withSignal(toolCtrl.signal, fn), toolCtrl.signal, 2_000);
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 300);
      log.warn({ tool: toolId, ms: Date.now() - t0, err: msg, label: opts.label }, 'tool call failed');
      record(false, { error: msg, failureClass: classifyFailure(e) });
      throw e;
    } finally { clearTimeout(timer); }
    if (contract) {
      const schema = (opts.input !== undefined && contract.outputFor?.(opts.input)) || contract.output;
      const parsed = schema.safeParse(out);
      if (!parsed.success) {
        const why = issuesOf(parsed.error);
        log.error({ tool: toolId, label: opts.label, issues: why }, 'tool output does not match its contract');
        record(false, { error: `output does not match the contract: ${why}`.slice(0, 300), failureClass: 'OUTPUT_CORRUPTION' });
        throw contractError(`${def.name} returned something its contract does not allow — ${why}`, 'OUTPUT_CORRUPTION', { toolId });
      }
    }
    log.debug({ tool: toolId, ms: Date.now() - t0, label: opts.label }, 'tool call');
    record(true);
    // the provider's own value, untouched: validation never rewrites what the handler receives
    return out;
  };
}

/** `ctx.delegate(agentId, purpose, fn)` — run a specialist's step inside the current job as that agent: a child run
 *  under the job's run, a tool runner with THAT agent's allow-list, the outcome and failure class recorded, and one
 *  activity event. `purpose` is `'<step id>'` or `'<step id>: <detail>'`, and the step must be one the agent
 *  declares in model.ts (`steps`); the run records the step's name and the detail. The step's error propagates
 *  unchanged to the job. */
export interface Delegator { <T>(agentId: string, purpose: string, fn: (tool: ToolRunner) => Promise<T>): Promise<T> }

/** Split `'<step id>: <detail>'`. */
export function parsePurpose(purpose: string): { stepId: string; detail?: string } {
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?::\s*([\s\S]*))?$/.exec(purpose.trim());
  return m ? { stepId: m[1], detail: m[2]?.trim() || undefined } : { stepId: '' };
}

export function makeDelegator(job: Pick<Job, 'id' | 'type' | 'attempts' | 'productionId' | 'shotId'>, parentRunId: string, log: Logger): Delegator {
  return async (agentId, purpose, fn) => {
    const agent = agentById(agentId);
    if (!agent) throw new StudioError('INVALID', `Unknown agent ${agentId}.`);
    const { stepId, detail } = parsePurpose(purpose);
    const def = agent.steps.find((s) => s.id === stepId);
    if (!def) throw new StudioError('INVALID', `${agent.name} declares no step "${stepId || purpose}" (declared: ${agent.steps.map((s) => s.id).join(', ') || 'none'}).`, { agentId, purpose });
    const label = detail ? `${def.name}: ${detail}` : def.name;
    const runId = await startDelegatedRun({ job, parentRunId, agentId, purpose: label });
    const t0 = Date.now();
    try {
      const out = await fn(makeToolRunner(agent, runId, log));
      await finishRun(runId, { outcome: 'COMPLETED', ms: Date.now() - t0 });
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'STEP_DONE', message: `${agent.name}: ${label}`, data: { runId, parentRunId, stepId, ms: Date.now() - t0 }, jobId: job.id });
      return out;
    } catch (e) {
      const failureClass = classifyFailure(e);
      await finishRun(runId, { outcome: 'FAILED', failureClass, errorMessage: (e as Error).message, ms: Date.now() - t0 }).catch(() => undefined);
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'STEP_FAILED', message: `${agent.name}: ${label} — ${(e as Error).message.slice(0, 200)}`, data: { runId, parentRunId, stepId, failureClass }, jobId: job.id });
      throw e;
    }
  };
}

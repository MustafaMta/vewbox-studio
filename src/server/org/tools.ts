import { StudioError } from '@/domain/errors';
import type { Job } from '@/domain/jobs';
import type { Logger } from '../log';
import { agentById, toolById, type AgentDef } from './model';
import { classifyFailure, finishRun, recordToolCall, startDelegatedRun, studioEvent } from './runs';

/** TOOL CONTRACTS AT RUN TIME — a handler gets `ctx.tool(id, fn)`: the call is refused when the tool is not on the
 *  agent's allow-list or not registered, bounded by the tool's timeout, timed, logged, and recorded on the agent run.
 *  The input and output validation lives in the provider functions the tool wraps (Zod schemas on their requests and
 *  the engine's responses); this layer owns permission, time and the record. */

export interface ToolRunner { <T>(toolId: string, fn: () => Promise<T>, opts?: { label?: string }): Promise<T> }

export function makeToolRunner(agent: AgentDef, runId: string, log: Logger): ToolRunner {
  return async (toolId, fn, opts = {}) => {
    const def = toolById(toolId);
    if (!def) throw new StudioError('INVALID', `Tool ${toolId} is not registered.`);
    if (!agent.tools.includes(toolId)) throw new StudioError('INVALID', `${agent.name} may not call ${toolId} (allowed: ${agent.tools.join(', ')}).`, { agentId: agent.id, toolId });
    const t0 = Date.now();
    const at = new Date().toISOString();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new StudioError('UNAVAILABLE', `${def.name} did not finish within ${Math.round(def.timeoutMs / 1000)} s.`), { failureClass: 'INFRASTRUCTURE' })), def.timeoutMs); });
    try {
      const out = await Promise.race([fn(), timeout]);
      const ms = Date.now() - t0;
      log.debug({ tool: toolId, ms, label: opts.label }, 'tool call');
      void recordToolCall(runId, { tool: toolId, ms, ok: true, at }).catch(() => undefined);
      return out;
    } catch (e) {
      const ms = Date.now() - t0;
      const msg = (e as Error).message?.slice(0, 300);
      log.warn({ tool: toolId, ms, err: msg, label: opts.label }, 'tool call failed');
      void recordToolCall(runId, { tool: toolId, ms, ok: false, error: msg, at }).catch(() => undefined);
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  };
}

/** For code paths outside a job (tests, scripts): records nothing, enforces nothing. */
export const unrecordedTool: ToolRunner = (_id, fn) => fn();

/** `ctx.delegate(agentId, purpose, fn)` — run a specialist's step inside the current job as that agent: a child run
 *  under the job's run, a tool runner with THAT agent's allow-list, the outcome and failure class recorded, and one
 *  activity event. The step's error propagates unchanged to the job. */
export interface Delegator { <T>(agentId: string, purpose: string, fn: (tool: ToolRunner) => Promise<T>): Promise<T> }

export function makeDelegator(job: Pick<Job, 'id' | 'type' | 'attempts' | 'productionId' | 'shotId'>, parentRunId: string, log: Logger): Delegator {
  return async (agentId, purpose, fn) => {
    const agent = agentById(agentId);
    if (!agent) throw new StudioError('INVALID', `Unknown agent ${agentId}.`);
    const runId = await startDelegatedRun({ job, parentRunId, agentId, purpose });
    const t0 = Date.now();
    try {
      const out = await fn(makeToolRunner(agent, runId, log));
      await finishRun(runId, { outcome: 'COMPLETED', ms: Date.now() - t0 });
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'STEP_DONE', message: `${agent.name}: ${purpose}`, data: { runId, parentRunId, ms: Date.now() - t0 }, jobId: job.id });
      return out;
    } catch (e) {
      const failureClass = classifyFailure(e);
      await finishRun(runId, { outcome: 'FAILED', failureClass, errorMessage: (e as Error).message, ms: Date.now() - t0 }).catch(() => undefined);
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'STEP_FAILED', message: `${agent.name}: ${purpose} — ${(e as Error).message.slice(0, 200)}`, data: { runId, parentRunId, failureClass }, jobId: job.id });
      throw e;
    }
  };
}

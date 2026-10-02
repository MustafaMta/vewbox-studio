import { StudioError } from '@/domain/errors';
import type { Logger } from '../log';
import { toolById, type AgentDef } from './model';
import { recordToolCall } from './runs';

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

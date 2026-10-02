import type { ToolRunner } from '@/server/org/tools';
import type { HandlerContext } from './index';

/** A specialist's step inside a job, recorded as that agent's delegated run (docs/CONTRACTS-PHASE2-STUDIO.md §2).
 *  `purpose` is `'<step id>'` or `` `<step id>: <detail>` ``, the step id one the agent declares in model.ts `steps`
 *  (written literally, so the organisation test finds every call). `fn` gets a tool runner with THAT agent's
 *  allow-list. Without a delegator (a test context) the step runs with the job's own tool runner.
 *  Lives in its own module (re-exported by ./index) so a handler can import it without importing the handler table. */
export function step<T>(ctx: Pick<HandlerContext, 'delegate' | 'tool'>, agentId: string, purpose: string, fn: (tool: ToolRunner) => Promise<T>): Promise<T> {
  return ctx.delegate ? ctx.delegate(agentId, purpose, fn) : fn(ctx.tool);
}

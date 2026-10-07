/* PLANNER LIVE CHECK: the studio's own call path against the running planner — the machine's GPU lease, vLLM woken
 * when asleep (as after another family held the card), one structured answer validated by a zod schema. Writes no
 * studio data (the lease row and a metric only).
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/planner-live-check.ts [--sleep-first]
 */
import { z } from 'zod';

async function main() {
  const { json, resolveProvider, plannerBase } = await import('@/server/providers/llm');
  const vllm = await import('@/server/providers/vllm');
  const cfg = resolveProvider();
  const base = plannerBase(cfg.baseUrl);
  if (process.argv.includes('--sleep-first')) { await vllm.sleepVllm(base); console.log(`asleep before the call: ${await vllm.vllmSleeping(base)}`); }
  const Schema = z.object({ character: z.object({ name: z.string(), look: z.string() }), location: z.string(), shots: z.array(z.object({ framing: z.enum(['WIDE', 'MEDIUM', 'CLOSE_UP']), action: z.string() })).length(3) });
  const t0 = Date.now();
  const r = await json(Schema, [
    { role: 'system', content: 'You plan films. Answer with ONE JSON object only.' },
    { role: 'user', content: 'A ferry captain makes her last crossing in fog. JSON: { "character": { "name", "look" }, "location": string, "shots": exactly 3 of { "framing": "WIDE"|"MEDIUM"|"CLOSE_UP", "action" } }.' },
  ], { maxTokens: 800 });
  console.log(JSON.stringify({ ms: Date.now() - t0, attempts: r.attempts, model: r.result.model, inputTokens: r.result.inputTokens, outputTokens: r.result.outputTokens, finish: r.result.finishReason, awakeAfter: (await vllm.vllmSleeping(base)) === false, data: r.data }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error('FAILED:', (e as Error).message); process.exit(1); });

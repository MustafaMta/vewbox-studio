/* LANGUAGE MODEL EVALUATION (docs/research/MODEL-STACK-2026-10.md §5.6 L1/L2, run as docs/research/MODEL-EVAL-2026-10.md §3):
 * the studio's OWN planning calls (develop → script → shots, an Iraqi Arabic script scene and its shot plan, a
 * character design) run through the story engine (src/server/story/engine.ts) against the local Ollama with the app's
 * own request settings (num_ctx = OLLAMA_CONTEXT_LENGTH, keep_alive, think: false), once per candidate model.
 *
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/model-eval-llm.ts --model qwen3:14b [--runs 2] [--tasks develop,script,plan,ar-script,ar-plan,design]
 *
 * The engine's local path runs under the shared GPU lease, which WRITES resource_leases: this script therefore points
 * DATABASE_URL at the copy `vewbox_modeleval` (a dump of the live studio), never the live database, and reads the
 * studio state from it. Per call: attempts (every POST to /chat/completions is one; 1 = schema-valid without repair),
 * latency, prompt/completion tokens, the card's peak memory, Ollama's own report of the loaded model (size, VRAM share,
 * context), and the parsed answer, saved under docs/evidence/model-eval-2026-10/llm/<model>/. Quality (shot plans,
 * Arabic) is judged by reading the answers; nothing here scores it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL) { console.error('give --model <ollama tag>'); process.exit(2); }
const RUNS = Number(opt('runs', '2'));
const TASKS = opt('tasks', 'develop,script,plan,ar-script,ar-plan,design').split(',');
const OLLAMA = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/v1\/?$/, '');

// the copy database, the local provider, the candidate model: set before the server code reads its environment
const live = process.env.DATABASE_URL ?? '';
if (!/\/vewbox(\?|$)/.test(live)) { console.error(`DATABASE_URL does not name the vewbox database (${live.replace(/:[^:@]+@/, ':***@')})`); process.exit(2); }
process.env.DATABASE_URL = live.replace(/\/vewbox(\?|$)/, '/vewbox_modeleval$1');
process.env.LLM_PROVIDER = 'openai-compatible';
process.env.OPENAI_COMPATIBLE_MODEL = MODEL;
process.env.MINIMAX_API_KEY = ''; process.env.ANTHROPIC_API_KEY = '';

const ROOT = process.cwd();
const EVID = path.join(ROOT, 'docs/evidence/model-eval-2026-10/llm', MODEL.replace(/[^a-z0-9.-]+/gi, '_'));

// ------------------------------------------------------------------------------------------ measurement
class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (line.trim() && Number.isFinite(v)) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  now() { return this.samples.length ? this.samples[this.samples.length - 1][1] : NaN; }
  stop() { this.proc?.kill(); }
}
interface Attempt { ms: number; status: number; promptTokens?: number; completionTokens?: number; head: string; requestChars: number; numCtx?: number; keepAlive?: unknown; think?: unknown }
let attempts: Attempt[] = [];
let lastRequest: unknown = null;
const realFetch = globalThis.fetch;
// every POST to /chat/completions is one attempt (the engine's repair rounds are further attempts)
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!/\/chat\/completions$/.test(url)) return realFetch(input, init);
  const t0 = Date.now();
  const body = typeof init?.body === 'string' ? init.body : '';
  let parsed: { options?: { num_ctx?: number }; keep_alive?: unknown; think?: unknown; messages?: unknown } = {};
  try { parsed = JSON.parse(body); } catch { /* not json */ }
  lastRequest = parsed.messages;
  const res = await realFetch(input, init);
  const clone = res.clone();
  let head = ''; let usage: { prompt_tokens?: number; completion_tokens?: number } = {};
  try { const j = await clone.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: typeof usage }; head = (j.choices?.[0]?.message?.content ?? '').slice(0, 160); usage = j.usage ?? {}; } catch { /* not json */ }
  attempts.push({ ms: Date.now() - t0, status: res.status, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, head, requestChars: body.length, numCtx: parsed.options?.num_ctx, keepAlive: parsed.keep_alive, think: parsed.think });
  return res;
}) as typeof fetch;

async function ollamaPs() { try { return await realFetch(`${OLLAMA}/api/ps`).then((r) => r.json()); } catch { return null; } }
async function dockerStats() { return new Promise<string>((resolve) => { const p = spawn('docker', ['stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}}', 'vewbox-llm-1']); let out = ''; p.stdout.on('data', (d: Buffer) => { out += d.toString(); }); p.on('close', () => resolve(out.trim())); p.on('error', () => resolve('')); }); }

async function main() {
  const meter = new VramMeter(); meter.start();
  await fs.mkdir(EVID, { recursive: true });
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const engine = await import('@/server/story/engine');
  const { state } = await readState();
  const p = state.productions.find((x) => x.title === 'The Static Sky') ?? state.productions[0];
  if (!p) throw new Error('the copy database holds no production');
  const cast = castOf(state, p); const world = worldOf(state, p);
  console.log(`model ${MODEL}; production "${p.title}" (${p.language}, ${p.style}), ${p.scenes.length} scenes, cast ${cast.map((c) => c.name).join(', ')}; evidence → ${path.relative(ROOT, EVID)}`);
  const summaryFile = path.join(EVID, 'summary.json');
  const summary: Record<string, unknown> = await fs.readFile(summaryFile, 'utf8').then((t) => JSON.parse(t) as Record<string, unknown>, () => ({}));
  const calls: Array<Record<string, unknown>> = (summary.calls as Array<Record<string, unknown>>) ?? [];
  summary.model = MODEL; summary.numCtx = process.env.OLLAMA_CONTEXT_LENGTH ?? '16384 (default)'; summary.keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? '2m (default)';

  // the Arabic production: the same story, written in Iraqi Baghdadi Arabic (the cast speaks Arabic)
  const pAr = { ...p, id: `${p.id}-ar`, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const, title: 'السماء الساكنة', titleAr: 'السماء الساكنة' };
  const castAr = cast.map((c) => ({ ...c, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const }));
  let arScene: typeof p.scenes[number] | undefined;

  async function measure<T>(task: string, run: number, fn: () => Promise<T>): Promise<T | undefined> {
    attempts = []; lastRequest = null;
    const t0 = Date.now(); const before = meter.now();
    process.stdout.write(`${task} run ${run} … `);
    let data: T | undefined; let error: string | undefined;
    try { data = await fn(); } catch (e) { error = String((e as Error).message ?? e); }
    const ms = Date.now() - t0;
    const ps = await ollamaPs();
    const rec = { task, run, model: MODEL, ms, attempts: attempts.length, firstAttemptValid: !error && attempts.length === 1, attemptsDetail: attempts, error, vramBeforeMiB: before, vramPeakMiB: meter.peak(t0), ollamaPs: ps, llmContainer: await dockerStats(), at: new Date().toISOString() };
    calls.push(rec);
    summary.calls = calls;
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    await fs.writeFile(path.join(EVID, `${task}-run${run}.json`), JSON.stringify({ ...rec, request: lastRequest, answer: data }, null, 2));
    console.log(error ? `ERROR after ${Math.round(ms / 1000)} s, ${attempts.length} attempt(s): ${error.slice(0, 200)}` : `${Math.round(ms / 1000)} s, ${attempts.length} attempt(s), peak ${meter.peak(t0)} MiB, tokens ${attempts.map((a) => `${a.promptTokens}+${a.completionTokens}`).join(' / ')}`);
    return data;
  }

  for (let run = 1; run <= RUNS; run++) {
    if (TASKS.includes('develop')) await measure('develop', run, () => engine.developStory(state, { ...p, scenes: [] }, cast, world));
    if (TASKS.includes('script')) await measure('script', run, () => engine.writeScript(state, p, p.scenes, cast, world));
    if (TASKS.includes('plan')) {
      const draft = await measure('plan', run, () => engine.planShotsDraft(state, p, p.scenes[0], cast, world, {}));
      if (draft) {
        const notes = draft.shots.flatMap((s) => s.notes ?? []);
        const total = draft.shots.reduce((a, s) => a + s.durationSeconds, 0);
        const lines = p.scenes[0].beats.flatMap((b) => b.lines).length;
        const assigned = draft.shots.reduce((a, s) => a + s.dialogue.length, 0);
        const checks = { shots: draft.shots.length, budget: draft.budget, totalSeconds: total, scriptLines: lines, linesAssignedByPlanner: assigned, castAddedFromActions: notes.filter((n) => n.startsWith('added to the cast')).length, speechScrubbed: notes.filter((n) => n.includes('speech words scrubbed')).length, framingChanged: notes.filter((n) => n.includes('framing')).length, cutsDropped: notes.filter((n) => n.includes('cut(s) dropped')).length, withBeats: draft.shots.filter((s) => s.staging?.beats?.length).length, withPrompt: draft.shots.filter((s) => s.prompt).length, boundaries: draft.shots.map((s) => s.boundary) };
        calls[calls.length - 1].checks = checks;
        await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
        console.log(`  plan checks ${JSON.stringify(checks)}`);
      }
    }
    if (TASKS.includes('ar-script')) {
      const scene0 = { ...p.scenes[0], beats: [] };
      const r = await measure('ar-script', run, () => engine.writeScript(state, { ...pAr, scenes: [scene0] }, [scene0], castAr, world));
      if (r && run === 1) {
        const sc = r.scenes[0];
        const byName = (n: string) => castAr.find((c) => c.name.toLowerCase() === n.trim().toLowerCase() || c.nameAr === n.trim())?.id ?? castAr[0].id;
        arScene = { ...scene0, beats: sc.beats.map((b, i) => ({ id: `beat-${i}`, action: b.action, lines: b.lines.map((l, k) => ({ id: `line-${i}-${k}`, characterId: byName(l.characterName), text: l.text, textAr: l.textAr, delivery: l.delivery })) })) } as typeof scene0;
      }
    }
    if (TASKS.includes('ar-plan') && arScene) await measure('ar-plan', run, () => engine.planShotsDraft(state, { ...pAr, scenes: [arScene!] }, arScene!, castAr, world, {}));
    if (TASKS.includes('design')) await measure('design', run, () => engine.designCharacter(state, { brief: 'A Baghdadi kite-maker of about seventy who sells paper kites on the Tigris corniche and talks to the wind; gentle, stubborn, funny', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI' }));
  }
  // the model leaves the card (the lease would ask for it on the next family switch; here we are done)
  await realFetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }).catch(() => {});
  meter.stop();
  const byTask: Record<string, { n: number; medianMs: number; firstAttemptValid: number; errors: number; peakMiB: number }> = {};
  for (const t of new Set(calls.map((c) => String(c.task)))) {
    const cs = calls.filter((c) => c.task === t);
    const ms = cs.map((c) => Number(c.ms)).sort((a, b) => a - b);
    byTask[t] = { n: cs.length, medianMs: ms[Math.floor((ms.length - 1) / 2)], firstAttemptValid: cs.filter((c) => c.firstAttemptValid).length, errors: cs.filter((c) => c.error).length, peakMiB: Math.max(...cs.map((c) => Number(c.vramPeakMiB) || 0)) };
  }
  summary.byTask = byTask;
  await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(byTask, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

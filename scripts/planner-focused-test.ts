/* PLANNER FOCUSED TEST (producer Phase 1; docs/research/MODEL-EVAL-2026-10.md §10): the production planner
 * (Qwen3.8-27B-FP8 on vLLM, compose service llm-vllm) through the studio's OWN planning code paths
 * (src/server/story/engine.ts → src/server/providers/llm.ts: the app's request, schemas, repairs, truncation handling,
 * the GPU lease), on real Vewbox tasks, in one chain so continuity can be read across the outputs:
 *   1 concept      proposeIdea SHORT, with the studio's Elias Moore and Najm and Elias's workshop required
 *   2 outline      developStory of that concept (logline, synopsis, scene breakdown)
 *   3 scene        writeScript of the outline's first scene (beats, lines)
 *   4 shots        planShotsDraft + fitDurations of that scene at ≈ 15 s (3 shots of 3–10 s)
 *   5 JSON         every answer validated against the app's schemas (attempt #1 recorded separately)
 *   6 continuity   names, places and states across 1–4 (mechanical checks; read by hand too)
 *   7 image+text   one reference picture with a question, straight to the vLLM endpoint (the studio's planner path
 *                  is text-only today; this proves the vision tower serves)
 * Per call: attempts, first-token latency, answer tokens, tokens/s, stop reason, reasoning characters (must be 0),
 * card and RAM. Reads the copy database vewbox_llm (never writes the live studio; the GPU lease is the live one).
 *
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/planner-focused-test.ts [--out run1] [--image <png>]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess, execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = opt('base', 'http://127.0.0.1:8050/v1');
const live = process.env.DATABASE_URL ?? '';
if (!/\/vewbox(\?|$)/.test(live)) { console.error('DATABASE_URL must name the vewbox database (the copy vewbox_llm is derived from it)'); process.exit(2); }
process.env.DATABASE_URL = live.replace(/\/vewbox(\?|$)/, '/vewbox_llm$1');
process.env.GPU_LEASE_DATABASE_URL = live; // the machine's one lease
process.env.LLM_PROVIDER = 'openai-compatible';
process.env.OPENAI_COMPATIBLE_BASE_URL = BASE;
process.env.OPENAI_COMPATIBLE_RUNTIME = 'vllm';
process.env.OPENAI_COMPATIBLE_MODEL = opt('model', 'Qwen3.8-27B-FP8');
process.env.LLM_CONTEXT_LENGTH = opt('ctx', '16384');
process.env.MINIMAX_API_KEY = ''; process.env.ANTHROPIC_API_KEY = '';
const MODEL = process.env.OPENAI_COMPATIBLE_MODEL;
const OUT = path.join(process.cwd(), 'docs/evidence/model-eval-2026-10/planner-qwen3.8', opt('out', 'run1'));

class Meter {
  private p: ChildProcess | null = null; samples: Array<[number, number]> = [];
  start() { this.p = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.p.stdout!.on('data', (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) { const v = Number(l.trim()); if (l.trim() && Number.isFinite(v)) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  stop() { this.p?.kill(); }
}
const ramGiB = () => { try { const s = execFileSync('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', 'vewbox-llm-vllm-1']).toString(); const m = /([\d.]+)\s*([KMG]i?B)/i.exec(s); if (!m) return NaN; const v = Number(m[1]); return m[2].toUpperCase().startsWith('G') ? v : v / 1024; } catch { return NaN; } };

interface Attempt { kind: string; ms: number; firstTokenMs?: number; promptTokens?: number; completionTokens?: number; finish?: string; reasoningChars: number; maxTokens?: number; tokPerS?: number; head: string }
let attempts: Attempt[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!/\/chat\/completions$/.test(url)) return realFetch(input, init);
  const t0 = Date.now();
  const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string }>; max_tokens?: number };
  const res = await realFetch(input, init);
  const rec: Attempt = { kind: body.messages?.some((m) => m.role === 'assistant') ? 'repair' : 'first', ms: 0, reasoningChars: 0, maxTokens: body.max_tokens, head: '' };
  attempts.push(rec);
  // a tee: the engine reads one branch, this records the other (first token, usage, reasoning)
  if (!res.body) return res;
  const [a, b] = res.body.tee();
  void (async () => {
    const reader = b.getReader(); const dec = new TextDecoder(); let buf = ''; let content = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
        try {
          const j = JSON.parse(line.slice(5)) as { choices?: Array<{ delta?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          const d = j.choices?.[0]?.delta;
          if ((d?.content || d?.reasoning || d?.reasoning_content) && rec.firstTokenMs === undefined) rec.firstTokenMs = Date.now() - t0;
          content += d?.content ?? ''; rec.reasoningChars += (d?.reasoning ?? d?.reasoning_content ?? '').length;
          if (j.choices?.[0]?.finish_reason) rec.finish = j.choices[0].finish_reason ?? undefined;
          if (j.usage) { rec.promptTokens = j.usage.prompt_tokens; rec.completionTokens = j.usage.completion_tokens; }
        } catch { /* partial */ }
      }
    }
    rec.ms = Date.now() - t0; rec.head = content.slice(0, 200);
    if (rec.completionTokens && rec.firstTokenMs !== undefined) rec.tokPerS = Number((rec.completionTokens / Math.max(0.001, (rec.ms - rec.firstTokenMs) / 1000)).toFixed(1));
  })();
  return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
}) as typeof fetch;

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const meter = new Meter(); meter.start();
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const engine = await import('@/server/story/engine');
  const { state } = await readState();
  const base = state.productions.find((p) => p.title === 'The Static Sky')!;
  const cast = castOf(state, base); const world = worldOf(state, base);
  const results: Record<string, unknown> = { model: MODEL, base: BASE, at: new Date().toISOString() };
  const save = () => fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2));

  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    attempts = []; const t0 = Date.now(); let data: T | undefined; let error: string | undefined;
    process.stdout.write(`${name} … `);
    try { data = await fn(); } catch (e) { error = (e as Error).message; }
    await new Promise((r) => setTimeout(r, 300));
    const out = attempts.reduce((a, x) => a + (x.completionTokens ?? 0), 0);
    const rec = { name, ms: Date.now() - t0, attempts: attempts.length, firstAttemptValid: !error && attempts.length === 1, truncated: attempts.filter((a) => a.finish === 'length').length, reasoningChars: attempts.reduce((a, x) => a + x.reasoningChars, 0), answerTokens: out, cardPeakMiB: meter.peak(t0), ramGiB: ramGiB(), attemptsDetail: attempts, error };
    (results.steps as unknown[] | undefined) ? (results.steps as unknown[]).push(rec) : (results.steps = [rec]);
    await fs.writeFile(path.join(OUT, `${name}.json`), JSON.stringify({ ...rec, answer: data }, null, 2));
    await save();
    console.log(error ? `ERROR ${error.slice(0, 300)}` : `${Math.round(rec.ms / 1000)} s, ${rec.attempts} attempt(s), ${attempts.map((a) => `${a.promptTokens}+${a.completionTokens} ${a.finish} ttft ${a.firstTokenMs} ms ${a.tokPerS} tok/s`).join(' / ')}, card ${rec.cardPeakMiB} MiB, RAM ${rec.ramGiB} GiB, reasoning ${rec.reasoningChars}`);
    return data;
  }

  // 1 — a short film concept, with the studio's own cast and place required
  const concept = await step('1-concept', () => engine.proposeIdea(state, { kind: 'SHORT', preferences: { style: base.style, language: 'EN', durationSeconds: 60, castIds: cast.map((c) => c.id), locationIds: world.map((l) => l.id) }, brief: 'The night after the radio first spoke, Elias and Najm try to record the Mariner\'s call so that someone will believe them — and the tape catches something neither of them heard.' }));
  if (!concept) { meter.stop(); process.exit(1); }
  // 2 — the outline of that concept, as a production with its cast and place attached
  const p2 = { ...base, id: 'prod-focus', title: concept.title, logline: concept.logline, synopsis: '', targetSeconds: 60, scenes: [], shots: [], brief: { mode: 'MANUAL' as const, text: `${concept.logline}\n\n${concept.premise}` }, castIds: cast.map((c) => c.id), locationIds: world.map((l) => l.id) };
  const outline = await step('2-outline', () => engine.developStory(state, p2, cast, world));
  if (!outline) { meter.stop(); process.exit(1); }
  // 3 — the first scene of the outline, written
  const byName = (n: string) => cast.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())?.id ?? cast.find((c) => n.toLowerCase().includes(c.name.split(' ')[0].toLowerCase()))?.id;
  const locByName = (n: string) => world.find((l) => l.name.toLowerCase() === n.trim().toLowerCase())?.id ?? world.find((l) => n.toLowerCase().includes('workshop') && l.name.toLowerCase().includes('workshop'))?.id;
  const sc0 = outline.scenes[0];
  const scene = { id: 'scene-focus-1', number: 1, title: sc0.title, locationId: locByName(sc0.locationName) ?? world[0].id, timeOfDay: sc0.timeOfDay, characterIds: sc0.characterNames.map(byName).filter((x): x is string => Boolean(x)), beats: [], purpose: sc0.purpose, emotionalObjective: sc0.emotionalObjective, entryState: sc0.entryState, exitState: sc0.exitState };
  const p3 = { ...p2, logline: outline.logline, synopsis: outline.synopsis, scenes: [scene] } as typeof base;
  const script = await step('3-scene', () => engine.writeScript(state, p3, p3.scenes, cast, world));
  if (!script) { meter.stop(); process.exit(1); }
  // 4 — the scene's shots at ≈ 15 s
  const written = script.scenes[0];
  const scene4 = { ...scene, beats: written.beats.map((b, i) => ({ id: `beat-${i}`, action: b.action, lines: b.lines.map((l, k) => ({ id: `line-${i}-${k}`, characterId: byName(l.characterName) ?? cast[0].id, text: l.text, delivery: l.delivery })) })) };
  const p4 = { ...p3, targetSeconds: 15, scenes: [scene4] } as typeof base;
  const plan = await step('4-shots', async () => { const d = await engine.planShotsDraft(state, p4, scene4, cast, world, {}); return { ...d, shots: engine.fitDurations(d.shots, d.budget, d.maxShot) }; });

  // 6 — continuity across the outputs (mechanical; the outputs are read by hand as well)
  const names = cast.map((c) => c.name);
  const known = new Set(names.map((n) => n.toLowerCase()));
  const conceptCast = concept.cast.map((c) => c.name);
  const outlineNames = Array.from(new Set(outline.scenes.flatMap((s) => s.characterNames)));
  const speakers = Array.from(new Set(script.scenes.flatMap((s) => s.beats.flatMap((b) => b.lines.map((l) => l.characterName)))));
  const lineIds = scene4.beats.flatMap((b) => b.lines.map((l) => l.id));
  const assigned = plan?.shots.flatMap((s) => s.dialogue.map((d) => d.id)) ?? [];
  results.continuity = {
    conceptKeepsRequiredCast: names.every((n) => conceptCast.some((c) => c.toLowerCase() === n.toLowerCase())),
    conceptKeepsWorkshop: concept.locations.some((l) => /workshop/i.test(l.name)),
    outlineUsesStudioNames: outlineNames.filter((n) => !known.has(n.toLowerCase())),
    outlinePlaces: Array.from(new Set(outline.scenes.map((s) => s.locationName))),
    newCharactersInOutline: outline.newCharacters.map((c) => c.name),
    scriptSpeakersOutsideCast: speakers.filter((n) => !known.has(n.toLowerCase())),
    planEveryLineOnce: assigned.length === lineIds.length && lineIds.every((id) => assigned.includes(id)),
    planShots: plan?.shots.length, planSeconds: plan?.shots.reduce((a, s) => a + s.durationSeconds, 0),
    planCastInFrame: Array.from(new Set(plan?.shots.flatMap((s) => s.characterIds) ?? [])).map((id) => cast.find((c) => c.id === id)?.name ?? id),
    planPromptsNamingCast: plan?.shots.filter((s) => names.some((n) => s.prompt.includes(n.split(' ')[0]))).length,
    planTimeOfDay: Array.from(new Set(plan?.shots.map((s) => s.continuity.environment.timeOfDay) ?? [])), sceneTimeOfDay: scene.timeOfDay,
  };
  await save();
  console.log(`continuity ${JSON.stringify(results.continuity)}`);

  // 7 — one image + text request straight to the endpoint (the vision tower)
  const img = opt('image', '');
  if (img) {
    const b64 = (await fs.readFile(img)).toString('base64');
    const t0 = Date.now();
    const r = await realFetch(`${BASE}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5, chat_template_kwargs: { enable_thinking: false }, messages: [{ role: 'system', content: 'You read reference pictures for a film studio. Answer with ONE JSON object only.' }, { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }, { type: 'text', text: 'Describe the character in this reference picture for the studio\'s character sheet. Return JSON: { apparentAge, sex, build, face, hair, wardrobe, distinguishing: [], style: "CARTOON"|"ANIME"|"REALISTIC" }.' }] }] }) });
    const j = await r.json() as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>; usage?: unknown };
    results.imageText = { status: r.status, ms: Date.now() - t0, usage: j.usage, answer: j.choices?.[0]?.message?.content, reasoningChars: (j.choices?.[0]?.message?.reasoning_content ?? '').length, image: path.basename(img), cardPeakMiB: meter.peak(t0) };
    await save();
    console.log(`image+text ${r.status} ${Date.now() - t0} ms: ${(j.choices?.[0]?.message?.content ?? JSON.stringify(j)).slice(0, 400)}`);
  }
  meter.stop();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

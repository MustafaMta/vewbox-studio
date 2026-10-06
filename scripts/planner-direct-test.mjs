/* PLANNER DIRECT TEST (producer Phase 1): the vLLM server alone, before the studio is pointed at it. Streams every
 * request and records first-token latency, answer tokens, tokens/s, stop reason and reasoning characters (thinking is
 * off: must be 0). Cases: plain text, JSON from the prompt alone (the studio's way), JSON under a response_format
 * schema, a long answer (truncation), strict instruction following, recall from a ≈ 12K-token prompt, a request past
 * --max-model-len (must be refused cleanly, not crash the server), and /health afterwards.
 *
 *   node scripts/planner-direct-test.mjs [--base http://127.0.0.1:8050] [--model Qwen3.8-27B-FP8] [--out <file.json>]
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = opt('base', 'http://127.0.0.1:8050');
const MODEL = opt('model', 'Qwen3.8-27B-FP8');
const OUT = opt('out', '');
// the model card's non-thinking sampling (what the studio sends: src/server/providers/llm.ts vllmRequest)
const SAMPLING = { temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5, chat_template_kwargs: { enable_thinking: false } };

async function chat(messages, extra = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages, stream: true, stream_options: { include_usage: true }, ...SAMPLING, ...extra }) });
  if (!res.ok || !/event-stream/.test(res.headers.get('content-type') ?? '')) return { status: res.status, error: (await res.text()).slice(0, 400), ms: Date.now() - t0 };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', content = '', reasoning = '', finish, usage, ttft;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      const j = JSON.parse(line.slice(5));
      const d = j.choices?.[0]?.delta;
      const r = d?.reasoning ?? d?.reasoning_content ?? '';
      if ((d?.content || r) && ttft === undefined) ttft = Date.now() - t0;
      content += d?.content ?? ''; reasoning += r;
      if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      if (j.usage) usage = j.usage;
    }
  }
  const ms = Date.now() - t0;
  const out = usage?.completion_tokens ?? 0;
  return { status: res.status, ms, ttftMs: ttft, promptTokens: usage?.prompt_tokens, answerTokens: out, tokPerS: ttft !== undefined && out > 1 ? Number(((out - 1) / ((ms - ttft) / 1000)).toFixed(1)) : undefined, finish, reasoningChars: reasoning.length, content };
}

const parseJson = (s) => { const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''); try { return JSON.parse(t); } catch { return undefined; } };
const results = { base: BASE, model: MODEL, at: new Date().toISOString(), cases: [] };
const record = (name, r, checks) => {
  const pass = Object.values(checks).every(Boolean);
  results.cases.push({ name, pass, checks, ...r, content: r.content?.length > 1200 ? `${r.content.slice(0, 1200)} …[${r.content.length} chars]` : r.content });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${r.status} ${r.ms} ms, ttft ${r.ttftMs} ms, ${r.promptTokens}+${r.answerTokens} tok, ${r.tokPerS} tok/s, ${r.finish}, reasoning ${r.reasoningChars} — ${JSON.stringify(checks)}`);
};

// 1 — plain text
{
  const r = await chat([{ role: 'user', content: 'In two sentences, describe a rain-soaked night market in Baghdad as the opening image of a short film.' }], { max_tokens: 200 });
  record('1-text', r, { ok: r.status === 200, stopped: r.finish === 'stop', twoSentences: (r.content.match(/[.!?](\s|$)/g) ?? []).length === 2, noThinking: r.reasoningChars === 0 && !/<think>/.test(r.content) });
}
// 2 — JSON from the prompt alone (how the studio asks: src/server/story/engine.ts)
{
  const r = await chat([
    { role: 'system', content: 'You are a film studio\'s character designer. Answer with ONE JSON object only, no prose, no code fence.' },
    { role: 'user', content: 'Design the lead of a 60-second short about a retired lighthouse keeper. JSON keys: name (string), age (integer), look (string, ≤ 40 words), wardrobe (string), voice (string), traits (array of exactly 3 strings).' },
  ], { max_tokens: 600 });
  const j = parseJson(r.content);
  record('2-json-prompt', r, { ok: r.status === 200, stopped: r.finish === 'stop', parses: Boolean(j), keys: Boolean(j && typeof j.name === 'string' && Number.isInteger(j.age) && typeof j.look === 'string' && typeof j.wardrobe === 'string' && typeof j.voice === 'string'), threeTraits: Array.isArray(j?.traits) && j.traits.length === 3, noThinking: r.reasoningChars === 0 });
}
// 3 — JSON under a schema (structured output)
{
  const schema = { type: 'object', additionalProperties: false, required: ['shots'], properties: { shots: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['number', 'framing', 'action', 'seconds'], properties: { number: { type: 'integer' }, framing: { type: 'string', enum: ['WIDE', 'MEDIUM', 'CLOSE'] }, action: { type: 'string' }, seconds: { type: 'integer', minimum: 3, maximum: 10 } } } } } };
  const r = await chat([{ role: 'user', content: 'Plan three shots for: an old man lights a lamp at dusk in a lighthouse, then looks out to sea. Return the plan.' }], { max_tokens: 800, response_format: { type: 'json_schema', json_schema: { name: 'shot_plan', schema, strict: true } } });
  const j = parseJson(r.content);
  record('3-json-schema', r, { ok: r.status === 200, stopped: r.finish === 'stop', parses: Boolean(j), threeShots: j?.shots?.length === 3, enums: Boolean(j?.shots?.every((s) => ['WIDE', 'MEDIUM', 'CLOSE'].includes(s.framing) && s.seconds >= 3 && s.seconds <= 10)) });
}
// 4 — a long answer: must end by itself, inside its budget (no cut)
{
  const r = await chat([
    { role: 'system', content: 'Answer with ONE JSON object only, no prose, no code fence.' },
    { role: 'user', content: 'Write a scene breakdown for a 6-minute short film in 12 scenes. JSON: { "title": string, "scenes": [ { "number": int, "title": string, "location": string, "timeOfDay": string, "summary": string (60–90 words), "characters": [string] } ] }. Exactly 12 scenes.' },
  ], { max_tokens: 6000 });
  const j = parseJson(r.content);
  record('4-long', r, { ok: r.status === 200, stopped: r.finish === 'stop', parses: Boolean(j), twelveScenes: j?.scenes?.length === 12, long: r.answerTokens > 1500 });
}
// 5 — strict instruction following
{
  const r = await chat([{ role: 'user', content: 'Give exactly three lines and nothing else. Each line starts with "SHOT " followed by its number and a colon, is written in capital letters, and has at most 8 words in all. Subject: a ferry leaving a foggy harbour.' }], { max_tokens: 200 });
  const lines = r.content.trim().split(/\r?\n/).filter((l) => l.trim());
  record('5-instructions', r, { ok: r.status === 200, threeLines: lines.length === 3, prefixes: lines.every((l, i) => l.startsWith(`SHOT ${i + 1}:`)), caps: lines.every((l) => l === l.toUpperCase()), short: lines.every((l) => l.trim().split(/\s+/).length <= 8) });
}
// 6 — recall from a long prompt (≈ 12K tokens of continuity notes with one fact buried in the middle)
{
  const notes = Array.from({ length: 220 }, (_, i) => `Note ${i + 1}: in take ${i + 3}, the lamp on the workbench stays lit, the window shows rain, and the radio dial reads ${88 + (i % 20) / 10} MHz; nobody moves the brass compass.`);
  notes.splice(110, 0, 'Note 110b: IMPORTANT — Najm\'s scarf is OCHRE with two green stripes, and it is knotted on his LEFT shoulder in every shot.');
  const r = await chat([{ role: 'user', content: `${notes.join('\n')}\n\nFrom the notes above only: what colour is Najm's scarf, how many stripes, what colour are they, and on which shoulder is it knotted? One sentence.` }], { max_tokens: 100 });
  record('6-long-context', r, { ok: r.status === 200, bigPrompt: (r.promptTokens ?? 0) > 9000, recalled: /ochre/i.test(r.content) && /(two|2)/i.test(r.content) && /green/i.test(r.content) && /left/i.test(r.content) });
}
// 7 — past the context window: a clean refusal (HTTP 400), the server stays up
{
  const r = await chat([{ role: 'user', content: 'lighthouse '.repeat(20000) }], { max_tokens: 100 });
  const h = await fetch(`${BASE}/health`).then((x) => x.status, () => 0);
  record('7-over-context', r, { refusedCleanly: r.status === 400, serverHealthy: h === 200 });
}

results.passed = results.cases.filter((c) => c.pass).length;
results.total = results.cases.length;
console.log(`${results.passed}/${results.total} passed`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
process.exit(results.passed === results.total ? 0 : 1);

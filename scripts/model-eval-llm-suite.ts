/* PLANNING-LLM BENCHMARK (docs/directives/MODEL-UPGRADE-DIRECTIVE-2026-10-06.md §3, §9; results in
 * docs/research/MODEL-EVAL-2026-10.md §7): the studio's OWN planning calls, run through the story engine
 * (src/server/story/engine.ts → src/server/providers/llm.ts, the app's request: num_ctx, keep_alive, think off, its
 * max_tokens, its repair rounds, its truncation handling and scene splitting) against the local Ollama, with the SAME
 * inputs for every candidate model.
 *
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/model-eval-llm-suite.ts --model <tag>
 *     [--tasks ep-develop,ep-script,ep-plan,bible-record,bible-next,perf,design,plan,ar-plan]
 *     [--runs 1]          runs of the short tasks (the episode tasks run once per model; re-run with --out)
 *     [--scenes 1-4]      ep-plan: only these scenes of the fixed episode (resumes from the saved earlier scenes)
 *     [--freeze]          write a missing fixture from this run's answer (done once, from the incumbent's run 1)
 *     [--out <sub>]       evidence under llm-suite/<model>/<sub>/
 *
 * THE INPUTS (fixed, identical per model):
 *  - a synthetic SHOW built in memory around the copy database's "The Static Sky" (its cast and workshop): season 1,
 *    episode 1 = The Static Sky (cut), a show bible with planted facts and open storylines (BIBLE below);
 *  - episode 2 "The Harbour Office", 8 minutes, from a fixed brief:
 *      ep-develop  developStory: long-story planning and the scene breakdown (≈ 11 scenes), inside the World Bible;
 *      ep-script   writeScript of every scene of the FIXED breakdown (fixtures/ep-develop.json) in one call;
 *      ep-plan     planShotsDraft + fitDurations of every scene of the FIXED script (fixtures/ep-script.json), in order,
 *                  each scene continuing from the last shot of the one before — as the PLAN_SHOTS handler does;
 *  - bible-record  continuityUpdate: the Continuity Writer's record of episode 1 against the bible;
 *  - bible-next    proposeIdea EPISODE: the next episode inside the show (reuse by id, pick up open storylines, respect
 *                  the timeline);
 *  - perf          planPerformance: a two-singer music video's singing assignment (production coordination);
 *  - design        designCharacter, Arabic (Iraqi) and English briefs;
 *  - plan / ar-plan  the 60 s English scene and the Iraqi Arabic scene of MODEL-EVAL §3/§6 (ar-plan reads the recorded
 *                  Arabic scene of the incumbent, as the §6 re-run did).
 *
 * Every POST to /chat/completions is one attempt (repairs and re-asks are further attempts); attempt #1 is recorded on
 * its own (`firstAttemptValid`: valid on the first POST). Per call: latency, prompt/answer tokens, stop reasons, answer
 * tokens per second, the card's peak (nvidia-smi 250 ms), the llm container's RAM and the Docker VM's used RAM
 * (sampled every ≈ 3 s), Ollama's own report of the loaded model. Quality is read and scored by hand (rubric in §7);
 * this script computes the mechanical checks only. The engine's local path takes the GPU lease, which writes
 * resource_leases: DATABASE_URL is pointed at the copy `vewbox_llm`, never the live database. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n: string) => argv.includes(`--${n}`);
const MODEL = opt('model', '');
if (!MODEL) { console.error('give --model <ollama tag>'); process.exit(2); }
const RUNS = Number(opt('runs', '1'));
const TASKS = opt('tasks', 'ep-develop,ep-script,ep-plan,bible-record,bible-next,perf,design,plan,ar-plan').split(',');
const SCENES = opt('scenes', '');
const FREEZE = flag('freeze');
const OLLAMA = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/v1\/?$/, '');
/** the benchmark's own ceiling per call (the app's deadline is localDeadlineMs; recorded, never hit by a valid answer) */
const CALL_TIMEOUT_MS = Number(opt('call-timeout-ms', String(60 * 60_000)));

const live = process.env.DATABASE_URL ?? '';
if (!/\/vewbox(\?|$)/.test(live)) { console.error(`DATABASE_URL does not name the vewbox database (${live.replace(/:[^:@]+@/, ':***@')})`); process.exit(2); }
process.env.DATABASE_URL = live.replace(/\/vewbox(\?|$)/, '/vewbox_llm$1');
process.env.LLM_PROVIDER = 'openai-compatible';
process.env.OPENAI_COMPATIBLE_MODEL = MODEL;
process.env.MINIMAX_API_KEY = ''; process.env.ANTHROPIC_API_KEY = '';

const ROOT = process.cwd();
const BASE = path.join(ROOT, 'docs/evidence/model-eval-2026-10/llm-suite');
const FIX = path.join(BASE, 'fixtures');
const EVID = path.join(BASE, MODEL.replace(/[^a-z0-9.-]+/gi, '_'), opt('out', ''));
const AR_SCENE_FROM = path.join(ROOT, 'docs/evidence/model-eval-2026-10/llm/gemma4_31b-it-qat/ar-script-run1.json');

// ------------------------------------------------------------------------------------------ measurement
class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (line.trim() && Number.isFinite(v)) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  now() { return this.samples.length ? this.samples[this.samples.length - 1][1] : NaN; }
  stop() { this.proc?.kill(); }
}
const run = (cmd: string, args: string[]) => new Promise<string>((resolve) => { const p = spawn(cmd, args); let out = ''; p.stdout.on('data', (d: Buffer) => { out += d.toString(); }); p.on('close', () => resolve(out.trim())); p.on('error', () => resolve('')); });
const GiB = (s: string) => { const m = /([\d.]+)\s*([KMG]i?B)/i.exec(s); if (!m) return NaN; const v = Number(m[1]); const u = m[2].toUpperCase(); return u.startsWith('G') ? v : u.startsWith('M') ? v / 1024 : v / 1024 / 1024; };
/** the llm container's RAM (docker stats) and the Docker VM's used RAM (MemTotal − MemAvailable), every ≈ 3 s */
class RamMeter {
  private on = false; samples: Array<{ t: number; container: number; vmUsed: number }> = [];
  start() { this.on = true; void this.loop(); }
  private async loop() {
    while (this.on) {
      const [stats, meminfo] = await Promise.all([run('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', 'vewbox-llm-1']), run('docker', ['exec', 'vewbox-llm-1', 'cat', '/proc/meminfo'])]);
      const kb = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(meminfo)?.[1] ?? NaN);
      this.samples.push({ t: Date.now(), container: GiB(stats.split('/')[0] ?? ''), vmUsed: (kb('MemTotal') - kb('MemAvailable')) / 1024 / 1024 });
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  peak(since: number) { const xs = this.samples.filter((s) => s.t >= since); const mx = (f: (s: (typeof xs)[number]) => number) => { const v = xs.map(f).filter(Number.isFinite); return v.length ? Number(Math.max(...v).toFixed(2)) : NaN; }; return { containerGiB: mx((s) => s.container), vmUsedGiB: mx((s) => s.vmUsed) }; }
  stop() { this.on = false; }
}

interface Attempt { kind: 'first' | 'repair' | 're-ask'; requestKey: string; ms: number; status: number; promptTokens?: number; completionTokens?: number; finishReason?: string; maxTokens?: number; tokPerS?: number; reasoningChars?: number; head: string; tail: string; requestChars: number; numCtx?: number; think?: unknown }
let attempts: Attempt[] = [];
let lastRequest: unknown = null;
const realFetch = globalThis.fetch;
/** an OpenAI-compatible answer, whole or streamed (server-sent events), read from a clone of the response */
async function readAnswer(res: Response): Promise<{ content: string; finish?: string; usage?: { prompt_tokens?: number; completion_tokens?: number }; reasoningChars?: number }> {
  const text = await res.text();
  if (!/text\/event-stream/i.test(res.headers.get('content-type') ?? '')) { try { const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }; return { content: j.choices?.[0]?.message?.content ?? '', finish: j.choices?.[0]?.finish_reason, usage: j.usage }; } catch { return { content: '' }; } }
  let content = ''; let reasoning = 0; let finish: string | undefined; let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  for (const line of text.split('\n')) { const d = line.replace(/^data:\s?/, '').trim(); if (!line.startsWith('data:') || !d || d === '[DONE]') continue; try { const j = JSON.parse(d) as { choices?: Array<{ delta?: { content?: string; reasoning?: string }; finish_reason?: string | null }>; usage?: typeof usage }; content += j.choices?.[0]?.delta?.content ?? ''; reasoning += (j.choices?.[0]?.delta?.reasoning ?? '').length; if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason ?? undefined; if (j.usage) usage = j.usage; } catch { /* partial */ } }
  return { content, finish, usage, reasoningChars: reasoning };
}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!/\/chat\/completions$/.test(url)) return realFetch(input, init);
  const t0 = Date.now();
  const body = typeof init?.body === 'string' ? init.body : '';
  let parsed: { options?: { num_ctx?: number }; think?: unknown; messages?: unknown; max_tokens?: number } = {};
  try { parsed = JSON.parse(body); } catch { /* not json */ }
  lastRequest = parsed.messages;
  const res = await realFetch(input, init);
  // a REPAIR carries the earlier answer in its history (an assistant turn); a RE-ASK repeats the previous request with
  // a wider budget (a cut answer); anything else is a first call (of a task, or of one part of a scene planned in parts)
  const msgs = (parsed.messages ?? []) as Array<{ role: string; content: string }>;
  const prev = attempts.at(-1);
  const kind: Attempt['kind'] = msgs.some((m) => m.role === 'assistant') ? 'repair' : prev && prev.requestKey === JSON.stringify(msgs).length + ':' + msgs.at(-1)?.content.slice(0, 200) ? 're-ask' : 'first';
  const rec: Attempt = { kind, requestKey: JSON.stringify(msgs).length + ':' + msgs.at(-1)?.content.slice(0, 200), ms: 0, status: res.status, maxTokens: parsed.max_tokens, head: '', tail: '', requestChars: body.length, numCtx: parsed.options?.num_ctx, think: parsed.think };
  attempts.push(rec);
  // the clone is read alongside the engine's own read; the record completes when the stream ends
  void readAnswer(res.clone()).then((a) => { rec.ms = Date.now() - t0; rec.head = a.content.slice(0, 160); rec.tail = a.content.slice(-160); rec.finishReason = a.finish; rec.reasoningChars = a.reasoningChars; rec.promptTokens = a.usage?.prompt_tokens; rec.completionTokens = a.usage?.completion_tokens; rec.tokPerS = a.usage?.completion_tokens ? Number((a.usage.completion_tokens / (rec.ms / 1000)).toFixed(1)) : undefined; }, () => {});
  return res;
}) as typeof fetch;

async function ollamaPs() { try { return await realFetch(`${OLLAMA}/api/ps`).then((r) => r.json()); } catch { return null; } }

// ------------------------------------------------------------------------------------------ the fixed inputs
const SHOW_ID = 'show-bench-static-sky';
const SEASON_ID = 'season-bench-1';
const EP2_ID = 'prod-bench-ep2';
const NOW = '2026-10-06T00:00:00.000Z';
/** the show bible: facts later episodes must respect (some planted to be contradicted by a careless planner) */
const BIBLE = {
  worldRules: [
    'Kerran Point is a small cold fishing town on a northern cliff coast; the story stays grounded — no ghosts are ever shown, only what a radio, a logbook or a person can carry.',
    'The old valve radio only receives the Mariner\'s frequency while meteors are falling; on a clear night without meteors it hears nothing but static.',
    'Elias has not set foot on a boat since the storm of 1987 and will not go out on the water.',
  ],
  relationships: [
    'Elias Moore and Najm: strangers until episode 1; now bound by the same storm — wary friends.',
    'Elias was married to Ruth Moore, the Mariner\'s radio officer, lost with the ship in the storm of 1987.',
    'Najm\'s younger brother Tariq was the Mariner\'s deckhand and was never found.',
  ],
  timeline: [
    'S1E1: Najm brought a cracked valve radio labelled "1987" to Elias\'s workshop on the night of a meteor shower.',
    'S1E1: The repaired radio received the Mariner\'s call: "This is the Mariner… four miles south of the point…".',
    'S1E1: Elias cut the palm of his LEFT hand on the radio\'s chassis; it is bandaged.',
    'S1E1: Najm learned that Elias\'s wife Ruth was aboard the Mariner.',
  ],
  unresolved: [
    'Who — or what — is still transmitting on the Mariner\'s frequency, thirty-nine years later?',
    'The harbour office keeps the Mariner\'s last logbook, sealed since the 1987 inquiry.',
  ],
  styleNotes: 'Warm hand-drawn cartoon; night scenes lit by lamps and the meteors; the sea always audible.',
};
const EP2_BRIEF = 'Episode 2. The morning after the signal, Elias and Najm go to the Kerran Point harbour office to see the Mariner\'s sealed 1987 logbook. The harbour master, Ingrid Dahl (a brisk woman in her fifties who lost no one in the storm and wants the past left alone), refuses at first; Najm talks her round with a librarian\'s patience. In the logbook they find Ruth\'s last radio entry, which does not match the official inquiry: the Mariner turned back toward the point. That night the meteors return; back in the workshop the radio speaks again and gives a bearing. The episode ends with Elias, who will not go on the water, looking out of the workshop window at the sea where the bearing points, and Najm unrolling a chart.';

type Engine = typeof import('@/server/story/engine');
type State = Awaited<ReturnType<typeof import('@/server/studio/engine').readState>>['state'];
type Production = State['productions'][number];
type Character = State['characters'][number];
type Location = State['locations'][number];
type Scene = Production['scenes'][number];
type DevelopResult = Awaited<ReturnType<Engine['developStory']>>;
type ScriptResult = Awaited<ReturnType<Engine['writeScript']>>;

const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[’']/g, "'");

/** The studio state with the synthetic show: episode 1 is The Static Sky (cut), episode 2 is to be developed. */
function benchState(state: State) {
  const ep1src = state.productions.find((x) => x.title === 'The Static Sky');
  if (!ep1src) throw new Error('the copy database has no "The Static Sky"');
  const workshop = state.locations.find((l) => l.id === ep1src.scenes[0].locationId)!;
  const castIds = ep1src.castIds.length ? ep1src.castIds : Array.from(new Set(ep1src.scenes.flatMap((s) => s.characterIds)));
  const show = { id: SHOW_ID, title: 'The Static Sky', logline: 'Two old men in a cliff-top fishing town follow a radio signal from a ship lost in the storm of 1987.', genre: 'mystery drama', style: ep1src.style, language: ep1src.language, aspect: ep1src.aspect, synopsis: 'Elias Moore, a retired lighthouse keeper and radio repairman, and Najm, a retired librarian and amateur astronomer, hear the lost trawler Mariner calling on an old valve radio whenever meteors fall. Season 1 follows the signal toward what really happened in 1987.', castIds, locationIds: [workshop.id], bible: BIBLE, createdAt: NOW, updatedAt: NOW } as unknown as State['shows'][number];
  const season = { id: SEASON_ID, showId: SHOW_ID, number: 1, title: 'The Signal', arc: 'From the first call to the truth about the Mariner\'s last night.', createdAt: NOW } as State['seasons'][number];
  const scenes1 = ep1src.scenes.map((sc, i, all) => (i === all.length - 1 ? { ...sc, exitState: sc.exitState ?? 'Past midnight. The radio is silent again; Elias, his left palm bandaged, stares at Ruth\'s photograph; Najm sits beside him, the meteors thinning over the sea.' } : sc));
  const ep1 = { ...ep1src, kind: 'EPISODE', showId: SHOW_ID, seasonId: SEASON_ID, episodeNumber: 1, stage: 'COMPLETE', scenes: scenes1 } as Production;
  const ep2 = { ...ep1src, id: EP2_ID, kind: 'EPISODE', showId: SHOW_ID, seasonId: SEASON_ID, episodeNumber: 2, title: 'The Harbour Office', titleAr: undefined, logline: '', synopsis: '', targetSeconds: 480, stage: 'STORY', brief: { mode: 'MANUAL', text: EP2_BRIEF }, castIds, locationIds: [workshop.id], scenes: [], shots: [], song: undefined, cutAssetId: undefined, posterAssetId: undefined, coverAssetId: undefined, exports: [] } as unknown as Production;
  const s: State = { ...state, shows: [...state.shows, show], seasons: [...state.seasons, season], productions: [...state.productions.filter((x) => x.id !== ep1src.id), ep1, ep2] };
  return { s, show, season, ep1, ep2, workshop };
}

/** The fixed breakdown laid onto episode 2: new characters and places become studio records (cloned shapes). */
function applyBreakdown(b: ReturnType<typeof benchState>, dev: DevelopResult) {
  const s = b.s;
  const base = s.characters.find((c) => c.id === b.ep2.castIds[1]) ?? s.characters[0];
  const newChars: Character[] = dev.newCharacters.map((c, i) => ({ ...structuredClone(base), id: `char-bench-${i + 1}`, name: c.name, nameAr: c.design.nameAr, role: c.role, sex: c.sex, ageYears: c.design.ageYears ?? 50, build: c.design.build, face: c.design.face, hair: c.design.hair, skin: c.design.skin, eyes: c.design.eyes, distinguishing: c.design.distinguishing ?? [], wardrobe: c.design.wardrobe, personality: c.design.personality, canonicalImage: undefined, portraitAssetId: undefined, usage: undefined } as unknown as Character));
  const newLocs: Location[] = dev.newLocations.map((l, i) => ({ ...structuredClone(b.workshop), id: `loc-bench-${i + 1}`, name: l.name, nameAr: l.design.nameAr, description: l.design.description, kind: l.design.kind, landmarks: l.design.landmarks ?? [], props: l.design.props ?? [], lighting: l.design.lighting ?? [], layout: l.design.layout, refs: [], masterAssetId: undefined, identity: undefined } as unknown as Location));
  const characters = [...s.characters, ...newChars];
  const locations = [...s.locations, ...newLocs];
  const charId = (n: string) => characters.find((c) => norm(c.name) === norm(n) || (c.nameAr && c.nameAr === n.trim()))?.id ?? characters.find((c) => norm(n).includes(norm(c.name)) || norm(c.name).includes(norm(n)))?.id;
  const locId = (n: string) => locations.find((l) => norm(l.name) === norm(n))?.id ?? locations.find((l) => norm(n).includes(norm(l.name)) || norm(l.name).includes(norm(n)))?.id;
  const unresolved: string[] = [];
  const scenes: Scene[] = dev.scenes.map((sc, i) => {
    const locationId = locId(sc.locationName); if (!locationId) unresolved.push(`scene ${i + 1} location "${sc.locationName}"`);
    const characterIds = sc.characterNames.map((n) => { const id = charId(n); if (!id) unresolved.push(`scene ${i + 1} character "${n}"`); return id; }).filter((x): x is string => Boolean(x));
    return { id: `scene-bench-${i + 1}`, number: i + 1, title: sc.title, locationId, timeOfDay: sc.timeOfDay, characterIds, beats: [], purpose: sc.purpose, emotionalObjective: sc.emotionalObjective, entryState: sc.entryState, exitState: sc.exitState } as Scene;
  });
  const castIds = Array.from(new Set([...b.ep2.castIds, ...scenes.flatMap((sc) => sc.characterIds)]));
  const locationIds = Array.from(new Set([...b.ep2.locationIds, ...scenes.map((sc) => sc.locationId).filter((x): x is string => Boolean(x))]));
  const ep2 = { ...b.ep2, logline: dev.logline, synopsis: dev.synopsis, scenes, castIds, locationIds } as Production;
  const s2: State = { ...s, characters, locations, productions: s.productions.map((p) => (p.id === EP2_ID ? ep2 : p)) };
  return { s: s2, ep2, unresolved };
}

/** The fixed script laid onto the scenes (line ids stable: line-<scene>-<beat>-<k>). */
function applyScript(s: State, ep2: Production, script: ScriptResult): Production {
  const cast = s.characters;
  const byName = (n: string) => cast.find((c) => norm(c.name) === norm(n) || c.nameAr === n.trim())?.id ?? cast.find((c) => norm(n).includes(norm(c.name)) || norm(c.name).includes(norm(n)))?.id ?? ep2.castIds[0];
  const scenes = ep2.scenes.map((sc) => { const w = script.scenes.find((x) => x.sceneId === sc.id); return w ? { ...sc, beats: w.beats.map((bt, bi) => ({ id: `beat-${sc.number}-${bi}`, action: bt.action, lines: bt.lines.map((l, k) => ({ id: `line-${sc.number}-${bi}-${k}`, characterId: byName(l.characterName), text: l.text, textAr: l.textAr, delivery: l.delivery })) })) } : sc; });
  return { ...ep2, scenes } as Production;
}

async function fixture<T>(name: string, from?: T): Promise<T | undefined> {
  const f = path.join(FIX, `${name}.json`);
  const have = await fs.readFile(f, 'utf8').then((t) => JSON.parse(t) as { answer: T }, () => undefined);
  if (have) return have.answer;
  if (from !== undefined && FREEZE) { await fs.mkdir(FIX, { recursive: true }); await fs.writeFile(f, JSON.stringify({ frozenFrom: MODEL, at: new Date().toISOString(), answer: from }, null, 2)); console.log(`  fixture ${name} frozen from ${MODEL}`); return from; }
  return undefined;
}

// ------------------------------------------------------------------------------------------ mechanical checks
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['and', 'with', 'the', 'his', 'her', 'over', 'under'].includes(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; const u = new Set([...a, ...b]).size; return u ? i / u : 1; };

function developChecks(dev: DevelopResult, expectScenes: number, target: number, b: ReturnType<typeof applyBreakdown>, regulars: string[]) {
  const total = dev.scenes.reduce((a, sc) => a + (sc.targetSeconds ?? 0), 0);
  const named = new Set(dev.scenes.flatMap((sc) => sc.characterNames.map(norm)));
  return { scenes: dev.scenes.length, expectedScenes: expectScenes, totalSeconds: total, targetSeconds: target, withinTenPercent: Math.abs(total - target) <= target * 0.1, newCharacters: dev.newCharacters.map((c) => c.name), newLocations: dev.newLocations.map((l) => l.name), unresolvedNames: b.unresolved, regularsPresent: regulars.filter((r) => named.has(norm(r)) || [...named].some((n) => n.includes(norm(r).split(' ')[0]))), synopsisWords: words(dev.synopsis) };
}

function scriptChecks(script: ScriptResult, ep2: Production, s: State) {
  const ids = ep2.scenes.map((sc) => sc.id);
  const lines = script.scenes.flatMap((sc) => sc.beats.flatMap((b) => b.lines));
  const names = new Set(s.characters.map((c) => norm(c.name)));
  return { scenesReturned: script.scenes.length, scenesExpected: ids.length, everySceneOnce: ids.every((id) => script.scenes.filter((x) => x.sceneId === id).length === 1), beatsPerScene: script.scenes.map((sc) => sc.beats.length), beatsOutside2to6: script.scenes.filter((sc) => sc.beats.length < 2 || sc.beats.length > 6).length, lines: lines.length, linesOver15Words: lines.filter((l) => words(l.text) > 15).length, unknownSpeakers: Array.from(new Set(lines.map((l) => l.characterName).filter((n) => !names.has(norm(n))))), actionWords: Math.round(script.scenes.flatMap((sc) => sc.beats).reduce((a, b) => a + words(b.action), 0) / Math.max(1, script.scenes.flatMap((sc) => sc.beats).length)) };
}

type Planned = Awaited<ReturnType<Engine['planShotsDraft']>>['shots'];
function planChecks(shots: Planned, scene: Scene, budget: number, cast: Character[]) {
  const lineIds = scene.beats.flatMap((b) => b.lines.map((l) => l.id));
  const assigned = shots.flatMap((s) => s.dialogue.map((d) => d.id));
  const notes = shots.flatMap((s) => s.notes ?? []);
  const names = cast.map((c) => c.name.split(/\s+/)[0]).filter((n) => n.length > 2);
  const nameInPrompt = shots.filter((s) => names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s.prompt))).length;
  return { shots: shots.length, budget, totalSeconds: shots.reduce((a, s) => a + s.durationSeconds, 0), scriptLines: lineIds.length, everyLineOnce: assigned.length === lineIds.length && lineIds.every((id) => assigned.includes(id)), linesForgottenByPlanner: notes.length >= 0 ? lineIds.length - shots.reduce((a, s) => a + s.dialogue.length, 0) : 0, castAddedFromActions: notes.filter((n) => n.startsWith('added to the cast')).length, speechScrubbed: notes.filter((n) => n.includes('speech words scrubbed')).length, framingChanged: notes.filter((n) => n.includes('framing')).length, cutsDropped: notes.filter((n) => n.includes('cut(s) dropped')).length, promptsWithCastName: nameInPrompt, promptWordsMedian: shots.map((s) => words(s.prompt)).sort((a, b) => a - b)[Math.floor((shots.length - 1) / 2)] ?? 0, promptsOutside60to160: shots.filter((s) => words(s.prompt) < 60 || words(s.prompt) > 160).length, boundaries: shots.map((s) => s.boundary) };
}

/** Across the episode: does each character keep one wardrobe (token overlap with the canonical wardrobe, or with the
 *  character's first described wardrobe when the record has none), and do props keep their owner? */
function episodeConsistency(all: Array<{ scene: number; shots: Planned }>, cast: Character[]) {
  const per: Record<string, { canonical: string; first?: string; overlaps: number[]; shotsDescribed: number }> = {};
  for (const { shots } of all) for (const sh of shots) for (const c of sh.continuity.characters) {
    const ch = cast.find((x) => x.id === c.characterId); if (!ch || !c.wardrobe) continue;
    const e = (per[ch.name] ??= { canonical: ch.wardrobe ?? '', overlaps: [], shotsDescribed: 0 });
    e.first ??= c.wardrobe; e.shotsDescribed++;
    e.overlaps.push(jaccard(tokens(c.wardrobe), tokens(e.canonical || e.first)));
  }
  const out: Record<string, unknown> = {};
  for (const [name, e] of Object.entries(per)) { const xs = e.overlaps.sort((a, b) => a - b); out[name] = { shotsDescribed: e.shotsDescribed, against: e.canonical ? 'canonical wardrobe' : 'first described wardrobe', medianOverlap: Number((xs[Math.floor((xs.length - 1) / 2)] ?? 0).toFixed(2)), minOverlap: Number((xs[0] ?? 0).toFixed(2)) }; }
  return out;
}

// ------------------------------------------------------------------------------------------ main
async function main() {
  const vram = new VramMeter(); vram.start();
  const ram = new RamMeter(); ram.start();
  await fs.mkdir(EVID, { recursive: true });
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const { deriveWorld } = await import('@/domain/world');
  const engine = await import('@/server/story/engine');
  const { fitDurations } = engine;
  const { state } = await readState();
  const b = benchState(state);
  const bible = deriveWorld(b.s, { kind: 'SHOW', showId: SHOW_ID }, undefined, NOW);
  const castEp = castOf(b.s, b.ep2); const worldEp = worldOf(b.s, b.ep2);
  console.log(`model ${MODEL}; show "${b.show.title}" (bible: ${bible.rules.length} rules, ${bible.timeline.length} timeline facts, ${bible.openStorylines.length} open); cast ${castEp.map((c) => c.name).join(', ')}; evidence → ${path.relative(ROOT, EVID)}`);
  const summaryFile = path.join(EVID, 'summary.json');
  const summary: Record<string, unknown> = await fs.readFile(summaryFile, 'utf8').then((t) => JSON.parse(t) as Record<string, unknown>, () => ({}));
  const calls: Array<Record<string, unknown>> = (summary.calls as Array<Record<string, unknown>>) ?? [];
  Object.assign(summary, { model: MODEL, numCtx: process.env.OLLAMA_CONTEXT_LENGTH ?? '16384 (default)', keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '2m (default)', callTimeoutMs: CALL_TIMEOUT_MS });
  const save = () => fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
  const eo = { timeoutMs: CALL_TIMEOUT_MS };

  async function measure<T>(task: string, runNo: number, fn: () => Promise<T>, checks?: (d: T) => unknown): Promise<T | undefined> {
    attempts = []; lastRequest = null;
    const t0 = Date.now(); const before = vram.now();
    process.stdout.write(`${task} run ${runNo} … `);
    let data: T | undefined; let error: string | undefined;
    try { data = await fn(); } catch (e) { error = String((e as Error).message ?? e); }
    await new Promise((r) => setTimeout(r, 300)); // the last attempt's clone finishes reading
    const ms = Date.now() - t0;
    const ps = await ollamaPs();
    const outTok = attempts.reduce((a, x) => a + (x.completionTokens ?? 0), 0);
    const rec: Record<string, unknown> = { task, run: runNo, model: MODEL, ms, attempts: attempts.length, firstAttemptValid: !error && attempts.length === 1, firstCalls: attempts.filter((a) => a.kind === 'first').length, repairs: attempts.filter((a) => a.kind === 'repair').length, reasks: attempts.filter((a) => a.kind === 're-ask').length, everyFirstCallValid: !error && attempts.every((a) => a.kind === 'first') && !attempts.some((a) => a.finishReason === 'length'), truncatedAttempts: attempts.filter((a) => a.finishReason === 'length').length, answerTokens: outTok, tokPerS: ms ? Number((outTok / (attempts.reduce((a, x) => a + x.ms, 0) / 1000)).toFixed(1)) : undefined, attemptsDetail: attempts, error, vramBeforeMiB: before, vramPeakMiB: vram.peak(t0), ram: ram.peak(t0), ollamaPs: ps, at: new Date().toISOString() };
    if (data !== undefined && checks) { try { rec.checks = checks(data); } catch (e) { rec.checks = { error: String(e) }; } }
    calls.push(rec); summary.calls = calls; await save();
    await fs.writeFile(path.join(EVID, `${task}-run${runNo}.json`), JSON.stringify({ ...rec, request: lastRequest, answer: data }, null, 2));
    console.log(error ? `ERROR after ${Math.round(ms / 1000)} s, ${attempts.length} attempt(s): ${error.slice(0, 240)}` : `${Math.round(ms / 1000)} s, ${attempts.length} attempt(s), ${rec.tokPerS} tok/s, card ${rec.vramPeakMiB} MiB, RAM ${JSON.stringify(rec.ram)}, tokens ${attempts.map((a) => `${a.promptTokens}+${a.completionTokens}${a.finishReason === 'length' ? '(cut)' : ''}`).join(' / ')}`);
    if (rec.checks) console.log(`  checks ${JSON.stringify(rec.checks)}`);
    return data;
  }

  // ---- the episode: develop → (fixed breakdown) script → (fixed script) shot plans
  const expectScenes = Math.max(1, Math.min(24, Math.round(480 / 45)));
  const regulars = castEp.map((c) => c.name);
  let dev: DevelopResult | undefined = await fixture<DevelopResult>('ep-develop');
  if (TASKS.includes('ep-develop')) {
    const mine = await measure('ep-develop', 1, () => engine.developStory(b.s, b.ep2, castEp, worldEp, eo, bible), (d) => developChecks(d, expectScenes, 480, applyBreakdown(b, d), regulars));
    if (!dev && mine) dev = await fixture('ep-develop', mine);
  }
  const laid = dev ? applyBreakdown(b, dev) : undefined;
  let script: ScriptResult | undefined = await fixture<ScriptResult>('ep-script');
  if (TASKS.includes('ep-script')) {
    if (!laid) console.log('ep-script: no fixed breakdown yet (run the incumbent with --freeze first)');
    else {
      const bible2 = deriveWorld(laid.s, { kind: 'SHOW', showId: SHOW_ID }, undefined, NOW);
      const mine = await measure('ep-script', 1, () => engine.writeScript(laid.s, laid.ep2, laid.ep2.scenes, castOf(laid.s, laid.ep2), worldOf(laid.s, laid.ep2), eo, bible2), (d) => scriptChecks(d, laid.ep2, laid.s));
      if (!script && mine) script = await fixture('ep-script', mine);
    }
  }
  if (TASKS.includes('ep-plan')) {
    if (!laid || !script) console.log('ep-plan: no fixed script yet (run the incumbent with --freeze first)');
    else {
      const ep = applyScript(laid.s, laid.ep2, script);
      const s3: State = { ...laid.s, productions: laid.s.productions.map((p) => (p.id === EP2_ID ? ep : p)) };
      const bible3 = deriveWorld(s3, { kind: 'SHOW', showId: SHOW_ID }, undefined, NOW);
      const cast3 = castOf(s3, ep); const world3 = worldOf(s3, ep);
      const [from, to] = SCENES ? SCENES.split('-').map(Number) : [1, ep.scenes.length];
      // the previous shot: the last shot of the scene before, from this model's saved plan (resume)
      let previous: Parameters<Engine['planShotsDraft']>[5] = {};
      if (from > 1) {
        const prev = await fs.readFile(path.join(EVID, `ep-plan-s${String(from - 1).padStart(2, '0')}-run1.json`), 'utf8').then((t) => JSON.parse(t) as { answer?: { shots: Planned } }, () => undefined);
        const last = prev?.answer?.shots.at(-1);
        if (!last) { console.log(`ep-plan: scene ${from - 1} has no saved plan for ${MODEL}; plan it first`); }
        else previous = { shot: last, sceneExit: ep.scenes[from - 2].exitState };
      }
      for (const scene of ep.scenes.filter((sc) => sc.number >= from && sc.number <= (to || from))) {
        const draft = await measure(`ep-plan-s${String(scene.number).padStart(2, '0')}`, 1, async () => { const d = await engine.planShotsDraft(s3, ep, scene, cast3, world3, previous, eo, bible3); return { ...d, shots: fitDurations(d.shots, d.budget, d.maxShot) }; }, (d) => planChecks(d.shots, scene, d.budget, cast3));
        if (!draft) break; // the handler stops at a failed scene too
        previous = { shot: draft.shots[draft.shots.length - 1], sceneExit: scene.exitState };
      }
      // the whole episode's consistency, once every scene is planned
      const all: Array<{ scene: number; shots: Planned }> = [];
      for (const sc of ep.scenes) { const f = await fs.readFile(path.join(EVID, `ep-plan-s${String(sc.number).padStart(2, '0')}-run1.json`), 'utf8').then((t) => JSON.parse(t) as { answer?: { shots: Planned } }, () => undefined); if (f?.answer) all.push({ scene: sc.number, shots: f.answer.shots }); }
      if (all.length === ep.scenes.length) { summary.episode = { scenes: all.length, shots: all.reduce((a, x) => a + x.shots.length, 0), seconds: all.reduce((a, x) => a + x.shots.reduce((q, s) => q + s.durationSeconds, 0), 0), wardrobe: episodeConsistency(all, cast3) }; await save(); console.log(`episode ${JSON.stringify(summary.episode)}`); }
    }
  }

  // ---- World Bible reasoning, production coordination, design, the §3/§6 scenes
  const castShow = castOf(b.s, b.ep1);
  for (let r = 1; r <= RUNS; r++) {
    if (TASKS.includes('bible-record')) await measure('bible-record', r, () => engine.continuityUpdate(b.s, b.show, b.ep1, castShow, eo), (d) => ({ events: d.events.length, eventsTagged: d.events.filter((e) => e.startsWith('S1E1:')).length, unresolved: d.unresolved.length, keepsOpenLogbook: d.unresolved.some((u) => /logbook|harbou?r/i.test(u)), keepsOpenSignal: d.unresolved.some((u) => /transmit|signal|frequency|calling/i.test(u)) }));
    if (TASKS.includes('bible-next')) await measure('bible-next', r, () => engine.proposeIdea(b.s, { kind: 'EPISODE', showId: SHOW_ID, seasonId: SEASON_ID, preferences: {} }, eo), (d) => ({ structure: d.structure.length, castReturning: d.cast.filter((c) => !c.isNew).map((c) => c.name), castNew: d.cast.filter((c) => c.isNew).map((c) => c.name), locationsReturning: d.locations.filter((l) => !l.isNew).map((l) => l.name), picksUpOpen: /logbook|harbou?r|transmit|frequency/i.test(`${d.premise} ${d.structure.map((x) => x.summary).join(' ')}`), eliasOnWater: /elias[^.]{0,80}\b(boat|sails?|rows?|aboard|out on the water)\b/i.test(`${d.premise} ${d.structure.map((x) => x.summary).join(' ')}`) }));
    if (TASKS.includes('perf')) {
      const singers = b.s.characters.filter((c) => c.style === b.ep1.style).slice(0, 2);
      const mv = { ...b.ep1, id: 'prod-bench-mv', kind: 'MUSIC_VIDEO', showId: undefined, title: 'Lanterns on the Breakwater', logline: 'Two old friends sing to the sea on the night the meteors return.', synopsis: 'On the breakwater, one sings the verses to the sea; the other answers from the lighthouse; they meet for the last chorus.', concept: 'MIXED', song: { id: 'song-bench', title: 'Lanterns on the Breakwater', source: 'GENERATED', durationSeconds: 150, caption: 'slow folk waltz, accordion and fiddle, two weathered male voices', singerIds: singers.map((c) => c.id), sections: [
        { id: 'sec-1', kind: 'INTRO', text: '', singerIds: singers.map((c) => c.id), from: 0, to: 12 },
        { id: 'sec-2', kind: 'VERSE', text: 'I kept a light for forty years / for every boat that came home late / the one that never came still calls / across the water, through the static', singerIds: singers.map((c) => c.id), from: 12, to: 40 },
        { id: 'sec-3', kind: 'VERSE', text: 'I counted stars instead of ships / my brother laughed and went to sea / the sky still writes his name in fire / on nights the meteors fall for me', singerIds: singers.map((c) => c.id), from: 40, to: 68 },
        { id: 'sec-4', kind: 'CHORUS', text: 'Lanterns on the breakwater / burning for the ones not home / we will hold them till the morning / no one waits for them alone', singerIds: singers.map((c) => c.id), from: 68, to: 92 },
        { id: 'sec-5', kind: 'BRIDGE', text: 'You take the first line — I will take the second / you call the bearing — I will mark the chart / you hold the lamp — I will hold the silence / and between us both, the sea', singerIds: singers.map((c) => c.id), from: 92, to: 116 },
        { id: 'sec-6', kind: 'INSTRUMENTAL', text: '', singerIds: singers.map((c) => c.id), from: 116, to: 128 },
        { id: 'sec-7', kind: 'CHORUS', text: 'Lanterns on the breakwater / burning for the ones not home / we will hold them till the morning / no one waits for them alone', singerIds: singers.map((c) => c.id), from: 128, to: 150 },
      ] } } as unknown as Production;
      await measure('perf', r, () => engine.planPerformance(mv, singers, eo), (d) => ({ sections: d.length, everySection: mv.song!.sections.every((x) => d.some((y) => y.sectionId === x.id)), instrumentalOk: d.filter((x) => ['sec-1', 'sec-6'].includes(x.sectionId)).every((x) => x.mode === 'INSTRUMENTAL' && x.singerIds.length === 0), bridgeAlternating: d.find((x) => x.sectionId === 'sec-5')?.mode, verseSolo: d.filter((x) => ['sec-2', 'sec-3'].includes(x.sectionId)).map((x) => `${x.mode}:${x.singerIds.length}`), everyoneEverywhere: d.every((x) => x.singerIds.length === singers.length) }));
    }
    if (TASKS.includes('design')) {
      await measure('design-ar', r, () => engine.designCharacter(b.s, { brief: 'A Baghdadi kite-maker of about seventy who sells paper kites on the Tigris corniche and talks to the wind; gentle, stubborn, funny', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI' }, eo));
      await measure('design-en', r, () => engine.designCharacter(b.s, { brief: 'Ingrid Dahl, the Kerran Point harbour master: a brisk woman in her fifties, practical, keeps the harbour office spotless, secretly kind; wears the harbour authority uniform', style: 'CARTOON', language: 'EN' }, eo));
    }
    // the §3 English scene and the §6 Iraqi Arabic scene (same input as the earlier evaluation)
    const p = b.ep1.id ? state.productions.find((x) => x.title === 'The Static Sky')! : b.ep1;
    const cast = castOf(state, p); const world = worldOf(state, p);
    if (TASKS.includes('plan')) await measure('plan', r, async () => { const d = await engine.planShotsDraft(state, p, p.scenes[0], cast, world, {}, eo); return d; }, (d) => planChecks(d.shots, p.scenes[0], d.budget, cast));
    if (TASKS.includes('ar-plan')) {
      const rec = JSON.parse(await fs.readFile(AR_SCENE_FROM, 'utf8')) as { answer: ScriptResult };
      const castAr = cast.map((c) => ({ ...c, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const }));
      const byName = (n: string) => castAr.find((c) => c.name.toLowerCase() === n.trim().toLowerCase() || c.nameAr === n.trim())?.id ?? castAr[0].id;
      const sc = rec.answer.scenes[0];
      const arScene = { ...p.scenes[0], beats: sc.beats.map((bt, i) => ({ id: `beat-${i}`, action: bt.action, lines: bt.lines.map((l, k) => ({ id: `line-${i}-${k}`, characterId: byName(l.characterName), text: l.text, textAr: l.textAr, delivery: l.delivery })) })) } as Scene;
      const pAr = { ...p, id: `${p.id}-ar`, language: 'AR', dialect: 'IRAQI_BAGHDADI', title: 'السماء الساكنة', titleAr: 'السماء الساكنة', scenes: [arScene] } as Production;
      await measure('ar-plan', r, () => engine.planShotsDraft(state, pAr, arScene, castAr, world, {}, eo), (d) => ({ ...planChecks(d.shots, arScene, d.budget, castAr), calls: attempts.length, finishReasons: attempts.map((a) => a.finishReason) }));
    }
  }

  // the model leaves the card and the RAM (the next family needs both)
  await realFetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }).catch(() => {});
  vram.stop(); ram.stop();
  const byTask: Record<string, unknown> = {};
  for (const t of new Set(calls.map((c) => String(c.task).replace(/-s\d\d$/, '')))) {
    const cs = calls.filter((c) => String(c.task).replace(/-s\d\d$/, '') === t);
    const ms = cs.map((c) => Number(c.ms)).sort((a, b2) => a - b2);
    byTask[t] = { n: cs.length, medianMs: ms[Math.floor((ms.length - 1) / 2)], firstAttemptValid: cs.filter((c) => c.firstAttemptValid).length, everyFirstCallValid: cs.filter((c) => c.everyFirstCallValid).length, repairs: cs.reduce((a, c) => a + Number(c.repairs ?? 0), 0), truncatedAttempts: cs.reduce((a, c) => a + Number(c.truncatedAttempts ?? 0), 0), errors: cs.filter((c) => c.error).length, peakMiB: Math.max(...cs.map((c) => Number(c.vramPeakMiB) || 0)), ramPeak: { containerGiB: Math.max(...cs.map((c) => Number((c.ram as { containerGiB?: number })?.containerGiB) || 0)), vmUsedGiB: Math.max(...cs.map((c) => Number((c.ram as { vmUsedGiB?: number })?.vmUsedGiB) || 0)) } };
  }
  summary.byTask = byTask; await save();
  console.log(JSON.stringify(byTask, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

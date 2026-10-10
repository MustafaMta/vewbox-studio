/* THE DECISIVE CHARACTER A PACK (the producer's master directive, 2026-10-10 §22, §45): exactly ONE generation per
 * request, no best-of-N, no hidden seeds — the small listening package for the gate
 * CHARACTER_A_VOICE = WAITING_FOR_USER_ACCEPTANCE.
 *
 *   natural Iraqi     شلونك؟ صارلي هواية ما شايفك.
 *   hard Iraqi        گلتلك باچر نكعد نحچي ونشرب چاي.
 *   emotional Iraqi   يمعود لا تشيل هم، آني يمك وكلشي راح يصير زين.
 *   longer Iraqi      one natural 10–15 s Baghdadi conversational line written by Qwen3.8 (written once, kept)
 *   English identity  I told you we'd make it. Sit down and let me explain.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/character-a-pack.ts write-long     (Qwen3.8 writes the line once)
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/character-a-pack.ts speak --engine <id> [--english-engine <id>]
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/character-a-pack.ts package
 *
 * `speak` enqueues one VOICE_PREVIEW per line as the character (its one voice identity, its canonical reference pack)
 * through the named Iraqi renderer (Vewbox-IQ when it exists) and the English renderer; `package` copies the five
 * outputs and the canonical reference into docs/evidence/character-a-voice/<attempt>/ with a short README and the
 * machine metrics in a separate metrics.json. Nothing here chooses a winner. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';

const IRAQI = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
export const PACK = {
  natural: 'شلونك؟ صارلي هواية ما شايفك.',
  hard: 'گلتلك باچر نكعد نحچي ونشرب چاي.',
  emotional: 'يمعود لا تشيل هم، آني يمك وكلشي راح يصير زين.',
  english: "I told you we'd make it. Sit down and let me explain.",
} as const;
const LONG_FILE = path.resolve('docs/evidence/character-a-voice/long-line.json');
const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };

async function characterA() {
  const { db } = await import('@/server/db/client');
  const { readState } = await import('@/server/studio/engine');
  const r = (await db().execute(sql`select result->>'characterId' as id from jobs where (idempotency_key = 'phase1:create:A' or idempotency_key like 'phase1:create:A:%') and result->>'characterId' is not null order by created_at desc limit 1`)) as unknown as { rows?: Array<{ id: string }> };
  const id = (r.rows ?? (r as unknown as Array<{ id: string }>))[0]?.id;
  const { state } = await readState();
  const c = id ? state.characters.find((x) => x.id === id) : undefined;
  if (!c) throw new Error('character A does not exist');
  return { c, state };
}

/** Qwen3.8 writes the longer Baghdadi line ONCE; it is kept and reused by every attempt (the same line for every renderer). */
async function writeLong() {
  try { const kept = JSON.parse(await fs.readFile(LONG_FILE, 'utf8')) as { text: string }; console.log(JSON.stringify({ kept: kept.text })); return; } catch { /* not written yet */ }
  const { c } = await characterA();
  const { z } = await import('zod');
  const { json } = await import('@/server/providers/llm');
  // the brief's own constraints, checked on the text (the planner repairs a line that fails them): at least one چ word and
  // one گ word; no Levantine/Egyptian markers (the first draft had «كمان» and «باجرك») — never the model's audio
  const LEVANTINE = /(?<![\p{L}])(كمان|كتير|هيدا|هيك|شو|بدي|مش|إيه|ازاي|دلوقتي|عايز|ليه)(?![\p{L}])/u;
  const schema = z.object({ line: z.string().min(40).max(260).refine((t) => /چ/.test(t), 'the line must contain a word spoken with چ (باچر، چان، چاي، هيچ…)').refine((t) => /گ/.test(t), 'the line must contain a word spoken with گ (گلت، گاعد، گدام، شگد…)').refine((t) => !LEVANTINE.test(t), 'not Baghdadi: remove the Levantine/Egyptian word'), gloss: z.string().min(10).max(400) });
  const prompt = `Write ONE natural Baghdadi (Muslim Baghdadi, gilit) conversational line for ${c.name}, a Baghdad-born stage actor and singer in her early thirties, said to a close friend over tea — warm, everyday, nothing poetic or formal. It must take 10–15 seconds to say aloud (about 25–40 words), be written the way Baghdadis write their dialect (چ گ where they are spoken: باچر، گلت، شلونك، هسه، كلشي، ماكو…), with natural pauses marked by commas, and contain at least one چ word and one گ word. No Modern Standard Arabic grammar or vocabulary. Return JSON { "line": "...", "gloss": "an English gloss" }.`;
  const { data, result } = await json(schema, [{ role: 'user', content: prompt }], { maxTokens: 600, temperature: 0.8 });
  await fs.mkdir(path.dirname(LONG_FILE), { recursive: true });
  await fs.writeFile(LONG_FILE, JSON.stringify({ text: data.line, gloss: data.gloss, model: result.model, writtenAt: new Date().toISOString(), note: 'written once by Qwen3.8; the same line for every attempt and renderer' }, null, 2), 'utf8');
  console.log(JSON.stringify({ line: data.line, gloss: data.gloss, model: result.model }, null, 1));
}

async function speak() {
  const engine = arg('engine'); if (!engine) throw new Error('--engine <the Iraqi renderer id> is required');
  const englishEngine = arg('english-engine');
  const attempt = Number(arg('attempt', '1'));
  const { c } = await characterA();
  const { enqueue } = await import('@/server/jobs/queue');
  const long = JSON.parse(await fs.readFile(LONG_FILE, 'utf8')) as { text: string };
  const lines = [
    { id: 'natural', text: PACK.natural, ...IRAQI, engine },
    { id: 'hard', text: PACK.hard, ...IRAQI, engine },
    { id: 'emotional', text: PACK.emotional, ...IRAQI, engine, emotion: 'reassuring, warm, close' },
    { id: 'long', text: long.text, ...IRAQI, engine },
    { id: 'english', text: PACK.english, language: 'EN' as const, ...(englishEngine ? { engine: englishEngine } : {}) },
  ];
  const out: Array<{ line: string; job: string; created: boolean }> = [];
  // --only-iraqi: a rerun after a fix on the Iraqi side alone (the English line of the previous attempt stands and the
  // package picks the latest sample of each line)
  for (const l of lines.filter((x) => !process.argv.includes('--only-iraqi') || x.language === 'AR')) {
    const { id, ...payload } = l;
    const r = await enqueue({ type: 'VOICE_PREVIEW', payload: { characterId: c.id, ...payload }, idempotencyKey: `character-a-pack:${attempt}:${id}:${l.engine ?? 'production'}`, maxAttempts: 1 });
    out.push({ line: id, job: r.job.id, created: r.created });
  }
  console.log(JSON.stringify({ character: c.name, attempt, engine, englishEngine: englishEngine ?? '(production)', jobs: out }, null, 1));
}

async function pack() {
  const attempt = Number(arg('attempt', '1'));
  const { c, state } = await characterA();
  const { assetFile } = await import('@/server/media');
  const long = JSON.parse(await fs.readFile(LONG_FILE, 'utf8')) as { text: string };
  const dir = path.resolve('docs/evidence/character-a-voice', `attempt-${attempt}`);
  await fs.mkdir(dir, { recursive: true });
  const byId = (id?: string) => state.assets.find((a) => a.id === id);
  const id = c.voice.identity!;
  const ref = byId(id.referenceAssetId);
  const files: Record<string, string> = {};
  const metrics: Record<string, unknown> = { identity: { revision: id.revision, origin: id.origin, designId: id.designId, seedSha256: id.seedSha256, profiles: id.languageProfiles, referencePack: id.canonicalReferencePack } };
  if (ref) { await fs.copyFile(assetFile(ref), path.join(dir, '0-canonical-reference.wav')); files.reference = '0-canonical-reference.wav'; }
  // the pack rule: a line's language conditions on its clip of the canonical reference pack (same performer); each clip travels with the package
  for (const clip of id.canonicalReferencePack ?? []) {
    const a = byId(clip.assetId); if (!a || a.id === ref?.id) continue;
    const name = `0-reference-${clip.role.toLowerCase()}.wav`;
    await fs.copyFile(assetFile(a), path.join(dir, name)); files[`reference-${clip.role.toLowerCase()}`] = name;
  }
  const want: Array<[string, string, string]> = [['1-iraqi-natural', PACK.natural, 'AR'], ['2-iraqi-hard', PACK.hard, 'AR'], ['3-iraqi-emotional', PACK.emotional, 'AR'], ['4-iraqi-long', long.text, 'AR'], ['5-english-identity', PACK.english, 'EN']];
  for (const [name, text, lang] of want) {
    const s = [...c.voice.samples].reverse().find((x) => x.source === 'GENERATED' && x.text === text && x.language === lang && byId(x.assetId));
    if (!s) { metrics[name] = { missing: true }; continue; }
    const a = byId(s.assetId)!;
    await fs.copyFile(assetFile(a), path.join(dir, `${name}.wav`));
    files[name] = `${name}.wav`;
    const p = (a.provenance ?? {}) as Record<string, unknown>;
    metrics[name] = { engine: s.engine ?? p.engine, model: p.model, check: p.check, measured: p.measured, durationSeconds: s.durationSeconds };
  }
  // the scorer's shape (scripts/iq-eval-score.ts --metrics lines.json --reference 0-canonical-reference.wav): ECAPA to
  // the identity's seed (the fingerprint), CER/coverage and the phoneme gate on the packaged files themselves
  await fs.writeFile(path.join(dir, 'lines.json'), JSON.stringify({ lines: want.filter(([name]) => files[name]).map(([name, text, lang]) => ({ id: name, language: lang.toLowerCase(), text, file: files[name] })), package: dir, attempt }, null, 2), 'utf8');
  const readme = `# Character A — ${c.name} — voice listening package, attempt ${attempt}\n\nListen first; the metrics are in metrics.json, apart.\n\n0. canonical reference — the voice's own reference (what every renderer conditions on)\n1. Iraqi, natural — «${PACK.natural}»\n2. Iraqi, hard — «${PACK.hard}»\n3. Iraqi, emotional — «${PACK.emotional}»\n4. Iraqi, longer dialogue — «${long.text}»\n5. English identity — “${PACK.english}”\n\nEach output is the ONE result of one request (no candidates, no seed search). Gate: CHARACTER_A_VOICE = WAITING_FOR_USER_ACCEPTANCE — human enough? Iraqi enough? the same person? professional enough?\n`;
  await fs.writeFile(path.join(dir, 'README.md'), readme, 'utf8');
  await fs.writeFile(path.join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
  console.log(JSON.stringify({ dir, files }, null, 1));
}

const cmd = process.argv[2];
(cmd === 'write-long' ? writeLong() : cmd === 'speak' ? speak() : cmd === 'package' ? pack() : Promise.reject(new Error('usage: character-a-pack.ts write-long | speak --engine <id> [--english-engine <id>] [--attempt N] | package [--attempt N]')))
  .then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });

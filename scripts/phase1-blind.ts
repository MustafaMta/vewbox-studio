/* PHASE 1 BLIND LISTENING PACK (the producer's voice-identity recovery, 2026-10-09): the three clean characters' own
 * lines, every engine's ONE result per line (the production engines and the evaluation candidates), under shuffled
 * letters — which engine made a letter stays in blind-key.json until the listener has rated (Voice Studio → LAB
 * comparisons → "Phase 1"). The reference of an English line is the voice's own seed (what it was cloned from); the
 * reference of an Iraqi line is the SAME character's English line, so "same person" is heard, not assumed.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/phase1-blind.ts
 *
 * Reads the studio (the characters' generated samples and their provenance), copies the clips into
 * var/eval/phase1-voices-2026-10/clips, writes the set fixture, report.json and blind-key.json; a test whose set of
 * engines has not changed keeps its letters, and the grades already stored are kept. Nothing is spoken here. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { CHARACTERS, linesFor } from './phase1';

const RUN = path.resolve('var/eval/phase1-voices-2026-10');
const SET = 'tests/fixtures/voice/phase1-voices-2026-10.json';
const SCALES = ['natural', 'baghdadi', 'pronunciation', 'emotion', 'same_person', 'cinematic'];
const ARMS = [
  { id: 'moss', engine: 'moss', acting: 'reference prosody (MOSS-TTS v1.5)' },
  { id: 'habibi', engine: 'habibi', acting: 'reference prosody (Habibi Specialized IRQ)' },
  { id: 'fireredtts3', engine: 'fireredtts3', acting: 'reference prosody (FireRedTTS3-Base, evaluation)' },
  { id: 'fish-s2-pro', engine: 'fish-s2-pro', acting: 'plain (Fish S2 Pro, evaluation only)' },
];
const EN_INTENT = ['neutral greeting', 'warm welcome', 'serious, urgent', 'emotional', 'long conversational line'];
const IQ_INTENT = ['neutral greeting', 'the hard line: چ and گ', 'reassuring, warm', 'urgent', 'long natural Baghdadi line'];

const readJson = async <T>(f: string, fallback: T): Promise<T> => { try { return JSON.parse(await fs.readFile(f, 'utf8')) as T; } catch { return fallback; } };

async function main() {
  const { db } = await import('@/server/db/client');
  const { readState } = await import('@/server/studio/engine');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  const rows = async <T>(q: ReturnType<typeof sql>) => { const r = (await db().execute(q)) as unknown as { rows?: T[] }; return r.rows ?? (r as unknown as T[]); };
  await fs.mkdir(path.join(RUN, 'clips'), { recursive: true });
  const tests: Array<{ id: string; language: 'AR' | 'EN'; intent: string; text: string; character: string; characterName: string }> = [];
  const takes: Array<Record<string, unknown> & { arm: string; test: string; ok: boolean; file?: string }> = [];
  const refs: Array<{ language: string; file: string; source: string; licence: string; labOnly: boolean; character: string; label: string }> = [];
  const copy = async (from: string, name: string) => { const to = path.join(RUN, 'clips', name); await fs.copyFile(from, to); return `clips/${name}`; };
  for (const key of Object.keys(CHARACTERS) as Array<keyof typeof CHARACTERS>) {
    const [created] = await rows<{ id: string }>(sql`select result->>'characterId' as id from jobs where (idempotency_key = ${`phase1:create:${key}`} or idempotency_key like ${`phase1:create:${key}:%`}) and result->>'characterId' is not null order by created_at desc limit 1`);
    const c = created?.id ? state.characters.find((x) => x.id === created.id) : undefined;
    if (!c) { console.log(`${key}: not created yet`); continue; }
    const byId = (id?: string) => state.assets.find((a) => a.id === id);
    const { english, iraqi } = linesFor(key);
    const sampleOf = (text: string, engine: string) => c.voice.samples.find((s) => s.source === 'GENERATED' && s.text === text && (s.engine ?? (byId(s.assetId)?.provenance as { engine?: string } | undefined)?.engine) === engine && byId(s.assetId) && !byId(s.assetId)!.unavailable);
    // the references: the seed for English, this character's English line for Iraqi (same person?)
    const seed = byId(c.voice.identity?.referenceAssetId);
    if (seed) refs.push({ language: 'EN', file: await copy(assetFile(seed), `${key}-seed.wav`), source: 'the voice’s design seed (studio-designed synthetic voice)', licence: 'studio', labOnly: false, character: key, label: `${c.name}: the seed the voice was cloned from` });
    const enRef = sampleOf(english[0].text, 'moss');
    if (enRef) refs.push({ language: 'AR', file: await copy(assetFile(byId(enRef.assetId)!), `${key}-ref-english.wav`), source: 'the same character’s English line (MOSS)', licence: 'studio', labOnly: false, character: key, label: `${c.name} in English — is the Iraqi line the same person?` });
    const lines = [...english.map((l, i) => ({ ...l, language: 'EN' as const, intent: EN_INTENT[i] })), ...iraqi.map((l, i) => ({ ...l, language: 'AR' as const, intent: IQ_INTENT[i] }))];
    for (const l of lines) {
      const id = `${key}-${l.id}`;
      tests.push({ id, language: l.language, intent: l.intent, text: l.text, character: key, characterName: c.name });
      for (const arm of ARMS) {
        const s = sampleOf(l.text, arm.engine);
        if (!s) continue;
        const a = byId(s.assetId)!;
        const p = (a.provenance ?? {}) as { check?: { cer?: number; coverage?: number; heard?: string; status?: string } | null; model?: string };
        takes.push({ arm: arm.id, test: id, engine: arm.engine, ok: true, file: await copy(assetFile(a), `${id}-${arm.id}.wav`), seconds: s.durationSeconds, engineVersion: p.model, score: p.check ? { cer: p.check.cer, coverage: p.check.coverage, heard: p.check.heard, intelligibility: p.check.status } : undefined });
      }
    }
  }
  await fs.mkdir(path.dirname(path.resolve(SET)), { recursive: true });
  await fs.writeFile(path.resolve(SET), JSON.stringify({ name: 'Phase 1 — the three characters', tests, scales: SCALES }, null, 2), 'utf8');
  // the blind order, kept for a test whose engines have not changed; the grades already stored are kept
  const prev = await readJson<{ grades?: unknown }>(path.join(RUN, 'report.json'), {});
  const prevKey = await readJson<Record<string, Record<string, string>>>(path.join(RUN, 'blind-key.json'), {});
  const key: Record<string, Record<string, string>> = {};
  for (const t of tests) {
    const ts = takes.filter((x) => x.test === t.id && x.ok && x.file);
    const kept = prevKey[t.id] && Object.values(prevKey[t.id]).sort().join() === ts.map((x) => x.arm).sort().join() ? prevKey[t.id] : undefined;
    const order = kept ? Object.keys(kept).sort().map((l) => ts.find((x) => x.arm === kept[l])!) : ts.map((x) => ({ x, r: crypto.randomInt(1_000_000) })).sort((a, b) => a.r - b.r).map((o) => o.x);
    key[t.id] = Object.fromEntries(order.map((x, i) => [String.fromCharCode(65 + i), x.arm]));
  }
  await fs.writeFile(path.join(RUN, 'blind-key.json'), JSON.stringify(key, null, 2), 'utf8');
  const arms = ARMS.filter((a) => takes.some((t) => t.arm === a.id));
  await fs.writeFile(path.join(RUN, 'report.json'), JSON.stringify({ set: SET, arms, refs, takes, grades: prev.grades ?? null, note: 'Phase 1 voices: each clip is the engine’s one result for the line (first attempt). Machine numbers are supporting evidence; the listener decides. grades is null until a listener grades.' }, null, 2), 'utf8');
  console.log(JSON.stringify({ tests: tests.length, clips: takes.length, arms: arms.map((a) => a.id), refs: refs.length, run: RUN }));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

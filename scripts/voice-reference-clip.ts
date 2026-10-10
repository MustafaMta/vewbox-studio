/* A SAME-PERFORMER REFERENCE CLIP FOR ONE LANGUAGE OF A VOICE IDENTITY (the master directive §18; the smoke-2
 * separation, 2026-10-10: a cross-language reference masks the dialect, so Iraqi lines must condition on an Arabic clip
 * of the SAME identity). The identity renders neutral speech in that language through the named engine from its own
 * primary reference — one generation per candidate text (no hidden seeds; every candidate is kept in the library as a
 * COMPARISON sample and printed with its measurement) — and the candidate closest to the identity's speaker fingerprint
 * (ECAPA cosine) joins the canonical reference pack as STUDIO_RENDER, provided it was heard back (the line gate's PASS,
 * or its REVIEW within the CER/coverage gates — the ASR cannot confirm چ) and its similarity is at or above the floor.
 * Otherwise nothing is added and the evidence is printed. (Attempt 1 of Character A, 2026-10-10: the single-shot clip
 * at 0.587 to the fingerprint pulled the Iraqi lines to 0.44–0.57 — hence the ranked candidates.)
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/voice-reference-clip.ts --character-id <id> --language AR --engine vewbox-iq [--candidates 4] [--text "…"] [--attempt N] [--floor 0.60] [--replace]
 *
 * The candidate texts are neutral Baghdadi sentences with چ and گ words that are NOT any of the five pack lines (a
 * reference must not be the line it conditions). */
import { sql } from 'drizzle-orm';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const CANDIDATE_TEXTS: Record<'AR' | 'EN', string[]> = {
  AR: [
    'آني من بغداد، وكل يوم الصبح أشرب چاي وأحچي ويا أهلي شوية، وبعدين أطلع للشغل گبل ما يزدحم الشارع.',
    'هسه راح أگعد بالبيت شوية، وباچر الصبح أمر عليكم ونحچي على كلشي بهدوء.',
    'كل يوم أمشي على الشط نص ساعة، وأرجع أشرب چاي حار ويا أمي گبل ما أبدي شغلي.',
    'گلت لصاحبتي خلي نلتقي باچر العصر، نكعد بالمقهى ونحچي عن الأيام اللي راحت.',
  ],
  EN: [
    'I grew up by the river, and every morning I walk the same quiet street before the city wakes up.',
    'We used to sit on the roof in the evenings, drinking tea and talking until the lights came on.',
  ],
};

interface Row { status: string; result: Record<string, unknown> | null; error: unknown }
interface Result { assetId: string; check: { ok: boolean; status?: 'PASS' | 'REVIEW' | 'FAIL'; cer: number; coverage: number; heard: string; reasons?: string[] } | null; measured?: { seedToLineSimilarity?: number } }

async function main() {
  const characterId = arg('character-id'); if (!characterId) throw new Error('--character-id <id> is required');
  const language = (arg('language', 'AR') as 'AR' | 'EN');
  const engine = arg('engine'); if (!engine) throw new Error('--engine <renderer id> is required');
  const attempt = Number(arg('attempt', '1'));
  const floor = Number(arg('floor', '0.60'));
  const candidates = Number(arg('candidates', '1'));
  const texts = arg('text') ? [arg('text')!] : CANDIDATE_TEXTS[language].slice(0, Math.max(1, candidates));
  const { db } = await import('@/server/db/client');
  const { readState, command } = await import('@/server/studio/engine');
  const { enqueue } = await import('@/server/jobs/queue');
  const { embedVoice, cosine } = await import('@/server/providers/voice-design');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c?.voice.identity) throw new Error('character or its voice identity not found');
  const role = language === 'AR' ? 'IRAQI' : 'ENGLISH';
  const dialect = language === 'AR' ? (c.dialect ?? 'IRAQI_BAGHDADI') : undefined;
  const existing = c.voice.identity.canonicalReferencePack?.filter((k) => k.role === role) ?? [];
  if (existing.length && !flag('replace')) { console.log(JSON.stringify({ already: existing, hint: '--replace renders new candidates; the pack keeps every clip and the speaking path takes the closest to the fingerprint' }, null, 1)); return; }
  let fingerprint = c.voice.identity.speakerFingerprint?.vector;
  if (!fingerprint) {
    // an identity pinned before the fingerprint existed (Phase 1, 2026-10-09): measured now from its own primary
    // reference (the design seed) and stored once; the seed also becomes the pack's NEUTRAL clip (DESIGN_SEED)
    const seed = state.assets.find((x) => x.id === c.voice.identity!.referenceAssetId);
    if (!seed) throw new Error('the identity has neither a speaker fingerprint nor a reference asset on record');
    const e = await embedVoice(assetFile(seed));
    fingerprint = e.embedding.map((v) => Number(v.toFixed(5)));
    await command('setSpeakerFingerprint', [c.id, { model: e.model ?? 'ecapa', vector: fingerprint, measuredAt: new Date().toISOString() }], 'worker');
    if (!c.voice.identity.canonicalReferencePack?.length) await command('addVoiceReferenceClip', [c.id, { role: 'NEUTRAL', assetId: seed.id, sha256: seed.sha256, text: c.voice.identity.referenceText, language: c.voice.identity.language, ...(c.voice.identity.language === 'AR' && c.voice.identity.dialect ? { dialect: c.voice.identity.dialect } : {}), source: 'DESIGN_SEED', similarity: 1 }], 'worker');
    console.error(`[clip] fingerprint measured from the primary reference ${seed.id} and stored; the seed is the pack's NEUTRAL clip`);
  }
  // one job per candidate text (the queue runs them in turn), then every result is waited for
  const jobs: Array<{ index: number; text: string; id: string }> = [];
  for (const [index, text] of texts.entries()) {
    const key = `reference-clip:${c.id}:${role}:${engine}:${attempt}${index ? `:${index}` : ''}`;
    // reference: PRIMARY — a pack clip is rendered from the identity's primary reference, never from another pack clip
    const r = await enqueue({ type: 'VOICE_PREVIEW', payload: { characterId: c.id, text, language, ...(dialect ? { dialect } : {}), engine, reference: 'PRIMARY' }, idempotencyKey: key, maxAttempts: 1 });
    jobs.push({ index, text, id: r.job.id });
    console.error(`[clip] candidate ${index} job ${r.job.id} (${r.created ? 'created' : 'existing'})`);
  }
  const rows = new Map<string, Row>();
  for (let i = 0; i < 720 && rows.size < jobs.length; i++) {
    for (const j of jobs) {
      if (rows.has(j.id)) continue;
      const q = (await db().execute(sql`select status, result, error from jobs where id = ${j.id}`)) as unknown as { rows?: Row[] };
      const row = (q.rows ?? (q as unknown as Row[]))[0];
      if (row && ['COMPLETED', 'AWAITING_REVIEW', 'FAILED', 'CANCELLED'].includes(row.status)) rows.set(j.id, row);
    }
    if (rows.size < jobs.length) await new Promise((res) => setTimeout(res, 10_000));
  }
  const fresh = (await readState()).state;
  const measured: Array<Record<string, unknown> & { ok: boolean; similarity: number; assetId?: string; text: string }> = [];
  for (const j of jobs) {
    const row = rows.get(j.id);
    if (!row || !['COMPLETED', 'AWAITING_REVIEW'].includes(row.status)) { measured.push({ index: j.index, text: j.text, job: j.id, status: row?.status ?? 'unfinished', error: row?.error ?? undefined, ok: false, similarity: -1 }); continue; }
    const result = row.result as unknown as Result;
    const a = fresh.assets.find((x) => x.id === result.assetId);
    if (!a) { measured.push({ index: j.index, text: j.text, job: j.id, status: row.status, ok: false, similarity: -1, missingAsset: result.assetId }); continue; }
    const emb = (await embedVoice(assetFile(a))).embedding;
    const similarity = Math.round(cosine(fingerprint, emb) * 1000) / 1000;
    // heard back: PASS, or REVIEW within the CER/coverage gates (a point the ASR cannot confirm — چ heard as ك — is a listener's)
    const heard = result.check?.ok === true || (result.check?.status === 'REVIEW' && result.check.cer <= 0.15 && result.check.coverage >= 0.7);
    measured.push({ index: j.index, text: j.text, job: j.id, status: row.status, assetId: a.id, sha256: a.sha256, durationSeconds: a.durationSeconds, cer: result.check?.cer, coverage: result.check?.coverage, heard: result.check?.heard, reasons: result.check?.reasons, similarity, heardBack: heard, ok: heard && similarity >= floor });
  }
  const ranking = [...measured].sort((a, b) => b.similarity - a.similarity);
  const chosen = ranking.find((m) => m.ok);
  const evidence = { character: c.name, role, engine, floor, candidates: ranking, previous: existing.map((k) => ({ assetId: k.assetId, similarity: k.similarity })) };
  if (!chosen) { console.log(JSON.stringify({ refused: `no candidate was heard back with similarity ≥ ${floor}`, ...evidence }, null, 1)); process.exitCode = 3; return; }
  if (existing.some((k) => (k.similarity ?? -1) >= chosen.similarity)) { console.log(JSON.stringify({ kept: 'the pack already holds a closer clip of this role', ...evidence }, null, 1)); return; }
  const fa = fresh.assets.find((x) => x.id === chosen.assetId)!;
  await command('addVoiceReferenceClip', [c.id, { role, assetId: fa.id, sha256: fa.sha256, text: chosen.text, language, ...(dialect ? { dialect } : {}), source: 'STUDIO_RENDER', similarity: chosen.similarity }], 'worker');
  console.log(JSON.stringify({ added: { assetId: fa.id, similarity: chosen.similarity, text: chosen.text }, ...evidence }, null, 1));
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e.message ?? e); process.exit(1); });

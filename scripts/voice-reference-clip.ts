/* A SAME-PERFORMER REFERENCE CLIP FOR ONE LANGUAGE OF A VOICE IDENTITY (the master directive §18; the smoke-2
 * separation, 2026-10-10: a cross-language reference masks the dialect, so Iraqi lines must condition on an Arabic clip
 * of the SAME identity). The identity renders ONE clip of neutral speech in that language through the named engine from
 * its own primary reference (one VOICE_PREVIEW job, one generation, no best-of-N); the clip joins the canonical
 * reference pack as STUDIO_RENDER only when it was heard back (the line gate) AND its ECAPA cosine to the identity's
 * speaker fingerprint is at or above the floor — otherwise nothing is added and the evidence is printed.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/voice-reference-clip.ts --character-id <id> --language AR --engine vewbox-iq [--text "…"] [--attempt N] [--floor 0.55]
 *
 * The default Iraqi text is a neutral Baghdadi sentence with چ and گ words that is NOT one of the five pack lines (a
 * reference must not be the line it conditions). */
import { sql } from 'drizzle-orm';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const DEFAULT_TEXT: Record<'AR' | 'EN', string> = {
  AR: 'آني من بغداد، وكل يوم الصبح أشرب چاي وأحچي ويا أهلي شوية، وبعدين أطلع للشغل گبل ما يزدحم الشارع.',
  EN: 'I grew up by the river, and every morning I walk the same quiet street before the city wakes up.',
};

async function main() {
  const characterId = arg('character-id'); if (!characterId) throw new Error('--character-id <id> is required');
  const language = (arg('language', 'AR') as 'AR' | 'EN');
  const engine = arg('engine'); if (!engine) throw new Error('--engine <renderer id> is required');
  const attempt = Number(arg('attempt', '1'));
  const floor = Number(arg('floor', '0.55'));
  const text = arg('text', DEFAULT_TEXT[language])!;
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
  if (c.voice.identity.canonicalReferencePack?.some((k) => k.role === role)) { console.log(JSON.stringify({ already: c.voice.identity.canonicalReferencePack.find((k) => k.role === role) }, null, 1)); return; }
  const fingerprint = c.voice.identity.speakerFingerprint?.vector;
  if (!fingerprint) throw new Error('the identity has no speaker fingerprint; build the voice again');
  const key = `reference-clip:${c.id}:${role}:${engine}:${attempt}`;
  const r = await enqueue({ type: 'VOICE_PREVIEW', payload: { characterId: c.id, text, language, ...(dialect ? { dialect } : {}), engine }, idempotencyKey: key, maxAttempts: 1 });
  console.error(`[clip] job ${r.job.id} (${r.created ? 'created' : 'existing'}): ${role} clip of ${c.name} through ${engine}`);
  // wait for the worker (the job is one generation; the queue may hold it behind other GPU work)
  let row: { status: string; result: Record<string, unknown> | null; error: unknown } | undefined;
  for (let i = 0; i < 360; i++) {
    const q = (await db().execute(sql`select status, result, error from jobs where id = ${r.job.id}`)) as unknown as { rows?: Array<typeof row> };
    row = (q.rows ?? (q as unknown as Array<typeof row>))[0];
    if (row && ['DONE', 'FAILED', 'CANCELLED'].includes(row.status)) break;
    await new Promise((res) => setTimeout(res, 10_000));
  }
  if (!row || row.status !== 'DONE') throw new Error(`job ${r.job.id} ended ${row?.status ?? 'unknown'}: ${JSON.stringify(row?.error ?? null)}`);
  const result = row.result as { assetId: string; check: { ok: boolean; cer: number; coverage: number; heard: string } | null; measured?: { seedToLineSimilarity?: number } };
  const fresh = (await readState()).state;
  const a = fresh.assets.find((x) => x.id === result.assetId);
  if (!a) throw new Error(`asset ${result.assetId} not found`);
  const emb = (await embedVoice(assetFile(a))).embedding;
  const similarity = Math.round(cosine(fingerprint, emb) * 1000) / 1000;
  const heard = result.check?.ok === true;
  const evidence = { character: c.name, role, engine, text, assetId: a.id, sha256: a.sha256, durationSeconds: a.durationSeconds, check: result.check, similarityToFingerprint: similarity, floor, heardBack: heard };
  if (!heard || similarity < floor) { console.log(JSON.stringify({ refused: !heard ? 'the clip was not heard back within the line gate' : `similarity ${similarity} is below the floor ${floor}`, ...evidence }, null, 1)); process.exitCode = 3; return; }
  await command('addVoiceReferenceClip', [c.id, { role, assetId: a.id, sha256: a.sha256, text, language, ...(dialect ? { dialect } : {}), source: 'STUDIO_RENDER', similarity }], 'worker');
  console.log(JSON.stringify({ added: true, ...evidence }, null, 1));
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e.message ?? e); process.exit(1); });

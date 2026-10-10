/* ONE LINE AS ONE CHARACTER, THROUGH THE PIPELINE (one VOICE_PREVIEW job: one generation, the line gate, the ECAPA
 * measurement, the asset in the library) — printed with its machine metrics when done. For controlled comparisons
 * (the same line and character through two renderers) and for the pack scripts of B and C.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/voice-line.ts --character-id <id> --text "…" [--language EN|AR] [--dialect IRAQI_BAGHDADI] [--engine <id>] [--emotion "…"] [--key <idempotency key>] [--no-wait] */
import { sql } from 'drizzle-orm';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const characterId = arg('character-id'); const text = arg('text');
  if (!characterId || !text) throw new Error('--character-id and --text are required');
  const language = arg('language') as 'EN' | 'AR' | undefined;
  const dialect = arg('dialect'); const engine = arg('engine'); const emotion = arg('emotion');
  const { db } = await import('@/server/db/client');
  const { enqueue } = await import('@/server/jobs/queue');
  const key = arg('key', `voice-line:${characterId}:${engine ?? 'production'}:${language ?? 'own'}:${text.slice(0, 40)}`);
  const r = await enqueue({ type: 'VOICE_PREVIEW', payload: { characterId, text, ...(language ? { language } : {}), ...(dialect ? { dialect } : {}), ...(engine ? { engine } : {}), ...(emotion ? { emotion } : {}) }, idempotencyKey: key, maxAttempts: 1 });
  console.error(`[line] job ${r.job.id} (${r.created ? 'created' : 'existing'})`);
  if (flag('no-wait')) { console.log(JSON.stringify({ job: r.job.id, created: r.created })); return; }
  let row: { status: string; result: Record<string, unknown> | null; error: unknown } | undefined;
  for (let i = 0; i < 720; i++) {
    const q = (await db().execute(sql`select status, result, error from jobs where id = ${r.job.id}`)) as unknown as { rows?: Array<typeof row> };
    row = (q.rows ?? (q as unknown as Array<typeof row>))[0];
    if (row && ['COMPLETED', 'AWAITING_REVIEW', 'FAILED', 'CANCELLED'].includes(row.status)) break;
    await new Promise((res) => setTimeout(res, 10_000));
  }
  const res = row?.result as { assetId?: string; engine?: string; model?: string; language?: string; durationSeconds?: number; check?: { ok: boolean; cer: number; coverage: number; heard: string } | null; measured?: { seedToLineSimilarity?: number; lufs?: number } } | undefined;
  console.log(JSON.stringify({ job: r.job.id, status: row?.status, error: row?.error ?? undefined, assetId: res?.assetId, engine: res?.engine, model: res?.model, language: res?.language, durationSeconds: res?.durationSeconds, cer: res?.check?.cer, coverage: res?.check?.coverage, ok: res?.check?.ok, heard: res?.check?.heard, similarity: res?.measured?.seedToLineSimilarity }, null, 1));
  if (!['COMPLETED', 'AWAITING_REVIEW'].includes(row?.status ?? '')) process.exitCode = 3;
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e.message ?? e); process.exit(1); });

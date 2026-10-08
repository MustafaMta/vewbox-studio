import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { json, readJson, route } from '@/server/http';
import { comparisonView, storeGrades } from '@/server/voice/evaluation';

export const dynamic = 'force-dynamic';

/** THE VOICE COMPARISON (src/server/voice/evaluation.ts): GET ?run=<id> the blind view; POST ?run=<id> a listener's
 *  ratings `{ by, native, dialect?, ratings: [{ test, letter, <scale>: 1–5 …, note? }] }` → `{ stored, reveal }` (which
 *  engine each rated letter was — shown to the listener only after they rated). Unknown scales are refused there. */
const runOf = (req: Request) => new URL(req.url).searchParams.get('run')?.slice(0, 60) || undefined;

export const GET = route(async (req) => json(await comparisonView(runOf(req)), { headers: { 'Cache-Control': 'no-store' } }));

const Grades = z.object({
  by: z.string().min(1).max(80), native: z.boolean(), dialect: z.string().max(40).optional(),
  ratings: z.array(z.object({ test: z.string().max(20), letter: z.string().max(4), note: z.string().max(1000).optional() }).catchall(z.number().int().min(1).max(5))).min(1).max(300),
}).strict();

export const POST = route(async (req) => {
  const parsed = Grades.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return json(await storeGrades(parsed.data as never, new Date().toISOString(), runOf(req)), { status: 201 });
});

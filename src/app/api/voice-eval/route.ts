import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { json, readJson, route } from '@/server/http';
import { comparisonView, storeGrades } from '@/server/voice/evaluation';

export const dynamic = 'force-dynamic';

/** THE VOICE COMPARISON (src/server/voice/evaluation.ts): GET the blind view; POST a listener's ratings
 *  `{ by, native, dialect?, ratings: [{ test, letter, natural?, baghdadi?, emotion?, pronunciation?, same_voice?, note? }] }`. */
export const GET = route(async () => json(await comparisonView(), { headers: { 'Cache-Control': 'no-store' } }));

const score = z.number().int().min(1).max(5).optional();
const Grades = z.object({
  by: z.string().min(1).max(80), native: z.boolean(), dialect: z.string().max(40).optional(),
  ratings: z.array(z.object({ test: z.string().max(20), letter: z.string().max(4), natural: score, baghdadi: score, emotion: score, pronunciation: score, same_voice: score, note: z.string().max(1000).optional() }).strict()).min(1).max(200),
}).strict();

export const POST = route(async (req) => {
  const parsed = Grades.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return json(await storeGrades(parsed.data, new Date().toISOString()), { status: 201 });
});

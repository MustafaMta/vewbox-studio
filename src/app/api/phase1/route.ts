import fs from 'node:fs/promises';
import path from 'node:path';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** PHASE 1 REVIEW EVIDENCE (scripts/phase1-review.ts → docs/evidence/phase1/<A|B|C>.json): the machine's supporting
 *  measurements per character, read by the review page. Supporting only — the producer's listening decides. */
export const GET = route(async () => {
  const dir = path.resolve('docs/evidence/phase1');
  const out: unknown[] = [];
  for (const key of ['A', 'B', 'C']) {
    try { out.push(JSON.parse(await fs.readFile(path.join(dir, `${key}.json`), 'utf8'))); } catch { /* not measured yet */ }
  }
  return json({ evidence: out }, { headers: { 'Cache-Control': 'no-store' } });
});

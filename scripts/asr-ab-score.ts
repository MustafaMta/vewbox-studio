/* Scores the ASR A/B of scripts/asr-ab-iraqi.py with the studio's own Iraqi measures (src/server/providers/speech.ts:
 * `charErrorRate` / `scriptCoverage` after `normalizeIraqi`, and the take-gate verdict) against the text each WAV was
 * meant to say (report.json of the run). Prints and writes <run>/asr-ab/score.json.
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/asr-ab-score.ts docs/evidence/iraqi-eval/2026-10-run1 */
import fs from 'node:fs';
import path from 'node:path';

const run = process.argv[2];
const report = JSON.parse(fs.readFileSync(path.join(run, 'report.json'), 'utf8')) as { lines: Array<{ file?: string; text: string; id: string; category: string; voice: string; variant: string; engine: string }> };
const speech = await import('@/server/providers/speech');
const arms = ['large-v3', 'dialectal-v2'];
const texts = Object.fromEntries(arms.map((a) => [a, (JSON.parse(fs.readFileSync(path.join(run, 'asr-ab', `${a}.json`), 'utf8')) as { texts: Record<string, string> }).texts]));
const rows: Array<Record<string, unknown>> = [];
for (const l of report.lines.filter((x) => x.engine === 'habibi' && x.file)) {
  const f = path.basename(l.file!);
  const row: Record<string, unknown> = { id: l.id, voice: l.voice, variant: l.variant, category: l.category, text: l.text };
  for (const a of arms) {
    const heard = texts[a][f] ?? '';
    const cer = speech.charErrorRate(l.text, heard, 'AR');
    const coverage = speech.scriptCoverage(l.text, heard, 'AR');
    row[a] = { heard, cer: Number(cer.toFixed(3)), coverage: Number(coverage.toFixed(3)), verdict: speech.verdict({ coverage, cer, context: 'line' }).status };
  }
  rows.push(row);
}
const summary: Record<string, unknown> = {};
for (const a of arms) {
  const xs = rows.map((r) => r[a] as { cer: number; verdict: string });
  const sorted = xs.map((x) => x.cer).sort((p, q) => p - q);
  summary[a] = { lines: xs.length, meanCer: Number((xs.reduce((s, x) => s + x.cer, 0) / xs.length).toFixed(3)), medianCer: sorted[Math.floor(sorted.length / 2)], cerAtMost015: xs.filter((x) => x.cer <= 0.15).length, pass: xs.filter((x) => x.verdict === 'PASS').length, review: xs.filter((x) => x.verdict === 'REVIEW').length, fail: xs.filter((x) => x.verdict === 'FAIL').length };
}
const better = rows.filter((r) => (r['dialectal-v2'] as { cer: number }).cer < (r['large-v3'] as { cer: number }).cer).length;
const worse = rows.filter((r) => (r['dialectal-v2'] as { cer: number }).cer > (r['large-v3'] as { cer: number }).cer).length;
summary.perLine = { dialectBetter: better, dialectWorse: worse, equal: rows.length - better - worse };
fs.writeFileSync(path.join(run, 'asr-ab', 'score.json'), JSON.stringify({ note: 'Synthetic speech (Habibi IRQ with designed seeds): the two ASR models on the same WAVs, scored with the studio fold. Not real Iraqi speakers.', summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows.filter((x) => Math.abs((x['dialectal-v2'] as { cer: number }).cer - (x['large-v3'] as { cer: number }).cer) >= 0.2).slice(0, 12)) console.log(r.id, r.voice, '| v3:', (r['large-v3'] as { heard: string; cer: number }).cer, (r['large-v3'] as { heard: string }).heard, '| dialect:', (r['dialectal-v2'] as { cer: number }).cer, (r['dialectal-v2'] as { heard: string }).heard);
process.exit(0);

/* THE چ/گ PHONEME GATE, FORMAL RUN (Phase 3 regression gate). Judges recordings that already exist — it never
 * synthesizes: each Arabic line's words heard as phonemes (wav2vec2-xlsr-53-espeak-cv-ft through the asr service's
 * /qa/phonemes), then src/server/media/iraqi-phonology.ts judgeLine (چ must be /tʃ/, گ must be /ɡ/). Inputs: lab reports
 * (rows with id, language, text, file) and/or explicit --pair "<file>|<text>". Writes <out>/phoneme-gate.json.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts ASR 4000 -- \
 *     pnpm exec tsx --env-file=.env --env-file=.env.local scripts/phoneme-gate.ts --out <dir> [--report <json>]... [--pair "<wav>|<text>"]...
 */
async function main() {
  const args = process.argv.slice(2);
  const all = (k: string) => args.flatMap((a, i) => (a === `--${k}` && args[i + 1] ? [args[i + 1]] : []));
  const out = all('out')[0];
  if (!out) throw new Error('--out is required');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { dialectPhonemes } = await import('@/server/providers/qa-service');
  const { judgeLine } = await import('@/server/media/iraqi-phonology');
  const items: Array<{ id: string; file: string; text: string; source: string }> = [];
  for (const r of all('report')) {
    const j = JSON.parse(await fs.readFile(r, 'utf8')) as { rows?: Array<{ id: string; language?: string; text: string; file: string }> };
    for (const row of j.rows ?? []) if ((row.language ?? 'AR') === 'AR' && /[چگ]/.test(row.text)) items.push({ id: row.id, file: row.file, text: row.text, source: path.basename(path.dirname(r)) });
  }
  for (const [k, p] of all('pair').entries()) { const [file, text] = p.split('|'); items.push({ id: `pair-${k + 1}`, file, text, source: 'pair' }); }
  const rows: unknown[] = [];
  const tally: Record<string, number> = {};
  for (const it of items) {
    const ph = await dialectPhonemes(it.file, it.text);
    const verdict = ph.available ? { ...judgeLine(ph.words), coverage: ph.coverage } : { verdict: 'UNAVAILABLE', reason: (ph as { reason?: string }).reason };
    const v = String((verdict as { verdict: string }).verdict);
    tally[`${it.source}:${v}`] = (tally[`${it.source}:${v}`] ?? 0) + 1;
    rows.push({ ...it, phonology: verdict });
    console.log(`${it.source} ${it.id}: ${v} ${JSON.stringify((verdict as { words?: unknown[] }).words ?? (verdict as { reason?: string }).reason ?? '').slice(0, 300)}`);
  }
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'phoneme-gate.json'), JSON.stringify({ at: new Date().toISOString(), label: 'LAB TEST — NOT PRODUCTION', tally, rows }, null, 2));
  console.log(JSON.stringify(tally));
}
main().catch((e) => { console.error(e); process.exit(1); });

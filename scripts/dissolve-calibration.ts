/* DISSOLVE CHECK CALIBRATION (src/server/media/continuity-qa.ts measuredDissolves): run the dissolve and cut measures
 * over every READY take of the named productions (all when none is named) and score them against the labelled real
 * transitions (tests/fixtures/qa/transition-labels.json): a measured dissolve within 0.5 s of a DISSOLVE label is a true
 * positive; one within 0.5 s of any other label, or anywhere in a take labelled CLEAN, is a false positive; a DISSOLVE
 * label with nothing measured near it is a miss. Unlabelled detections are listed for a person to look at and label.
 * The measure stays out of take QA until its false-positive rate on this set is acceptable. Read only.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dissolve-calibration.ts [productionId ...]
 */
import fs from 'node:fs/promises';

interface Label { takeId: string; shot: string; kind: string; at?: number }

async function main() {
  const ids = process.argv.slice(2);
  const { readState } = await import('@/server/studio/engine');
  const { greyFrames } = await import('@/server/media/assembly-joins');
  const { measuredDissolves, measuredCuts, frameSeries } = await import('@/server/media/continuity-qa');
  const { assetFile } = await import('@/server/media');
  const { labels } = JSON.parse(await fs.readFile('tests/fixtures/qa/transition-labels.json', 'utf8')) as { labels: Label[] };
  const { state } = await readState();
  let tp = 0, fp = 0, miss = 0;
  const unlabelled: string[] = [];
  for (const p of state.productions.filter((x) => !ids.length || ids.includes(x.id))) {
    for (const sh of p.shots) for (const t of sh.takes) {
      const a = state.assets.find((x) => x.id === t.assetId);
      if (!a || t.status !== 'READY') continue;
      let frames: Uint8Array[];
      try { frames = await greyFrames(assetFile(a)); } catch (e) { console.log(`${p.title} ${sh.number} ${t.id}: ${(e as Error).message.split('\n')[0]}`); continue; }
      const d = measuredDissolves(frames, 24);
      const c = measuredCuts(frameSeries(frames, 24));
      const mine = labels.filter((l) => l.takeId === t.id);
      for (const x of d) {
        const near = mine.find((l) => l.at !== undefined && Math.abs(l.at - x) <= 0.5);
        if (near?.kind === 'DISSOLVE') tp++;
        else if (near || mine.some((l) => l.kind === 'CLEAN')) fp++;
        else unlabelled.push(`${p.title} ${sh.number} ${t.id} at ${x.toFixed(2)} s`);
      }
      for (const l of mine.filter((k) => k.kind === 'DISSOLVE')) if (!d.some((x) => Math.abs(x - (l.at ?? -9)) <= 0.5)) miss++;
      console.log(`${p.title} ${sh.number} ${t.id} ${t.label ?? ''}: dissolves [${d.map((x) => x.toFixed(2)).join(', ')}] cuts [${c.map((x) => x.toFixed(2)).join(', ')}]${mine.length ? ` labels [${mine.map((l) => `${l.kind}${l.at !== undefined ? `@${l.at}` : ''}`).join(', ')}]` : ''}`);
    }
  }
  const labelledNegatives = labels.filter((l) => l.kind !== 'DISSOLVE').length;
  console.log(`\nagainst ${labels.length} labels: ${tp} true positive(s), ${fp} false positive(s) on ${labelledNegatives} labelled non-dissolve(s), ${miss} missed dissolve(s); ${unlabelled.length} unlabelled detection(s) to look at:`);
  for (const u of unlabelled) console.log(`  ${u}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

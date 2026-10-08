/* DISSOLVE CHECK CALIBRATION (src/server/media/continuity-qa.ts measuredDissolves): run the dissolve and cut measures
 * over every READY take of the named productions and print them, so the START thresholds are checked against real H3
 * media — the known dissolve ("The Relief" 1.6 attempt 5) must be found, and takes a person looked at and saw no
 * dissolve in must stay clean. Read only.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dissolve-calibration.ts <productionId> [...]
 */
async function main() {
  const ids = process.argv.slice(2);
  const { readState } = await import('@/server/studio/engine');
  const { greyFrames } = await import('@/server/media/assembly-joins');
  const { measuredDissolves, measuredCuts, frameSeries } = await import('@/server/media/continuity-qa');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  for (const p of state.productions.filter((x) => !ids.length || ids.includes(x.id))) {
    for (const sh of p.shots) for (const t of sh.takes) {
      const a = state.assets.find((x) => x.id === t.assetId);
      if (!a || t.status !== 'READY') continue;
      try {
        const file = assetFile(a);
        const frames = await greyFrames(file);
        const d = measuredDissolves(frames, 24);
        const c = measuredCuts(frameSeries(frames, 24));
        console.log(`${p.title} ${sh.number} ${t.id} ${t.label ?? ''}: dissolves [${d.map((x) => x.toFixed(2)).join(', ')}] cuts [${c.map((x) => x.toFixed(2)).join(', ')}]`);
      } catch (e) { console.log(`${p.title} ${sh.number} ${t.id}: ${(e as Error).message.split('\n')[0]}`); }
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

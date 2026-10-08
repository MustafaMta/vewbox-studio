/* THE SHOT DEPENDENCY CONTRACT, APPLIED TO STATE WRITTEN BEFORE IT (src/domain/shot-dependencies.ts validShot):
 * every shot whose structured state names people who are not in its cast (a continuity entry, a prop owner, the point
 * of view, an on-screen line) is repaired through the ordinary `updateShot` command (an empty patch: the contract runs
 * on every update), so the change is recorded like any other edit. Dry run unless --apply.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/repair-shot-state.ts [--apply]
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const { readState, command } = await import('@/server/studio/engine');
  const { validShot } = await import('@/domain/shot-dependencies');
  const { state } = await readState();
  let n = 0;
  for (const p of state.productions) for (const sh of p.shots) {
    const r = validShot(sh);
    if (!r.stale.length) continue;
    n++;
    console.log(`${p.title} — shot ${sh.number} (${sh.id}): ${r.stale.map((s) => `${s.item} (${s.why})`).join('; ')}`);
    if (apply) await command('updateShot', [p.id, sh.id, {}], 'system');
  }
  console.log(`${n} shot(s) ${apply ? 'repaired' : 'would be repaired (dry run; --apply to write)'}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

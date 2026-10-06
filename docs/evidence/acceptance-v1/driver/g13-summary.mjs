// G13 A/B: per arm, the take's measured signals and its references, from the live studio (read only).
//   node g13-summary.mjs <arms.jsonl> <out.json>
import fs from 'node:fs/promises';
const [armsFile, out] = process.argv.slice(2);
const arms = (await fs.readFile(armsFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.state && l.state !== 'enqueued');
const { state } = await (await fetch('http://localhost:4200/api/studio')).json();
const rows = [];
for (const a of arms) {
  const takeId = a.result?.takeId;
  const p = state.productions.find((x) => x.shots.some((s) => s.id === a.shotId));
  const sh = p.shots.find((s) => s.id === a.shotId);
  const t = sh.takes.find((x) => x.id === takeId);
  if (!t) { rows.push({ shot: sh.number, arm: a.arm, mode: a.mode, jobId: a.jobId, state: a.state, missing: true }); continue; }
  const chk = (n) => t.qa?.checks.find((c) => c.name === n);
  const asset = state.assets.find((x) => x.id === t.assetId);
  rows.push({
    shot: sh.number, framing: sh.framing, arm: a.arm, mode: a.mode, seed: t.seed, jobId: a.jobId, takeId, status: t.status, verdict: a.result?.verdict, tier: t.params?.tier, file: asset?.provenance?.path,
    faceRef: (t.references ?? []).filter((r) => /derived face reference/i.test(r.note ?? '')).map((r) => ({ assetId: r.assetId, binding: r.binding, note: r.note })),
    identity: t.params?.identityCheck, people: chk('people-on-screen') && { ok: chk('people-on-screen').ok, value: chk('people-on-screen').value, detail: chk('people-on-screen').detail },
    lipSync: t.params?.lipSync, flags: (t.qa?.checks ?? []).filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail ?? ''}`.slice(0, 200)),
    attempt: t.params?.attempt, generationMs: t.generationMs,
  });
}
await fs.writeFile(out, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`shot ${r.shot} ${r.arm}/${r.mode} ${r.status ?? r.state} ${r.verdict ?? ''} faceRef=${r.faceRef?.length ?? '-'} id=${JSON.stringify(r.identity?.characters ? Object.fromEntries(Object.entries(r.identity.characters).map(([k, v]) => [k.slice(-4), v.median])) : null)} people=${r.people?.value} lip=${r.lipSync?.verdict ?? '-'}/${r.lipSync?.lagFrames ?? '-'} ${r.file ?? ''}`);

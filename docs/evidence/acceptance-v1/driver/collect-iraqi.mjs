// Copy the Iraqi voice material of Abu Haidar into docs/evidence/acceptance-v1/iraqi/ with its texts and what the app's
// ASR heard (support only; the dialect is PENDING native review). Usage: node collect-iraqi.mjs <jobId> [<jobId> ...]
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve('docs/evidence/acceptance-v1/iraqi');
await fs.mkdir(OUT, { recursive: true });
const state = (await (await fetch('http://localhost:4200/api/studio')).json()).state;
const asset = (id) => state.assets.find((a) => a.id === id);
const listFile = path.join(OUT, 'lines.json');
const lines = JSON.parse(await fs.readFile(listFile, 'utf8').catch(() => '[]'));
const add = async (entry) => {
  const a = asset(entry.assetId); if (!a) { console.log('missing asset', entry.assetId); return; }
  const file = `${entry.id}.wav`;
  await fs.copyFile(path.resolve('var/library', a.provenance.path), path.join(OUT, file));
  const i = lines.findIndex((l) => l.id === entry.id);
  const row = { ...entry, file, engine: a.provenance?.model ?? a.provenance?.engine ?? entry.engine, durationSeconds: a.provenance?.probe?.duration ?? entry.durationSeconds };
  if (i >= 0) lines[i] = row; else lines.push(row);
};
for (const jobId of process.argv.slice(2)) {
  const job = (await (await fetch(`http://localhost:4200/api/jobs/${jobId}`)).json()).job;
  const r = job.result ?? {};
  if (job.type === 'VOICE_BUILD') {
    const chosen = r.design.candidates.find((c) => c.index === r.design.chosen);
    await add({ id: 'abu-haidar-proof', kind: 'proof line (voice build)', text: 'هلا بيك. اني اسمي أبو حيدر، وهذا صوتي.', assetId: r.sampleAssetId, heard: r.check?.heard, cer: r.check?.cer, jobId, engine: r.engine });
    await add({ id: 'abu-haidar-designed-seed', kind: 'designed seed (VoxCPM2, synthetic; the clone reference)', text: '(calibration text, MSA)', assetId: chosen.assetId, heard: chosen.measured?.heard, cer: chosen.cer, jobId, engine: 'voxcpm2-design' });
    for (const [k, pv] of chosen.previews.entries()) await add({ id: `abu-haidar-probe-${k + 1}`, kind: 'Iraqi probe line (design ranking)', text: pv.text, assetId: pv.assetId, heard: pv.heard, cer: pv.cer, jobId, engine: pv.engine });
  } else if (job.type === 'VOICE_PREVIEW') {
    await add({ id: `abu-haidar-preview-${jobId}`, kind: 'preview line (profile, Speak it)', text: job.payload?.text ?? r.text, assetId: r.assetId, heard: r.check?.heard, cer: r.check?.cer, status: r.check?.status, reasons: r.check?.reasons, jobId, engine: r.engine });
  } else console.log('skip', job.type);
}
await fs.writeFile(listFile, JSON.stringify(lines, null, 1));
console.log(lines.map((l) => `${l.id}\t${l.text}\t→ ${l.heard}`).join('\n'));

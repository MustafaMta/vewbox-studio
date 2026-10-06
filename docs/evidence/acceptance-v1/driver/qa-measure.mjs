// Acceptance QA measurements against the live services (signals for the reviewer, never acceptance by themselves):
//   node qa-measure.mjs <spec.json> <out.json>
// Run it under the studio's GPU lease (the asr service loads Whisper / wav2vec2 on the card):
//   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts ASR 6000 -- node docs/evidence/acceptance-v1/driver/qa-measure.mjs spec.json out.json
// spec: { transcribe: [{label, file, language}], align: [{label, file, text, language, start?, end?}],
//         mouth: [{label, video, audio?, audioOffset?, windows?, speakers?, fps?, maxLagMs?}],
//         identity: [{label, video, refs: [{characterId, image}], sampleFps?}], similarity: [{label, a, b}] }
// File paths are relative to the repository root or absolute. Every answer (or error) is kept in out.json.
import fs from 'node:fs/promises';
import path from 'node:path';

const [specFile, outFile] = process.argv.slice(2);
const spec = JSON.parse(await fs.readFile(specFile, 'utf8'));
const ASR = process.env.ASR_URL ?? 'http://127.0.0.1:8030';
const DESIGN = process.env.TTS_DESIGN_URL ?? 'http://127.0.0.1:8022';
const blob = async (f) => new Blob([await fs.readFile(path.resolve(f))]);
const post = async (url, fd) => { const t0 = Date.now(); const r = await fetch(url, { method: 'POST', body: fd, signal: AbortSignal.timeout(15 * 60_000) }); const txt = await r.text(); let body; try { body = JSON.parse(txt); } catch { body = txt.slice(0, 2000); } return { status: r.status, ms: Date.now() - t0, body }; };
const out = { at: new Date().toISOString(), spec: specFile, results: {} };
const save = () => fs.writeFile(outFile, JSON.stringify(out, null, 1));

for (const t of spec.transcribe ?? []) {
  const fd = new FormData(); fd.set('file', await blob(t.file), path.basename(t.file)); fd.set('language', t.language ?? 'en'); fd.set('words', '1');
  out.results[`transcribe:${t.label}`] = await post(`${ASR}/transcribe`, fd); await save();
  console.log('transcribe', t.label, out.results[`transcribe:${t.label}`].status);
}
for (const a of spec.align ?? []) {
  const fd = new FormData(); fd.set('file', await blob(a.file), path.basename(a.file)); fd.set('text', a.text); fd.set('language', a.language ?? 'en'); fd.set('chars', '0');
  if (a.start !== undefined) fd.set('start', String(a.start)); if (a.end !== undefined) fd.set('end', String(a.end));
  out.results[`align:${a.label}`] = await post(`${ASR}/align`, fd); await save();
  console.log('align', a.label, out.results[`align:${a.label}`].status);
}
for (const m of spec.mouth ?? []) {
  const fd = new FormData(); fd.set('video', await blob(m.video), path.basename(m.video));
  if (m.audio) fd.set('audio', await blob(m.audio), path.basename(m.audio));
  if (m.audioOffset !== undefined) fd.set('audio_offset', String(m.audioOffset));
  if (m.windows) fd.set('windows', JSON.stringify(m.windows));
  fd.set('fps', String(m.fps ?? 24)); fd.set('mode', m.mode ?? 'speech'); fd.set('speakers', String(m.speakers ?? 1)); fd.set('max_lag_ms', String(m.maxLagMs ?? 300));
  out.results[`mouth:${m.label}`] = await post(`${ASR}/qa/mouth`, fd); await save();
  console.log('mouth', m.label, out.results[`mouth:${m.label}`].status);
}
for (const i of spec.identity ?? []) {
  const fd = new FormData(); fd.set('video', await blob(i.video), path.basename(i.video));
  for (const r of i.refs) fd.append('references', await blob(r.image), path.basename(r.image));
  fd.set('characters', JSON.stringify(i.refs.map((r) => r.characterId))); fd.set('sample_fps', String(i.sampleFps ?? 2));
  out.results[`identity:${i.label}`] = await post(`${ASR}/qa/identity`, fd); await save();
  console.log('identity', i.label, out.results[`identity:${i.label}`].status);
}
for (const s of spec.similarity ?? []) {
  const fd = new FormData(); fd.set('a', await blob(s.a), path.basename(s.a)); fd.set('b', await blob(s.b), path.basename(s.b));
  out.results[`similarity:${s.label}`] = await post(`${DESIGN}/similarity`, fd); await save();
  console.log('similarity', s.label, out.results[`similarity:${s.label}`].body?.cosine ?? out.results[`similarity:${s.label}`].status);
}
await save();
console.log('written', outFile);

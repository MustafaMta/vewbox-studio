// G13 face-reference A/B (docs/testing/CONTINUITY-VALIDATION-SHOTS.md §E): for each shot, arm A
// (settings.generation.faceReference OFF) then arm B (AUTO), the same fixed seed, one after the other — the setting is
// read by the worker when the take job runs, so each arm waits for its take to finish before the setting changes.
// The take request is the one the shot page's "New take" sends (POST /api/jobs GENERATE_TAKE {productionId, shotId,
// quality: 'final'}) plus `seed`, which the page does not expose; the setting is changed with the updateSettings
// command (the Settings page has no control for it). Writes one JSON line per arm to <out.jsonl>.
//   node g13-ab.mjs <productionId> <seed> <out.jsonl> <shotId> [shotId...]
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const [pid, seedArg, out, ...shots] = process.argv.slice(2);
const BASE = 'http://localhost:4200';
const seed = Number(seedArg);
const post = async (u, body) => { const r = await fetch(BASE + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const t = await r.text(); if (!r.ok) throw new Error(`${u} ${r.status}: ${t.slice(0, 400)}`); return JSON.parse(t); };
const get = async (u) => (await fetch(BASE + u)).json();
const setFace = (mode) => post('/api/commands', { clientId: 'acceptance-g13', batchId: `g13-${crypto.randomUUID()}`, commands: [{ name: 'updateSettings', args: [{ generation: { faceReference: mode } }], seed: crypto.randomUUID(), at: new Date().toISOString() }] });
const log = (o) => fs.appendFile(out, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'DEAD', 'AWAITING_REVIEW'];
// resume: an arm already enqueued (by an earlier run of this script) is waited for, never enqueued again
const earlier = await fs.readFile(out, 'utf8').then((t) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l))).catch(() => []);
for (const shotId of shots) {
  for (const [arm, mode] of [['A', 'OFF'], ['B', 'AUTO']]) {
    const prior = earlier.find((l) => l.shotId === shotId && l.arm === arm && l.jobId);
    if (prior) {
      if (earlier.some((l) => l.jobId === prior.jobId && TERMINAL.includes(l.state))) { console.log(shotId, arm, 'done earlier', prior.jobId); continue; }
      let j;
      for (;;) { j = (await get(`/api/jobs/${prior.jobId}`)).job; if (TERMINAL.includes(j.status)) break; await new Promise((res) => setTimeout(res, 15000)); }
      console.log(shotId, arm, 'resumed', j.status);
      await log({ shotId, arm, mode, seed, jobId: prior.jobId, state: j.status, result: j.result, error: j.error });
      continue;
    }
    await setFace(mode);
    const settings = (await get('/api/studio/settings')).settings?.generation?.faceReference;
    const r = await post('/api/jobs', { type: 'GENERATE_TAKE', payload: { productionId: pid, shotId, quality: 'final', seed } });
    const jobId = r.job?.id ?? r.id;
    console.log(shotId, arm, mode, 'setting now', settings, 'job', jobId);
    await log({ shotId, arm, mode, settingRead: settings, seed, jobId, state: 'enqueued' });
    let j;
    for (;;) { await new Promise((res) => setTimeout(res, 15000)); j = (await get(`/api/jobs/${jobId}`)).job; if (TERMINAL.includes(j.status)) break; }
    console.log(shotId, arm, j.status, JSON.stringify(j.result ?? j.error).slice(0, 300));
    await log({ shotId, arm, mode, seed, jobId, state: j.status, result: j.result, error: j.error });
  }
}
await setFace('OFF');
console.log('done; faceReference back to OFF');

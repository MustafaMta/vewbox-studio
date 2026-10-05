// Evidence bundle of one acceptance production (read-only against the live studio's GET endpoints):
//   node docs/evidence/acceptance-v1/driver/bundle.mjs <productionId> <slug> [stage-label]
// Writes docs/evidence/acceptance-v1/<slug>/: production.json (story + shot plan), characters.json, voices.json,
// locations.json, takes.json (every take: MiniMax inputs, model, seed, length, checks), jobs.json (every job of the
// production and its people/places, with attempts and errors), cut.json (cuts, audio timeline, subtitles), models.json,
// images/ (canonical images and plates as JPEG proxies + sha256 of the originals), manifest.json, and attempts.jsonl —
// APPEND-ONLY: one line per generated asset/job the first time it is seen, never rewritten, so a retry or a restart
// never overwrites an earlier attempt's record. Each run appends a line to stages.jsonl.
import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [pid, slug, stage = 'snapshot'] = process.argv.slice(2);
if (!pid || !slug) { console.error('usage: bundle.mjs <productionId> <slug> [stage]'); process.exit(2); }
const BASE = 'http://localhost:4200';
const OUT = path.resolve('docs/evidence/acceptance-v1', slug);
const LIB = path.resolve('var/library');
await fs.mkdir(path.join(OUT, 'images'), { recursive: true });
const get = async (u) => { const r = await fetch(BASE + u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };
const sha = (file) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const write = (name, data) => fs.writeFile(path.join(OUT, name), JSON.stringify(data, null, 1));

const { state } = await get('/api/studio');
const p = state.productions.find((x) => x.id === pid);
if (!p) throw new Error(`no production ${pid}`);
const asset = (id) => state.assets.find((a) => a.id === id);
const file = (a) => (a?.provenance?.path ? path.join(LIB, a.provenance.path) : undefined);
const fileInfo = async (id) => { const a = asset(id); const f = file(a); return a ? { assetId: id, path: a.provenance?.path, sha256: a.sha256 ?? (f && existsSync(f) ? await sha(f) : undefined), bytes: a.bytes, model: a.provenance?.model, workflowVersion: a.provenance?.workflowVersion, promptId: a.provenance?.promptId, seed: a.provenance?.seed } : { assetId: id, missing: true }; };
const proxy = async (id, name) => { const f = file(asset(id)); if (!f || !existsSync(f)) return undefined; const out = path.join(OUT, 'images', `${name}.jpg`); if (!existsSync(out)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-vf', 'scale=640:-2', '-q:v', '4', out]); return `images/${name}.jpg`; };

// 1) the story and the shot plan as approved (takes summarised separately)
const { shots, scenes, ...head } = p;
const plan = shots.map(({ takes, ...sh }) => ({ ...sh, takeIds: (takes ?? []).map((t) => t.id) }));
await write('production.json', { ...head, scenes, shots: plan });

// 2) characters with canonical images, 3) voice identities
const castIds = new Set([...(p.castIds ?? []), ...shots.flatMap((s) => s.characterIds ?? [])]);
const cast = state.characters.filter((c) => castIds.has(c.id));
const characters = [];
const voices = [];
for (const c of cast) {
  const img = c.canonicalImage;
  characters.push({ id: c.id, name: c.name, style: c.style, language: c.language, dialect: c.dialect, sex: c.sex, ageYears: c.ageYears, look: { build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, wardrobe: c.wardrobe, distinguishing: c.distinguishing, canon: c.canon }, canonicalImage: img ? { ...img, file: await fileInfo(img.assetId), proxy: await proxy(img.assetId, `character-${c.id}`) } : null });
  const id = c.voice?.identity;
  voices.push({ characterId: c.id, name: c.name, identity: id ?? null, referenceFile: id?.referenceAssetId ? await fileInfo(id.referenceAssetId) : null, proofFile: id?.proof?.assetId ? await fileInfo(id.proof.assetId) : null, settings: { pitch: c.voice?.pitch, pace: c.voice?.pace, timbre: c.voice?.timbre, notes: c.voice?.notes } });
}
await write('characters.json', characters);
await write('voices.json', voices);

// 4) locations
const locIds = new Set([...(p.locationIds ?? []), ...scenes.map((s) => s.locationId).filter(Boolean)]);
const locations = [];
for (const l of state.locations.filter((x) => locIds.has(x.id))) {
  const refs = [];
  for (const r of l.refs ?? []) refs.push({ ...r, file: await fileInfo(r.assetId), proxy: await proxy(r.assetId, `location-${l.id}-${r.role}-${r.timeOfDay ?? 'x'}-${r.assetId}`) });
  locations.push({ id: l.id, name: l.name, kind: l.kind, style: l.style, description: l.description, landmarks: l.landmarks, identity: l.identity, refs });
}
await write('locations.json', locations);

// 5) every take: the MiniMax inputs and the outcome
const takes = [];
for (const sh of shots) for (const t of sh.takes ?? []) {
  const { prompt, params, ...rest } = t;
  takes.push({ shotId: sh.id, shot: sh.number, boundary: sh.boundary, selected: sh.selectedTakeId === t.id, ...rest, prompt, params, video: await fileInfo(t.assetId), openingFrame: params?.identity ? undefined : undefined });
}
await write('takes.json', takes);

// 6) jobs of this production and of its people and places, with their attempts and errors
const all = (await get('/api/jobs?limit=500')).jobs;
const mine = all.filter((j) => { const pl = j.payload ?? {}; return pl.productionId === pid || castIds.has(pl.characterId) || locIds.has(pl.locationId); });
const jobs = [];
for (const j of mine) { let events = []; try { events = (await get(`/api/jobs/${j.id}`)).events ?? []; } catch { /* listed only */ } jobs.push({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, payload: j.payload, error: j.error, result: j.result, events: events.map((e) => ({ at: e.createdAt ?? e.at, level: e.level, message: e.message })) }); }
jobs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
await write('jobs.json', jobs);

// 7) the cut(s): audio timeline, joins, subtitles, loudness
const cuts = state.assets.filter((a) => a.kind === 'VIDEO' && (a.tags ?? []).includes('cut') && (a.provenance?.productionId === pid || a.label?.startsWith(p.title)));
const cutRecords = [];
for (const a of cuts) cutRecords.push({ assetId: a.id, label: a.label, createdAt: a.createdAt, current: p.cutAssetId === a.id, file: await fileInfo(a.id), provenance: a.provenance });
const exportsList = state.assets.filter((a) => (a.tags ?? []).includes('export') && (a.provenance?.productionId === pid || a.label?.startsWith(p.title)));
const exportRecords = [];
for (const a of exportsList) exportRecords.push({ assetId: a.id, label: a.label, createdAt: a.createdAt, file: await fileInfo(a.id), provenance: a.provenance });
await write('cut.json', { currentCutAssetId: p.cutAssetId, cutStale: p.cutStale, cuts: cutRecords, exports: exportRecords });

// 8) the models the generated assets name, from the registry
const registry = await get('/api/registry');
const usedModels = new Set(state.assets.filter((a) => a.provenance?.model).map((a) => a.provenance.model));
await write('models.json', { usedModelNames: [...usedModels], registryModels: registry.models.filter((m) => /minimax_h3|qwen|flux|klein|vae|lora|whisper|indextts|habibi|gemma/i.test(m.name)).map((m) => ({ name: m.name, version: m.version, sha256: m.sha256, bytes: m.bytes, status: m.status, group: m.metadata?.group })), workflows: registry.workflows.map((w) => ({ name: w.name ?? w.key, version: w.version, sha256: w.sha256 ?? w.hash })) });

// 9) the append-only attempt log: one line per job and per generated asset, written once
const logFile = path.join(OUT, 'attempts.jsonl');
const seen = new Set((existsSync(logFile) ? (await fs.readFile(logFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []));
const lines = [];
for (const j of jobs) { const key = `job:${j.id}:${j.status}:${j.attempts}`; if (!seen.has(key)) lines.push({ key, at: new Date().toISOString(), kind: 'job', id: j.id, type: j.type, status: j.status, attempts: j.attempts, startedAt: j.startedAt, finishedAt: j.finishedAt, error: j.error?.message, warnings: j.events.filter((e) => e.level === 'warn').map((e) => e.message) }); }
for (const t of takes) { const key = `take:${t.id}:${t.status}:${t.selected}`; if (!seen.has(key)) lines.push({ key, at: new Date().toISOString(), kind: 'take', id: t.id, shot: t.shot, status: t.status, selected: t.selected, jobId: t.jobId, seed: t.seed, generationMs: t.generationMs, failedChecks: (t.qa?.checks ?? []).filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail ?? ''}`) }); }
if (lines.length) await fs.appendFile(logFile, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
await fs.appendFile(path.join(OUT, 'stages.jsonl'), JSON.stringify({ at: new Date().toISOString(), stage, takes: takes.length, jobs: jobs.length, newAttemptLines: lines.length, cut: p.cutAssetId }) + '\n');

// 10) manifest
const manifest = { production: { id: p.id, title: p.title, kind: p.kind, language: p.language, stage: p.stage }, generatedBy: 'docs/evidence/acceptance-v1/driver/bundle.mjs', updatedAt: new Date().toISOString(), lastStage: stage,
  files: { 'production.json': 'story, scenes and the shot plan (prompts, staging, boundaries) as stored', 'characters.json': 'cast with canonical image records, file sha256 and proxies', 'voices.json': 'voice identities: engine, reference clip, settings, proof', 'locations.json': 'location plates with revision and sha256', 'takes.json': 'every take: MiniMax prompt, guides, references, seed, length, model, checks', 'jobs.json': 'every job with attempts, errors and events', 'cut.json': 'cuts and exports with the authoritative audio timeline, joins, subtitles, loudness', 'models.json': 'models and workflows from the registry', 'attempts.jsonl': 'append-only first-attempt/retry record', 'stages.jsonl': 'one line per bundle update', 'images/': 'JPEG proxies of canonical images and plates', 'qa.md': 'QA findings and corrections (hand-written)', 'gpu.md': 'GPU/RAM measurements (hand-written)' },
  counts: { characters: characters.length, locations: locations.length, shots: shots.length, takes: takes.length, jobs: jobs.length, cuts: cutRecords.length, exports: exportRecords.length } };
await write('manifest.json', manifest);
console.log(JSON.stringify(manifest.counts), 'new attempt lines:', lines.length);

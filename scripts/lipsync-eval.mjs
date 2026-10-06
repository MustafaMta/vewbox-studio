// LIP-SYNC CORRECTOR EVALUATION HARNESS (CPU side; docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §4 G4).
// For every clip of a set: the Tier-1 mouth check (asr /qa/mouth) against the authoritative audio placed where the take
// was conditioned on it, and SFace identity (asr /qa/identity) against each character's canonical image; for a
// corrected clip also against the ORIGINAL take's own frames (the corrected face must still be the same face), and a
// dense frame strip of the speaker's face around the syllables for looking at it.
//
//   node scripts/lipsync-eval.mjs <set.json> <outDir> [--variant original|<suffix>] [--asr http://127.0.0.1:8030]
//
// set.json: { "items": [ { "name", "video", "audio", "audioOffset", "speaker": "<characterId>",
//             "refs": [ { "characterId", "image" } ], "corrected": { "<suffix>": "<file>" } } ] }
// Writes <outDir>/<variant>/<name>.json and strips <outDir>/<variant>/<name>-strip.jpg. Media stays outside Git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [setFile, outDir, ...rest] = process.argv.slice(2);
if (!setFile || !outDir) { console.error('usage: lipsync-eval.mjs <set.json> <outDir> [--variant original|<suffix>] [--asr url]'); process.exit(2); }
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const variant = opt('--variant', 'original');
const ASR = opt('--asr', 'http://127.0.0.1:8030').replace(/\/$/, '');
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));
const dir = path.join(outDir, variant);
fs.mkdirSync(dir, { recursive: true });

// the asr service is shared (the worker's takes use it too): a dropped connection is retried
async function post(route, fields) {
  for (let i = 1; ; i++) {
    try { return await postOnce(route, fields); } catch (e) { if (i >= 4) throw e; console.log(`${route}: ${e.message} — retry ${i}`); await new Promise((r) => setTimeout(r, 15_000 * i)); }
  }
}
async function postOnce(route, fields) {
  const fd = new FormData();
  for (const [k, v] of fields) {
    if (v && typeof v === 'object' && v.file) fd.append(k, new Blob([fs.readFileSync(v.file)]), path.basename(v.file));
    else fd.append(k, String(v));
  }
  const r = await fetch(`${ASR}${route}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(20 * 60_000) });
  const t = await r.text();
  if (!r.ok) return { available: false, status: r.status, reason: t.slice(0, 400) };
  return JSON.parse(t);
}

/** Frames of the clip as a contact strip: every `step`-th frame from `from` s for `n` frames, cropped to `box`. */
function strip(video, box, out, { from = 0, n = 24, step = 1, fps = 24, cols = 8 } = {}) {
  const [x0, y0, x1, y1] = box;
  const pad = 0.35;
  const w = x1 - x0, h = y1 - y0;
  const cx = Math.max(0, Math.round(x0 - w * pad)), cy = Math.max(0, Math.round(y0 - h * pad * 0.6));
  const cw = Math.round(w * (1 + 2 * pad)), ch = Math.round(h * (1 + 2 * pad * 0.9));
  const vf = `select='gte(n\\,${Math.round(from * fps)})*not(mod(n-${Math.round(from * fps)}\\,${step}))',crop=${cw}:${ch}:${cx}:${cy},scale=200:-2,tile=${cols}x${Math.ceil(n / cols)}:padding=2`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', vf, '-frames:v', '1', '-q:v', '3', out]);
}

for (const it of set.items) {
  // a corrected clip: named in the set, else where docker/lipsync/eval_batch.py writes it (<outDir>/out/<variant>/<name>.mp4)
  const video = variant === 'original' ? it.video : it.corrected?.[variant] ?? path.join(outDir, 'out', variant, `${it.name}.mp4`);
  if (!video || !fs.existsSync(video)) { console.log(`${it.name}: no ${variant} file`); continue; }
  const t0 = Date.now();
  const mouth = await post('/qa/mouth', [['video', { file: video }], ['audio', { file: it.audio }], ['audio_offset', it.audioOffset ?? 0], ['fps', 24], ['mode', 'speech'], ['speakers', 1], ['max_lag_ms', 250]]);
  const refs = it.refs ?? [];
  const identity = refs.length ? await post('/qa/identity', [['video', { file: video }], ...refs.map((r) => ['references', { file: r.image }]), ['characters', JSON.stringify(refs.map((r) => r.characterId))], ['sample_fps', 4]]) : null;
  // the corrected face against the original take's own face (same track): the frame of the original as a reference
  // (the frame: the original take's first frame where the speaker was found, the same frame for every variant)
  let selfIdentity = null;
  const origJson = path.join(outDir, 'original', `${it.name}.json`);
  const origId = variant === 'original' ? identity : (fs.existsSync(origJson) ? JSON.parse(fs.readFileSync(origJson, 'utf8')).raw?.identity : null);
  if (it.speaker && origId?.characters?.[it.speaker]?.series?.length) {
    const ref = path.join(dir, `${it.name}-origframe.png`);
    const s = origId.characters[it.speaker].series.find((x) => x.cosine !== null);
    if (s) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(s.t), '-i', it.video, '-frames:v', '1', ref]);
      selfIdentity = await post('/qa/identity', [['video', { file: video }], ['references', { file: ref }], ['characters', JSON.stringify(['original-frame'])], ['sample_fps', 4]]);
    }
  }
  const sp = mouth.tracks?.find((t) => t.is_speaker) ?? mouth.tracks?.[0];
  const rec = {
    name: it.name, variant, video, audio: it.audio, audioOffset: it.audioOffset ?? 0, ms: Date.now() - t0,
    mouth: mouth.available === false ? mouth : { speaker: sp ? { id: sp.id, face_height_px: sp.face_height_px, corr_best: sp.corr_best, corr_lag0: sp.corr_lag0, best_lag_frames: sp.best_lag_frames, activity_ratio: sp.activity_ratio, activity_inside: sp.activity_inside, activity_outside: sp.activity_outside, flags: sp.flags, mean_box: sp.mean_box } : null, tracks: mouth.tracks?.length, speech_frames: mouth.speech_frames, windows_source: mouth.windows_source },
    identity: identity && identity.available !== false ? Object.fromEntries(Object.entries(identity.characters).map(([k, v]) => [k, v.summary])) : identity,
    selfIdentity: selfIdentity && selfIdentity.available !== false ? selfIdentity.characters['original-frame'].summary : selfIdentity,
  };
  fs.writeFileSync(path.join(dir, `${it.name}.json`), JSON.stringify({ ...rec, raw: { mouth, identity } }, null, 1));
  if (sp?.mean_box) {
    try { strip(video, sp.mean_box, path.join(dir, `${it.name}-strip.jpg`), { from: (it.audioOffset ?? 0) + (it.stripFrom ?? 0.3), n: 32, step: 1 }); } catch (e) { console.log(`strip failed: ${e.message}`); }
  }
  console.log(JSON.stringify({ name: rec.name, variant, mouth: rec.mouth.speaker ?? rec.mouth, identity: rec.identity, selfIdentity: rec.selfIdentity }));
}

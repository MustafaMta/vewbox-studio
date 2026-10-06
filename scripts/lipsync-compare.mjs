// LIP-SYNC EVALUATION TABLE: original vs a corrected variant, per clip (after scripts/lipsync-eval.mjs ran on both and
// docker/lipsync/eval_batch.py wrote the corrector's reports), plus a dense before/after strip of the speaker's mouth
// for looking at it.
//
//   node scripts/lipsync-compare.mjs <evDir> <variant> [--strips]
//
// Reads <evDir>/original/<name>.json, <evDir>/<variant>/<name>.json (QA) and <evDir>/out/<variant>/<name>.json (the
// corrector's report); writes <evDir>/compare-<variant>.json and, with --strips, <evDir>/look/<variant>/<name>-*.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [evDir, variant, ...rest] = process.argv.slice(2);
if (!evDir || !variant) { console.error('usage: lipsync-compare.mjs <evDir> <variant> [--strips]'); process.exit(2); }
const strips = rest.includes('--strips');
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
const rows = [];
for (const f of fs.readdirSync(path.join(evDir, variant)).filter((x) => x.endsWith('.json'))) {
  const name = f.replace(/\.json$/, '');
  const after = read(path.join(evDir, variant, f));
  const before = read(path.join(evDir, 'original', f));
  const rep = read(path.join(evDir, 'out', variant, f));
  if (!after || !rep) continue;
  const sp = (x) => x?.mouth?.speaker ?? {};
  const canon = (x) => Object.fromEntries(Object.entries(x?.identity ?? {}).map(([k, v]) => [k, r2(v?.median)]));
  const row = {
    name,
    frames: rep.frames, outFrames: rep.out_frames, edited: rep.track?.frames_edited, fullStrength: rep.track?.frames_full_strength, profile: rep.track?.frames_profile,
    occluded: rep.occlusion?.frames?.length ?? 0, faceHeightPx: rep.track?.face_height_px?.median,
    corr: { before: r2(sp(before).corr_best), after: r2(sp(after).corr_best) }, lag: { before: sp(before).best_lag_frames ?? null, after: sp(after).best_lag_frames ?? null },
    ratio: { before: r2(sp(before).activity_ratio), after: r2(sp(after).activity_ratio) },
    canonical: { before: canon(before), after: canon(after) }, self: { before: r2(before?.selfIdentity?.median), after: r2(after?.selfIdentity?.median) },
    mouthChangeMad: rep.mouth_change_mad, modelS: rep.timing_s?.model, totalS: rep.timing_s?.total, vramReservedMb: rep.vram_peak_reserved_mb,
  };
  rows.push(row);
  if (strips && before?.video && after?.video) {
    const dir = path.join(evDir, 'look', variant); fs.mkdirSync(dir, { recursive: true });
    const tj = read(path.join(evDir, 'out', variant, name, 'track.json'));
    // the speaker's box at the middle of the edited frames, the mouth half of the face, 2× enlarged; 16 frames
    const edited = (tj?.strength ?? []).map((s, i) => [s, i]).filter(([s]) => s > 0.99).map(([, i]) => i);
    const mid = edited.length ? edited[Math.floor(edited.length / 2)] : 0;
    const b = tj?.boxes?.[mid] ?? tj?.boxes?.find(Boolean);
    if (b) {
      const w = b[2] - b[0], h = b[3] - b[1];
      const cx = Math.max(0, Math.round(b[0] - 0.15 * w)), cy = Math.max(0, Math.round(b[1] + 0.35 * h));
      const cw = Math.round(1.3 * w), ch = Math.round(0.85 * h);
      const from = Math.max(0, mid - 8);
      const sel = `select='between(n\\,${from}\\,${from + 15})',crop=${cw}:${ch}:${cx}:${cy},scale=240:-2,tile=16x1`;
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', before.video, '-i', after.video, '-filter_complex', `[0]${sel}[a];[1]${sel}[b];[a][b]vstack`, '-frames:v', '1', '-q:v', '3', path.join(dir, `${name}-mouth-${from}.jpg`)]);
        row.strip = path.join(dir, `${name}-mouth-${from}.jpg`);
      } catch (e) { row.strip = `failed: ${e.message.slice(0, 120)}`; }
    }
  }
  console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(evDir, `compare-${variant}.json`), JSON.stringify(rows, null, 1));

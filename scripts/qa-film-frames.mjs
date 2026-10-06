// Independent film QA helper (2026-10-06): small grey frames of a video, decoded with ffmpeg, compared by mean absolute
// difference (0–255). CPU only.
//   node scripts/qa-film-frames.mjs match <a.mp4> <aFrom> <aTo> <b.mp4> <bFrom> <bTo>   best match of each b frame in a
//   node scripts/qa-film-frames.mjs series <file.mp4> [from] [to]                        frame-to-frame differences
//   node scripts/qa-film-frames.mjs dups <file.mp4>                                       repeated runs (diff < 0.6)
import { execFileSync } from 'node:child_process';

const W = 96, H = 54;
function frames(file, from = 0, to = 1e9) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=between(n\\,${from}\\,${to}),scale=${W}:${H}:flags=area,format=gray`, '-fps_mode', 'passthrough','-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const n = buf.length / (W * H); const out = [];
  for (let i = 0; i < n; i++) out.push(buf.subarray(i * W * H, (i + 1) * W * H));
  return out;
}
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'match') {
  const [fa, af, at, fb, bf, bt] = a; const A = frames(fa, +af, +at), B = frames(fb, +bf, +bt);
  B.forEach((fr, j) => { const d = A.map((x, i) => [i + +af, mad(x, fr)]).sort((x, y) => x[1] - y[1]); console.log(`b ${+bf + j}: best a ${d[0][0]} (${d[0][1].toFixed(2)}), next a ${d[1][0]} (${d[1][1].toFixed(2)})`); });
} else if (cmd === 'series') {
  const [f, from = 0, to = 1e9] = a; const F = frames(f, +from, +to);
  console.log(F.slice(1).map((x, i) => `${+from + i}->${+from + i + 1}:${mad(F[i], x).toFixed(2)}`).join('  '));
} else if (cmd === 'dups') {
  const F = frames(a[0]); let run = null; const runs = [];
  for (let i = 1; i < F.length; i++) { const d = mad(F[i - 1], F[i]); if (d < 0.6) { run ??= [i - 1, i]; run[1] = i; } else if (run) { runs.push(run); run = null; } }
  if (run) runs.push(run);
  console.log(`${F.length} frames; near-identical runs (diff < 0.6): ${runs.map((r) => `${r[0]}–${r[1]}`).join(', ') || 'none'}`);
}

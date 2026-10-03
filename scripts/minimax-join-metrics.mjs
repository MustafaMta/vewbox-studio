// Join metrics for a continuation (docs/research/MINIMAX-CONTINUITY.md §3.6, a first measurement towards E3):
//   node scripts/minimax-join-metrics.mjs <previous.mp4> <continuation.mp4> [guideFrames=22]
// Picture: per-frame PSNR and SSIM of the regenerated head against the previous take's tail (how closely the guide is
// re-rendered), and the join pair (the previous take's last frame → the continuation's first kept frame) against
// consecutive-frame values inside both takes (the join passes when its PSNR is no worse than the 5th percentile of
// the intra-shot PSNR). Sound: RMS (dBFS) of the 200 ms either side of the join, and of the anchored head against the
// previous tail.
import { execFileSync, spawnSync } from 'node:child_process';

const [prev, next, g = '22'] = process.argv.slice(2);
if (!prev || !next) { console.error('usage: node scripts/minimax-join-metrics.mjs <previous.mp4> <continuation.mp4> [guideFrames]'); process.exit(2); }
const G = Number(g);
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }); return `${r.stdout}\n${r.stderr}`; };
const frames = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());

/** per-frame PSNR and SSIM between frames [a0, a0+n) of A and [b0, b0+n) of B */
function compare(A, a0, B, b0, n) {
  const graph = `[0:v]trim=start_frame=${a0}:end_frame=${a0 + n},setpts=PTS-STARTPTS,format=yuv420p,split[a1][a2];[1:v]trim=start_frame=${b0}:end_frame=${b0 + n},setpts=PTS-STARTPTS,format=yuv420p,split[b1][b2];[a1][b1]psnr=stats_file=-[p];[a2][b2]ssim=stats_file=-[s]`;
  const out = ffmpeg(['-i', A, '-i', B, '-filter_complex', graph, '-map', '[p]', '-f', 'null', '-', '-map', '[s]', '-f', 'null', '-']);
  return {
    psnr: [...out.matchAll(/psnr_avg:([\d.]+|inf)/g)].map((m) => (m[1] === 'inf' ? 99 : Number(m[1]))),
    ssim: [...out.matchAll(/All:([\d.]+)/g)].map((m) => Number(m[1])),
  };
}
const pct = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.max(0, Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1))))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** overall RMS level (dBFS) of [from, from+dur) */
function rms(file, from, dur) {
  const out = ffmpeg(['-ss', from.toFixed(4), '-t', dur.toFixed(4), '-i', file, '-vn', '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-']);
  const m = [...out.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)].map((x) => (x[1] === '-inf' ? -120 : Number(x[1])));
  return m.length ? m[m.length - 1] : NaN;
}

const nPrev = frames(prev); const nNext = frames(next);
const head = compare(prev, nPrev - G, next, 0, G);
const join = compare(prev, nPrev - 1, next, G, 1);
const intraPrev = compare(prev, nPrev - 25, prev, nPrev - 24, 24);
const intraNext = compare(next, G, next, G + 1, 24);
const intra = [...intraPrev.psnr, ...intraNext.psnr];
console.log(JSON.stringify({
  frames: { previous: nPrev, continuation: nNext, guide: G },
  head: { psnrMean: +mean(head.psnr).toFixed(2), psnrMin: +Math.min(...head.psnr).toFixed(2), ssimMean: +mean(head.ssim).toFixed(4), psnr: head.psnr },
  join: { psnr: join.psnr[0], ssim: join.ssim[0] },
  intra: { psnrP5: pct(intra, 5), psnrMedian: pct(intra, 50), psnrMin: Math.min(...intra), ssimMedian: pct([...intraPrev.ssim, ...intraNext.ssim], 50) },
  joinPasses: join.psnr[0] >= pct(intra, 5),
  audio: {
    previousLast200msDb: +rms(prev, nPrev / 24 - 0.2, 0.2).toFixed(1),
    continuationFirstKept200msDb: +rms(next, G / 24, 0.2).toFixed(1),
    previousTailDb: +rms(prev, (nPrev - G) / 24, G / 24).toFixed(1),
    continuationHeadDb: +rms(next, 0, G / 24).toFixed(1),
  },
}, null, 2));

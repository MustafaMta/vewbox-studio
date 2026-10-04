import { describe, expect, it } from 'vitest';
import { LIBRARY_FILE, fileAssetId, planGc } from '@/server/media/gc';
import { jobStamp } from '@/server/jobs/outputs';

/** THE ORPHAN-FILE COLLECTOR'S RULES (src/server/media/gc.ts, step 15), pure: only a library-laid-out file that no
 *  record refers to, that is not a running job's and is older than the grace period, is an orphan. */

const NOW = Date.parse('2026-10-04T12:00:00Z');
const old = NOW - 3 * 24 * 3600_000;
const f = (p: string, mtimeMs = old, bytes = 10) => ({ path: p, bytes, mtimeMs });

describe('which library files are orphans', () => {
  it('keeps referenced files, their thumbnails, files of known assets, running jobs and recent files; reports unknown layouts', () => {
    const running = 'job-running-1';
    const refs = { paths: new Set(['video/2026/10/take-1.mp4', 'image/2026/10/pic-1.png']), assetIds: new Set(['take-1', 'pic-1', 'gen-moved']), activeJobStamps: [jobStamp(running)] };
    const plan = planGc([
      f('video/2026/10/take-1.mp4'),
      f('video/2026/10/take-1.thumb.jpg'),
      f('image/2026/10/pic-1.png'),
      f('image/2026/09/gen-moved.a2.png'), // named for an asset that has a row elsewhere
      f(`video/2026/10/gen-${jobStamp(running)}abcd1234.a1.mp4`), // a job still running
      f('audio/2026/10/up-recent.wav', NOW - 3600_000), // within the grace period
      f('audio/2026/10/up-orphan.wav', old, 1234), // nothing refers to it
      f('video/2026/10/gen-crashed.a1.mp4', old, 99), // a crash between the file and its record
      f('notes/readme.txt'), f('video/2026/take-x.mp4'), // not the library's layout
    ], refs, { now: NOW });
    expect(plan.candidates.map((c) => c.path)).toEqual(['audio/2026/10/up-orphan.wav', 'video/2026/10/gen-crashed.a1.mp4']);
    expect(plan.bytes).toBe(1333);
    expect(plan.kept).toEqual({ referenced: 2, 'thumbnail of a referenced file': 1, 'asset row exists': 1, 'job in progress': 1, 'too recent': 1 });
    expect(plan.unknown).toEqual(['notes/readme.txt', 'video/2026/take-x.mp4']);
    expect(plan.scanned).toBe(10);
  });

  it('the layout and the id a file is named for', () => {
    expect(LIBRARY_FILE.test('subtitle/2026/10/sub-1.srt')).toBe(true);
    expect(LIBRARY_FILE.test('../video/2026/10/x.mp4')).toBe(false);
    expect(LIBRARY_FILE.test('.gc-trash/2026/10/x.mp4')).toBe(false);
    expect(fileAssetId('video/2026/10/gen-abc.a2.mp4')).toBe('gen-abc');
  });

  it('a grace period of zero still keeps everything referenced', () => {
    const plan = planGc([f('image/2026/10/pic-1.png', NOW)], { paths: new Set(['image/2026/10/pic-1.png']), assetIds: new Set(), activeJobStamps: [] }, { now: NOW, graceMs: 0 });
    expect(plan.candidates).toEqual([]);
  });
});

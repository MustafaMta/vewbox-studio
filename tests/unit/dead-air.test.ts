import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEAD_AIR_SECONDS, parseSilences, silentStretches } from '@/server/media/assembly';
import { ffmpeg } from '@/server/media/ffmpeg';

/** DEAD AIR (producer directive: intentional silence is valid; accidental dead silence is not): the finished film's
 *  silent stretches are measured, and one longer than DEAD_AIR_SECONDS that the plan did not declare fails the export. */
describe('dead air in a finished film', () => {
  it('reads silencedetect\'s log; a stretch still open at the end runs to the end', () => {
    const log = '[silencedetect @ 0x1] silence_start: 2.5\n[silencedetect @ 0x1] silence_end: 8.25 | silence_duration: 5.75\n[silencedetect @ 0x1] silence_start: 12\n';
    expect(parseSilences(log, 15)).toEqual([{ start: 2.5, end: 8.25 }, { start: 12, end: 15 }]);
    expect(DEAD_AIR_SECONDS).toBe(4);
  });

  it('finds a real dead stretch in audio (tone, 6 s of silence, tone)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-air-'));
    const f = path.join(dir, 'mix.wav');
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=2', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=6', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=2', '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1', f]);
    const s = await silentStretches(f, -50, 1.0);
    expect(s).toHaveLength(1);
    expect(s[0].start).toBeCloseTo(2, 0); expect(s[0].end).toBeCloseTo(8, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

import { describe, expect, it } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpeg, padAudio } from '@/server/media/ffmpeg';
import { ffprobe } from '@/server/media';

/** The dialogue guide runs to the clip's last frame (src/worker/handlers/take.ts): a short line's soundtrack is padded
 *  with silence so local MiniMax H3 (never fewer than 124 frames) has nothing unguided to fill with more speech. */
describe('the dialogue guide is padded with silence to the clip', () => {
  it('a 1 s line becomes a 3.5 s guide whose last 2.5 s are silent', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pad-'));
    const line = path.join(dir, 'line.wav');
    await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '48000', '-ac', '1', line]);
    const out = await padAudio(line, path.join(dir, 'guide.wav'), 3.5);
    expect((await ffprobe(out)).durationSeconds).toBeCloseTo(3.5, 2);
    // the padded stretch carries no sound: 48 kHz s16 mono, 1.2 s onwards
    const pcm = await fsp.readFile(out);
    const data = pcm.subarray(pcm.indexOf('data') + 8);
    let peak = 0;
    for (let i = Math.round(1.2 * 48000) * 2; i + 1 < data.length; i += 2) peak = Math.max(peak, Math.abs(data.readInt16LE(i)));
    expect(peak).toBe(0);
    await fsp.rm(dir, { recursive: true, force: true });
  });
});

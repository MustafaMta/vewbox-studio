import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ffmpeg, measureLoudness } from '@/server/media/ffmpeg';
import { loudness } from '@/server/media/voice-check';

/** ComfyUI writes its workflow (JSON, with newlines inside its strings) into every FLAC it saves; ffmpeg prints a
 *  file's tags before the loudnorm block. The measurement must read loudnorm's own block, not the first brace —
 *  Harbour Lights' song measured "not measured" because of it. */
describe('loudness of a file whose tags hold JSON', () => {
  it('reads the loudnorm block, not the tags', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loud-tags-'));
    const file = path.join(dir, 'song.flac');
    const prompt = JSON.stringify({ '1': { inputs: { tags: 'city pop\nsoft drums' }, class_type: 'X' } }).replace('\\n', '\n');
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-metadata', `prompt=${prompt}`, '-c:a', 'flac', file]);
    const l = await loudness(file);
    expect(Number.isFinite(l.integratedLufs)).toBe(true);
    expect(Number.isFinite(l.truePeakDbtp)).toBe(true);
    const m = await measureLoudness(file);
    expect(m && Number.isFinite(m.integrated)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

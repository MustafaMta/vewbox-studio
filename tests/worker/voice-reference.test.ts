import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffprobe } from '@/server/media';
import { measureLoudness } from '@/server/media/ffmpeg';
import { measureVoiceReference, REFERENCE_WINDOW } from '@/server/studio/voice-reference';
import type { transcribe } from '@/server/providers/speech';

/** THE VOICE REFERENCE MEASUREMENT on real files with ffmpeg (the transcription service is NOT called — it shares the
 *  GPU with production; a fake answers in its place). No database. */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-voiceref-'));
const gen = (name: string, seconds: number, opts: { lufs?: string; silenceLead?: number; stereo48?: boolean; rate?: number } = {}) => {
  const f = path.join(tmp, name);
  // a "voice": a tone that pulses (speech-like on/off) after an optional silent lead, at a chosen level; with this
  // chain the integrated loudness measures (−26 + volume) LUFS, so 8dB ≈ −18 LUFS
  const pulse = `sine=frequency=220:sample_rate=${opts.rate ?? 44100},volume=${opts.lufs ?? '8dB'},tremolo=f=2.5:d=0.9`;
  const lead = opts.silenceLead ?? 0;
  const filter = lead ? `[0:a]adelay=${Math.round(lead * 1000)}:all=1[a]` : `[0:a]anull[a]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', pulse, '-filter_complex', filter, '-map', '[a]', '-t', String(seconds + lead), '-ac', opts.stereo48 ? '2' : '1', '-ar', String(opts.stereo48 ? 48000 : opts.rate ?? 44100), '-c:a', 'pcm_s16le', f]);
  return f;
};
const asr = (text: string, language = 'en'): typeof transcribe => async () => { const words = text.split(/\s+/).filter(Boolean); return { language, languageProbability: 0.97, duration: 3, text, segments: [{ start: 0, end: 3, text, words: words.map((w, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25, word: w, probability: 0.9 })) }], ms: 1, model: 'fake' }; };

let good: string; let short: string; let long: string; let quiet: string; let leading: string;
beforeAll(() => {
  good = gen('good.wav', 8, { stereo48: true });
  short = gen('short.wav', 1);
  long = gen('long.wav', 60);
  quiet = gen('quiet.wav', 8, { lufs: '-19dB' }); // ≈ −45 LUFS
  leading = gen('leading.wav', 20, { silenceLead: 2.5 });
}, 120_000);
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('measureVoiceReference', () => {
  it('a stereo 48 kHz recording passes; the stored window is mono 24 kHz, ≤ 12 s, near −20 LUFS, under −1 dBTP; the transcript is kept', async () => {
    const r = await measureVoiceReference(good, { probe: await ffprobe(good), expectLanguage: 'EN', trimmedOut: path.join(tmp, 'good-24k.wav'), transcribe: asr('the last bus to karrada leaves at midnight') });
    expect(r.refusal).toBeNull();
    expect(r.validation).toMatchObject({ channels: 2, sampleRate: 48000, speech: { present: true, words: 8, language: 'EN', transcript: 'the last bus to karrada leaves at midnight' } });
    expect(r.validation.durationSeconds).toBeCloseTo(8, 0);
    expect(r.validation.integratedLufs).toBeGreaterThan(-30); expect(r.validation.integratedLufs).toBeLessThan(-10);
    const p = await ffprobe(r.trimmedFile);
    expect(p.channels).toBe(1); expect(p.sampleRate).toBe(REFERENCE_WINDOW.sampleRate);
    expect(p.durationSeconds!).toBeLessThanOrEqual(REFERENCE_WINDOW.maxSeconds + 0.2);
    const l = (await measureLoudness(r.trimmedFile))!;
    expect(Math.abs(l.integrated - REFERENCE_WINDOW.targetLufs)).toBeLessThan(1.5);
    expect(l.truePeak).toBeLessThanOrEqual(REFERENCE_WINDOW.truePeakDbtp + 0.3);
  }, 60_000);
  it('a 1 s clip is TOO_SHORT and a 60 s file TOO_LONG before any window is cut or the service asked', async () => {
    let asked = 0;
    const count: typeof transcribe = async (...a) => { asked++; return asr('x y z')(...a); };
    const s = await measureVoiceReference(short, { probe: await ffprobe(short), trimmedOut: path.join(tmp, 's.wav'), transcribe: count });
    expect(s.refusal?.code).toBe('TOO_SHORT');
    const l = await measureVoiceReference(long, { probe: await ffprobe(long), trimmedOut: path.join(tmp, 'l.wav'), transcribe: count });
    expect(l.refusal?.code).toBe('TOO_LONG');
    expect(asked).toBe(0);
    expect(fs.existsSync(path.join(tmp, 's.wav'))).toBe(false);
  }, 60_000);
  it('a −45 LUFS recording is TOO_QUIET; silence heard as nothing is NO_SPEECH; Arabic heard for an English voice is WRONG_LANGUAGE', async () => {
    const q = await measureVoiceReference(quiet, { probe: await ffprobe(quiet), trimmedOut: path.join(tmp, 'q.wav'), transcribe: asr('x y z') });
    expect(q.refusal?.code).toBe('TOO_QUIET');
    const n = await measureVoiceReference(good, { probe: await ffprobe(good), trimmedOut: path.join(tmp, 'n.wav'), transcribe: asr('') });
    expect(n.refusal?.code).toBe('NO_SPEECH');
    const w = await measureVoiceReference(good, { probe: await ffprobe(good), expectLanguage: 'EN', trimmedOut: path.join(tmp, 'w.wav'), transcribe: asr('هلا شلونك اليوم', 'ar') });
    expect(w.refusal?.code).toBe('WRONG_LANGUAGE');
    expect(w.validation.speech.language).toBe('AR');
  }, 60_000);
  it('a 20 s file with a silent head: the window starts at the first speech, not at zero, and is at most 12 s', async () => {
    const r = await measureVoiceReference(leading, { probe: await ffprobe(leading), trimmedOut: path.join(tmp, 'lead-24k.wav'), transcribe: asr('one two three four') });
    expect(r.refusal).toBeNull();
    expect(r.window.from).toBeGreaterThan(1.5);
    expect(r.window.to - r.window.from).toBeLessThanOrEqual(12.2);
    const p = await ffprobe(r.trimmedFile);
    expect(p.durationSeconds!).toBeLessThanOrEqual(12.2);
  }, 60_000);
});

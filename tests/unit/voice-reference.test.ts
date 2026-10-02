import { describe, expect, it } from 'vitest';
import { REFERENCE_RULES, chooseWindow, judgeFormat, judgeReference, judgeSpeech, parseSilences, staticGainDb } from '@/server/studio/voice-reference';

/** The rules a voice reference must pass and how its window is chosen — pure, so they run without ffmpeg or the
 *  transcription service (the measuring path is exercised in tests/worker/voice-reference.test.ts). */

const good = { durationSeconds: 8, sampleRate: 48000, channels: 2, integratedLufs: -18, truePeakDbtp: -3 };
const speech = (words: number, language: 'AR' | 'EN' | 'UNKNOWN' = 'EN', confidence = 0.95) => ({ present: words >= REFERENCE_RULES.minWords, words, language, transcript: 'x '.repeat(words).trim(), confidence });

describe('judgeFormat', () => {
  it('accepts 3–30 s at ≥ 16 kHz between −30 and −10 LUFS without clipping', () => {
    expect(judgeFormat(good)).toBeNull();
    expect(judgeFormat({ ...good, durationSeconds: 3, integratedLufs: -30, sampleRate: 16000 })).toBeNull();
  });
  it('names the refusal: TOO_SHORT, TOO_LONG, BAD_FORMAT (rate, unreadable), TOO_QUIET, CLIPPING', () => {
    expect(judgeFormat({ ...good, durationSeconds: 1 })?.code).toBe('TOO_SHORT');
    expect(judgeFormat({ ...good, durationSeconds: 60 })?.code).toBe('TOO_LONG');
    expect(judgeFormat({ ...good, sampleRate: 8000 })?.code).toBe('BAD_FORMAT');
    expect(judgeFormat({ ...good, durationSeconds: 0, sampleRate: 0 })?.code).toBe('BAD_FORMAT');
    expect(judgeFormat({ ...good, integratedLufs: -45 })?.code).toBe('TOO_QUIET');
    expect(judgeFormat({ ...good, integratedLufs: Number.NEGATIVE_INFINITY })?.code).toBe('TOO_QUIET');
    expect(judgeFormat({ ...good, truePeakDbtp: 0.4 })?.code).toBe('CLIPPING');
    expect(judgeFormat({ ...good, integratedLufs: -6, truePeakDbtp: -0.5 })?.code).toBe('CLIPPING');
  });
});

describe('judgeSpeech', () => {
  it('needs at least three heard words (NO_SPEECH) in the expected language (WRONG_LANGUAGE), unless unsure', () => {
    expect(judgeSpeech(speech(12), 'EN')).toBeNull();
    expect(judgeSpeech(speech(0), 'EN')?.code).toBe('NO_SPEECH');
    expect(judgeSpeech(speech(2), 'EN')?.code).toBe('NO_SPEECH');
    expect(judgeSpeech(speech(12, 'AR'), 'EN')?.code).toBe('WRONG_LANGUAGE');
    expect(judgeSpeech(speech(12, 'EN'), 'AR')?.code).toBe('WRONG_LANGUAGE');
    expect(judgeSpeech(speech(12, 'EN', 0.4), 'AR')).toBeNull(); // not confident enough to refuse
    expect(judgeSpeech(speech(12, 'UNKNOWN'), 'AR')).toBeNull();
    expect(judgeSpeech(speech(12, 'AR'), undefined)).toBeNull();
    expect(judgeReference({ ...good, speech: speech(5, 'AR') }, 'AR')).toBeNull();
    expect(judgeReference({ ...good, durationSeconds: 2, speech: speech(0) }, 'AR')?.code).toBe('TOO_SHORT'); // format first
  });
});

describe('parseSilences', () => {
  it('pairs silence_start and silence_end lines and leaves an open silence running to the end', () => {
    const stderr = '[silencedetect] silence_start: 0\n[silencedetect] silence_end: 1.2 | silence_duration: 1.2\nsilence_start: 5.5\nsilence_end: 6.1\nsilence_start: 9.9\n';
    expect(parseSilences(stderr)).toEqual([{ start: 0, end: 1.2 }, { start: 5.5, end: 6.1 }, { start: 9.9, end: Number.POSITIVE_INFINITY }]);
    expect(parseSilences('')).toEqual([]);
  });
});

describe('chooseWindow', () => {
  it('starts at the first speech, not the head of the file, and ends at a silence boundary within 12 s', () => {
    // 1.2 s of lead silence, speech 1.2–5.5, gap, speech 6.1–9.9, gap, speech 10.4–16, tail to 20
    const w = chooseWindow([{ start: 0, end: 1.2 }, { start: 5.5, end: 6.1 }, { start: 9.9, end: 10.4 }, { start: 16, end: 20 }], 20);
    expect(w.from).toBeCloseTo(1.05, 2); // a short lead-in before the first word
    expect(w.to).toBeCloseTo(10.0, 1); // the second region ends at 9.9; the third would run to 16 (> 12 s)
    expect(w.to - w.from).toBeLessThanOrEqual(12);
  });
  it('cuts a single long speech region at the limit and takes a short file whole', () => {
    const long = chooseWindow([{ start: 0, end: 0.5 }], 30);
    expect(long.from).toBeCloseTo(0.35, 2); expect(long.to - long.from).toBeLessThanOrEqual(12.1); expect(long.to - long.from).toBeGreaterThan(11.9);
    const short = chooseWindow([], 4);
    expect(short).toEqual({ from: 0, to: 4 });
    const shortWithLead = chooseWindow([{ start: 0, end: 0.4 }], 5);
    expect(shortWithLead.from).toBeCloseTo(0.25, 2); expect(shortWithLead.to).toBe(5);
  });
  it('never returns a window shorter than the minimum when the file allows it', () => {
    const w = chooseWindow([{ start: 0, end: 1 }, { start: 2, end: 20 }], 20);
    expect(w.to - w.from).toBeGreaterThanOrEqual(3);
  });
});

describe('staticGainDb', () => {
  it('brings the loudness to −20 LUFS unless the true peak would pass −1 dBTP, and leaves silence alone', () => {
    expect(staticGainDb({ integrated: -26, truePeak: -8 })).toBe(6);
    expect(staticGainDb({ integrated: -26, truePeak: -3 })).toBe(2); // peak-limited: only 2 dB of headroom
    expect(staticGainDb({ integrated: -14, truePeak: -1 })).toBe(-6);
    expect(staticGainDb({ integrated: -90, truePeak: -80 })).toBe(0);
  });
});

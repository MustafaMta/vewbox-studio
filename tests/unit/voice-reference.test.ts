import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFERENCE_RULES, heardSpeech, judgeSpeech, measureVoiceReference } from '@/server/studio/voice-reference';
import type { transcribe } from '@/server/providers/speech';

/** The speech judgement of a voice reference, and the upload's measurement composed from THE one measurement stack
 *  (src/server/media/voice-check.ts — finding 9): format, level, clipping, provenance and window come from there, the
 *  heard words and language from here. Real ffmpeg on synthetic files; the transcription service is faked. */

const execFileP = promisify(execFile);
let dir: string;
const make = async (name: string, expr: string, seconds: number, extra: string[] = []) => { const out = path.join(dir, name); await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=24000:d=${seconds}`, ...extra, '-c:a', 'pcm_s16le', out]); return out; };
beforeAll(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'voice-ref-')); });
afterAll(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

const speech = (words: number, language: 'AR' | 'EN' | 'UNKNOWN' = 'EN', confidence = 0.95) => ({ present: words >= REFERENCE_RULES.minWords, words, language, transcript: 'x '.repeat(words).trim(), confidence });
const asr = (text: string, language = 'en', probability = 0.97): { fn: typeof transcribe; calls: number } => { const o = { calls: 0, fn: (async () => { o.calls++; const words = text.split(/\s+/).filter(Boolean); return { language, languageProbability: probability, duration: 3, text, segments: [{ start: 0, end: 3, text, words: words.map((w, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25, word: w, probability: 0.9 })) }], ms: 1, model: 'fake' }; }) as typeof transcribe }; return o; };

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
  });
});

describe('heardSpeech (finding 20: one place applies the language threshold)', () => {
  it('reports the detected language and its confidence as heard; the judgement alone decides on the threshold', async () => {
    const low = heardSpeech(await asr('هلا شلونك اليوم شنو الاخبار', 'ar', 0.41).fn('x'));
    expect(low).toMatchObject({ present: true, words: 5, language: 'AR', confidence: 0.41 });
    expect(judgeSpeech(low, 'EN')).toBeNull(); // heard as Arabic, but not confidently: not refused
    const sure = heardSpeech(await asr('هلا شلونك اليوم شنو الاخبار', 'ar', 0.93).fn('x'));
    expect(judgeSpeech(sure, 'EN')?.code).toBe('WRONG_LANGUAGE');
    expect(heardSpeech(await asr('bonjour tout le monde', 'fr').fn('x')).language).toBe('UNKNOWN');
  });
});

describe('measureVoiceReference (one stack: voice-check measures, this module hears)', () => {
  it('a clean recording that peaks just under full scale is accepted — clipping is counted on samples, not guessed from the true peak', async () => {
    // a steady -20 dBFS voice with short transients reaching 0.99 of full scale: true peak above −0.1 dBTP, no clipped samples
    const f = await make('hot-but-clean.wav', '0.1*sin(220*2*PI*t)+0.89*sin(997*2*PI*t)*lt(mod(t,1),0.01)', 6);
    const words = asr('the last bus to karrada leaves at midnight');
    const r = await measureVoiceReference(f, { expectLanguage: 'EN', trimmedOut: path.join(dir, 'hot-24k.wav'), transcribe: words.fn });
    expect(r.measurement.clipping.clippedSamples).toBe(0);
    expect(r.refusal).toBeNull();
    expect(r.validation).toMatchObject({ sampleRate: 24000, channels: 1, speech: { present: true, words: 8, language: 'EN' } });
    expect(r.window.to - r.window.from).toBeLessThanOrEqual(12.2);
    expect(words.calls).toBe(1);
  }, 60_000);
  it('the studio’s own engine output is refused BAD_FORMAT before the window is cut or the service asked (finding 7)', async () => {
    const f = await make('engine-line.wav', '0.2*sin(220*2*PI*t)*(0.6+0.4*sin(3*2*PI*t))', 5, ['-metadata', 'comment=synthetic speech; engine=habibi; seed=7; not a voice reference']);
    const words = asr('هلا شلونك اليوم', 'ar');
    const r = await measureVoiceReference(f, { expectLanguage: 'AR', trimmedOut: path.join(dir, 'engine-24k.wav'), transcribe: words.fn });
    expect(r.refusal).toMatchObject({ code: 'BAD_FORMAT', message: expect.stringMatching(/engine output/) });
    expect(r.measurement.engineOutput).toMatch(/not a voice reference/);
    expect(words.calls).toBe(0);
    await expect(fsp.stat(path.join(dir, 'engine-24k.wav'))).rejects.toThrow();
  }, 60_000);
  it('format refusals (TOO_SHORT, TOO_QUIET) come back before the service is asked', async () => {
    const words = asr('x y z');
    expect((await measureVoiceReference(await make('short.wav', '0.3*sin(440*2*PI*t)', 1.5), { trimmedOut: path.join(dir, 's.wav'), transcribe: words.fn })).refusal?.code).toBe('TOO_SHORT');
    expect((await measureVoiceReference(await make('quiet.wav', '0.003*sin(440*2*PI*t)', 5), { trimmedOut: path.join(dir, 'q.wav'), transcribe: words.fn })).refusal?.code).toBe('TOO_QUIET');
    expect(words.calls).toBe(0);
  }, 60_000);
});

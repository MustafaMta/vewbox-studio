import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audioFacts, clipping, engineOutputOf, engineOutputTag, formatTags, loudness, pickReferenceWindow, speechRegions, trimReference, validateVoiceReference } from '@/server/media/voice-check';

const execFileP = promisify(execFile);
const fixture = path.resolve('tests/fixtures/speech-en.wav');
let dir: string;

/** Synthetic recordings made by ffmpeg: the measurements must match what was synthesised. */
async function make(name: string, expr: string, seconds: number, rate = 24000): Promise<string> {
  const out = path.join(dir, name);
  await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${rate}:d=${seconds}`, '-c:a', 'pcm_s16le', out]);
  return out;
}

beforeAll(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'voice-check-')); });
afterAll(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

describe('measurements on synthetic files', () => {
  it('reports duration, rate and channels; refuses junk', async () => {
    const f = await make('facts.wav', '0.3*sin(440*2*PI*t)', 4, 48000);
    expect(await audioFacts(f)).toMatchObject({ durationSeconds: expect.closeTo(4, 1), sampleRate: 48000, channels: 1, codec: 'pcm_s16le' });
    const junk = path.join(dir, 'junk.wav'); await fsp.writeFile(junk, 'not audio at all');
    await expect(audioFacts(junk)).rejects.toMatchObject({ code: 'INVALID', details: { code: 'BAD_FORMAT' } });
  }, 60_000);

  it('measures loudness and true peak, and -Infinity for silence', async () => {
    // a 0.1 full-scale sine is -20 dBFS; K-weighting is flat around 1 kHz so the integrated figure lands near -23 LUFS
    const l = await loudness(await make('sine.wav', '0.1*sin(1000*2*PI*t)', 5));
    expect(l.integratedLufs).toBeGreaterThan(-25); expect(l.integratedLufs).toBeLessThan(-21);
    expect(l.truePeakDbtp).toBeGreaterThan(-21); expect(l.truePeakDbtp).toBeLessThan(-19);
    const s = await loudness(await make('silence.wav', '0', 4));
    expect(s.integratedLufs).toBe(-Infinity);
  }, 60_000);

  it('counts clipped samples', async () => {
    const hot = await clipping(await make('hot.wav', '1.4*sin(220*2*PI*t)', 3));
    expect(hot.ratio).toBeGreaterThan(0.2); expect(hot.peakDbfs).toBeGreaterThan(-0.01); expect(hot.flatFactor).toBeGreaterThan(0);
    const clean = await clipping(await make('clean.wav', '0.5*sin(220*2*PI*t)', 3));
    expect(clean.clippedSamples).toBe(0); expect(clean.ratio).toBe(0); expect(clean.peakDbfs).toBeCloseTo(-6.02, 0);
  }, 60_000);

  it('finds the speech regions between silences and picks the longest run, not the head', async () => {
    // silence 0–2, tone 2–5, pause 5–5.5, tone 5.5–9, silence 9–10
    const f = await make('gaps.wav', '0.3*sin(300*2*PI*t)*(gt(t,2)*lt(t,5)+gt(t,5.5)*lt(t,9))', 10);
    const r = await speechRegions(f);
    expect(r.regions.length).toBe(2);
    expect(r.regions[0].from).toBeCloseTo(2, 0); expect(r.regions[0].to).toBeCloseTo(5, 0);
    expect(r.regions[1].from).toBeCloseTo(5.5, 0); expect(r.regions[1].to).toBeCloseTo(9, 0);
    expect(r.speechSeconds).toBeCloseTo(6.5, 0);
    const w = pickReferenceWindow(r.regions, r.durationSeconds)!;
    expect(w.from).toBeGreaterThan(1.6); expect(w.from).toBeLessThan(2.1);
    expect(w.to).toBeGreaterThan(8.9); expect(w.to).toBeLessThan(9.3);
    expect(w.cutMidSpeech).toBeUndefined();
  }, 60_000);

  it('bounds the window at 12 s and prefers the longest run over an earlier short one', () => {
    const regions = [{ from: 0.5, to: 2 }, { from: 4, to: 25 }];
    const w = pickReferenceWindow(regions, 30)!;
    expect(w.from).toBeCloseTo(3.85, 2); expect(w.seconds).toBe(12); expect(w.cutMidSpeech).toBe(true);
    // short phrases separated by pauses longer than the merge gap stay separate; the longest wins
    const phrases = [{ from: 0, to: 1 }, { from: 3, to: 7 }, { from: 9, to: 10.5 }];
    expect(pickReferenceWindow(phrases, 12)!.from).toBeCloseTo(2.85, 2);
    expect(pickReferenceWindow([], 5)).toBeNull();
    expect(pickReferenceWindow([{ from: 0, to: 0.4 }], 5)).toBeNull();
  });

  it('trims with a static gain to -20 LUFS at 24 kHz mono, keeping the true peak under -1 dBTP', async () => {
    // 997 Hz, not 1000: a pure tone whose period is a whole number of samples repeats its bytes every 188 bytes once
    // attenuated and ffmpeg's probe then takes the WAV for an MPEG transport stream (a synthetic-signal artefact)
    const quiet = await make('quiet-sine.wav', '0.03*sin(997*2*PI*t)', 6, 48000);
    const out = path.join(dir, 'trimmed.wav');
    const t = await trimReference(quiet, out, { from: 1, to: 5 });
    expect(t.gainDb).toBeGreaterThan(5);
    expect(t.integratedLufs).toBeGreaterThan(-20.7); expect(t.integratedLufs).toBeLessThan(-19.3);
    expect(await audioFacts(out)).toMatchObject({ sampleRate: 24000, channels: 1, durationSeconds: expect.closeTo(4, 1) });
    // a loud take cannot be pushed to -20 without exceeding the ceiling: the gain is capped at the true peak
    const loud = await make('loud-sine.wav', '0.9*sin(997*2*PI*t)', 4);
    const t2 = await trimReference(loud, path.join(dir, 'trimmed-loud.wav'), { from: 0, to: 4 });
    expect(t2.truePeakDbtp).toBeLessThanOrEqual(-0.9);
    expect(t2.gainDb).toBeLessThan(0);
    // a stereo recording lands at -20 LUFS too: the gain is measured on the mono cut (stereo measures 3 dB louder)
    const stereo = path.join(dir, 'stereo.wav');
    await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.03*sin(997*2*PI*t)|0.03*sin(997*2*PI*t)':s=48000:d=6", '-c:a', 'pcm_s16le', stereo]);
    const t3 = await trimReference(stereo, path.join(dir, 'trimmed-stereo.wav'), { from: 1, to: 5 });
    expect(t3.integratedLufs).toBeGreaterThan(-20.7); expect(t3.integratedLufs).toBeLessThan(-19.3);
    expect(await audioFacts(path.join(dir, 'trimmed-stereo.wav'))).toMatchObject({ channels: 1, sampleRate: 24000 });
  }, 60_000);
});

describe('engine provenance (finding 7)', () => {
  it('reads the synthetic-speech tag docker/tts writes (ISFT/ICMT → encoder/comment) and refuses the file BAD_FORMAT', async () => {
    expect(engineOutputOf({ encoder: 'vewbox-tts habibi', comment: 'synthetic speech; engine=habibi; seed=7; not a voice reference' })).toMatch(/vewbox-tts habibi/);
    expect(engineOutputOf({ comment: 'synthetic speech; engine=indextts; seed=1; not a voice reference' })).toMatch(/not a voice reference/);
    expect(engineOutputOf({ encoder: 'Lavf61.7.100' })).toBeNull();
    expect(engineOutputOf({})).toBeNull();
    const tagged = path.join(dir, 'tagged.wav');
    await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.2*sin(220*2*PI*t)':s=24000:d=5", '-metadata', 'comment=synthetic speech; engine=indextts; seed=3; not a voice reference', '-c:a', 'pcm_s16le', tagged]);
    expect((await formatTags(tagged)).comment).toMatch(/not a voice reference/);
    const v = await validateVoiceReference(tagged, { language: 'EN' });
    expect(v).toMatchObject({ ok: false, code: 'BAD_FORMAT' }); expect(v.message).toMatch(/engine output/); expect(v.engineOutput).toBeTruthy();
    // a real recording carries no such tag
    expect(await engineOutputTag(fixture)).toBeNull();
  }, 60_000);
});

describe('validateVoiceReference', () => {
  it('accepts the English speech fixture and proposes a window from the speech', async () => {
    const v = await validateVoiceReference(fixture, { language: 'EN' });
    expect(v.ok).toBe(true); expect(v.code).toBeUndefined(); expect(v.reasons).toEqual([]);
    expect(v).toMatchObject({ sampleRate: 22050, channels: 1, expectedLanguage: 'EN' });
    expect(v.durationSeconds).toBeCloseTo(6.27, 1);
    expect(v.integratedLufs).toBeGreaterThan(-21); expect(v.integratedLufs).toBeLessThan(-19);
    expect(v.truePeakDbtp).toBeLessThan(0); expect(v.clipping.ratio).toBe(0);
    expect(v.speechSeconds).toBeGreaterThan(4);
    expect(v.window).toBeDefined(); expect(v.window!.to).toBeGreaterThan(5); expect(v.window!.seconds).toBeLessThanOrEqual(12);
    expect(v.speech).toBeUndefined(); // the ASR fields are the voice handler's
  }, 60_000);

  it('refuses with the contract codes', async () => {
    const short = await validateVoiceReference(await make('short.wav', '0.3*sin(440*2*PI*t)', 1.5));
    expect(short).toMatchObject({ ok: false, code: 'TOO_SHORT' }); expect(short.message).toMatch(/1.5 s/);
    expect((await validateVoiceReference(await make('long.wav', '0.3*sin(440*2*PI*t)', 35))).code).toBe('TOO_LONG');
    expect((await validateVoiceReference(await make('phone.wav', '0.3*sin(440*2*PI*t)', 5, 8000))).code).toBe('BAD_FORMAT');
    const silent = await validateVoiceReference(await make('silent.wav', '0', 5));
    expect(silent.code).toBe('NO_SPEECH'); expect(silent.integratedLufs).toBe(-Infinity);
    // -50 dBFS: there is a signal, it is just far too quiet — that is the message, not "no speech"
    const whisper = await validateVoiceReference(await make('whisper.wav', '0.003*sin(440*2*PI*t)', 5));
    expect(whisper.code).toBe('TOO_QUIET'); expect(whisper.message).toMatch(/too quiet/);
    const clipped = await validateVoiceReference(await make('clipped.wav', '1.4*sin(220*2*PI*t)', 5));
    expect(clipped.code).toBe('CLIPPING'); expect(clipped.clipping.ratio).toBeGreaterThan(0.001);
    const junk = path.join(dir, 'junk2.wav'); await fsp.writeFile(junk, 'RIFF nothing');
    expect((await validateVoiceReference(junk)).code).toBe('BAD_FORMAT');
  }, 120_000);
});

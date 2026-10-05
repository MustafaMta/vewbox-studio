import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ONE_WORD_LEAD_IN, cutWavStart, isOneWordLine, leadInCutPoint, quietestPoint, readPcm16, type TimedWord } from '@/server/media/lead-in';
import { prepareLineText } from '@/server/providers/iraqi-text';

/** ONE-WORD LINES ON INDEXTTS (docs/research/MODEL-EVAL-2026-10.md §4, open item 7): spoken alone, IndexTTS runs past
 *  the word into an invented syllable (10/18 over 6 words × 3 seeds; «Nothing.» → "Nothing. Thang."). The studio now
 *  speaks it after a lead-in sentence and cuts at the silence before the word, located by the transcript's timings —
 *  18/18 clean in the recorded run (docs/evidence/model-eval-2026-10/voice-en/one-word/results.json), whose
 *  transcripts and WAVs these tests read. */

const EVID = path.join(process.cwd(), 'docs/evidence/model-eval-2026-10/voice-en/one-word');
interface Take { word: string; seed: number; variant: string; file: string; words: TimedWord[]; cut: { from: number; seconds: number } | null }
const takes = (JSON.parse(fs.readFileSync(path.join(EVID, 'results.json'), 'utf8')) as { takes: Take[] }).takes;
const EN = { engine: 'indextts' as const, language: 'EN' as const };

describe('prepareLineText: a one-word line on IndexTTS gets the lead-in', () => {
  it('one Latin word with its mark → lead-in + word, named in the changes, leadIn returned', () => {
    for (const w of ['Nothing.', 'Now?', 'Run!', 'okay', 'Mm-hmm…', "Don't!"]) {
      const p = prepareLineText(w, EN);
      expect(p.text).toBe(`${ONE_WORD_LEAD_IN} ${w}`);
      expect(p.leadIn).toBe(ONE_WORD_LEAD_IN);
      expect(p.changes).toContain('one-word line: spoken after a lead-in sentence, cut after synthesis');
    }
  });

  it('leaves everything else alone: two words, the Iraqi engine, an Arabic word, digits', () => {
    expect(prepareLineText('Not now.', EN)).toEqual({ text: 'Not now.', changes: [] });
    expect(prepareLineText('زين.', { engine: 'habibi', language: 'AR', dialect: 'IRAQI_BAGHDADI' }).leadIn).toBeUndefined();
    expect(prepareLineText('زين.', { engine: 'indextts', language: 'AR' }).leadIn).toBeUndefined();
    expect(prepareLineText('42.', EN).leadIn).toBeUndefined();
    expect(isOneWordLine('Nothing. Thang.')).toBe(false);
  });
});

describe('leadInCutPoint on the recorded transcripts', () => {
  it('locates the word after the lead-in in 18/18 prepared takes, the cut between "say" and the word', () => {
    const prepared = takes.filter((t) => t.variant === 'prepared');
    expect(prepared).toHaveLength(18);
    for (const t of prepared) {
      const at = leadInCutPoint(t.words, t.word);
      expect(at, `${t.word} s${t.seed}`).not.toBeNull();
      expect(at!.target).toEqual(t.words[t.words.length - 1]);
      expect(at!.from).toBeLessThanOrEqual(at!.to);
      expect(t.words[t.words.length - 2].word.toLowerCase()).toMatch(/^say/);
    }
  });

  it('refuses a take whose last word is not the line (a garbled tail, a different word, no lead-in heard)', () => {
    const alone = takes.find((t) => t.variant === 'alone' && t.word === 'Nothing.' && t.seed === 7)!; // "Nothing. Thang."
    expect(leadInCutPoint(alone.words, 'Nothing.')).toBeNull();
    const words = (s: string) => s.split(' ').map((w, i) => ({ start: i * 0.2, end: i * 0.2 + 0.15, word: w }));
    expect(leadInCutPoint(words('That is all I have to say. Nothing. Thang.'), 'Nothing.')).toBeNull();
    expect(leadInCutPoint(words('That is all I have to say. Yeah.'), 'Yes.')).toBeNull();
    expect(leadInCutPoint(words('Yes.'), 'Yes.')).toBeNull();
    expect(leadInCutPoint(words('That is all I have to say, okay?'), 'Okay.')?.target.word).toBe('okay?');
  });
});

describe('the cut on the samples', () => {
  const take = takes.find((t) => t.variant === 'prepared' && t.word === 'Nothing.' && t.seed === 7)!;
  const wav = fs.readFileSync(path.join(EVID, take.file));

  it('quietestPoint reproduces the recorded cut and lands in the pause, before the word', () => {
    const { samples, sampleRate } = readPcm16(wav);
    const at = leadInCutPoint(take.words, take.word)!;
    const from = quietestPoint(samples, sampleRate, at.from, at.to);
    expect(Math.round(from * 1000) / 1000).toBe(take.cut!.from);
    expect(from).toBeGreaterThanOrEqual(at.from - 0.05);
    expect(from).toBeLessThan(at.to + 0.03);
  });

  it('quietestPoint picks the latest quiet window of a synthetic pause, keeping 40 ms before the onset', () => {
    const sr = 1000; const s = new Int16Array(1000);
    for (let i = 0; i < 300; i++) s[i] = i % 2 ? 8000 : -8000; // "say"
    for (let i = 600; i < 1000; i++) s[i] = i % 2 ? 8000 : -8000; // the word from 0.6 s
    const t = quietestPoint(s, sr, 0.3, 0.6);
    expect(t).toBeGreaterThan(0.5); expect(t).toBeLessThan(0.6);
  });

  it('cutWavStart keeps the provenance chunk, drops exactly the lead-in, fades in', () => {
    const cut = cutWavStart(wav, take.cut!.from);
    const before = readPcm16(wav); const after = readPcm16(cut);
    expect(after.sampleRate).toBe(before.sampleRate);
    expect(after.samples.length).toBe(before.samples.length - Math.round(take.cut!.from * before.sampleRate));
    expect(Math.round((after.samples.length / after.sampleRate) * 1000) / 1000).toBe(take.cut!.seconds);
    expect(after.samples[0]).toBe(0);
    expect(cut.includes(Buffer.from('synthetic speech'))).toBe(wav.includes(Buffer.from('synthetic speech')));
    expect(cut.toString('ascii', 0, 4)).toBe('RIFF');
    expect(cut.readUInt32LE(4)).toBe(cut.length - 8);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lineScript } from '@/server/providers/speech';

/** The Iraqi evaluation set (docs/voice/IRAQI-EVAL-SET-2026-10.md) as the harness reads it: well-formed, within the
 *  brief's bounds, every line speakable by the Iraqi engine letter for letter (its vocabulary, read from the model
 *  volume), and listed in the document. */

interface EvalLine { id: string; category: string; text: string; gloss: string; features: string[]; emotion: string; sex: 'M' | 'F' | 'ANY'; msaWouldSoundWrong: boolean; length: 'short' | 'medium' | 'long'; source: string; rawDigits?: boolean; filmLineId?: string; notes?: string }
interface EvalSet { name: string; dialect: string; language: string; lines: EvalLine[] }

const set = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/voice/iraqi-eval-set.json'), 'utf8')) as EvalSet;
const vocab = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/voice/habibi-irq-vocab-chars.json'), 'utf8')) as { sha256: string; chars: string };
const doc = fs.readFileSync(path.resolve('docs/voice/IRAQI-EVAL-SET-2026-10.md'), 'utf8');

describe('the Iraqi evaluation set', () => {
  it('has 40–60 lines with unique ids and every field filled', () => {
    expect(set.dialect).toBe('IRAQI_BAGHDADI'); expect(set.language).toBe('AR');
    expect(set.lines.length).toBeGreaterThanOrEqual(40); expect(set.lines.length).toBeLessThanOrEqual(60);
    expect(new Set(set.lines.map((l) => l.id)).size).toBe(set.lines.length);
    for (const l of set.lines) {
      expect(l.text.trim().length, l.id).toBeGreaterThan(0);
      expect(l.gloss.trim().length, l.id).toBeGreaterThan(0);
      expect(l.features.length, l.id).toBeGreaterThan(0);
      expect(l.emotion.trim().length, l.id).toBeGreaterThan(0);
      expect(['M', 'F', 'ANY'], l.id).toContain(l.sex);
      expect(typeof l.msaWouldSoundWrong, l.id).toBe('boolean');
      expect(['short', 'medium', 'long'], l.id).toContain(l.length);
      expect(l.source.trim().length, l.id).toBeGreaterThan(0);
    }
  });

  it('covers every category the brief asks for, both sexes, two code-switched lines and the film lines', () => {
    const by = (c: string) => set.lines.filter((l) => l.category === c);
    for (const c of ['conversation', 'question', 'exclamation', 'numbers', 'names', 'emotion', 'long', 'short', 'code-switch', 'film']) expect(by(c).length, c).toBeGreaterThan(0);
    expect(set.lines.filter((l) => l.sex === 'M').length).toBeGreaterThan(0);
    expect(set.lines.filter((l) => l.sex === 'F').length).toBeGreaterThan(0);
    // emotions: anger, tenderness, humour, sadness
    for (const e of ['angry', 'tender', 'humour', 'sad']) expect(by('emotion').filter((l) => l.emotion === e).length, e).toBeGreaterThan(0);
    // code-switched lines carry Latin words and route to IndexTTS under the studio's rule; their twin stays Arabic
    const mixed = by('code-switch').filter((l) => lineScript(l.text) === 'MIXED');
    expect(mixed.length).toBeGreaterThanOrEqual(2);
    expect(by('code-switch').some((l) => lineScript(l.text) === 'AR')).toBe(true);
    // numbers: Iraqi spelled numerals, and exactly one line of raw digits for the preparation A/B
    expect(by('numbers').some((l) => /اثنعش|خمسطعش|اربعطعش|ميتين|تسعمية/.test(l.text))).toBe(true);
    expect(set.lines.filter((l) => l.rawDigits).map((l) => l.id)).toEqual(['num-04']);
    expect(set.lines.filter((l) => !l.rawDigits).every((l) => !/[0-9٠-٩]/.test(l.text))).toBe(true);
    // the film: six Static Sky renderings tagged with studio line ids, four fixture lines
    const ss = by('film').filter((l) => l.filmLineId);
    expect(ss.length).toBe(6); expect(new Set(ss.map((l) => l.filmLineId)).size).toBe(6);
    expect(by('film').filter((l) => l.source.startsWith('fixture')).length).toBe(4);
  });

  it('marks dialect fidelity: most lines would sound wrong in MSA, and each of those names a dialect feature', () => {
    const wrong = set.lines.filter((l) => l.msaWouldSoundWrong);
    expect(wrong.length / set.lines.length).toBeGreaterThan(0.85);
    const dialectMarker = /گ|چ|ك-as-g|vowel-reduction|شلون|شنو|وين|منو|ليش|شوكت|لعد|ماكو|اكو|مو|هسه|هاي|هيچ|باچر|هواية|شوية|ويا|اني|احنا|يمعود|عفية|بعده|عمر\+|ما-|ب-preposition|عَ-|هال-|ش-interrogative|راح-|گاعد|چا-|لو=|من=|numbers-iraqi|teens|construct|ونص|iraqi-month|kunya|honorific|يا-|دير|endearment|تدري|تجي|يجي|يفوت|نسوي|خلي|طلع|شيل|كلشي|بدري|هادي|ريحة|راحت|راحوا|السالفة|شخبار|شكو|والله|loanword|code-switch/u;
    for (const l of wrong) expect(l.features.some((f) => dialectMarker.test(f)), `${l.id}: ${l.features.join(', ')}`).toBe(true);
    // the Static Sky renderings are the engineer's, not studio text: said so on every one
    for (const l of set.lines.filter((x) => x.filmLineId)) expect(l.source).toMatch(/rendering by the engineer/);
  });

  it('is speakable letter for letter by the Iraqi engine: every character of every Arabic-script line is in its vocabulary', () => {
    expect(vocab.sha256).toMatch(/^[0-9a-f]{64}$/);
    const known = new Set(Array.from(vocab.chars));
    for (const l of set.lines) {
      if (lineScript(l.text) !== 'AR') continue; // mixed lines go to IndexTTS
      const missing = Array.from(l.text.normalize('NFC')).filter((c) => !known.has(c));
      expect(missing, `${l.id}: ${JSON.stringify(missing)}`).toEqual([]);
    }
  });

  it('is listed line by line in the document, with the protocol and the pass bar', () => {
    for (const l of set.lines) expect(doc.includes(`| ${l.id} |`), l.id).toBe(true);
    expect(doc).toMatch(/natural\*\* \/ \*\*understandable\*\* \/ \*\*wrong/);
    expect(doc).toMatch(/80 %/);
    expect(doc).toMatch(/not yet verified by a native listener/);
  });
});

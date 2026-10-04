import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { charErrorRateEval, coverageEval, foldDialectLetters, lineFlags, lineScriptOf, measureAudio, measuredSummary, msaReadingFlags, normalizeArabicEval, renderReviewHtml, summarizeReview, wordErrorRateEval } from '../../scripts/lib/voice-eval-metrics.mjs';
import { lineScript } from '@/server/providers/speech';

/** The harness's measurement side (scripts/voice-eval.mjs): the Arabic normaliser, WER/CER, the MSA-reading
 *  heuristic, routing parity with the studio, the ffmpeg measurements on the English speech fixture and on synthetic
 *  files, the flags, the review page and the pass bar. */

const execFileP = promisify(execFile);
const fixture = path.resolve('tests/fixtures/speech-en.wav');
let dir: string;
async function make(name: string, expr: string, seconds: number, extra: string[] = []): Promise<string> {
  const out = path.join(dir, name);
  await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=24000:d=${seconds}`, ...extra, '-c:a', 'pcm_s16le', out]);
  return out;
}
beforeAll(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'voice-eval-')); });
afterAll(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

describe('normalizeArabicEval', () => {
  it('unifies hamza forms, taa marbuta, alef maksura, Persian variants; strips diacritics, tatweel and zero-width marks', () => {
    expect(normalizeArabicEval('أحمد إبراهيم آمنة ٱلله')).toBe('احمد ابراهيم امنه الله');
    expect(normalizeArabicEval('مؤمن سائل شيء')).toBe('مومن سايل شي');
    expect(normalizeArabicEval('مكتبة')).toBe(normalizeArabicEval('مكتبه'));
    expect(normalizeArabicEval('مصطفى')).toBe('مصطفي');
    expect(normalizeArabicEval('شغّل الـ wifi')).toBe('شغل ال wifi');
    expect(normalizeArabicEval('ويّاي')).toBe('وياي');
    expect(normalizeArabicEval('كَتَبَ شكراً')).toBe('كتب شكرا');
    expect(normalizeArabicEval('کتاب یوم')).toBe('كتاب يوم');
    expect(normalizeArabicEval('ما‌كو')).toBe('ماكو');
  });
  it('converts both digit sets and drops punctuation, keeping the dialect letters', () => {
    expect(normalizeArabicEval('الساعة ٧:٣٠ و۱۵ دقيقة')).toBe('الساعه 7 30 و15 دقيقه');
    expect(normalizeArabicEval('شلونك؟ گلتلك، باچر!')).toBe('شلونك گلتلك باچر');
    expect(normalizeArabicEval('')).toBe('');
  });
  it('folds the /g/ and /tʃ/ letter classes only in the lenient view', () => {
    expect(foldDialectLetters(normalizeArabicEval('گلتلك باچر'))).toBe(foldDialectLetters(normalizeArabicEval('قلتلك باجر')));
    expect(foldDialectLetters(normalizeArabicEval('چاي'))).toBe(foldDialectLetters(normalizeArabicEval('تشاي')));
    expect(normalizeArabicEval('گلتلك')).not.toBe(normalizeArabicEval('قلتلك'));
  });
});

describe('WER / CER / coverage', () => {
  it('score an exact transcript at zero and an empty one at one', () => {
    expect(wordErrorRateEval('هسه وين نروح؟', 'هسه وين نروح')).toBe(0);
    expect(charErrorRateEval('هسه وين نروح؟', 'هسه وين نروح')).toBe(0);
    expect(coverageEval('هسه وين نروح؟', 'هسه وين نروح')).toBe(1);
    expect(charErrorRateEval('هسه', '')).toBe(1); expect(charErrorRateEval('', '')).toBe(0); expect(wordErrorRateEval('', 'x')).toBe(1);
  });
  it('charge a wrong word in the raw view and forgive a dialect spelling only after the fold', () => {
    const raw = charErrorRateEval('ليش ما گلتلي من البداية؟', 'ليش ما قلتلي من البداية؟');
    expect(raw).toBeGreaterThan(0); expect(raw).toBeLessThan(0.1);
    expect(charErrorRateEval('ليش ما گلتلي من البداية؟', 'ليش ما قلتلي من البداية؟', 'ar', true)).toBe(0);
    expect(wordErrorRateEval('ليش ما گلتلي من البداية؟', 'ليش ما قلتلي من البداية؟')).toBeCloseTo(1 / 5, 5);
    // «باچر» heard «باسر»: one letter, in both views
    expect(charErrorRateEval('باچر نروح', 'باسر نروح', 'ar', true)).toBeCloseTo(1 / 9, 5);
    expect(coverageEval('باچر نروح للمكان نفسه', 'باسر نروح للمكان نفسه')).toBeCloseTo(0.75, 5);
    // a lost opening
    expect(coverageEval('شلونك حبيبي، شخبارك؟', 'شخبارك')).toBeCloseTo(1 / 3, 5);
  });
  it('handles English lines', () => {
    expect(charErrorRateEval("It's still functional, isn't it?", "it's still functional isn't it", 'en')).toBe(0);
    expect(wordErrorRateEval('She never left.', 'She never left', 'en')).toBe(0);
  });
});

describe('the MSA-reading heuristic', () => {
  it('flags a transcript that writes the MSA counterparts of the dialect markers', () => {
    const f = msaReadingFlags('شلونك؟ وين رحت باچر؟', 'كيف حالك؟ أين ذهبت غداً؟');
    expect(f.markers).toBe(3);
    expect(f.substitutions).toEqual(['شلونك→كيف حالك', 'وين→اين', 'باچر→غدا']);
    expect(f.msaLike).toBe(true);
    expect(f.tanween).toBe(1);
  });
  it('does not flag a dialect transcript, and reports how گ/چ words were spelled', () => {
    const f = msaReadingFlags('شلونك؟ وين رحت باچر؟', 'شلونك وين رحت باجر');
    expect(f.substitutions).toEqual([]); expect(f.msaLike).toBe(false);
    expect(f.letters).toEqual(['باچر: written باجر']);
    expect(msaReadingFlags('گلتلك ماكو وقت', 'گلتلك ماكو وقت').letters).toEqual(['گلتلك: written as such']);
    expect(msaReadingFlags('گلتلك ماكو وقت', 'ماكو وقت').letters).toEqual(['گلتلك: not found']);
  });
  it('counts MSA grammar the text does not have, and attached prefixes', () => {
    const g = msaReadingFlags('اني ما اروح وياك', 'أنا لن أذهب معك');
    expect(g.grammar).toEqual(['لن']); expect(g.substitutions).toContain('اني→انا'); expect(g.substitutions).toContain('وياك→معك'); expect(g.msaLike).toBe(true);
    const p = msaReadingFlags('والله ماكو شي، بس تعبان شوية.', 'والله لا يوجد شيء، فقط متعب قليلاً.');
    expect(p.substitutions.sort()).toEqual(['ماكو→لا يوجد', 'بس→فقط', 'شويه→قليلا'].sort());
  });
  it('one substitution flags a short line but not a long one; no markers, no flag', () => {
    expect(msaReadingFlags('هسه؟', 'الآن؟').msaLike).toBe(true);
    const long = msaReadingFlags('شلونك؟ شخبارك؟ هسه وين رايح، ليش ما گلتلي؟', 'شلونك شخبارك الآن وين رايح ليش ما قلتلي');
    expect(long.substitutions).toEqual(['هسه→الان']); expect(long.msaLike).toBe(false);
    const none = msaReadingFlags('ساهر وشيماء ونبأ راحوا للكرادة.', 'ساهر وشيماء ونبأ راحوا للكرادة');
    expect(none.markers).toBe(0); expect(none.msaLike).toBe(false);
    // the ASR adding the MSA word beside the Iraqi one is not a substitution
    expect(msaReadingFlags('هسه وين', 'هسه الآن وين').substitutions).toEqual([]);
  });
});

describe('routing parity with the studio', () => {
  it('lineScriptOf agrees with lineScript on the evaluation set and the edge cases', async () => {
    const set = JSON.parse(await fsp.readFile(path.resolve('tests/fixtures/voice/iraqi-eval-set.json'), 'utf8')) as { lines: Array<{ text: string }> };
    for (const t of [...set.lines.map((l) => l.text), 'A سمير', 'Hello، world', '12:30 — 2026', '٢٥', '  …؟! ', '', 'I said مرحبا to her']) expect(lineScriptOf(t), t).toBe(lineScript(t));
  });
});

describe('ffmpeg measurements', () => {
  it('measures the English speech fixture: duration, level, speech with little silence, no engine tag', async () => {
    const m = await measureAudio(fixture);
    expect(m.durationSeconds).toBeCloseTo(6.27, 1); expect(m.sampleRate).toBe(22050); expect(m.channels).toBe(1);
    expect(m.lufs).toBeGreaterThan(-21); expect(m.lufs).toBeLessThan(-19);
    expect(m.truePeakDbtp).toBeLessThan(0);
    expect(m.silence.ratio).toBeGreaterThanOrEqual(0); expect(m.silence.ratio).toBeLessThan(0.6);
    expect(m.silence.totalSeconds).toBeLessThan(m.durationSeconds);
    expect(m.engineOutput).toBeNull();
  }, 60_000);
  it('measures silence as -Infinity LUFS with a silence ratio of 1, and leading silence before a tone', async () => {
    const s = await measureAudio(await make('silence.wav', '0', 2));
    expect(s.lufs).toBe(-Infinity); expect(s.silence.ratio).toBeCloseTo(1, 1); expect(s.silence.leadingSeconds).toBeCloseTo(2, 0);
    // 1 s of silence, 2 s of tone, 1 s of silence
    const t = await measureAudio(await make('gap.wav', '0.1*sin(1000*2*PI*t)*gt(t,1)*lt(t,3)', 4));
    expect(t.silence.leadingSeconds).toBeGreaterThan(0.8); expect(t.silence.leadingSeconds).toBeLessThan(1.2);
    expect(t.silence.trailingSeconds).toBeGreaterThan(0.8); expect(t.silence.trailingSeconds).toBeLessThan(1.2);
    expect(t.silence.ratio).toBeGreaterThan(0.4); expect(t.silence.ratio).toBeLessThan(0.6);
    expect(t.silence.longestPauseSeconds).toBe(0);
    expect(t.lufs).toBeGreaterThan(-30); expect(t.lufs).toBeLessThan(-20);
  }, 60_000);
  it('reads the voice service provenance tag', async () => {
    const tagged = await make('tagged.wav', '0.2*sin(220*2*PI*t)', 2, ['-metadata', 'comment=synthetic speech; engine=habibi; seed=3; not a voice reference']);
    expect((await measureAudio(tagged)).engineOutput).toMatch(/not a voice reference/);
  }, 60_000);
});

describe('lineFlags', () => {
  const base = { text: 'هسه وين نروح؟', durationSeconds: 1.4, lufs: -20, truePeakDbtp: -1.2, silence: { ratio: 0.1 }, engineOutput: 'synthetic speech; engine=habibi', asrLanguage: 'ar', asrModel: 'large-v3-arabic-dialectal-v2', cerFolded: 0.05 };
  it('is empty on a good line and names each problem', () => {
    expect(lineFlags(base)).toEqual([]);
    expect(lineFlags({ ...base, cerFolded: 0.2 })).toEqual(['CER_ABOVE_GATE']);
    expect(lineFlags({ ...base, cerFolded: 0.5 })).toEqual(['CER_ABOVE_GATE', 'UNINTELLIGIBLE']);
    expect(lineFlags({ ...base, msa: { msaLike: true } })).toEqual(['MSA_LIKE']);
    expect(lineFlags({ ...base, asrModel: 'large-v3' })).toEqual(['ASR_NOT_DIALECT_MODEL']);
    expect(lineFlags({ ...base, lufs: -Infinity, silence: { ratio: 1 } })).toEqual(['SILENT', 'MOSTLY_SILENCE']);
    expect(lineFlags({ ...base, lufs: -28 })).toEqual(['LOUDNESS_OUT_OF_RANGE']);
    expect(lineFlags({ ...base, truePeakDbtp: -0.2 })).toEqual(['PEAK_ABOVE_CEILING']);
    expect(lineFlags({ ...base, durationSeconds: 0.1 })).toEqual(['TOO_SHORT']);
    expect(lineFlags({ ...base, durationSeconds: 30 })).toEqual(['TOO_LONG_FOR_TEXT']);
    expect(lineFlags({ ...base, engineOutput: null })).toEqual(['NO_PROVENANCE_TAG']);
    expect(lineFlags({ ...base, error: 'boom' })).toEqual(['ERROR']);
  });
});

/** A small report: one voice, ten lines (two film, two emotion, eight MSA-sensitive). The library is plain JS, so the
 *  shapes here are loose on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const summarize = (r: Loose, review: Loose): Loose => summarizeReview(r, review);
function report(lines = 10): { run: { id: string }; lines: Loose[] } {
  const out: Loose[] = [];
  for (let i = 0; i < lines; i++) out.push({ key: `v/l${i}/prepared`, id: `l${i}`, category: i < 2 ? 'film' : i < 4 ? 'emotion' : 'conversation', text: 'هسه', gloss: 'now', features: ['هسه'], emotion: i < 4 ? 'angry' : 'neutral', sex: 'ANY', msaWouldSoundWrong: i < 8, voice: 'v', voiceSex: 'M', engine: 'habibi', file: `wavs/l${i}.wav`, cerFolded: 0.05, wer: 0.1, lufs: -20, truePeakDbtp: -1.1, flags: [] });
  return { run: { id: 'r1' }, lines: out };
}
const rating = (rating: string, over: Partial<{ dialect: string; emotion: string; sameVoice: string; note: string }> = {}) => ({ rating, dialect: 'yes', emotion: 'matched', sameVoice: '5', ...over });

describe('summarizeReview (the pass bar)', () => {
  it('passes a voice rated natural on 90 % with nothing wrong, by a named reviewer', () => {
    const r = report();
    const ratings = Object.fromEntries(r.lines.map((l, i) => [l.key, rating(i === 5 ? 'understandable' : 'natural')]));
    const s = summarize(r, { reviewer: 'Reviewer', at: '2026-10-05T10:00:00Z', runId: 'r1', ratings });
    expect(s.perVoice.v).toMatchObject({ spoken: 10, rated: 10, complete: true, natural: 9, understandable: 1, wrong: 0, pass: true });
    expect(s.perVoice.v.criteria.naturalShare.value).toBe(0.9);
    expect(s.verified).toBe(true); expect(s.status).toBe('REVIEWED');
  });
  it('fails on a wrong film line, on dialect no, on a weak emotion, or on too few natural; never verifies without a reviewer', () => {
    const r = report();
    const all = () => Object.fromEntries(r.lines.map((l) => [l.key, rating('natural')]));
    const run = (ratings: Record<string, unknown>, reviewer = 'R') => summarize(r, { reviewer, at: 'now', runId: 'r1', ratings });
    expect(run({ ...all(), 'v/l0/prepared': rating('wrong', { note: 'باچر with /k/' }) }).perVoice.v).toMatchObject({ pass: false, wrongLines: [{ id: 'l0', note: 'باچر with /k/' }] });
    const dialectNo = all(); for (const k of ['v/l4/prepared', 'v/l5/prepared']) dialectNo[k] = rating('natural', { dialect: 'no' });
    expect(run(dialectNo).perVoice.v.criteria.dialectYesShare).toEqual({ value: 0.75, pass: false });
    expect(run({ ...all(), 'v/l2/prepared': rating('natural', { emotion: 'weak' }) }).perVoice.v.criteria.emotionMatchedShare).toEqual({ value: 0.5, pass: false });
    const flat = all(); for (const k of ['v/l4/prepared', 'v/l5/prepared', 'v/l6/prepared']) flat[k] = rating('understandable');
    expect(run(flat).perVoice.v.criteria.naturalShare).toEqual({ value: 0.7, pass: false });
    const unnamed = run(all(), '');
    expect(unnamed.perVoice.v.pass).toBe(true); expect(unnamed.verified).toBe(false); expect(unnamed.status).toBe('PENDING');
    const partial = run(Object.fromEntries(r.lines.slice(0, 5).map((l) => [l.key, rating('natural')])));
    expect(partial.perVoice.v.complete).toBe(false); expect(partial.perVoice.v.pass).toBe(false); expect(partial.status).toBe('PARTIAL');
  });
});

describe('the review page and the measured summary', () => {
  it('renders a player, the text, the gloss and the form for every line, with the report embedded safely', () => {
    const r = report(3);
    r.lines[1].text = 'هسه </script><b>x</b>';
    const html = renderReviewHtml(r);
    expect(html).toContain('<audio controls'); // the page script renders one player per line from the embedded JSON
    expect(html).toContain('<script id="report" type="application/json">');
    expect(html).toContain('"file":"wavs/l0.wav"');
    expect(html).not.toMatch(/هسه <\/script>/); // the embedded JSON cannot close the script tag early
    expect(html).toContain('<\\/script>');
    expect(html).toMatch(/natural.*understandable.*wrong/s);
    expect(html).toContain('id="reviewer"'); expect(html).toContain('id="save"'); expect(html).toContain('id="blind"');
    expect(html).toContain('Sounds authentically Baghdadi');
  });
  it('summarises measurements per voice without a quality claim', () => {
    const r = report(4);
    r.lines[0].cerFolded = 0.3; r.lines[0].flags = ['CER_ABOVE_GATE']; r.lines[1].msa = { msaLike: true }; r.lines[2].error = 'boom';
    const s: Loose = measuredSummary(r.lines);
    expect(s.errors).toBe(1); expect(s.all.lines).toBe(3); expect(s.all.intelligible).toBe(2); expect(s.all.msaLike).toBe(1);
    expect(s.all.flags).toEqual({ CER_ABOVE_GATE: 1 });
    expect(s.perVoice.v.lines).toBe(3); expect(s.perCategory.film.lines).toBe(2);
    expect(JSON.stringify(s)).not.toMatch(/natural|authentic/);
  });
});

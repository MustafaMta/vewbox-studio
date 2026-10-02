import { describe, expect, it } from 'vitest';
import { charErrorRate, lineScript, normalizeIraqi, parseSynthesisHeaders, routeLine, scriptCoverage, verdict, VOICE_GATES, wordErrorRate } from '@/server/providers/speech';

/** The Iraqi gate: CER and coverage after the dialect fold. Cases come from docs/evidence/iraqi-suite.md, where
 *  Whisper wrote گ as ق, چ as س, joined ما to the verb and spelled «اثنعش» as «اثنى عشر» — orthography that the
 *  raw WER charged as errors although the line was spoken correctly. */

describe('normalizeIraqi', () => {
  it('folds گ/ق/ك, hamza forms, ة/ه, ى/ي, diacritics and tatweel', () => {
    expect(normalizeIraqi('ليش ما گلتلي من البداية؟')).toBe(normalizeIraqi('ليش ماقلتلي من البداية؟'));
    expect(normalizeIraqi('شغّل الـ wifi')).toBe('شغل ال wifi');
    expect(normalizeIraqi('ما أدري')).toBe(normalizeIraqi('ما ادري'));
    expect(normalizeIraqi('يسأل عني')).toBe(normalizeIraqi('يسال عني'));
    expect(normalizeIraqi('الأعظمية')).toBe('الاعظميه');
    expect(normalizeIraqi('مصطفى')).toBe('مصطفي');
  });
  it('treats چ as the /tʃ/ class with ج and «تش», and a final چ as the feminine clitic ك', () => {
    expect(normalizeIraqi('باچر')).toBe(normalizeIraqi('باجر'));
    expect(normalizeIraqi('چاي')).toBe(normalizeIraqi('تشاي'));
    expect(normalizeIraqi('شلونچ')).toBe(normalizeIraqi('شلونك'));
  });
  it('maps Iraqi spellings and their MSA counterparts to one key', () => {
    expect(normalizeIraqi('اني اسمي سمير')).toBe(normalizeIraqi('انا اسمي سمير'));
    expect(normalizeIraqi('هسه وين نروح؟')).toBe(normalizeIraqi('هسا وين نروح'));
    expect(normalizeIraqi('شلونك')).not.toBe(normalizeIraqi('شنو'));
    expect(normalizeIraqi('ماكو شي')).toBe(normalizeIraqi('ما كو شي'));
    expect(normalizeIraqi('فرحت هواية')).toBe(normalizeIraqi('فرحت كثير'));
  });
  it('spells numbers as digits, Iraqi and MSA alike, including compounds and an attached و', () => {
    expect(normalizeIraqi('الباص رقم اثنعش')).toBe('الباص ركم 12');
    expect(normalizeIraqi('اثنى عشر')).toBe('12');
    expect(normalizeIraqi('عندي ثلاث طيارات وخمسة وعشرين خيط')).toBe(normalizeIraqi('عندي 3 طيارات و25 خيط'));
    expect(normalizeIraqi('٢٥ دينار')).toBe('25 دينار');
    expect(normalizeIraqi('ميتين وخمسين')).toBe('250');
  });
  it('attaches ما, و, يا and لا to the next word and collapses stretched letters', () => {
    expect(normalizeIraqi('ما ظل أحد')).toBe(normalizeIraqi('ماظل احد'));
    expect(normalizeIraqi('سمير و أمينة')).toBe(normalizeIraqi('سمير وأمينة'));
    expect(normalizeIraqi('يلااااا')).toBe('يلا');
  });
});

describe('charErrorRate / scriptCoverage after the fold', () => {
  it('scores the suite lines that were spoken correctly at zero', () => {
    expect(charErrorRate('ليش ما گلتلي من البداية؟', 'ليش ماقلتلي من البداية؟', 'AR')).toBe(0);
    expect(scriptCoverage('ليش ما گلتلي من البداية؟', 'ليش ماقلتلي من البداية؟', 'AR')).toBe(1);
    expect(charErrorRate('والباص رقم اثنعش.', 'والباص رقم اثنى عشر', 'AR')).toBe(0);
    // the raw WER still reports the orthographic distance
    expect(wordErrorRate('ليش ما گلتلي من البداية؟', 'ليش ماقلتلي من البداية؟', 'AR')).toBeGreaterThan(0);
  });
  it('still charges a wrong or missing word', () => {
    // «باچر» heard as «بسر»: a real pronunciation question, not orthography
    const cer = charErrorRate('باچر نروح للمكان نفسه.', 'بسر نروح للمكان نفسه.', 'AR');
    expect(cer).toBeGreaterThan(0.05); expect(cer).toBeLessThan(0.15);
    expect(scriptCoverage('باچر نروح للمكان نفسه.', 'بسر نروح للمكان نفسه.', 'AR')).toBeCloseTo(0.75, 5);
    // «هسه وين نروح؟» heard as «هسا وين روح؟»: one word lost
    expect(scriptCoverage('هسه وين نروح؟', 'هسا وين روح؟', 'AR')).toBeCloseTo(2 / 3, 5);
    expect(charErrorRate('هسه وين نروح؟', 'هسا وين روح؟', 'AR')).toBeCloseTo(1 / 12, 5);
    // the opening lost entirely
    expect(scriptCoverage('شلونك حبيبي، شخبارك؟', 'شخبارك.', 'AR')).toBeCloseTo(1 / 3, 5);
    expect(charErrorRate('شلونك حبيبي، شخبارك؟', 'شخبارك.', 'AR')).toBeGreaterThan(0.5);
  });
  it('handles English and the empty cases', () => {
    expect(charErrorRate('I’ll return it tomorrow.', "I'll return it, tomorrow.", 'EN')).toBe(0);
    expect(charErrorRate('', '', 'EN')).toBe(0); expect(charErrorRate('', 'hello', 'EN')).toBe(1);
    expect(charErrorRate('hello', '', 'EN')).toBe(1);
  });
});

describe('lineScript / routeLine (routing parity)', () => {
  it('classifies lines the way the worker routes them', () => {
    expect(lineScript('هسه وين نروح؟')).toBe('AR');
    expect(lineScript('شغّل الـ wifi وافتح الـ app')).toBe('MIXED');
    expect(lineScript('OK سمير، هسه نسوي test للخيط، ready?')).toBe('MIXED');
    expect(lineScript('A سمير')).toBe('AR'); // a lone Latin letter does not switch engines
    expect(lineScript('Hello there, Nadia.')).toBe('LATIN');
    expect(lineScript('12:30 — 2026')).toBe('NUMERIC');
    expect(lineScript('٢٥')).toBe('NUMERIC');
    expect(lineScript('  …؟! ')).toBe('EMPTY');
    expect(lineScript('')).toBe('EMPTY');
  });
  it('sends Arabic script to the character engine and Latin or mixed lines to IndexTTS, naming the fallback', () => {
    expect(routeLine('هسه وين نروح؟', 'AR', 'IRAQI_BAGHDADI')).toEqual({ script: 'AR', engine: 'habibi', asrLanguage: 'ar' });
    const mixed = routeLine('شغّل الـ wifi', 'AR', 'IRAQI_BAGHDADI');
    expect(mixed.engine).toBe('indextts'); expect(mixed.asrLanguage).toBe('ar'); expect(mixed.fallback).toMatch(/habibi/);
    const latin = routeLine('Hello there.', 'AR', 'IRAQI_BAGHDADI');
    expect(latin.engine).toBe('indextts'); expect(latin.asrLanguage).toBe('en'); expect(latin.fallback).toBeDefined();
    // an English character with an Arabic line: its own engine, Arabic ASR, no fallback
    expect(routeLine('شكراً', 'EN')).toEqual({ script: 'AR', engine: 'indextts', asrLanguage: 'ar' });
    expect(routeLine('Hello.', 'EN').fallback).toBeUndefined();
    // the pinned model is respected for Arabic script
    expect(routeLine('هلا', 'AR', 'IRAQI_BAGHDADI', 'indextts').engine).toBe('indextts');
  });
});

describe('verdict', () => {
  it('applies the contract thresholds per context', () => {
    expect(VOICE_GATES.coverage.take).toBe(0.7); expect(VOICE_GATES.coverage.line).toBe(0.85); expect(VOICE_GATES.cer).toBe(0.15);
    expect(verdict({ coverage: 0.75, cer: 0.1, context: 'take' }).status).toBe('PASS');
    expect(verdict({ coverage: 0.75, cer: 0.1, context: 'line' }).status).toBe('REVIEW');
    expect(verdict({ coverage: 1, cer: 0.15, context: 'line' }).status).toBe('PASS');
    expect(verdict({ coverage: 1, cer: 0.2, context: 'line' })).toMatchObject({ status: 'REVIEW', reasons: [expect.stringMatching(/CER 0.20 > 0.15/)] });
  });
  it('fails far below the gate and asks for review when unmeasured', () => {
    expect(verdict({ coverage: 0.3, cer: 0.6, context: 'line' }).status).toBe('FAIL');
    expect(verdict({ coverage: 0.4, cer: 0.1, context: 'take' }).status).toBe('FAIL');
    expect(verdict({ coverage: 1, cer: 0.5, context: 'take' }).status).toBe('FAIL');
    const unmeasured = verdict({ context: 'line' });
    expect(unmeasured.status).toBe('REVIEW'); expect(unmeasured.reasons[0]).toMatch(/not verified/);
    expect(verdict({ coverage: 0.9, context: 'line' }).status).toBe('REVIEW');
  });
});

describe('parseSynthesisHeaders', () => {
  it('reads the new headers and tolerates an older service', () => {
    const h = new Headers({ 'x-sample-rate': '24000', 'x-duration': '2.5', 'x-engine': 'habibi', 'x-model': 'Habibi-TTS IRQ', 'x-engine-version': 'habibi-tts 0.1.1', 'x-seed': '7', 'x-params': JSON.stringify({ seed: 7, speed: 1, nfe_step: 32, cfg_strength: 2 }), 'x-true-peak': '-1.00', 'x-gain-reduction': '-3.2' });
    const m = parseSynthesisHeaders(h, 'habibi');
    expect(m).toMatchObject({ sampleRate: 24000, durationSeconds: 2.5, engine: 'habibi', engineVersion: 'habibi-tts 0.1.1', seed: 7, truePeakDbtp: -1, gainReductionDb: -3.2 });
    expect(m.params).toEqual({ seed: 7, speed: 1, nfe_step: 32, cfg_strength: 2 });
    const old = parseSynthesisHeaders(new Headers({ 'x-sample-rate': '22050', 'x-duration': '1.0', 'x-engine': 'indextts', 'x-model': 'IndexTTS-2.5' }), 'indextts');
    expect(old).toMatchObject({ engineVersion: 'unknown', params: {} }); expect(old.seed).toBeUndefined(); expect(old.truePeakDbtp).toBeUndefined();
  });
});

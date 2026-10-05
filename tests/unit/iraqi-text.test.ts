import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { iraqiNumberWords, msaNumberWords, prepareLineText, timeWords } from '@/server/providers/iraqi-text';
import { charErrorRate, lineScript, normalizeIraqi, scriptCoverage } from '@/server/providers/speech';

/** What the Arabic engines hear (src/server/providers/iraqi-text.ts): Baghdadi number words, clean characters, and
 *  nothing the Iraqi engine's vocabulary would cut — proven against the vocabulary read from the model volume. The
 *  script is never rewritten: the verification against the ORIGINAL line still passes after the fold. */

const IQ = { engine: 'habibi' as const, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
const MSA = { engine: 'indextts' as const, language: 'AR' as const };
const EN = { engine: 'indextts' as const, language: 'EN' as const };

describe('iraqiNumberWords', () => {
  it('spells units, teens, tens, hundreds, thousands and millions the Baghdadi way', () => {
    expect([0, 1, 2, 3, 8, 10].map((n) => iraqiNumberWords(n))).toEqual(['صفر', 'واحد', 'اثنين', 'ثلاثة', 'ثمانية', 'عشرة']);
    expect([11, 12, 13, 14, 15, 16, 17, 18, 19].map((n) => iraqiNumberWords(n))).toEqual(['احدعش', 'اثنعش', 'ثلطعش', 'اربعطعش', 'خمسطعش', 'سطعش', 'سبعطعش', 'ثمنطعش', 'تسعطعش']);
    expect(iraqiNumberWords(25)).toBe('خمسة وعشرين'); expect(iraqiNumberWords(40)).toBe('اربعين');
    expect(iraqiNumberWords(100)).toBe('مية'); expect(iraqiNumberWords(101)).toBe('مية وواحد'); expect(iraqiNumberWords(200)).toBe('ميتين'); expect(iraqiNumberWords(250)).toBe('ميتين وخمسين');
    expect(iraqiNumberWords(300)).toBe('ثلثمية'); expect(iraqiNumberWords(999)).toBe('تسعمية وتسعة وتسعين');
    expect(iraqiNumberWords(1000)).toBe('الف'); expect(iraqiNumberWords(1987)).toBe('الف وتسعمية وسبعة وثمانين'); expect(iraqiNumberWords(2026)).toBe('الفين وستة وعشرين');
    expect(iraqiNumberWords(3000)).toBe('ثلاث تالاف'); expect(iraqiNumberWords(11000)).toBe('احدعش الف'); expect(iraqiNumberWords(100000)).toBe('ميت الف'); expect(iraqiNumberWords(250000)).toBe('ميتين وخمسين الف');
    expect(iraqiNumberWords(1_000_000)).toBe('مليون'); expect(iraqiNumberWords(2_500_000)).toBe('مليونين وخمسمية الف'); expect(iraqiNumberWords(3_000_000)).toBe('ثلاث ملايين');
    expect(iraqiNumberWords(1_000_000_000)).toBe('1000000000'); expect(iraqiNumberWords(-1)).toBe('-1');
  });
  it('uses the construct form before a counted noun', () => {
    expect(iraqiNumberWords(3, { beforeNoun: true })).toBe('ثلاث'); expect(iraqiNumberWords(10, { beforeNoun: true })).toBe('عشر'); expect(iraqiNumberWords(100, { beforeNoun: true })).toBe('ميت');
    expect(iraqiNumberWords(25, { beforeNoun: true })).toBe('خمسة وعشرين'); expect(iraqiNumberWords(103, { beforeNoun: true })).toBe('مية وثلاثة');
  });
  it('spells MSA numbers in the reading form without case endings', () => {
    expect([1, 2, 12, 25, 100, 200, 1000, 2000, 3000, 1987].map((n) => msaNumberWords(n))).toEqual(['واحد', 'اثنان', 'اثنا عشر', 'خمسة وعشرون', 'مئة', 'مئتان', 'ألف', 'ألفان', 'ثلاثة آلاف', 'ألف وتسعمئة وسبعة وثمانون']);
  });
  it('says the time as a Baghdadi does', () => {
    expect(timeWords(7, 30, 'IRAQI')).toBe('سبعة ونص'); expect(timeWords(7, 15, 'IRAQI')).toBe('سبعة وربع'); expect(timeWords(7, 45, 'IRAQI')).toBe('ثمانية الا ربع');
    expect(timeWords(8, 20, 'IRAQI')).toBe('ثمانية وثلث'); expect(timeWords(19, 0, 'IRAQI')).toBe('سبعة'); expect(timeWords(0, 5, 'IRAQI')).toBe('اثنعش وخمس دقايق'); expect(timeWords(12, 25, 'IRAQI')).toBe('اثنعش وخمسة وعشرين دقيقة');
    expect(timeWords(7, 30, 'MSA')).toBe('سبعة والنصف'); expect(timeWords(7, 45, 'MSA')).toBe('ثمانية إلا ربع');
  });
});

describe('prepareLineText for the Iraqi engine', () => {
  it('spells the digit line of the evaluation set (times, dates, prices) and leaves a line without digits alone', () => {
    const p = prepareLineText('الموعد الساعة 7:30 يوم 15 من الشهر، والسعر 250 ألف.', IQ);
    expect(p.text).toBe('الموعد الساعة سبعة ونص يوم خمسطعش من الشهر، والسعر ميتين وخمسين ألف.');
    expect(p.changes).toEqual(['numbers spelled in Iraqi words']);
    expect(prepareLineText('عمري ٣٥ سنة وساكن بالشارع رقم ١٥.', IQ).text).toBe('عمري خمسة وثلاثين سنة وساكن بالشارع رقم خمسطعش.');
    expect(prepareLineText('انولدت بسنة 1987 ببغداد', IQ).text).toBe('انولدت بسنة الف وتسعمية وسبعة وثمانين ببغداد');
    expect(prepareLineText('شلونك؟ شخبارك؟ شكو ماكو؟', IQ)).toEqual({ text: 'شلونك؟ شخبارك؟ شكو ماكو؟', changes: [] });
  });
  it('counts nouns with the construct form, swaps «1 X», reads percentages, decimals and thousands separators', () => {
    expect(prepareLineText('عندي 3 طيارات و 1 دينار و 25% خصم', IQ).text).toBe('عندي ثلاث طيارات و دينار واحد و خمسة وعشرين بالمية خصم');
    expect(prepareLineText('السعر 2,500 دينار و 7.5 كيلو', IQ).text).toBe('السعر الفين وخمسمية دينار و سبعة ونص كيلو');
    expect(prepareLineText('الساعة 19:45 و 12:00 و 8:20', IQ).text).toBe('الساعة ثمانية الا ربع و اثنعش و ثمانية وثلث');
    expect(prepareLineText('نسبة 3.25 بالمية', IQ).text).toBe('نسبة ثلاثة فاصلة اثنين خمسة بالمية');
  });
  it('removes the tatweel and keeps English words apart, drops curly quotes and invisible marks, joins lines', () => {
    expect(prepareLineText('شغّل الـwifi', { ...IQ, engine: 'indextts' })).toEqual({ text: 'شغّل ال wifi', changes: ['tatweel removed', 'space between Arabic and Latin words'] });
    expect(prepareLineText('يقول “مرحبا” لك', IQ)).toEqual({ text: 'يقول مرحبا لك', changes: ['curly double quotes removed'] });
    expect(prepareLineText('ما‌كو شي هنا', IQ)).toEqual({ text: 'ماكو شي هنا', changes: ['zero-width marks removed'] });
    expect(prepareLineText('سطر اول\nسطر ثاني؟\nثالث', IQ).text).toBe('سطر اول. سطر ثاني؟ ثالث');
    expect(prepareLineText('ﻻ ﺗﺮﻭﺡ', IQ)).toEqual({ text: 'لا تروح', changes: ['Arabic presentation forms → letters'] });
  });
  it('turns Latin marks after Arabic letters into Arabic ones and collapses runs; hand diacritics and گ چ stay', () => {
    expect(prepareLineText('هسه؟!! شنو, زين?', IQ)).toEqual({ text: 'هسه؟! شنو، زين؟', changes: ['Latin ? , ; → Arabic ؟ ، ؛', 'repeated marks collapsed'] });
    expect(prepareLineText('ويّاي للسوگ باچر', IQ).text).toBe('ويّاي للسوگ باچر');
    expect(prepareLineText('ready now?', EN).text).toBe('ready now?'); // (a one-word line gets its lead-in: lead-in.test.ts)
  });
  it('gives an MSA line MSA words and an English line nothing', () => {
    expect(prepareLineText('السعر 250 ألف دينار', MSA)).toEqual({ text: 'السعر مئتان وخمسون ألف دينار', changes: ['numbers spelled in MSA words'] });
    expect(prepareLineText('We leave at 7:30, 250 people.', EN)).toEqual({ text: 'We leave at 7:30, 250 people.', changes: [] });
    // a mixed line routed to IndexTTS for an Iraqi character still counts in Iraqi
    expect(prepareLineText('OK سمير، 12 test', { ...IQ, engine: 'indextts' }).text).toBe('OK سمير، اثنعش test');
  });
});

describe('the verification still passes against the ORIGINAL line', () => {
  it('the dialect fold reads the spoken number words back to the digits of the script', () => {
    for (const line of ['الموعد الساعة 7:30 يوم 15 من الشهر، والسعر 250 ألف.', 'عمري ٣٥ سنة وساكن بالشارع رقم ١٥.', 'انولدت بسنة 1987 ببغداد', 'السعر 2,500 دينار', 'عندي 3 طيارات و 25% خصم', 'الساعة 19:45']) {
      const spoken = prepareLineText(line, IQ).text; // what a perfect ASR would write back
      expect(charErrorRate(line, spoken, 'AR'), `${line} ← ${spoken}`).toBe(0);
      expect(scriptCoverage(line, spoken, 'AR'), `${line} ← ${spoken}`).toBe(1);
    }
    expect(normalizeIraqi('ميتين وخمسين الف')).toBe('250000'); expect(normalizeIraqi('ثلاث تالاف وخمسمية')).toBe('3500'); expect(normalizeIraqi('الف وتسعمية وسبعة وثمانين')).toBe('1987');
    expect(normalizeIraqi('سبعة ونص')).toBe('7 30'); expect(normalizeIraqi('ثمانية الا ربع')).toBe('7 45'); expect(normalizeIraqi('ثلاثمائة')).toBe('300'); expect(normalizeIraqi('مائة')).toBe('100');
  });
});

describe('every prepared line of the evaluation set is in the Iraqi engine vocabulary', () => {
  it('no character the engine would cut, before or after preparation', () => {
    const set = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/voice/iraqi-eval-set.json'), 'utf8')) as { lines: Array<{ id: string; text: string; rawDigits?: boolean }> };
    const known = new Set(Array.from((JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/voice/habibi-irq-vocab-chars.json'), 'utf8')) as { chars: string }).chars));
    for (const l of set.lines) {
      if (lineScript(l.text) !== 'AR') continue;
      const p = prepareLineText(l.text, IQ);
      expect(Array.from(p.text).filter((c) => !known.has(c)), l.id).toEqual([]);
      if (l.rawDigits) { expect(p.text).not.toMatch(/[0-9]/); expect(p.changes).toEqual(['numbers spelled in Iraqi words']); } else expect(p.changes, l.id).toEqual([]);
    }
  });
});

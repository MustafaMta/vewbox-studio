import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { clockTime, fileSize, formatNumber, formatNumberNode, formatRange, formatRangeNode, isReadoutKind, numberProps, readoutDuration, resolution, toWesternDigits } from '@/lib/format';

/** docs/DESIGN-SYSTEM-V5.md §9.4 as amended 2026-10-03 (the interface is English-only): every number in Western
 *  digits; readouts, identifiers and file sizes set in the mono as an LTR isolate; counts, dates and durations in
 *  words in the interface face. One test per kind. */

const at = new Date(2026, 9, 3, 9, 29); // 3 Oct 2026, 09:29 local time

describe('formatNumber by kind', () => {
  it('readout: seconds as m:ss, h:mm:ss, a timecode or seconds; a Date as a clock time; strings kept', () => {
    expect(formatNumber(56, 'readout')).toBe('0:56');
    expect(formatNumber(61.4, 'readout')).toBe('1:01');
    expect(formatNumber(3725, 'readout')).toBe('1:02:05');
    expect(formatNumber(3.5, 'readout', { as: 'timecode' })).toBe('00:00:03:12');
    expect(formatNumber(7.3, 'readout', { as: 'timecode', fps: 25 })).toBe('00:00:07:07');
    expect(formatNumber(7.3, 'readout', { as: 'seconds' })).toBe('7.3 s');
    expect(formatNumber(at, 'readout')).toBe('09:29');
    expect(formatNumber('H.264', 'readout')).toBe('H.264');
    expect(formatNumber(resolution(1344, 768), 'readout')).toBe('1344×768');
    expect(formatNumber(56, 'duration')).toBe('0:56');
  });

  it('time: a clock time, 24-hour', () => {
    expect(formatNumber(at, 'time')).toBe('09:29');
    expect(clockTime(new Date(2026, 9, 3, 18, 5))).toBe('18:05');
  });

  it('identifier: shot, take, cut, scene and episode numbers written one way', () => {
    expect(formatNumber('2.3', 'identifier')).toBe('2.3');
    expect(formatNumber(4, 'identifier')).toBe('4');
    expect(formatNumber('٢.٣', 'identifier')).toBe('2.3'); // a digit typed in another script reads back Western
  });

  it('file: sizes in B, KB, MB, GB', () => {
    expect(formatNumber(512, 'file')).toBe('512 B');
    expect(formatNumber(48 * 1024, 'file')).toBe('48 KB');
    expect(formatNumber(56.3 * 1024 ** 2, 'file')).toBe('56.3 MB');
    expect(fileSize(1.25 * 1024 ** 3)).toBe('1.3 GB');
  });

  it('count: grouped, Western', () => {
    expect(formatNumber(4, 'count')).toBe('4');
    expect(formatNumber(1234, 'count')).toBe('1,234');
    expect(formatNumber(2.5, 'count')).toBe('2.5');
    expect(formatNumber('٤', 'count')).toBe('4');
  });

  it('date and datetime: "3 Oct", "3 Oct 2026", "3 Oct, 09:29"', () => {
    expect(formatNumber(at, 'date')).toBe('3 Oct');
    expect(formatNumber(at, 'date', { year: true })).toBe('3 Oct 2026');
    expect(formatNumber(at, 'datetime')).toBe('3 Oct, 09:29');
    expect(formatNumber('not a date', 'date')).toBe('');
  });

  it('duration-words: "56 s", "7.3 s", "7 min 11 s", "2 min", "1 h 4 min" — a decimal duration is still a duration', () => {
    expect(formatNumber(56, 'duration-words')).toBe('56 s');
    expect(formatNumber(7.3, 'duration-words')).toBe('7.3 s');
    expect(formatNumber(7, 'duration-words')).toBe('7 s');
    expect(formatNumber(431, 'duration-words')).toBe('7 min 11 s');
    expect(formatNumber(120, 'duration-words')).toBe('2 min');
    expect(formatNumber(3840, 'duration-words')).toBe('1 h 4 min');
    expect(formatNumber('431', 'duration-words')).toBe('7 min 11 s');
  });

  it('ranges take one kind for both ends', () => {
    expect(formatRange('2.1', '2.4', 'identifier')).toBe('2.1–2.4');
    expect(formatRange(1, 2, 'count')).toBe('1–2');
    expect(formatRange(12, 30, 'readout')).toBe('0:12–0:30');
    expect(formatRange(4, 4, 'count', {}, ' / ')).toBe('4 / 4');
  });
});

describe('rendering: readouts are mono LTR isolates', () => {
  it('readouts, identifiers and file sizes are isolated; counts and dates are not', () => {
    for (const k of ['readout', 'duration', 'time', 'identifier', 'file'] as const) { expect(isReadoutKind(k)).toBe(true); expect(numberProps(k)).toEqual({ className: 'num-ltr', dir: 'ltr' }); }
    for (const k of ['count', 'duration-words'] as const) expect(numberProps(k)).toEqual({ className: 'count' });
    for (const k of ['date', 'datetime'] as const) expect(numberProps(k)).toEqual({ className: 'date' });
  });

  it('formatNumberNode and formatRangeNode write the isolate', () => {
    expect(renderToStaticMarkup(formatNumberNode(resolution(1344, 768), 'readout'))).toBe('<span class="num-ltr" dir="ltr">1344×768</span>');
    expect(renderToStaticMarkup(formatNumberNode('2.3', 'identifier'))).toBe('<span class="num-ltr" dir="ltr">2.3</span>');
    expect(renderToStaticMarkup(formatNumberNode(8, 'count'))).toBe('<span class="count">8</span>');
    expect(renderToStaticMarkup(formatRangeNode('2.1', '2.4', 'identifier'))).toBe('<span class="num-ltr" dir="ltr">2.1–2.4</span>');
    expect(renderToStaticMarkup(formatRangeNode(1, 2, 'count'))).toBe('<span class="count num" dir="ltr">1–2</span>');
  });
});

describe('helpers', () => {
  it('toWesternDigits reads Arabic-Indic and Persian digits and separators', () => {
    expect(toWesternDigits('١٬٢٣٤٫٥')).toBe('1,234.5');
    expect(toWesternDigits('۳')).toBe('3');
  });
  it('readoutDuration handles negatives and non-numbers', () => {
    expect(readoutDuration(-5)).toBe('-0:05');
    expect(readoutDuration(Number.NaN)).toBe('');
  });
});

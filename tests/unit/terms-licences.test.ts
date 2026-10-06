import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TERMS, TERMS_VERSION, termsAccepted } from '@/domain/terms';
import { DISTRIBUTION_NOTE, ENGINE_LICENCES } from '@/domain/licences';
import { runCommand } from '@/domain/commands';
import { emptyStudio } from '@/domain/actions';
import { DEFAULT_SETTINGS } from '@/domain/settings';

describe('the terms of use (licence compliance)', () => {
  it('are accepted for this version only; a new version asks again', () => {
    expect(termsAccepted(undefined)).toBe(false);
    expect(termsAccepted({})).toBe(false);
    expect(termsAccepted({ terms: { version: '2000-01-01', acceptedAt: 'x' } })).toBe(false);
    expect(termsAccepted({ terms: { version: TERMS_VERSION, acceptedAt: 'x' } })).toBe(true);
  });
  it('bind users to the restrictions the licences pass on, and say to disclose AI content', () => {
    const all = TERMS.flatMap((s) => s.items).join(' ');
    for (const w of [/unlawful/i, /harass/i, /defamation/i, /deception/i, /military/i, /AI-generated/, /MiniMax H3/]) expect(all).toMatch(w);
  });
  it('are stored by the studio’s own updateSettings command', () => {
    const s = emptyStudio(DEFAULT_SETTINGS);
    const cmd = { id: 'c1', name: 'updateSettings', args: [{ terms: { version: TERMS_VERSION, acceptedAt: '2026-10-06T00:00:00.000Z', by: 'producer' } }], seed: 's', at: '2026-10-06T00:00:00.000Z' } as never;
    expect(termsAccepted(runCommand(s, cmd).state.settings)).toBe(true);
  });
  it('a new studio starts without them (DEFAULT_SETTINGS never pre-accepts)', () => {
    expect(termsAccepted(DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('the engines and their licences', () => {
  it('name MiniMax H3 with its UI-attribution, AUP and territory obligations; the distribution note names the four territories', () => {
    const h3 = ENGINE_LICENCES.find((l) => l.id === 'minimax-h3')!;
    expect(h3.licence).toBe('MiniMax H3 Community License');
    expect(h3.obligations.join(' ')).toMatch(/§IV\.2/);
    expect(h3.passesRestrictions).toBe(true);
    for (const t of ['United States', 'European Union', 'United Kingdom', 'South Korea']) expect(DISTRIBUTION_NOTE).toContain(t);
  });
  it('docs/LICENSES.md lists every engine of the table', () => {
    const doc = fs.readFileSync('docs/LICENSES.md', 'utf8');
    for (const l of ENGINE_LICENCES) expect(doc).toContain(l.licence.split(' (')[0]);
  });
});

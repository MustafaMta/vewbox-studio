import { describe, expect, it } from 'vitest';
import { performerProfile, speaksWord, spokenLanguagesOf, type HeaderValues } from '@/components/character/create/Starts';

/** The creation form's Language choice (the producer, 2026-10-09): English, Iraqi Arabic, or Both — one voice identity
 *  either way; Both gives it a profile per language and a singer sings in both. */
const h = (over: Partial<HeaderValues>): HeaderValues => ({ forId: '', style: 'REALISTIC', language: 'EN', dialect: 'IRAQI_BAGHDADI', kind: 'ACTOR_SINGER', ...over });

describe('what a new character speaks', () => {
  it('English, Iraqi Arabic, or both (English primary)', () => {
    expect(spokenLanguagesOf(h({}))).toEqual([{ language: 'EN' }]);
    expect(spokenLanguagesOf(h({ speaks: 'AR', language: 'AR' }))).toEqual([{ language: 'AR', dialect: 'IRAQI_BAGHDADI' }]);
    expect(spokenLanguagesOf(h({ speaks: 'BOTH' }))).toEqual([{ language: 'EN' }, { language: 'AR', dialect: 'IRAQI_BAGHDADI' }]);
    expect(speaksWord(h({ speaks: 'BOTH' }))).toBe('English + Iraqi Arabic');
    expect(speaksWord(h({ speaks: 'AR', language: 'AR', dialect: 'EGYPTIAN' }))).toBe('Arabic (Egyptian)');
  });
  it('a singer who speaks both sings in both', () => {
    expect(performerProfile(h({ speaks: 'BOTH', voiceType: 'TENOR', singingStyles: 'pop, maqam' })).singing).toEqual({ voiceType: 'TENOR', styles: ['pop', 'maqam'], languages: ['EN', 'AR'] });
  });
});

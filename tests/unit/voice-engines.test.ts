import { describe, expect, it } from 'vitest';
import { VOICE_ENGINES, englishEngine, isLocalTtsEngine, pinnable } from '@/server/providers/voice-engines';
import { enginesToUnloadForTts, pickEngine, routeLine } from '@/server/providers/speech';
import { prepareLineText } from '@/server/providers/iraqi-text';

/** The voice-engine capability layer (docs/research/VOICE-BENCH-2026-10.md §5): candidates are selectable by
 *  configuration, IndexTTS stays the default, a pinned identity keeps its engine, and capability data — not engine
 *  names — decides what is sent. */
describe('voice engines', () => {
  it('defaults English to IndexTTS and refuses unknown or non-English engines', () => {
    expect(englishEngine(undefined)).toBe('indextts');
    expect(englishEngine('indextts')).toBe('indextts');
    expect(englishEngine('dots')).toBe('dots');
    expect(englishEngine('habibi')).toBe('indextts'); // no English
    expect(englishEngine('fish-s2')).toBe('indextts'); // not a runtime engine (research reference only)
    expect(isLocalTtsEngine('moss')).toBe(true);
    expect(isLocalTtsEngine('minimax')).toBe(false);
  });

  it('picks the configured English engine only for NEW English voices; a pinned engine always wins', () => {
    expect(pickEngine('EN', undefined, undefined, 'indextts')).toBe('indextts');
    expect(pickEngine('EN', undefined, undefined, 'voxcpm2')).toBe('voxcpm2');
    expect(pickEngine('EN', undefined, 'indextts', 'dots')).toBe('indextts');
    expect(pickEngine('AR', 'IRAQI_BAGHDADI', undefined, 'dots')).toBe('habibi');
    expect(pickEngine('AR', undefined, undefined, 'dots')).toBe('indextts');
  });

  it('routes Latin lines to the voice’s own engine when it speaks English, and Habibi voices to IndexTTS', () => {
    expect(routeLine('Where were you?', 'EN', undefined, 'dots')).toMatchObject({ engine: 'dots', asrLanguage: 'en' });
    expect(routeLine('Where were you?', 'EN', undefined, undefined, 'indextts')).toMatchObject({ engine: 'indextts' });
    expect(routeLine('OK, ready', 'AR', 'IRAQI_BAGHDADI', 'habibi').engine).toBe('indextts');
    expect(routeLine('شغّل الـ wifi', 'AR', 'IRAQI_BAGHDADI', 'habibi').engine).toBe('indextts');
  });

  it('pins only an engine that speaks the character’s language', () => {
    expect(pinnable('dots', 'EN')).toBe('dots');
    expect(pinnable('habibi', 'EN')).toBeUndefined();
    expect(pinnable('speech-2.8-hd', 'EN')).toBeUndefined();
  });

  it('keeps the one-word lead-in to IndexTTS (the only engine where the defect was measured)', () => {
    expect(prepareLineText('Nothing.', { engine: 'indextts', language: 'EN' }).leadIn).toBeTruthy();
    for (const engine of ['voxcpm2', 'dots', 'moss'] as const) expect(prepareLineText('Nothing.', { engine, language: 'EN' }).leadIn).toBeUndefined();
    expect(Object.values(VOICE_ENGINES).filter((e) => e.oneWordLeadIn).map((e) => e.id)).toEqual(['indextts']);
  });

  it('unloads the live engines plus the configured English candidate', () => {
    expect(enginesToUnloadForTts('indextts')).toEqual(['indextts', 'habibi']);
    expect(enginesToUnloadForTts('moss')).toEqual(['indextts', 'habibi', 'moss']);
  });

  it('lists only commercial-safe engines (producer’s rule 2026-10-06)', () => {
    for (const e of Object.values(VOICE_ENGINES)) expect(e.licence).not.toMatch(/non-commercial|NC\b|research/i);
  });
});

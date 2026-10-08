import { describe, expect, it } from 'vitest';
import { VOICE_ENGINES, englishEngine, isLocalTtsEngine, pinnable } from '@/server/providers/voice-engines';
import { enginesToUnloadForTts, latinFallbackOf, pickEngine, routeLine } from '@/server/providers/speech';
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

  it('MOSS-TTS is the default engine for new English voices since 2026-10-06; indextts stays selectable', async () => {
    const { env } = await import('@/server/env');
    const configured = process.env.VOICE_ENGINE_EN; // a local .env may override; the CODE default is what is tested
    expect(configured ? englishEngine(configured) : englishEngine(env().VOICE_ENGINE_EN)).toBe(configured ? englishEngine(configured) : 'moss');
    expect(englishEngine('indextts')).toBe('indextts');
  });

  it('picks the configured English engine only for NEW English voices; a pinned engine always wins', () => {
    expect(pickEngine('EN', undefined, undefined, 'indextts')).toBe('indextts');
    expect(pickEngine('EN', undefined, undefined, 'voxcpm2')).toBe('voxcpm2');
    expect(pickEngine('EN', undefined, 'indextts', 'dots')).toBe('indextts');
    expect(pickEngine('AR', 'IRAQI_BAGHDADI', undefined, 'dots')).toBe('habibi');
    expect(pickEngine('AR', undefined, undefined, 'dots')).toBe('indextts');
  });

  it('routes Latin lines to the voice’s own engine when it speaks English, and a Habibi (Iraqi) voice’s to the English engine', () => {
    expect(routeLine('Where were you?', 'EN', undefined, 'dots')).toMatchObject({ engine: 'dots', asrLanguage: 'en' });
    expect(routeLine('Where were you?', 'EN', undefined, undefined, 'indextts')).toMatchObject({ engine: 'indextts' });
    // one character, one consented reference, both languages: Habibi has no English, MOSS (the English engine) speaks it
    expect(routeLine('OK, ready', 'AR', 'IRAQI_BAGHDADI', 'habibi', 'moss').engine).toBe('moss');
    expect(routeLine('شغّل الـ wifi', 'AR', 'IRAQI_BAGHDADI', 'habibi', 'moss').engine).toBe('moss');
    expect(latinFallbackOf('moss')).toBe('moss');
    expect(latinFallbackOf('indextts')).toBe('indextts');
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

  it('sizes the GPU lease by the engine (MOSS-TTS 8B far above the shared floor)', async () => {
    const { ttsVramFor, TTS_VRAM_FLOOR_MB } = await import('@/server/providers/voice-engines');
    expect(ttsVramFor('indextts')).toBe(TTS_VRAM_FLOOR_MB);
    expect(ttsVramFor('moss')).toBeGreaterThanOrEqual(16000);
  });

  it('sends each engine only the fields it honours: the transcript to Habibi/dots, the target length to MOSS as `duration`', async () => {
    const { synthesisFields } = await import('@/server/providers/speech');
    const line = { text: 'Did your father teach you this?', language: 'EN' as const, referenceText: 'the reference says this', seed: 7, speed: 1, emotion: 'curious', durationSeconds: 2.3456 };
    expect(synthesisFields(line, 'moss')).toMatchObject({ text: line.text, language: 'en', engine: 'moss', seed: '7', duration: '2.346', emotion: 'curious' });
    expect(synthesisFields(line, 'moss').reference_text).toBeUndefined();
    expect(synthesisFields(line, 'indextts').duration).toBeUndefined();
    expect(synthesisFields({ ...line, language: 'AR', dialect: 'IRAQI_BAGHDADI', nfeStep: 32 }, 'habibi')).toMatchObject({ language: 'ar', dialect: 'IRAQI_BAGHDADI', reference_text: line.referenceText, nfe_step: '32' });
    expect(synthesisFields(line, 'dots').reference_text).toBe(line.referenceText);
  });

  it('budgets a one-word line on a token-controlled engine, never on the others, and never over a caller’s target', async () => {
    const { durationFor } = await import('@/server/providers/voice-engines');
    expect(durationFor('moss', 'Nothing.')).toBe(0.9);
    expect(durationFor('moss', 'Now?')).toBe(0.9);
    expect(durationFor('moss', 'Did your father teach you this?')).toBeUndefined();
    expect(durationFor('moss', 'Nothing.', 1.4)).toBe(1.4);
    expect(durationFor('indextts', 'Nothing.')).toBeUndefined(); // IndexTTS keeps the lead-in + cut
    expect(durationFor('dots', 'Nothing.')).toBeUndefined();
  });

  it('lists only commercial-safe engines (producer’s rule 2026-10-06)', () => {
    for (const e of Object.values(VOICE_ENGINES)) expect(e.licence).not.toMatch(/non-commercial|NC\b|research/i);
  });

  it('keeps Fish S2 Pro an evaluation engine: never routed, never pinned, never the English default', async () => {
    const { EVAL_VOICE_ENGINES, isEvalTtsEngine } = await import('@/server/providers/voice-eval-engines');
    expect(isEvalTtsEngine('fish-s2-pro')).toBe(true);
    expect(EVAL_VOICE_ENGINES['fish-s2-pro']).toMatchObject({ commercialUse: false, licence: expect.stringMatching(/non-commercial/) });
    expect(isLocalTtsEngine('fish-s2-pro')).toBe(false);
    expect(englishEngine('fish-s2-pro')).toBe('indextts');
    expect(pinnable('fish-s2-pro', 'EN')).toBeUndefined();
    expect(pinnable('fish-s2-pro', 'AR')).toBeUndefined();
    expect(pickEngine('AR', 'IRAQI_BAGHDADI', 'fish-s2-pro' as never, 'moss')).toBe('habibi');
  });
});

import { describe, expect, it } from 'vitest';
import { SynthesizeInput } from '@/server/org/contracts';
import { VOICE_ENGINES } from '@/server/providers/voice-engines';

/** Every local voice engine is a valid speech.synthesize input (acceptance 2026-10-06: the MOSS promotion made the
 *  first MOSS voice build fail as WRONG_PARAMETERS — the tool contract still listed indextts/habibi only). */
describe('speech.synthesize contract', () => {
  it('accepts every local engine and auto', () => {
    for (const engine of [...Object.keys(VOICE_ENGINES), 'auto']) {
      expect(SynthesizeInput.safeParse({ text: 'Hello.', language: 'EN', referenceWav: '/tmp/a.wav', engine }).success, engine).toBe(true);
    }
  });
});

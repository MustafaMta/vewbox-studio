import { describe, expect, it } from 'vitest';
import { normalizeArabic, transcribe, wordErrorRate } from '@/server/providers/speech';

/** THE TRANSCRIPTION PATH THE WORKER USES to check every generated line: the audio service (faster-whisper on the
 *  GPU) through the worker's own client, then the word-error-rate the voice handler decides with. Skips cleanly
 *  when the service is not running. */

const up = async () => { try { const r = await fetch(`${process.env.ASR_URL ?? 'http://127.0.0.1:8030'}/health`, { signal: AbortSignal.timeout(3000) }); const j = await r.json() as { ok: boolean; weights_present: boolean }; return j.ok && j.weights_present; } catch { return false; } };

describe('transcription client', () => {
  it('transcribes real English speech with word timings and a low word error rate', async () => {
    // the real ASR, only when this run may use the card (the live lease) - never from a run on its own lease
    if ((await import('@/server/gpu/lease-db')).engineGuardProblem(process.env.ASR_URL ?? 'http://127.0.0.1:8030') || !(await up())) return;
    const t = await transcribe('tests/fixtures/speech-en.wav', { language: 'en' });
    expect(t.language).toBe('en');
    expect(t.segments.length).toBeGreaterThan(0);
    const words = t.segments.flatMap((s) => s.words);
    expect(words.length).toBeGreaterThan(10);
    for (const w of words) { expect(w.end).toBeGreaterThanOrEqual(w.start); expect(w.probability).toBeGreaterThan(0); }
    const intended = 'The last bus to Karrada leaves at midnight, and the driver has decided it will be his final shift.';
    const wer = wordErrorRate(intended, t.text, 'EN');
    expect(wer).toBeLessThan(0.15); // one proper-noun spelling is allowed to differ
  }, 120_000);

  it('normalises Arabic before comparing (diacritics, alef forms, taa marbuta, yaa)', () => {
    expect(normalizeArabic('شَلونَك؟ أهلاً')).toBe(normalizeArabic('شلونك اهلا'));
    expect(wordErrorRate('البيت ما بي چاي', 'البيت ما بي چاي.', 'AR')).toBe(0);
    expect(wordErrorRate('منو مات', 'منو راح', 'AR')).toBeCloseTo(0.5, 5);
  });
});

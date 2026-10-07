import { describe, expect, it } from 'vitest';
import { combineReadings } from '@/worker/handlers/voice';

/** TWO READINGS, ONE VERDICT: Qwen3-ASR-1.7B (primary, auto language) judges a recorded line; the Whisper reading
 *  stands beside it; where they disagree a listener decides; neither alone accepts or condemns the line. */

describe('two recognisers on one line', () => {
  const line = 'I told you the ferry would be late again.';
  it('both hear it: PASS, judged by Qwen3-ASR with the Whisper reading kept', () => {
    const c = combineReadings(line, 'EN', 'line', { text: line, detected: 'English' }, line)!;
    expect(c).toMatchObject({ status: 'PASS', ok: true, asr: 'qwen3-asr', heardReference: line, detectedLanguage: 'English' });
  });
  it('they disagree (one fails the line, the other passes it): REVIEW, never PASS or FAIL on one reading', () => {
    const a = combineReadings(line, 'EN', 'line', { text: 'It all. Therefore, it would be wrong.', detected: 'English' }, line)!;
    expect(a.status).toBe('REVIEW'); expect(a.reasons.join(' ')).toMatch(/recognisers disagree/);
    const b = combineReadings(line, 'EN', 'line', { text: line, detected: 'English' }, 'something else entirely here')!;
    expect(b.status).toBe('REVIEW');
  });
  it('both fail it: FAIL', () => {
    expect(combineReadings(line, 'EN', 'line', { text: 'nothing like it', detected: 'English' }, 'also nothing')!.status).toBe('FAIL');
  });
  it('a detected language that is not the line\'s own is flagged (a passing line goes to REVIEW)', () => {
    const c = combineReadings('هسه وين نروح؟', 'AR', 'line', { text: 'هسه وين نروح؟', detected: 'Persian' }, 'هسه وين نروح؟')!;
    expect(c.status).toBe('REVIEW'); expect(c.reasons.join(' ')).toMatch(/detected Persian, not Arabic/);
  });
  it('one recogniser away: the other judges and says so; both away: unverified (null)', () => {
    expect(combineReadings(line, 'EN', 'line', null, line)).toMatchObject({ status: 'PASS', asr: 'whisper', reasons: expect.arrayContaining([expect.stringMatching(/Whisper alone/)]) });
    expect(combineReadings(line, 'EN', 'line', { text: line, detected: 'English' }, null)!.reasons).toContain('no Whisper reference reading');
    expect(combineReadings(line, 'EN', 'line', null, null)).toBeNull();
  });
});

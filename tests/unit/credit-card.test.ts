import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');
const { creditCardSrt } = await import('@/server/media/assembly');

/** The end-credit card is one SRT cue: an empty line inside it must not be blank (a blank line ends an SRT cue, and the
 *  Tea at Mutanabbi export of 2026-10-06 showed only the title). */
describe('the end-credit card', () => {
  it('keeps every line in one cue; empty lines are a no-break space', () => {
    const srt = creditCardSrt(['Tea at Mutanabbi', '', 'AI-generated with Vewbox Studio', 'Video: MiniMax H3', '', 'Engines', 'MiniMax-H3'], 4);
    const [head, ...rest] = srt.split('\n\n');
    expect(rest.join('').trim()).toBe('');
    const lines = head.replace(/\n$/, '').split('\n');
    expect(lines.slice(0, 2)).toEqual(['1', '00:00:00,000 --> 00:00:04,000']);
    expect(lines.slice(2)).toEqual(['Tea at Mutanabbi', ' ', 'AI-generated with Vewbox Studio', 'Video: MiniMax H3', ' ', 'Engines', 'MiniMax-H3']);
  });
});

import { describe, expect, it } from 'vitest';
import { agentById } from '@/server/org/model';

/** Phase 1, 2026-10-09: character A's proof line was heard by Whisper alone — "Audio Synchronization Inspector may not
 *  call speech.transcribe_qwen" — although Qwen3-ASR is the frozen stack's primary transcriber. Every agent that
 *  hears a line back may call it. */
describe('who may call Qwen3-ASR', () => {
  it('the agents that hear a spoken line back (the voice proof, a preview, a recorded line, a take)', () => {
    for (const id of ['audio-sync-inspector']) expect(agentById(id)?.tools).toContain('speech.transcribe_qwen');
  });
});
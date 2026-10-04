import { describe, expect, it } from 'vitest';
import { admits, createMemoryGpuLease } from '@/server/gpu/lease';
import { enginesToUnload, type Engine } from '@/server/gpu/unloaders';

/** THE GPU LEASE'S RULES (docs/BACKEND-AUDIT-2026-10.md H7, step 8), pure: who is admitted, and which engines let go
 *  of the card when the family changes. The database lease itself is tested in tests/worker/gpu-lease.test.ts. */

type R = { holder: string; ticket: number; family: string; state: string; jobId: string | null };
const row = (holder: string, ticket: number, family: string, state: 'HOLDING' | 'WAITING', jobId: string | null = null): R => ({ holder, ticket, family, state, jobId });

describe('admission', () => {
  it('the oldest waiter takes a free card; a younger one waits', () => {
    const rows = [row('a', 1, 'VIDEO', 'WAITING'), row('b', 2, 'ASR', 'WAITING')];
    expect(admits(rows, { holder: 'a', family: 'VIDEO', jobId: null })).toBe(true);
    expect(admits(rows, { holder: 'b', family: 'ASR', jobId: null })).toBe(false);
  });
  it('the same family joins the holders — but never past an older waiter of another family (no starvation)', () => {
    expect(admits([row('h', 1, 'VIDEO', 'HOLDING'), row('v', 3, 'VIDEO', 'WAITING')], { holder: 'v', family: 'VIDEO', jobId: null })).toBe(true);
    const queued = [row('h', 1, 'VIDEO', 'HOLDING'), row('asr', 2, 'ASR', 'WAITING'), row('v', 3, 'VIDEO', 'WAITING')];
    expect(admits(queued, { holder: 'v', family: 'VIDEO', jobId: null })).toBe(false);
    expect(admits(queued, { holder: 'asr', family: 'ASR', jobId: null })).toBe(false);
    expect(admits([row('asr', 2, 'ASR', 'WAITING'), row('v', 3, 'VIDEO', 'WAITING')], { holder: 'asr', family: 'ASR', jobId: null })).toBe(true);
  });
  it('a request nested in a job that holds the card is admitted when the card is that job\'s alone', () => {
    const rows = [row('take', 1, 'VIDEO', 'HOLDING', 'job-1'), row('other', 2, 'ASR', 'WAITING', 'job-2'), row('nested', 3, 'ASR', 'WAITING', 'job-1')];
    expect(admits(rows, { holder: 'nested', family: 'ASR', jobId: 'job-1' })).toBe(true);
    const shared = [row('take', 1, 'VIDEO', 'HOLDING', 'job-1'), row('img', 2, 'VIDEO', 'HOLDING', 'job-3'), row('nested', 3, 'ASR', 'WAITING', 'job-1')];
    expect(admits(shared, { holder: 'nested', family: 'ASR', jobId: 'job-1' })).toBe(false);
  });
});

describe('unloaders', () => {
  const list: Engine[] = [
    { name: 'comfyui', serves: ['IMAGE', 'VIDEO', 'MUSIC'], unload: async () => {} },
    { name: 'tts', serves: ['TTS'], unload: async () => {} },
    { name: 'tts-design', serves: ['TTS'], unload: async () => {} },
    { name: 'asr', serves: ['ASR'], unload: async () => {} },
    { name: 'ollama', serves: ['LLM'], unload: async () => {} },
  ];
  const names = (from: Parameters<typeof enginesToUnload>[0], to: Parameters<typeof enginesToUnload>[1]) => enginesToUnload(from, to, list).map((e) => e.name);
  it('every engine that does not serve the new family lets go; ComfyUI frees between its own families', () => {
    expect(names('TTS', 'VIDEO')).toEqual(['tts', 'tts-design', 'asr', 'ollama']);
    expect(names('VIDEO', 'TTS')).toEqual(['comfyui', 'asr', 'ollama']);
    expect(names('IMAGE', 'VIDEO')).toEqual(['comfyui', 'tts', 'tts-design', 'asr', 'ollama']);
    expect(names('LLM', 'ASR')).toEqual(['comfyui', 'tts', 'tts-design', 'ollama']);
    expect(names('VIDEO', 'VIDEO')).toEqual([]);
    expect(names(null, 'IMAGE')).toEqual(['tts', 'tts-design', 'asr', 'ollama']);
  });
});

describe('the in-process lease (GPU_LEASE=memory rollback)', () => {
  it('one family at a time in one process; unloads on a switch', async () => {
    const unloads: string[] = [];
    const lease = createMemoryGpuLease({ unload: async (from, to) => { unloads.push(`${from}->${to}`); } });
    const order: string[] = [];
    let release!: () => void; const held = new Promise<void>((r) => { release = r; });
    const a = lease('VIDEO', 1, async () => { order.push('video+'); await held; order.push('video-'); });
    const b = lease('ASR', 1, async () => { order.push('asr'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(['video+']);
    release(); await Promise.all([a, b]);
    expect(order).toEqual(['video+', 'video-', 'asr']);
    expect(unloads).toEqual(['null->VIDEO', 'VIDEO->ASR']);
  });
});

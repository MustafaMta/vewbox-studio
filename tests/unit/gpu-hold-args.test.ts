import { describe, expect, it } from 'vitest';
import { HOLD_USAGE, parseHoldArgs } from '@/server/gpu/hold-args';

describe('gpu-hold arguments', () => {
  it('a hold is BACKGROUND by default, for every family the lease knows — LIPSYNC included', () => {
    expect(parseHoldArgs(['LIPSYNC', '20000', '--', 'docker', 'run', 'x'])).toEqual({ family: 'LIPSYNC', estimateMb: 20000, priority: 'background', cmd: ['docker', 'run', 'x'] });
    expect(parseHoldArgs(['VIDEO', '31900', 'node', 'x.mjs'])).toMatchObject({ family: 'VIDEO', priority: 'background', cmd: ['node', 'x.mjs'] });
  });
  it('--priority normal is explicit; anything else is refused with the usage', () => {
    expect(parseHoldArgs(['--priority', 'normal', 'LIPSYNC', '20000', '--', 'cmd'])).toMatchObject({ priority: 'normal', family: 'LIPSYNC' });
    expect(parseHoldArgs(['--priority', 'urgent', 'LIPSYNC', '1', '--', 'cmd'])).toEqual({ error: '--priority must be normal or background' });
    expect(parseHoldArgs(['GPU', '1', '--', 'cmd'])).toEqual({ error: HOLD_USAGE });
    expect(parseHoldArgs(['LIPSYNC', 'lots', '--', 'cmd'])).toEqual({ error: HOLD_USAGE });
    expect(parseHoldArgs(['LIPSYNC', '1', '--'])).toEqual({ error: HOLD_USAGE });
    expect(HOLD_USAGE).toContain('LIPSYNC');
  });
});

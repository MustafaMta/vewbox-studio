import { describe, expect, it } from 'vitest';
import { commandLogView, senderOf } from '@/server/studio/journal';

/** THE ENGINE ROOM'S COMMAND LOG (GET /api/studio/commands): who sent which command to which aggregate and how it
 *  ended — never the arguments or seeds. */

describe('the command log as the engine room sees it', () => {
  const row = { id: 7, origin: 'k3x9q2abcdefgh', jobId: null, ok: true, studioVersion: 42, createdAt: '2026-10-04 10:00:00+00', result: { ok: true, version: 42, hash: 'h', results: [{ secret: 'x' }] },
    commands: [
      { name: 'updateShot', args: ['s1e1', 's1e1-2', { notes: 'a private note', prompt: 'a long prompt' }], seed: 'seed-1', at: '2026-10-04T10:00:00Z' },
      { name: 'updateSettings', args: [{ generation: { videoModel: 'x' } }], seed: 'seed-2', at: '2026-10-04T10:00:00Z' },
      { name: 'deleteAsset', args: ['img-1'], seed: 'seed-3', at: '2026-10-04T10:00:00Z' },
    ] };

  it('names each command and the aggregates it touches, and nothing of the payload', () => {
    const v = commandLogView(row);
    expect(v).toEqual({ id: 7, at: row.createdAt, sender: 'page:k3x9q2', jobId: null, ok: true, studioVersion: 42, commands: [{ name: 'updateShot', touches: ['production:s1e1'] }, { name: 'updateSettings', touches: ['settings'] }, { name: 'deleteAsset', touches: ['studio'] }] });
    const text = JSON.stringify(v);
    for (const secret of ['private note', 'long prompt', 'videoModel', 'seed-1', 'k3x9q2abcdefgh', 'secret', 'img-1']) expect(text).not.toContain(secret);
  });

  it('a refused batch says which command and why', () => {
    const v = commandLogView({ ...row, ok: false, result: { ok: false, failedAt: 1, error: { code: 'NOT_FOUND', message: 'Shot x was not found.' } } });
    expect(v.refused).toEqual({ failedAt: 1, code: 'NOT_FOUND', message: 'Shot x was not found.' });
  });

  it('system senders keep their name; a page is shown by a short prefix of its session id', () => {
    expect(['worker', 'server', 'seed', 'restore'].map(senderOf)).toEqual(['worker', 'server', 'seed', 'restore']);
    expect(senderOf('abcdefghijkl')).toBe('page:abcdef');
  });
});

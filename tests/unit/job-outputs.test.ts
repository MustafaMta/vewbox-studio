import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attemptTag, jobFiles, jobStamp, outputId, stableSeed } from '@/server/jobs/outputs';
import { libraryPathFor } from '@/server/media';
import { thumbPathFor } from '@/server/media/thumbs';
import { seed as sampleState } from '@/domain/sample';
import { runCommand, type Command } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** DETERMINISTIC OUTPUTS (docs/BACKEND-AUDIT-2026-10.md C2, step 6): ids and seeds from the job, file names that say
 *  which job and which attempt wrote them, and a take that can be added only once and chosen in the same batch. */

describe('job output ids', () => {
  it('are the same on every attempt of a job, differ by name and by job, and carry the job stamp', () => {
    expect(outputId('job-a', 'video')).toBe(outputId('job-a', 'video'));
    expect(outputId('job-a', 'video')).not.toBe(outputId('job-a', 'poster'));
    expect(outputId('job-a', 'video')).not.toBe(outputId('job-b', 'video'));
    expect(outputId('job-a', 'take', 'take')).toMatch(/^take-[0-9a-f]{20}$/);
    expect(outputId('job-a', 'video').slice(4, 16)).toBe(jobStamp('job-a'));
    expect(stableSeed('job-a', 'take')).toBe(stableSeed('job-a', 'take'));
    expect(stableSeed('job-a', 'take')).toBeLessThan(2 ** 31);
  });

  it('name each attempt\'s file apart (`{id}.a{n}.{ext}`) and its thumbnail with it', () => {
    const id = outputId('job-a', 'poster');
    const rel = libraryPathFor(id, 'IMAGE', 'png', attemptTag(2));
    expect(path.posix.basename(rel)).toBe(`${id}.a2.png`);
    expect(path.posix.basename(thumbPathFor(rel))).toBe(`${id}.a2.thumb.jpg`);
    expect(path.posix.basename(libraryPathFor(id, 'IMAGE', 'png'))).toBe(`${id}.png`);
    expect(() => libraryPathFor(id, 'IMAGE', 'png', '../x')).toThrow(/tag/);
  });

  it('jobFiles finds exactly the files of one job, with the attempt that wrote each', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-jobfiles-'));
    const mine = outputId('job-mine', 'video'); const poster = outputId('job-mine', 'poster'); const other = outputId('job-other', 'video');
    const put = (rel: string) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), 'x'); };
    put(`video/2026/10/${mine}.a1.mp4`); put(`video/2026/11/${mine}.a2.mp4`); put(`image/2026/10/${poster}.a1.png`); put(`image/2026/10/${poster}.a1.thumb.jpg`);
    put(`video/2026/10/${other}.a1.mp4`); put('video/2026/10/gen-abc123.mp4'); put(`video/2026/10/${mine}.a3.mp4.part`);
    const found = (await jobFiles('job-mine', root)).sort((a, b) => a.rel.localeCompare(b.rel));
    expect(found.map((f) => [f.rel, f.attempt])).toEqual([
      [`image/2026/10/${poster}.a1.png`, 1], [`image/2026/10/${poster}.a1.thumb.jpg`, 1],
      [`video/2026/10/${mine}.a1.mp4`, 1], [`video/2026/10/${mine}.a3.mp4.part`, 3], [`video/2026/11/${mine}.a2.mp4`, 2],
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('addTake with a job\'s id and its selection (step 6)', () => {
  const firstShot = (s: StudioState) => { const p = s.productions.find((x) => x.shots.length > 0)!; return { p, sh: p.shots[0] }; };
  const run = <T>(s: StudioState, name: string, args: unknown[]) => runCommand(s, { name, args, seed: 'seed-test', at: '2026-10-04T00:00:00.000Z' } as unknown as Command) as { state: StudioState; result: T };

  it('a take with an id is added once; the same id again is refused (never two takes for one request)', () => {
    const s0 = sampleState();
    const { p, sh } = firstShot(s0);
    const asset = s0.assets.find((a) => a.kind === 'VIDEO')!;
    const r = run<{ take: { id: string } }>(s0, 'addTake', [p.id, sh.id, { id: 'take-fixed', assetId: asset.id, provider: 'MINIMAX' }]);
    expect(r.result.take.id).toBe('take-fixed');
    expect(() => run(r.state, 'addTake', [p.id, sh.id, { id: 'take-fixed', assetId: asset.id, provider: 'MINIMAX' }])).toThrow(/already exists/);
  });

  it('IF_UNCHOSEN chooses the take only over nothing or a bundled sample; ALWAYS chooses it; a rejected take never', () => {
    const s0 = sampleState();
    const { p, sh } = firstShot(s0);
    const asset = s0.assets.find((a) => a.kind === 'VIDEO')!;
    const real = run<{ take: { id: string } }>(s0, 'addTake', [p.id, sh.id, { id: 'take-real', assetId: asset.id, provider: 'MINIMAX' }]);
    const chosen = run(real.state, 'selectTake', [p.id, sh.id, 'take-real']).state;
    const ifUnchosen = run(chosen, 'addTake', [p.id, sh.id, { id: 'take-new', assetId: asset.id, provider: 'MINIMAX', select: 'IF_UNCHOSEN' }]).state;
    expect(firstShot(ifUnchosen).sh.selectedTakeId).toBe('take-real');
    const always = run(chosen, 'addTake', [p.id, sh.id, { id: 'take-new', assetId: asset.id, provider: 'MINIMAX', select: 'ALWAYS' }]).state;
    expect(firstShot(always).sh.selectedTakeId).toBe('take-new');
    const cleared = run(real.state, 'selectTake', [p.id, sh.id, undefined]).state;
    expect(firstShot(run(cleared, 'addTake', [p.id, sh.id, { id: 'take-new', assetId: asset.id, provider: 'MINIMAX', select: 'IF_UNCHOSEN' }]).state).sh.selectedTakeId).toBe('take-new');
    expect(firstShot(run(cleared, 'addTake', [p.id, sh.id, { id: 'take-bad', assetId: asset.id, provider: 'MINIMAX', status: 'REJECTED', select: 'ALWAYS' }]).state).sh.selectedTakeId).toBeUndefined();
  });

  it('a page still cannot send a take id or a selection (the uploaded take is strict)', async () => {
    const { validateClientCommand } = await import('@/domain/commands');
    expect(() => validateClientCommand('addTake', ['p', 's', { assetId: 'a', provider: 'UPLOAD', id: 'take-x' }])).toThrow();
    expect(() => validateClientCommand('addTake', ['p', 's', { assetId: 'a', provider: 'UPLOAD', select: 'ALWAYS' }])).toThrow();
  });
});

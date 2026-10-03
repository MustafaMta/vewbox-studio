import { describe, expect, it } from 'vitest';
import { phaseDurations, runPhaseLabel, runPhaseOf } from '@/domain/phases';
import { initialPhases } from '@/server/org/runs';
import { expectationsByModel, median, takeExpectations } from '@/studio/selectors/expectations';
import { seed } from '@/domain/sample';
import type { Production, Take } from '@/domain/types';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B9: phases per run and what to expect of a take. */

describe('run phases', () => {
  it('maps every progress report a take handler makes onto the four phases of the status row', () => {
    expect(runPhaseOf('QUEUED')).toBe('QUEUED');
    expect(runPhaseOf('PREPARING', 'preparing')).toBe('PREPARING');
    expect(runPhaseOf('PREPARING', 'recording')).toBe('PREPARING');
    expect(runPhaseOf('GENERATING', 'generating')).toBe('GENERATING');
    expect(runPhaseOf('GENERATING', 'queued')).toBe('GENERATING');
    expect(runPhaseOf('DOWNLOADING', 'downloading')).toBe('GENERATING');
    expect(runPhaseOf('VALIDATING', 'validating')).toBe('CHECKING');
    expect(runPhaseOf('POSTPROCESSING', 'postprocessing')).toBe('FINISHING');
    expect(runPhaseOf('AWAITING_REVIEW')).toBeNull();
    expect(runPhaseOf('COMPLETED')).toBeNull();
    expect(runPhaseLabel('GENERATE_TAKE', 'GENERATING')).toBe('Filming');
    expect(runPhaseLabel('GENERATE_TAKE', 'PREPARING')).toBe('Preparing references');
    expect(runPhaseLabel('DIALOGUE_AUDIO', 'GENERATING')).toBe('Recording');
    expect(runPhaseLabel('WRITE_SCRIPT', 'GENERATING')).toBe('Generating');
  });
  it('a run starts with QUEUED at the job’s creation (or its retry time) and PREPARING at the claim', () => {
    expect(initialPhases({ createdAt: '2026-10-03T09:00:00.000Z' }, '2026-10-03T09:00:05.000Z')).toEqual([{ phase: 'QUEUED', at: '2026-10-03T09:00:00.000Z' }, { phase: 'PREPARING', at: '2026-10-03T09:00:05.000Z' }]);
    expect(initialPhases({ createdAt: '2026-10-03T09:00:00.000Z', runAfter: '2026-10-03T09:01:00.000Z' }, '2026-10-03T09:01:02.000Z')[0].at).toBe('2026-10-03T09:01:00.000Z');
    // a runAfter in the past of the creation, or after the claim (clock skew), is not trusted
    expect(initialPhases({ createdAt: '2026-10-03T09:00:00.000Z', runAfter: '2026-10-03T09:05:00.000Z' }, '2026-10-03T09:01:02.000Z')[0].at).toBe('2026-10-03T09:00:00.000Z');
  });
  it('durations run from each event to the next, the last one to the run’s end', () => {
    const d = phaseDurations([{ phase: 'PREPARING', at: '2026-10-03T09:00:05.000Z' }, { phase: 'QUEUED', at: '2026-10-03T09:00:00.000Z' }, { phase: 'GENERATING', at: '2026-10-03T09:00:35.000Z' }], '2026-10-03T09:03:05.000Z');
    expect(d.map((x) => [x.phase, x.ms])).toEqual([['QUEUED', 5000], ['PREPARING', 30000], ['GENERATING', 150000]]);
  });
});

const take = (id: string, over: Partial<Take>): Take => ({ id, label: id, assetId: 'a', createdAt: `2026-10-03T0${id.length % 10}:00:00.000Z`, status: 'READY', provider: 'MINIMAX', model: 'MiniMax-H3 (local, pruned int8)', generationMs: 180_000, ...over });
const production = (takes: Take[][]): Pick<Production, 'shots'> => ({ shots: takes.map((ts, i) => ({ id: `sh${i}`, sceneId: 'sc', number: i + 1, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT', takes: ts })) });

describe('take expectations', () => {
  it('the median of accepted takes, per production and per model; the newest one as the last', () => {
    const p = production([
      [take('t1', { generationMs: 170_000, createdAt: '2026-10-03T08:00:00.000Z' }), take('t2', { generationMs: 318_000, createdAt: '2026-10-03T08:30:00.000Z' })],
      [take('t3', { generationMs: 125_000, createdAt: '2026-10-03T09:00:00.000Z' }), take('t4', { generationMs: 596_000, model: 'MiniMax-H3', createdAt: '2026-10-03T09:26:00.000Z' })],
    ]);
    const e = takeExpectations(p);
    expect(e.count).toBe(4);
    expect(e.medianGenerationMs).toBe((170_000 + 318_000) / 2);
    expect(e.lastGenerationMs).toBe(596_000);
    expect(e.byModel).toEqual([{ model: 'MiniMax-H3 (local, pruned int8)', count: 3, medianGenerationMs: 170_000 }, { model: 'MiniMax-H3', count: 1, medianGenerationMs: 596_000 }]);
    expect(takeExpectations(p, { shotId: 'sh1' }).medianGenerationMs).toBe((125_000 + 596_000) / 2);
    expect(expectationsByModel([p, p])[0]).toEqual({ model: 'MiniMax-H3 (local, pruned int8)', count: 6, medianGenerationMs: 170_000 });
  });
  it('leaves out bundled samples, rejected takes and takes without a time; empty is null, never a guess', () => {
    const p = production([[take('t1', { provider: 'SAMPLE' }), take('t2', { status: 'REJECTED' }), take('t3', { rating: 'REJECTED' }), take('t4', { generationMs: undefined }), take('t5', { generationMs: 0 })]]);
    expect(takeExpectations(p)).toEqual({ count: 0, medianGenerationMs: null, lastGenerationMs: null, byModel: [] });
    for (const prod of seed().productions) expect(takeExpectations(prod).count).toBe(0);
    expect(median([])).toBeNull(); expect(median([3, 1, 2])).toBe(2); expect(median([4, 1])).toBe(2.5);
  });
});

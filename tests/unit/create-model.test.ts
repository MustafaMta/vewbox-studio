import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import type { Production } from '@/domain/types';
import { autoAvailability, elapsed, ideasOf, lengthWords, modeOf, researchLine, slateOf, stageRows, titleFrom, validateAuto, validateManual, type DevelopmentView } from '@/components/wizard/model';

/** The creation flows' reading of the studio (src/components/wizard/model.ts): validation, the ideas the studio
 *  wrote, the development stepper and the engines' words — all from real records, nothing invented. */

const job = (x: Partial<Job>): Job => ({ id: 'j', type: 'AUTO_IDEA', status: 'COMPLETED', priority: 0, payload: { kind: 'SHORT' }, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-03T06:00:00Z', updatedAt: '2026-10-03T06:00:00Z', ...x });

describe('modes and words', () => {
  it('reads ?mode= and the palette’s ?method=, Auto by default', () => {
    const sp = (q: string) => new URLSearchParams(q);
    expect(modeOf(sp(''))).toBe('auto');
    expect(modeOf(sp('mode=manual'))).toBe('manual');
    expect(modeOf(sp('method=manual'))).toBe('manual');
    expect(modeOf(sp('mode=auto'))).toBe('auto');
  });
  it('says lengths in minutes and seconds', () => {
    expect([30, 60, 90, 600].map(lengthWords)).toEqual(['30 s', '1 min', '1 min 30 s', '10 min']);
  });
  it('builds the preview slate from the choices', () => {
    expect(slateOf('short', { style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', seconds: 60, aspect: 'VERTICAL_9_16' })).toEqual(['Short', 'Cartoon', 'Arabic (Iraqi — Baghdadi)', '1 min', '9:16']);
  });
});

describe('validation', () => {
  it('a title or one line is enough', () => {
    expect(validateManual('short', { title: '', line: '' }).title).toBe('Give the short a title or one line about it.');
    expect(validateManual('short', { title: 'Paper Boats', line: '' })).toEqual({});
    expect(validateManual('short', { title: '', line: 'A boy folds boats from his father’s letters' })).toEqual({});
    expect(titleFrom('', 'A boy folds boats\nsecond line')).toBe('A boy folds boats');
  });
  it('a custom length stays between 5 seconds and an hour; a show has none', () => {
    expect(validateManual('short', { title: 'x', line: '', seconds: 2 }).seconds).toMatch(/5 seconds/);
    expect(validateManual('show', { title: 'x', line: '', seconds: 2 })).toEqual({});
  });
  it('a music video built on an upload needs its file, in both modes', () => {
    expect(validateManual('music-video', { title: 'x', line: '', song: { source: 'upload', uploaded: false } }).song).toMatch(/song file/);
    expect(validateAuto('music-video', { song: { source: 'upload', uploaded: false } }).song).toMatch(/song file/);
    expect(validateAuto('music-video', { song: { source: 'write', uploaded: false } })).toEqual({});
  });
});

describe('the ideas the studio wrote', () => {
  const made = { id: 'short-1', title: 'The Static Sky', brief: { mode: 'AUTO_IDEA', text: '', proposalJobId: 'j1' } } as unknown as Production;
  it('lists real AUTO_IDEA jobs of the kind, newest first, says which became a film and skips failures', () => {
    const jobs = [
      job({ id: 'j1', result: { proposalId: 'p1', title: 'The Static Sky' }, createdAt: '2026-10-03T06:00:00Z' }),
      job({ id: 'j2', result: { proposalId: 'p2', title: 'Paper Boats' }, createdAt: '2026-10-03T07:00:00Z' }),
      job({ id: 'j3', status: 'GENERATING', payload: { kind: 'SHORT', brief: 'night bakery' }, progress: { phase: 'research', message: 'Querying news' }, createdAt: '2026-10-03T08:00:00Z' }),
      job({ id: 'j4', status: 'FAILED', createdAt: '2026-10-03T09:00:00Z' }),
      job({ id: 'j5', payload: { kind: 'MUSIC_VIDEO' }, result: { proposalId: 'p5', title: 'Song' } }),
      job({ id: 'j6', type: 'DEVELOP_STORY' }),
    ];
    const ideas = ideasOf(jobs, [made], 'short', undefined, (p) => `/shorts/${p.id}`);
    expect(ideas.map((i) => [i.jobId, i.status])).toEqual([['j3', 'developing'], ['j2', 'ready'], ['j1', 'made']]);
    expect(ideas[0]).toMatchObject({ title: 'night bakery', message: 'Querying news' });
    expect(ideas[2].made).toEqual({ title: 'The Static Sky', href: '/shorts/short-1' });
  });
});

describe('the development stepper', () => {
  const base: DevelopmentView = { job: { id: 'i', status: 'GENERATING', progress: { phase: 'concepts', message: 'Writing three concepts' }, createdAt: '2026-10-03T06:00:00Z' }, stages: [
    { stage: 'RESEARCH', jobId: 'a', status: 'COMPLETED', startedAt: '2026-10-03T06:00:00Z', finishedAt: '2026-10-03T06:00:30Z' },
    { stage: 'AUDIENCE', jobId: 'b', status: 'COMPLETED' },
    { stage: 'CONCEPTS', jobId: 'c', status: 'GENERATING' },
  ], proposal: null };
  it('reads each stage from its real child job and the orchestrator’s phase; nothing else moves', () => {
    const rows = stageRows(base);
    expect(rows.map((r) => r.state)).toEqual(['done', 'done', 'running', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
    expect(rows[2].note).toBe('Writing three concepts');
    expect(rows[0].who).toBe('Trend research');
  });
  it('a finished idea without a revision shows the revision as skipped', () => {
    const rows = stageRows({ ...base, job: { ...base.job, status: 'COMPLETED', result: { steps: [{ stage: 'RESEARCH', status: 'skipped', reason: 'Research is off.' }] } }, proposal: { id: 'p' } });
    expect(rows[0]).toMatchObject({ state: 'skipped', note: 'Research is off.' });
    expect(rows.find((r) => r.stage === 'REVISION')?.state).toBe('skipped');
    expect(rows.find((r) => r.stage === 'PROPOSAL')?.state).toBe('done');
  });
  it('a failed child fails its stage', () => {
    expect(stageRows({ ...base, stages: [{ stage: 'RESEARCH', jobId: 'a', status: 'FAILED', error: { code: 'X', message: 'no' } }] })[0].state).toBe('failed');
  });
  it('counts elapsed time in minutes and seconds', () => {
    expect(elapsed('2026-10-03T06:00:00Z', '2026-10-03T06:01:05Z')).toBe('1:05');
    expect(elapsed('2026-10-03 06:00:00+00', '2026-10-03 06:00:09+00')).toBe('0:09');
  });
});

describe('the engines, honestly', () => {
  it('a paused studio and an offline story engine each say so and point to Manual', () => {
    expect(autoAvailability({ storyOk: true, intakePaused: true, intakeReason: 'Redesign phase.' })).toMatchObject({ state: 'unavailable', title: 'The studio is not taking new work right now' });
    expect(autoAvailability({ storyOk: false, intakePaused: false }).title).toBe('The story engine is offline');
    expect(autoAvailability({ storyOk: null, intakePaused: false }).state).toBe('checking');
    expect(autoAvailability({ storyOk: true, intakePaused: false }).state).toBe('ready');
  });
  it('names only the research sources that are reachable', () => {
    expect(researchLine({ enabled: true, sources: [{ platform: 'TIKTOK', status: 'NOT_CONFIGURED' }, { platform: 'NEWS', status: 'READY' }, { platform: 'WIKIPEDIA', status: 'READY' }] })).toBe('News and Wikipedia are reachable. The others need access the studio does not have.');
    expect(researchLine({ enabled: false, sources: [] })).toMatch(/switched off/);
  });
  it('offers no written sample anywhere: the flows show only real proposals', () => {
    const src = ['AutoFlow.tsx', 'Review.tsx', 'CreateFlow.tsx', 'ManualFlow.tsx'].map((f) => fs.readFileSync(`src/components/wizard/${f}`, 'utf8')).join('\n');
    expect(src).not.toMatch(/sampleProposal|SAMPLE_VARIANTS/);
  });
});

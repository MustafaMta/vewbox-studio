import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import type { Production, Shot, Take } from '@/domain/types';
import { breakdownOf, decisionsOf, fractionOf, jobWords, linesToHear, neighbours, nextTab, shotState, stagePills, tabFrom, takeVerdict, workspaceHref } from '@/components/workspace/model';
import type { Decision } from '@/studio/selectors/decisions';

const take = (id: string, x: Partial<Take> = {}): Take => ({ id, label: id, assetId: `a-${id}`, createdAt: '2026-10-03T08:00:00Z', status: 'READY', provider: 'MINIMAX', ...x });
const shot = (id: string, sceneId: string, number: number, x: Partial<Shot> = {}): Shot => ({ id, sceneId, number, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT', takes: [], ...x });
const prod = (x: Partial<Production> = {}): Production => ({
  id: 'p1', kind: 'SHORT', title: 'Film', logline: '', synopsis: '', style: 'CARTOON', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, stage: 'PRODUCE',
  brief: { mode: 'MANUAL', text: '' }, castIds: [], locationIds: [],
  scenes: [{ id: 'sc1', number: 1, title: 'One', timeOfDay: 'NIGHT', characterIds: [], beats: [] }, { id: 'sc2', number: 2, title: 'Two', timeOfDay: 'NIGHT', characterIds: [], beats: [] }],
  shots: [shot('b', 'sc2', 1), shot('a', 'sc1', 1, { openingFrameAssetId: 'f' })], createdAt: '', updatedAt: '', ...x,
});
const job = (x: Partial<Job>): Job => ({ id: 'j', type: 'GENERATE_TAKE', status: 'GENERATING', priority: 0, payload: {}, attempts: 1, maxAttempts: 2, cancelRequested: false, createdAt: '2026-10-03T09:00:00Z', updatedAt: '2026-10-03T09:00:00Z', productionId: 'p1', ...x });

describe('the workspace routes', () => {
  it('lives at …/production, the map without a tab parameter', () => {
    expect(workspaceHref(prod())).toBe('/shorts/p1/production');
    expect(workspaceHref(prod(), 'final')).toBe('/shorts/p1/production?tab=final');
    expect(workspaceHref(prod({ kind: 'EPISODE', showId: 's', seasonId: 'ss' }), 'story')).toBe('/shows/s/seasons/ss/episodes/p1/production?tab=story');
  });
  it('lands the old tab names on the tab that holds the same work', () => {
    expect(tabFrom(prod(), 'overview')).toBe('map');
    expect(tabFrom(prod(), 'characters')).toBe('cast');
    expect(tabFrom(prod(), 'locations')).toBe('cast');
    expect(tabFrom(prod(), 'nonsense')).toBe('map');
    expect(tabFrom(prod({ kind: 'MUSIC_VIDEO' }), 'story')).toBe('visual');
    expect(tabFrom(prod({ kind: 'MUSIC_VIDEO' }), 'song')).toBe('song');
    expect(tabFrom(prod(), 'song')).toBe('story');
  });
  it('sends the next step to its tab', () => {
    expect(nextTab(prod({ stage: 'STORY' }))).toBe('story');
    expect(nextTab(prod({ stage: 'STORY', kind: 'MUSIC_VIDEO' }))).toBe('song');
    expect(nextTab(prod({ stage: 'COMPLETE' }))).toBe('map');
  });
});

describe('the stage pills', () => {
  it('marks the stages done, current and upcoming from the production stage, and a waiting gate', () => {
    const pills = stagePills(prod({ stage: 'STORYBOARD' }));
    expect(pills.map((x) => [x.tab, x.state])).toEqual([['map', 'current'], ['story', 'done'], ['cast', 'done'], ['storyboard', 'current'], ['produce', 'upcoming'], ['final', 'upcoming']]);
    const waiting: Decision = { kind: 'stage', id: 'stage:p1:EDIT', title: 'Film', subject: { productionId: 'p1', stage: 'EDIT' }, since: null, href: '' };
    expect(stagePills(prod({ stage: 'FINAL_CUT' }), [waiting]).find((x) => x.tab === 'final')?.state).toBe('waiting');
    expect(stagePills(prod({ stage: 'COMPLETE' })).filter((x) => x.tab !== 'map').every((x) => x.state === 'done')).toBe(true);
  });
});

describe('shot states', () => {
  it('says what a shot is, from its takes and its jobs', () => {
    const p = prod();
    expect(shotState(p, shot('x', 'sc1', 1), []).kind).toBe('planned');
    expect(shotState(p, shot('x', 'sc1', 1, { openingFrameAssetId: 'f' }), []).kind).toBe('framed');
    expect(shotState(p, shot('x', 'sc1', 1, { takes: [take('t1'), take('t2')] }), []).words).toBe('2 takes · choose one');
    expect(shotState(p, shot('x', 'sc1', 1, { takes: [take('t1'), take('t2')], selectedTakeId: 't2' }), []).words).toBe('2 takes · take 2 selected');
    expect(shotState(p, shot('x', 'sc1', 1, { takes: [take('t1', { provider: 'SAMPLE' })], selectedTakeId: 't1' }), []).kind).toBe('sample');
    expect(shotState(p, shot('x', 'sc1', 1), [job({ shotId: 'x' })]).kind).toBe('running');
    expect(shotState(p, shot('x', 'sc1', 1, { takes: [take('t1')] }), [job({ shotId: 'x', status: 'FAILED' })]).kind).toBe('failed');
    // a failure older than the newest take is history, not the shot's state
    expect(shotState(p, shot('x', 'sc1', 1, { takes: [take('t1', { createdAt: '2026-10-03T10:00:00Z' })] }), [job({ shotId: 'x', status: 'FAILED' })]).kind).toBe('choose');
  });
  it('judges takes in words, and keeps rejected ones out of the cut', () => {
    const sh = shot('x', 'sc1', 1, { takes: [take('t1'), take('t2', { rating: 'REJECTED', ratingReason: 'soft focus' }), take('t3', { rating: 'GOOD' })], selectedTakeId: 't1' });
    expect(takeVerdict(sh, sh.takes[0]).words).toBe('Selected');
    expect(takeVerdict(sh, sh.takes[1]).words).toBe('Rejected · soft focus');
    expect(takeVerdict(sh, sh.takes[2]).words).toBe('Good take');
  });
});

describe('the map', () => {
  it('orders shots by scene, then number', () => {
    expect(neighbours(prod(), 'a')).toEqual({ prev: undefined, next: expect.objectContaining({ id: 'b' }) });
  });
  it('builds the breakdown review from the scenes', () => {
    const bd = breakdownOf(prod());
    expect(bd.rows.map((r) => [r.label, r.shots, r.framed, r.ready])).toEqual([['1 · One', 1, 1, true], ['2 · Two', 1, 0, false]]);
    expect(bd.total).toEqual({ shots: 2, seconds: 10, framed: 1, ready: false });
  });
  it('shows a fraction only when the worker reports one', () => {
    expect(fractionOf({ progress: { phase: 'GENERATING' } })).toBeNull();
    expect(fractionOf({ progress: { step: 2, total: 8 } })).toEqual({ value: 0.25, words: '2 of 8' });
    expect(fractionOf({ progress: { percent: 40 } })).toEqual({ value: 0.4, words: '40%' });
    expect(jobWords(job({ shotId: 'b' }), prod())).toBe('Filming shot 2.1');
  });
  it('finds the decisions and the lines to hear of this production and shot', () => {
    const lines: Decision = { kind: 'lines', id: 'lines:p1', title: 'Film', subject: { productionId: 'p1' }, since: null, href: '', lines: [{ lineId: 'l1', shotId: 'b', characterId: 'c', text: 'Hi', jobId: 'j', audioAssetId: 'x', reason: 'DRIFTED' }] };
    const other: Decision = { kind: 'image', id: 'image:c', title: 'C', subject: { characterId: 'c' }, since: null, href: '' };
    expect(decisionsOf(prod(), [lines, other])).toEqual([lines]);
    expect(decisionsOf(prod(), [lines], 'a')).toEqual([]);
    expect([...linesToHear(prod(), [lines], 'b')]).toEqual([['l1', 'DRIFTED']]);
  });
});

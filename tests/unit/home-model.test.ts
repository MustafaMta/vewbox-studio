import { describe, expect, it } from 'vitest';
import { buildFixture } from '../../scripts/v4-fixture';
import type { Job } from '@/domain/jobs';
import type { Asset, Production } from '@/domain/types';
import { waitingDecisions } from '@/studio/selectors/decisions';
import { countWord, decisionCard, deptMark, handoffWords, introLine, lineup, parseTime, pickMarquee, recentWork, runtime, shortWhen, timecode } from '@/components/home/model';

/** The Home page's reading of the studio (src/components/home/model.ts; docs/DESIGN-SYSTEM-V5.md §8.1): every word
 *  comes from the state, nothing is invented, and an empty studio has no marquee. */

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-03T07:00:00.000Z', updatedAt: '2026-10-03T07:30:00.000Z', finishedAt: undefined, ...p });
const image = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', width: 1280, height: 720, createdAt: '2026-10-03T07:00:00.000Z', ...extra });

function studio() {
  const f = buildFixture('states');
  return f;
}

describe('formatting helpers', () => {
  it('reads Postgres and ISO times alike', () => {
    expect(parseTime('2026-10-03 09:33:34.579+00')?.toISOString()).toBe('2026-10-03T09:33:34.579Z');
    expect(parseTime('2026-10-03T09:33:34.579Z')?.toISOString()).toBe('2026-10-03T09:33:34.579Z');
    expect(parseTime('not a time')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(shortWhen('2026-10-03T09:33:00Z')).toMatch(/^3 Oct, \d\d:\d\d$/);
  });
  it('runtimes, timecodes and counts in Western digits', () => {
    expect(runtime(56)).toBe('0:56');
    expect(runtime(3729)).toBe('1:02:09');
    expect(runtime(0)).toBeNull();
    expect(timecode(56, 24)).toBe('00:00:56:00');
    expect(timecode(61.5, 24)).toBe('00:01:01:12');
    expect(countWord(4, true)).toBe('Four');
    expect(countWord(15)).toBe('15');
  });
  it('department marks and handoff words', () => {
    expect(deptMark('Post-Production')).toBe('PP');
    expect(deptMark('Quality Assurance')).toBe('QA');
    expect(deptMark('Casting & Character Design')).toBe('CC');
    expect(handoffWords('EDIT', true)).toBe('Cut handed over and validated');
    expect(handoffWords('EDIT', false)).toBe('Cut handed over · not validated');
    expect(handoffWords('SOMETHING_NEW', true)).toBe('Something new handed over');
  });
  it('the intro line says what waits and whether anything is being made', () => {
    expect(introLine(4, 0, true)).toBe('Four decisions wait for you; the studio is paused.');
    expect(introLine(1, 2, false)).toBe('One decision waits for you; two jobs are running now.');
    expect(introLine(0, 0, false)).toBe('Nothing waits for you; nothing is being made right now.');
  });
});

describe('the marquee', () => {
  it('is absent in an empty studio', () => {
    const f = studio();
    expect(pickMarquee({ ...f.state, productions: [] })).toBeNull();
  });
  it('shows the latest production with a cut: its slate, the cut poster as the wide picture, the frame poster for phones, and Screen it', () => {
    const f = studio();
    const s = f.state;
    const p = s.productions[0] as Production;
    s.assets.push(image('cut-poster'), image('frame-poster', { width: 512, height: 768, thumb: { src: '/api/media/frame-poster?thumb=1', path: 'x', width: 512, height: 768, bytes: 1 } }));
    s.assets.push({ id: 'cut-1', kind: 'VIDEO', src: '/api/media/cut-1', poster: '/api/media/cut-poster', label: 'cut', tags: [], sample: false, origin: 'GENERATED', width: 1920, height: 1080, durationSeconds: 56, createdAt: '2026-10-03T09:00:00.000Z' });
    Object.assign(p, { cutAssetId: 'cut-1', stage: 'COMPLETE', framePosterAssetId: 'frame-poster', posterAssetId: undefined, coverAssetId: undefined, updatedAt: '2099-01-01T00:00:00.000Z', exports: [{ id: 'e1', assetId: 'cut-1', format: 'mp4-h264', resolution: '1080', subtitles: 'en', createdAt: '2026-10-03T09:33:00.000Z' }] });
    const m = pickMarquee(s)!;
    expect(m.production.id).toBe(p.id);
    expect(m.finished).toBe(true);
    expect(m.kick).toBe('The final cut is ready');
    expect(m.status).toEqual({ tone: 'ok', words: 'Finished · exported' });
    expect(m.slate).toContain('0:56');
    expect(m.wide?.asset.id).toBe('cut-poster');
    expect(m.poster).toMatchObject({ kind: 'FRAME_POSTER', src: '/api/media/frame-poster?thumb=1' });
    expect(m.credit).toContain('English subtitles, burned in');
    expect(m.creditMono).toBe('1920×1080 · 00:00:56:00');
    expect(m.screenHref).toBe(`/screening?p=${p.id}`);
  });
  it('without any cut, the latest production is work in progress: Continue, its stage, no Screen it', () => {
    const f = studio();
    const s = f.state;
    for (const p of s.productions) { p.cutAssetId = undefined; }
    const latest = s.productions[1];
    latest.updatedAt = '2099-01-01T00:00:00.000Z';
    const m = pickMarquee(s)!;
    expect(m.production.id).toBe(latest.id);
    expect(m.finished).toBe(false);
    expect(m.kick.startsWith('Continue · ')).toBe(true);
    expect(m.screenHref).toBeUndefined();
  });
});

describe('the decision cards', () => {
  it('one card per decision, words from the decision’s own facts, linking where it is decided', () => {
    const f = studio();
    const s = f.state;
    const c = s.characters.find((x) => x.canonicalImage === undefined) ?? s.characters[0];
    c.canonicalImage = { assetId: 'img-draft', status: 'DRAFT', version: 2, generatedAt: '2026-10-03T08:00:00.000Z', check: { ok: true } };
    c.usage = { videos: [] } as unknown as typeof c.usage;
    s.assets.push(image('img-draft', { width: 928, height: 1664 }));
    const p = s.productions[0];
    const jobs = [...f.jobs, job({ id: 'job-produce', type: 'PRODUCE', status: 'AWAITING_REVIEW', productionId: p.id, payload: { productionId: p.id }, updatedAt: '2026-10-03T08:40:00.000Z' })];
    const d = waitingDecisions(s, f.pipeline.productions, jobs);
    const cards = d.items.map((x) => decisionCard(x, s));
    expect(cards).toHaveLength(d.count);
    const img = cards.find((x) => x.id === `image:${c.id}`);
    if (img) {
      expect(img.kindLabel).toBe('Character image · version 2');
      expect(img.heading).toBe(c.name);
      expect(img.body).toContain('Drawn again: this is version 2.');
      expect(img.href).toBe(`/characters/${c.id}`);
      expect(img.picture?.figure).toBe(true);
    }
    const pass = cards.find((x) => x.id === 'pass:job-produce')!;
    expect(pass.heading).toBe('The production pass');
    expect(pass.kindLabel).toBe(`Production review · ${p.title}`);
    expect(pass.body).toMatch(/waited for your look since 3 Oct\.$/);
    for (const card of cards) { expect(card.href.startsWith('/')).toBe(true); expect(card.action.length).toBeGreaterThan(0); }
  });
});

describe('recent work and the line-up', () => {
  it('mixes productions, characters and locations newest first, each in its own shape', () => {
    const f = studio();
    const s = f.state;
    s.locations[0].updatedAt = '2099-01-02T00:00:00.000Z';
    s.characters[0].updatedAt = '2099-01-01T00:00:00.000Z';
    const r = recentWork(s, 6);
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r[0]).toMatchObject({ key: s.locations[0].id, shape: '239', kindLabel: 'Location', href: `/locations/${s.locations[0].id}` });
    expect(r[1]).toMatchObject({ key: s.characters[0].id, shape: 'fig', kindLabel: 'Character' });
    expect(r.every((x, i) => i === 0 || r[i - 1].at >= x.at)).toBe(true);
  });
  it('the line-up names each character’s state in words', () => {
    const f = studio();
    const cast = lineup(f.state, 5);
    expect(cast.length).toBe(Math.min(5, f.state.characters.length));
    for (const c of cast) expect(['Approved', 'Draft · awaiting you', 'Not drawn yet'].includes(c.state.words) || c.state.words.startsWith('Locked · in ')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { buildFixture } from '../../scripts/v4-fixture';
import type { Job } from '@/domain/jobs';
import type { Asset, Production } from '@/domain/types';
import type { Decision } from '@/studio/selectors/decisions';
import { waitingDecisions } from '@/studio/selectors/decisions';
import {
  countWord, coverPosition, decisionCard, figureCrop, handoffWords, lineup, nameLang, needsYou, parseTime, pickMarquee, recentWork, runtime, shortWhen,
  START_ACTIONS, studioFacts, waitingCharacters,
} from '@/components/home/model';

/** The Home page's reading of the studio (src/components/home/model.ts; docs/design/VISUAL-STANDARD-V5.1.md §7): every
 *  word comes from the state, nothing is invented, the crops follow §7.1 and §5.7, and an empty studio has no marquee. */

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-03T07:00:00.000Z', updatedAt: '2026-10-03T07:30:00.000Z', finishedAt: undefined, ...p });
const image = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', width: 1280, height: 720, createdAt: '2026-10-03T07:00:00.000Z', ...extra });
const studio = () => buildFixture('states');
const percents = (pos: string) => pos.split(' ').map((v) => parseFloat(v));

/** The real marquee frame of the studio (gen-1ec1231f8f, 1280×720) with the face box and focal point §7.1 measured. */
const WIDE = { width: 1280, height: 720 };
const WIDE_PRES = { focal: { x: 0.41, y: 0.2 }, faceBox: { x: 0.33, y: 0, w: 0.16, h: 0.38 } };

describe('formatting helpers', () => {
  it('reads Postgres and ISO times alike', () => {
    expect(parseTime('2026-10-03 09:33:34.579+00')?.toISOString()).toBe('2026-10-03T09:33:34.579Z');
    expect(parseTime('2026-10-03T09:33:34.579Z')?.toISOString()).toBe('2026-10-03T09:33:34.579Z');
    expect(parseTime('not a time')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(shortWhen('2026-10-03T09:33:00Z')).toMatch(/^3 Oct, \d\d:\d\d$/);
  });
  it('runtimes and counts in Western digits', () => {
    expect(runtime(56)).toBe('0:56');
    expect(runtime(3729)).toBe('1:02:09');
    expect(runtime(0)).toBeNull();
    expect(countWord(4, true)).toBe('Four');
    expect(countWord(15)).toBe('15');
  });
  it('handoff words', () => {
    expect(handoffWords('EXPORT', true)).toBe('Export made and validated');
    expect(handoffWords('EDIT', false)).toBe('Cut handed over · not validated');
    expect(handoffWords('SOMETHING_NEW', true)).toBe('Something new handed over');
  });
  it('a name in Arabic script carries lang="ar"; others carry none', () => {
    expect(nameLang('أبو سلام')).toBe('ar');
    expect(nameLang('Elias Moore')).toBeUndefined();
  });
});

describe('the crops (§7.1, §5.7)', () => {
  it('the marquee frame: 41% 0% on desktop at every width, 34% 0% in the phone’s 4:5 window of the same frame', () => {
    expect(coverPosition(WIDE_PRES, WIDE, 1120 / 630)).toBe('41% 0%');
    expect(coverPosition(WIDE_PRES, WIDE, 1600 / 760)).toBe('41% 0%');
    expect(coverPosition(WIDE_PRES, WIDE, 1680 / 751)).toBe('41% 0%');
    const [x, y] = percents(coverPosition(WIDE_PRES, WIDE, 4 / 5));
    expect(Math.round(x)).toBe(34);
    expect(y).toBe(0);
  });
  it('the face stays inside the phone window', () => {
    const [x] = percents(coverPosition(WIDE_PRES, WIDE, 4 / 5));
    const w = (4 / 5) / (16 / 9);
    const start = (x / 100) * (1 - w);
    expect(start).toBeLessThanOrEqual(WIDE_PRES.faceBox.x);
    expect(start + w).toBeGreaterThanOrEqual(WIDE_PRES.faceBox.x + WIDE_PRES.faceBox.w);
  });
  it('without a measured face or focal point: centred horizontally, anchored at the top (never above a head)', () => {
    expect(coverPosition(undefined, WIDE, 1600 / 760)).toBe('50% 0%');
    expect(coverPosition({}, WIDE, 4 / 5)).toBe('50% 0%');
  });
  it('a face lower in the frame sits at 35 % of the visible height', () => {
    const [, y] = percents(coverPosition({ faceBox: { x: 0.4, y: 0.3, w: 0.1, h: 0.1 } }, WIDE, 1600 / 760));
    const v = (16 / 9) / (1600 / 760);
    expect(y / 100).toBeCloseTo((0.35 - 0.35 * v) / (1 - v), 3);
  });
  it('a figure in a 16:9 card: 50% 8% without a face box; the face centre at 38 % of the visible height with one', () => {
    const fig = { width: 928, height: 1664 };
    expect(figureCrop(undefined, fig)).toBe('50% 8%');
    const [x, y] = percents(figureCrop({ faceBox: { x: 0.45, y: 0.2, w: 0.1, h: 0.1 } }, fig));
    const v = (928 / 1664) / (16 / 9);
    expect(x).toBe(50);
    expect(y / 100).toBeCloseTo((0.25 - 0.38 * v) / (1 - v), 3);
  });
});

describe('the marquee', () => {
  it('is absent in an empty studio', () => {
    const f = studio();
    expect(pickMarquee({ ...f.state, productions: [] })).toBeNull();
  });
  it('a finished film: the cut poster as the wide frame, a "Finished" badge, the slate, "Open the film" and "Screen it"', () => {
    const f = studio();
    const s = f.state;
    const p = s.productions[0] as Production;
    s.assets.push(image('cut-poster'));
    s.assets.push({ id: 'cut-1', kind: 'VIDEO', src: '/api/media/cut-1', poster: '/api/media/cut-poster', label: 'cut', tags: [], sample: false, origin: 'GENERATED', width: 1920, height: 1080, durationSeconds: 56, createdAt: '2026-10-03T09:00:00.000Z' });
    Object.assign(p, { cutAssetId: 'cut-1', stage: 'COMPLETE', coverAssetId: undefined, updatedAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-10-03T06:38:18.483Z', style: 'CARTOON', language: 'EN', exports: [{ id: 'e1', assetId: 'cut-1', format: 'mp4-h264', resolution: '1080', subtitles: 'en', createdAt: '2026-10-03T09:33:00.000Z' }] });
    const m = pickMarquee(s)!;
    expect(m.production.id).toBe(p.id);
    expect(m.finished).toBe(true);
    expect(m.badge).toEqual({ tone: 'ok', words: 'Finished' });
    expect(m.slate).toEqual([p.kind === 'SHORT' ? 'Short film' : m.slate[0], '2026', '0:56', 'Cartoon', 'English']);
    expect(m.wide).toMatchObject({ src: '/api/media/cut-poster', width: 1280, height: 720 });
    expect(m.secondary).toEqual({ label: 'Open the film', href: m.href });
    expect(m.primary).toEqual({ label: 'Screen it', href: `/screening?p=${p.id}`, play: true });
    // the readout, the kicker and the credit are gone from Home (§7.1)
    expect(Object.keys(m)).not.toContain('kick');
    expect(Object.keys(m)).not.toContain('credit');
  });
  it('without any cut, the latest production is work in progress: "Continue: <stage>", no Screen it', () => {
    const f = studio();
    const s = f.state;
    for (const p of s.productions) { p.cutAssetId = undefined; }
    const latest = s.productions[1];
    latest.updatedAt = '2099-01-01T00:00:00.000Z';
    latest.stage = 'STORYBOARD';
    const m = pickMarquee(s)!;
    expect(m.production.id).toBe(latest.id);
    expect(m.finished).toBe(false);
    expect(m.badge).toEqual({ tone: 'neutral', words: 'Storyboard' });
    expect(m.primary).toEqual({ label: 'Continue: storyboard', href: `${m.href}/production` });
    expect(m.secondary.label).toBe('Open the film');
  });
  it('a title longer than 28 characters steps down one role (§4.3)', () => {
    const f = studio();
    const s = f.state;
    s.productions[0].updatedAt = '2099-01-01T00:00:00.000Z';
    s.productions[0].title = 'A considerably longer title for a film';
    for (const p of s.productions) p.cutAssetId = undefined;
    expect(pickMarquee(s)!.long).toBe(true);
  });
});

describe('needs you', () => {
  const d = (n: number, since: string | null): Decision => ({ kind: 'stage', id: `stage:p:${n}`, title: `P${n}`, subject: { productionId: 'none', stage: 'STORY' }, since, href: '/production' });
  it('omitted when nothing waits', () => {
    expect(needsYou([], studio().state)).toBeNull();
  });
  it('the four oldest are shown; the link counts them all when more wait', () => {
    const items = [d(1, '2026-10-03T05:00:00Z'), d(2, '2026-10-03T01:00:00Z'), d(3, null), d(4, '2026-10-03T03:00:00Z'), d(5, '2026-10-03T02:00:00Z'), d(6, '2026-10-03T04:00:00Z')];
    const n = needsYou(items, studio().state)!;
    expect(n.count).toBe(6);
    expect(n.cards.map((c) => c.id)).toEqual(['stage:p:2', 'stage:p:5', 'stage:p:4', 'stage:p:6']);
    expect(n.link).toBe('All 6 decisions');
    expect(needsYou(items.slice(0, 4), studio().state)!.link).toBe('All decisions');
  });
  it('one card per decision, words from the decision’s own facts; a character image is portrait-cropped', () => {
    const f = studio();
    const s = f.state;
    // the fixture's waiting character: its draft image becomes a real (non-sample) version 2
    const c = s.characters.find((x) => x.canonicalImage?.status === 'DRAFT')!;
    c.canonicalImage = { ...c.canonicalImage!, assetId: 'img-draft', version: 2 };
    s.assets.push(image('img-draft', { width: 928, height: 1664 }));
    const p = s.productions[0];
    const jobs = [...f.jobs, job({ id: 'job-produce', type: 'PRODUCE', status: 'AWAITING_REVIEW', productionId: p.id, payload: { productionId: p.id }, updatedAt: '2026-10-03T08:40:00.000Z' })];
    const w = waitingDecisions(s, f.pipeline.productions, jobs);
    const cards = w.items.map((x) => decisionCard(x, s));
    expect(cards).toHaveLength(w.count);
    const imageDecision: Decision = { kind: 'image', id: `image:${c.id}`, title: c.name, subject: { characterId: c.id }, since: '2026-10-03T02:24:07.075Z', href: `/characters/${c.id}` };
    const img = decisionCard(imageDecision, s);
    expect(img!.kindLabel).toBe('Character image · version 2');
    expect(img!.heading).toBe(c.name);
    expect(img!.body).toContain('Drawn again: this is version 2.');
    expect(img!.href).toBe(`/characters/${c.id}`);
    expect(img!.picture).toMatchObject({ figure: true, position: '50% 8%' });
    const pass = cards.find((x) => x.id === 'pass:job-produce')!;
    expect(pass.heading).toBe('The production pass');
    expect(pass.kindLabel).toBe(`Production review · ${p.title}`);
    expect(pass.body).toMatch(/waited for your look since 3 Oct\.$/);
    for (const card of cards) { expect(card.href.startsWith('/')).toBe(true); expect(card.action.length).toBeGreaterThan(0); }
    expect(waitingCharacters([...w.items, imageDecision]).has(c.id)).toBe(true);
    expect(waitingCharacters(w.items.filter((x) => x.kind !== 'image' && x.kind !== 'character')).size).toBe(0);
  });
});

describe('recent work and the line-up', () => {
  it('productions, characters and locations newest first, each a 16:9 tile with its kind in the meta', () => {
    const f = studio();
    const s = f.state;
    s.locations[0].updatedAt = '2099-01-02T00:00:00.000Z';
    s.characters[0].updatedAt = '2099-01-01T00:00:00.000Z';
    const r = recentWork(s, 6);
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r[0]).toMatchObject({ key: s.locations[0].id, kind: 'location', href: `/locations/${s.locations[0].id}` });
    expect(r[0].meta).toMatch(/^Location · (interior|exterior)/);
    expect(r[1]).toMatchObject({ key: s.characters[0].id, kind: 'character' });
    expect(r[1].meta).toMatch(/^Character · /);
    if (r[1].src) expect(r[1].position).toBe('50% 8%');
    expect(r.every((x, i) => i === 0 || r[i - 1].at >= x.at)).toBe(true);
    const prod = r.find((x) => x.kind === 'production');
    if (prod) expect(prod.meta).toMatch(/^(Short|Episode|Music video) · /);
  });
  it('the line-up keeps the studio’s order and marks only the characters that wait', () => {
    const f = studio();
    const ids = f.state.characters.map((c) => c.id);
    const cast = lineup(f.state, new Set([ids[1]]));
    expect(cast.map((c) => c.id)).toEqual(ids.slice(0, 15));
    expect(cast.filter((c) => c.waiting).map((c) => c.id)).toEqual([ids[1]]);
    for (const c of cast) expect(c.href).toBe(`/characters/${c.id}`);
  });
});

describe('start actions and the studio panel', () => {
  it('four start actions, each to its own page', () => {
    expect(START_ACTIONS.map((a) => [a.title, a.href])).toEqual([
      ['New show', '/new/show'], ['New short', '/new/short'], ['New music video', '/new/music-video'], ['New character', '/characters/new'],
    ]);
  });
  it('the four facts, from the three endpoints', () => {
    const facts = studioFacts({
      health: { intake: { paused: true, since: '2026-10-03 11:39:18.768+00' } },
      engines: { video: { ok: false }, images: { ok: false }, voice: { ok: false } },
      org: { departments: [{ id: 'POST', name: 'Post-Production' }, ...Array.from({ length: 8 }, (_, i) => ({ id: `D${i}`, name: `D${i}` }))], agents: 35, handoffs: [{ id: 'h', productionId: 'p', stage: 'EXPORT', producerDepartment: 'POST', receiverDepartment: null, qualityStatus: 'VALIDATED', createdAt: '2026-10-03 09:33:34.579+00' }] },
      running: 0,
    });
    expect(facts.map((f) => f.label)).toEqual(['State', 'Company', 'Engines', 'Last handoff']);
    expect(facts[0]).toMatchObject({ value: 'Paused', tone: 'idle' });
    expect(facts[0].second).toMatch(/^since 3 Oct, \d\d:\d\d$/);
    expect(facts[1].value).toBe('9 departments · 35 agents');
    expect(facts[2].value).toBe('Picture, video and voices offline');
    const mixed = studioFacts({ health: null, engines: { video: { ok: true }, images: { ok: true }, voice: { ok: false } }, org: null, running: 0 });
    expect(mixed[2].value).toBe('Picture and video ready · Voices offline');
    expect(facts[3].value).toBe('Post-Production · export made and validated');
    expect(facts[3].second).toMatch(/^3 Oct, \d\d:\d\d$/);
  });
  it('while loading the values are null (skeletons); a failed source says so', () => {
    const loading = studioFacts({ health: null, engines: null, org: null, running: 0 });
    expect(loading.every((f) => f.value === null)).toBe(true);
    const down = studioFacts({ health: null, engines: null, org: null, running: 0, failed: { health: true, engines: true, org: true } });
    expect(down[0]).toMatchObject({ value: 'Server unreachable', tone: 'bad' });
    expect(down.slice(1).every((f) => f.value === 'Not available')).toBe(true);
    const busy = studioFacts({ health: { intake: { paused: false } }, engines: null, org: null, running: 3 });
    expect(busy[0]).toMatchObject({ value: 'Making · 3 jobs', tone: 'running' });
  });
});

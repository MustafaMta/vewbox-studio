import { describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({ answer: {} as Record<string, unknown> }));
vi.mock('@/server/providers/llm', () => ({ json: async () => ({ data: llm.answer, result: { model: 'fake' } }) }));
vi.mock('@/server/studio/engine', () => ({ readState: async () => { throw new Error('unused'); }, command: async () => { throw new Error('unused'); } }));
vi.mock('@/server/providers/comfy', () => ({}));
vi.mock('@/server/jobs/queue', () => ({ enqueue: async () => { throw new Error('unused'); }, recordMetric: async () => {} }));
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h' }));

import { seed } from '@/domain/sample';
import { designCharacter } from '@/server/story/engine';
import { featurePhrase, keepBriefLook, LOOK_FEATURES } from '@/server/story/brief-look';

/** Acceptance run 2026-10-05 (REPORT, extra item 11): Abu Haidar's Auto design dropped the brief's "grey moustache".
 *  The brief and the design below are the real ones from that run (job-906e3e6440). */
const BRIEF = 'A Baghdadi tea seller in his late fifties with a grey moustache and a checked keffiyeh over his shoulder, who runs a small stall near the book market on Mutanabbi Street; warm, teasing and unhurried.';
const DESIGN = {
  build: 'Slightly plump with a soft belly and rounded shoulders',
  face: 'Round and friendly with prominent apple-cheeks and deep laughter lines around the eyes',
  hair: 'Salt-and-pepper hair, thinning at the top and cropped short on the sides',
  skin: 'Golden-brown, sun-kissed skin', eyes: 'Small, twinkling dark brown eyes',
  distinguishing: ['a pair of small gold-rimmed reading glasses hanging from a black cord around his neck'],
  wardrobe: 'an ankle-length white cotton dishdasha, a red-and-white checked keffiyeh draped loosely over his own right shoulder, and brown leather sandals',
};

describe('the brief’s look survives the design (item 11: the grey moustache)', () => {
  it('a feature the design dropped is carried over in the brief’s own words, first among the distinguishing details', () => {
    const { design, carried } = keepBriefLook(BRIEF, DESIGN);
    expect(carried).toEqual(['a grey moustache']);
    expect(design.distinguishing[0]).toBe('a grey moustache');
    expect(design.distinguishing).toHaveLength(2);
  });
  it('a feature the design already names (in any look field) is left alone', () => {
    expect(keepBriefLook(BRIEF, { ...DESIGN, face: `${DESIGN.face}; a thick grey moustache` }).carried).toEqual([]);
    // the keffiyeh is in the wardrobe: not carried twice
    expect(keepBriefLook(BRIEF, DESIGN).carried.some((c) => /keffiyeh/i.test(c))).toBe(false);
  });
  it('spellings and other features: mustache, a full beard, a scar, glasses; nothing invented when the brief names none', () => {
    expect(keepBriefLook('an old fisherman with a white mustache', { face: 'weathered' }).carried).toEqual(['a white mustache']);
    expect(keepBriefLook('a young doctor, full beard, round glasses and a scar across her left eyebrow', { face: 'kind', distinguishing: [] }).carried).toEqual(['full beard', 'round glasses', 'a scar across her left eyebrow']);
    expect(keepBriefLook('a cheerful baker who loves bread', { face: 'round' })).toEqual({ design: { face: 'round' }, carried: [] });
  });
  it('the distinguishing details stay within the design’s six', () => {
    const many = { face: 'x', distinguishing: ['a', 'b', 'c', 'd', 'e', 'f'] };
    expect(keepBriefLook('a man with a grey moustache', many).design.distinguishing).toEqual(['a grey moustache', 'a', 'b', 'c', 'd', 'e']);
  });
  it('every feature has a phrase in a brief that names it', () => {
    for (const f of LOOK_FEATURES) expect(f.words.source.length).toBeGreaterThan(0);
    expect(featurePhrase(BRIEF, LOOK_FEATURES.find((f) => f.id === 'moustache')!)).toBe('a grey moustache');
  });
});

describe('designCharacter keeps the brief’s look (regression: Abu Haidar, job-906e3e6440)', () => {
  it('the model’s design without the moustache comes back with it, first among the distinguishing details', async () => {
    llm.answer = { name: 'Abu Haidar', role: 'Tea Seller', sex: 'MALE', ageYears: 58, ...DESIGN, personality: 'Warm, teasing and unhurried', voice: { pitch: 'LOW', pace: 'SLOW', timbre: 'raspy and warm' } };
    const d = await designCharacter(seed(), { brief: BRIEF, name: 'Abu Haidar', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    expect(d.distinguishing[0]).toBe('a grey moustache');
    expect(d.distinguishing).toContain(DESIGN.distinguishing[0]);
  });
});
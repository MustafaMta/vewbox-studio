import { describe, expect, it } from 'vitest';
import { layoutOf } from '@/components/location/LocationBible';
import { identityHashOf, lightFacts } from '@/domain/location';
import { takeChecksOf } from '@/components/workspace/checks';

const empty = { architecture: '', geography: '', spatial: '', materials: '', entrances: '', zones: '', key: '', practicals: '', palette: '', byTime: {} };

describe('the Location Bible editor', () => {
  it('an untouched draft leaves the layout as it was (the identity hash does not move)', () => {
    const base = { architecture: 'old brick', materials: ['brick', 'wood'] };
    const loc = { kind: 'EXTERIOR' as const, description: 'a stall', landmarks: [], props: [], layout: base };
    const same = layoutOf(base, { ...empty, architecture: 'old brick', materials: 'brick\nwood' });
    expect(identityHashOf({ ...loc, layout: same })).toBe(identityHashOf(loc));
  });
  it('lists split on lines or semicolons; the light rules join the layout; empty times are dropped', () => {
    const l = layoutOf(undefined, { ...empty, entrances: 'the street; the alley', key: 'daylight, camera left', practicals: 'a paraffin lamp', palette: 'brass\nbrick red', byTime: { MORNING: 'low warm sun', NIGHT: '  ' } });
    expect(l.entrances).toEqual(['the street', 'the alley']);
    expect(lightFacts(l.light)).toEqual({ key: 'daylight, camera left', practicals: ['a paraffin lamp'], palette: ['brass', 'brick red'], byTime: { MORNING: 'low warm sun' } });
  });
});

describe('the colour check at a join is a flag to review, shown with its numbers', () => {
  it('reads as review, never a pass', () => {
    const ch = takeChecksOf({ status: 'READY', qa: { ok: true, checks: [{ name: 'colour-continuity', ok: false, value: 9.1, detail: 'against the end of the shot before: ΔY +12' }] } })!;
    expect(ch.review.map((c) => c.label)).toEqual(['Light and colour against the shot before']);
    expect(ch.summary).toMatch(/the light or colour shifts at the join/);
  });
});

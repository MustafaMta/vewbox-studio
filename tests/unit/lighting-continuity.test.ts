import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { identityHashOf, lightRuleAt, locationIdentity, locationIdentityLine } from '@/domain/location';
import { contextLines, productionContextFor } from '@/domain/production-context';
import { COLOUR_QA, colourJoin, judgeColourMatch } from '@/server/media/continuity-qa';
import { LocationDesignSchema } from '@/server/story/schemas';
import { ffmpeg } from '@/server/media/ffmpeg';
import { takeVerdict } from '@/domain/take-checks';
import type { Location, StudioState } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** Lighting and colour continuity (continuity gaps 2026-10-06, item 6): the place's lighting rules in the Location
 *  Bible, the rule filling in when a scene states no light, and the colour join measured on real clips. */

const withLight = (state: StudioState, light: NonNullable<Location['layout']>['light']): StudioState => ({ ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, layout: { ...(l.layout ?? {}), light } } : l)) });

describe('the place’s lighting rules', () => {
  it('a place without rules keeps its identity hash; rules join the canon and the identity line; per-time light is not in the line', () => {
    const { state } = fixture();
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    const lit: Location = { ...loc, layout: { light: { key: 'cool fluorescent tubes overhead', practicals: ['the green cross sign'], palette: ['white', 'mint green'], byTime: { DUSK: 'blue dusk through the front window, tubes on' } } } };
    expect(identityHashOf({ ...loc, layout: { light: {} } })).toBe(identityHashOf(loc));
    expect(identityHashOf(lit)).not.toBe(identityHashOf(loc));
    expect(locationIdentity({ ...lit, identity: locationIdentity(loc) }).version).toBe(locationIdentity(loc).version + 1);
    const line = locationIdentityLine(lit);
    expect(line).toContain('key light: cool fluorescent tubes overhead; practical lights: the green cross sign; colour palette: white, mint green');
    expect(line).not.toContain('blue dusk');
    expect(lightRuleAt(lit, 'DUSK')).toBe('blue dusk through the front window, tubes on');
    expect(lightRuleAt(lit, 'NIGHT')).toBeUndefined();
  });

  it('the rule fills in when the scene states no light; a stated or carried light wins', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, continuity: s.continuity ? { ...s.continuity, environment: { ...s.continuity.environment, lighting: undefined } } : s.continuity })) });
    const lit = withLight(state, { byTime: { DUSK: 'blue dusk through the front window, tubes on' } });
    const c = productionContextFor(lit, p, shotOf(p, 's11'));
    expect(c.location).toMatchObject({ lighting: 'blue dusk through the front window, tubes on', lightingFrom: 'LOCATION_RULE' });
    expect(contextLines(c, () => '<Subject 1>')).toContain('Light, as this place always has it at dusk: blue dusk through the front window, tubes on.');
    const stated = fixture();
    const s2 = productionContextFor(withLight(stated.state, { byTime: { DUSK: 'blue dusk' } }), stated.p, shotOf(stated.p, 's11'));
    expect(s2.location).toMatchObject({ lighting: 'cool fluorescent light', lightingFrom: 'SCENE' });
    expect(contextLines(s2, () => '<Subject 1>')).not.toContain('as this place always has it');
  });

  it('the place designer writes them (any spelling of the keys and times)', () => {
    const d = LocationDesignSchema.parse({ description: 'a pharmacy', kind: 'INTERIOR', landmarks: [], props: [], lighting: ['DUSK'], layout: { light: { keyLight: 'tubes overhead', lamps: ['green cross'], colours: ['white'], perTime: { dusk: 'blue dusk', sunset: 'orange', bogus: 'x' } } } });
    expect(d.layout?.light).toEqual({ key: 'tubes overhead', practicals: ['green cross'], palette: ['white'], byTime: { DUSK: 'orange' } });
  });
});

describe('the colour join', () => {
  it('judged against the end of the shot before, with a wider margin on a cut; a flag is REVIEW, never a rejection', () => {
    const a = { y: 120, u: 128, v: 128, frames: 12 };
    expect(judgeColourMatch(a, { y: 123, u: 130, v: 126, frames: 12 }, 'CONTINUATION').ok).toBe(true);
    const shifted = judgeColourMatch(a, { y: 121, u: 134, v: 128, frames: 12 }, 'CONTINUATION');
    expect(shifted).toMatchObject({ name: 'colour-continuity', ok: false, value: 6 });
    expect(judgeColourMatch(a, { y: 121, u: 134, v: 128, frames: 24 }, 'CUT').ok).toBe(true);
    expect(takeVerdict({ ok: true, checks: [shifted] })).toMatchObject({ decision: 'REVIEW', flags: ['colour-continuity'] });
    expect(COLOUR_QA.chroma.CUT).toBeGreaterThan(COLOUR_QA.chroma.CONTINUATION);
  });

  it('measured on real clips: a warm take after a warm shot passes, a blue one is flagged; the previous window’s end is used', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-colour-'));
    const clip = (name: string, color: string) => ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=128x72:r=24:d=2`, '-pix_fmt', 'yuv420p', path.join(dir, name)]);
    await clip('warm.mp4', '0xC08040'); await clip('warm2.mp4', '0xC28242'); await clip('blue.mp4', '0x4060C0');
    // a previous take whose window ends at frame 24: its first second is warm, its second second blue (never seen)
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0xC08040:s=128x72:r=24:d=1', '-f', 'lavfi', '-i', 'color=c=0x4060C0:s=128x72:r=24:d=1', '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', path.join(dir, 'prev.mp4')]);
    expect((await colourJoin(path.join(dir, 'warm.mp4'), path.join(dir, 'warm2.mp4'), { head: 0, relation: 'CONTINUATION' })).ok).toBe(true);
    expect((await colourJoin(path.join(dir, 'warm.mp4'), path.join(dir, 'blue.mp4'), { head: 0, relation: 'CUT' })).ok).toBe(false);
    expect((await colourJoin(path.join(dir, 'prev.mp4'), path.join(dir, 'warm2.mp4'), { previousEndFrame: 24, head: 0, relation: 'CONTINUATION' })).ok).toBe(true);
    expect((await colourJoin(path.join(dir, 'prev.mp4'), path.join(dir, 'warm2.mp4'), { head: 0, relation: 'CONTINUATION' })).ok).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);
});

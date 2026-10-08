import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameContinuityLine } from '@/server/story/prompts';
import { seed } from '@/domain/sample';
import type { Shot } from '@/domain/types';

/** THE FRAME SHOWS THE MOMENT, NOT THE PORTRAIT (2026-10-08, "The Last Crossing" 1.1–1.2): the planner wrote "Strained",
 *  "Soaked, out of breath", "foot lifting from lower step"; the frame prompt kept only position, facing, eyeline and
 *  holding, and the edit model copied the canonical portrait's smile and dry suit. And a frame is drawn ONCE. */

describe('the continuity line of a frame', () => {
  const s = seed();
  const c = s.characters.find((x) => x.id === 'layla')!;
  const shot = { continuity: { characters: [{ characterId: c.id, startPose: 'Foot lifting from lower step', pose: 'Mid-stride', position: 'CENTER', screenDirection: 'TOWARD', eyeline: 'Down at feet', holding: ['Handrail'], emotion: 'Strained', condition: 'Soaked, out of breath', wardrobe: 'Charcoal suit, soaked and clinging' }], props: [], environment: {} } } as unknown as Shot;
  const line = frameContinuityLine(shot, [c], new Map([[c.id, 1]]));

  it('says the starting pose, the expression and the condition of this moment', () => {
    expect(line).toMatch(/^the person of image 1 foot lifting from lower step, is CENTER, faces the camera, looks Down at feet, holds Handrail, with a strained expression, soaked, out of breath\./);
  });
  it('never repeats the planner’s wardrobe words (the canonical image is the wardrobe, D30)', () => {
    expect(line).not.toMatch(/charcoal suit/i);
  });
});

describe('the moment’s state, as one edit of the drawn frame', () => {
  it('momentEditPrompt names the emotion and condition and keeps everything else; nothing to edit without them', async () => {
    const { momentEditPrompt } = await import('@/server/story/prompts');
    const e = momentEditPrompt({ emotion: 'Strained', condition: 'Soaked, out of breath' })!;
    expect(e).toMatch(/^Edit this picture\. Change only the person's face and condition: the expression becomes strained; the person is soaked, out of breath, and it shows on the face, hair and clothes\. Keep everything else exactly/);
    expect(e).toContain('every mark on the face');
    expect(momentEditPrompt({ emotion: 'Calm' })).toMatch(/the expression becomes calm\. Keep/);
    expect(momentEditPrompt({})).toBeUndefined();
    expect(momentEditPrompt(undefined)).toBeUndefined();
  });
  it('the person’s own hair and facial hair are named as what to keep (the beard stayed: SFace 0.44 → 0.52)', async () => {
    const { momentEditPrompt, identityKeepOf } = await import('@/server/story/prompts');
    const keep = identityKeepOf({ hair: 'Close-cropped black hair with silver greying at the temples.', face: "Square jawline with high cheekbones, a warm, approachable expression despite his formal attire, a neatly trimmed short beard" });
    expect(keep).toBe('Close-cropped black hair with silver greying at the temples; a neatly trimmed short beard');
    expect(keep).not.toMatch(/approachable|expression/);
    expect(momentEditPrompt({ emotion: 'Strained' }, keep)).toContain('Keep everything else exactly as it is: Close-cropped black hair with silver greying at the temples; a neatly trimmed short beard; the same person');
    expect(identityKeepOf({ hair: 'Long red hair', face: 'Round face, freckles' })).toBe('Long red hair');
  });
  it('the measured face is read back from the frame; a FAIL is refused by the preflight, a REVIEW is a warning', async () => {
    const { frameIdentityOf } = await import('@/domain/frames');
    expect(frameIdentityOf({ provenance: { identityCheck: { characterId: 'c1', median: 0.44, verdict: 'REVIEW' } } })).toEqual({ characterId: 'c1', median: 0.44, verdict: 'REVIEW' });
    expect(frameIdentityOf({ provenance: {} })).toBeUndefined();
    const src = fs.readFileSync('src/server/org/preflight.ts', 'utf8');
    expect(src).toMatch(/fi\.verdict === 'FAIL'\) add\(`\$\{which\}-frame-identity`, false, 'CHARACTER_INCONSISTENCY'/);
    expect(src).toMatch(/fi\.verdict === 'REVIEW'\) warnings\.push/);
  });
});

describe('the frame’s people: the vision count and the faces', () => {
  it('a second face fails a one-person frame even when the vision count says one (the giant face in the lens)', async () => {
    const { framePeopleOk } = await import('@/worker/handlers/images');
    expect(framePeopleOk(1, 1, 1)).toBe(true);
    expect(framePeopleOk(1, 1, 2)).toBe(false); // 1.1: man on the stair + a giant face (YuNet 0.91 and 0.93)
    expect(framePeopleOk(1, 2, 2)).toBe(false); // a stranger
    expect(framePeopleOk(2, 2, 1)).toBe(true); // a face turned away is not a missing person
    expect(framePeopleOk(1, undefined, undefined)).toBe(true); // nothing measured never fails a frame
  });
});

describe('a person seen from behind has no face to measure', () => {
  it('facingAway lists the people whose continuity faces away from the camera', async () => {
    const { facingAway } = await import('@/domain/blocking');
    expect(facingAway({ continuity: { characters: [{ characterId: 'a', screenDirection: 'AWAY' }, { characterId: 'b', screenDirection: 'TOWARD' }], props: [], environment: {} } } as never)).toEqual(['a']);
    expect(facingAway({ continuity: undefined } as never)).toEqual([]);
    const src = fs.readFileSync('src/worker/handlers/take.ts', 'utf8');
    expect(src).toMatch(/filter\(\(x\) => x\.a && !away\.has\(x\.characterId\)\)/);
  });
});

describe('a face measure is read for the way the person faces', () => {
  it('profile: a FAIL is REVIEW (unreliable); from behind: not measured; facing the camera: as measured', async () => {
    const { identityForFacing } = await import('@/domain/blocking');
    expect(identityForFacing('FAIL', 'LEFT')).toEqual({ verdict: 'REVIEW', note: 'in profile: the face measure is unreliable' });
    expect(identityForFacing('PASS', 'RIGHT')).toEqual({ verdict: 'PASS' });
    expect(identityForFacing('FAIL', 'AWAY').verdict).toBe('NOT_MEASURED');
    expect(identityForFacing('FAIL', 'TOWARD')).toEqual({ verdict: 'FAIL' });
    expect(identityForFacing('FAIL', undefined)).toEqual({ verdict: 'FAIL' });
  });
});

describe('a person with no line in the shot is never said to speak', () => {
  it('poseWithoutSpeech drops speech clauses only for a silent person', async () => {
    const { poseWithoutSpeech } = await import('@/domain/production-context');
    expect(poseWithoutSpeech('Standing upright, cloth in hand, speaking', false)).toBe('Standing upright, cloth in hand');
    expect(poseWithoutSpeech('Standing upright, cloth in hand, speaking', true)).toBe('Standing upright, cloth in hand, speaking');
    expect(poseWithoutSpeech('Leaning in, whispering to her', false)).toBe('Leaning in');
    expect(poseWithoutSpeech('Speaking', false)).toBe('');
  });
});

describe('a take from an opening frame carries only the environment in words', () => {
  it('sceneStateLine environmentOnly drops the carried people and props, keeps time, weather, light, place', async () => {
    const { sceneStateLine } = await import('@/domain/scene-state');
    const s = { boundary: 'cut', timeOfDay: 'NIGHT', weather: 'Heavy rain', lighting: 'Dim, flickering bulb', placeState: 'Light sputters', present: [{ characterId: 'c1', position: 'CENTER', holding: ['Brass knob'] }], props: [{ name: 'Wrench', state: 'Set down or held loosely', position: 'In his left hand or on floor' }] } as never;
    const full = sceneStateLine(s, () => '<Subject 1>');
    expect(full).toContain('Wrench (Set down or held loosely) In his left hand or on floor');
    expect(full).toContain('<Subject 1> is CENTER, holds Brass knob');
    const env = sceneStateLine(s, () => '<Subject 1>', { environmentOnly: true });
    expect(env).toMatch(/^Scene state \(carried across the cut\): night, weather: Heavy rain, light: Dim, flickering bulb, the place: Light sputters\.$/);
    expect(env).not.toMatch(/Wrench|Subject 1/);
  });
});

describe('one request, one frame', () => {
  it('drawShotFrame draws once: no "drawn again" loop', () => {
    const src = fs.readFileSync('src/worker/handlers/images.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function drawShotFrame'), src.indexOf('async function momentState'));
    expect(fn).not.toMatch(/\(drawn again\)|attempt < 2/);
    expect((fn.match(/await draw\(ctx/g) ?? []).length).toBe(1);
  });
});

describe('a scar is drawn healed (Marcus Bell and Elena Ward: "healed scar" drew a fresh cut, 2 of 2)', () => {
  it('healedMark says what a healed scar looks like, unless the wound is fresh; a woman gets no clean-shaven clause', async () => {
    const { healedMark, canonicalIdentityLine } = await import('@/server/workflows/canonical-image');
    expect(healedMark('A small, healed scar on her left eyebrow.')).toBe('A small, healed scar on her left eyebrow (an old, fully healed scar: a thin pale flat line, the skin closed, no redness, no blood, no cut)');
    expect(healedMark('A fresh scar across the cheek')).toBe('A fresh scar across the cheek');
    expect(healedMark('Freckles across the nose')).toBe('Freckles across the nose');
    const elena = { sex: 'FEMALE' as const, ageYears: 32, build: 'Compact', face: 'Strong jawline with a slightly upturned nose and clean-shaven skin.', hair: 'Short auburn bob', eyes: 'Grey-blue', skin: 'Fair, freckled', wardrobe: 'A green oilskin coat', distinguishing: ['A small, healed scar on her left eyebrow.'] };
    const line = canonicalIdentityLine(elena).line;
    expect(line).not.toMatch(/shaved smooth/);
    expect(line).toMatch(/no redness, no blood, no cut/);
  });
  it('the canonical figure of a character with a healed scar gets a negative against a fresh wound (cfg 4 honours it)', async () => {
    const { woundNegative } = await import('@/server/workflows/canonical-image');
    expect(woundNegative({ distinguishing: ['A small, healed scar on her left eyebrow'], face: '' })).toMatch(/^, fresh wound, bleeding cut/);
    expect(woundNegative({ distinguishing: ['A fresh scar across the cheek'], face: '' })).toBe('');
    expect(woundNegative({ distinguishing: ['Freckles'], face: 'Square jaw' })).toBe('');
  });
});
describe('each line once ("The Relief" 1.4: "Had to row. Had to row.")', () => {
  it('a speaking shot tells H3 to say every line once and keep the mouths closed around it', async () => {
    const { SAID_ONCE } = await import('@/server/story/prompts');
    expect(SAID_ONCE).toMatch(/said exactly once.*no word is repeated/);
    const src = fs.readFileSync('src/server/story/prompts.ts', 'utf8');
    expect(src).toMatch(/dialogueTags\(p, sh, cast, speaker, 'says,'\)\} \$\{SAID_ONCE\}/);
  });
});
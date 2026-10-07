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

describe('one request, one frame', () => {
  it('drawShotFrame draws once: no "drawn again" loop', () => {
    const src = fs.readFileSync('src/worker/handlers/images.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function drawShotFrame'), src.indexOf('async function framedToShot'));
    expect(fn).not.toMatch(/\(drawn again\)|attempt < 2/);
    expect((fn.match(/await draw\(ctx/g) ?? []).length).toBe(1);
  });
});

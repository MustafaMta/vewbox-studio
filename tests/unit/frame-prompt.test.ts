import { describe, expect, it } from 'vitest';
import { framePrompt, frameContinuityLine } from '@/server/story/prompts';
import { fixture, shotOf } from './continuity-fixture';

/** D30: shot 1.3 of "The Static Sky" described its two people three ways (profile, planner continuity with an
 *  invented "tweed jacket", the previous shot's state) and came back with three or four people in 6 of 6 draws. */
describe('a storyboard frame names each person once', () => {
  it('continuity names people by their reference picture and never says what they wear', () => {
    const { p, state } = fixture();
    const sh = shotOf(p, 's11');
    const [a, b] = sh.characterIds;
    const withWardrobe = { ...sh, continuity: { ...sh.continuity!, characters: sh.continuity!.characters.map((x) => ({ ...x, wardrobe: 'tweed jacket' })) } };
    const line = frameContinuityLine(withWardrobe, state.characters, new Map([[a!, 2], [b!, 3]]));
    expect(line).toContain('the person of image 2 is behind the counter');
    expect(line).toContain('the person of image 3 is behind the counter');
    expect(line).not.toMatch(/tweed|wears/);
  });
  it('the previous shot carries only its props and light', () => {
    const { p, state } = fixture();
    const sh = shotOf(p, 's11');
    const line = frameContinuityLine(sh, state.characters, new Map(sh.characterIds.map((id, i) => [id, i + 2])), { peopleToo: false });
    expect(line).not.toMatch(/person|behind the counter/);
    expect(line).toContain('Light: cool fluorescent light.');
  });
  it('a person shown by a reference picture is not described again in words', () => {
    const { p, state } = fixture();
    const sh = shotOf(p, 's11');
    const pictured = framePrompt(p, sh, state.characters, undefined, undefined, { pictured: new Set(sh.characterIds) });
    const described = framePrompt(p, sh, state.characters, undefined, undefined);
    expect(pictured).not.toMatch(/year-old/);
    expect(described).toMatch(/year-old/);
  });
});

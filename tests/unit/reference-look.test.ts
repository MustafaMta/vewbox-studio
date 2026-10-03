import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '@/domain/types';

/** REFERENCE MODE never invents a look the model never saw (finding 3). The story model is text-only: in REFERENCE
 *  mode it designs who the character is and returns no look; the portrait prompt and the identity line take the look
 *  from the picture ("as in the reference picture") and state only what the producer wrote; the profile shows the
 *  empty look fields as "from the reference picture". */

const llm = vi.hoisted(() => ({ calls: [] as Array<{ schemaKeys: string[]; messages: Array<{ role: string; content: string }> }>, answer: {} as Record<string, unknown> }));
vi.mock('@/server/providers/llm', () => ({
  json: async (schema: { shape?: Record<string, unknown> }, messages: Array<{ role: string; content: string }>) => { llm.calls.push({ schemaKeys: Object.keys(schema.shape ?? {}), messages }); return { data: llm.answer, result: { model: 'fake' } }; },
}));
vi.mock('@/server/studio/engine', () => ({ readState: async () => { throw new Error('unused'); }, command: async () => { throw new Error('unused'); } }));
vi.mock('@/server/providers/comfy', () => ({}));
vi.mock('@/server/jobs/queue', () => ({ enqueue: async () => { throw new Error('unused'); }, recordMetric: async () => {} }));
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h' }));

import { seed } from '@/domain/sample';
import { designCharacter } from '@/server/story/engine';
import { LOOK_FIELDS, REFERENCE_LOOK_BRIEF } from '@/server/story/schemas';
import { referenceIdentityLine, referenceLook } from '@/worker/handlers/images';
import { referenceCanonicalPrompt, type CharacterDescription } from '@/server/workflows';
import { lookFieldText, lookFromReference } from '@/components/character/look';

beforeEach(() => { llm.calls = []; });

describe('designCharacter in REFERENCE mode (text-only model)', () => {
  it('asks only for who the character is, says the picture cannot be seen, and returns no look', async () => {
    llm.answer = { name: 'Maysoon', role: 'a seamstress in Karrada', sex: 'FEMALE', ageYears: 41, personality: 'patient, dry humour', voice: { pitch: 'MID', pace: 'MEASURED', timbre: 'warm' } };
    const d = await designCharacter(seed(), { brief: `${REFERENCE_LOOK_BRIEF}\nKeep the face from the reference picture; everything else follows the sheet.`, name: 'Maysoon', style: 'REALISTIC', language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    expect(llm.calls).toHaveLength(1);
    const { schemaKeys, messages } = llm.calls[0];
    for (const k of LOOK_FIELDS) expect(schemaKeys, `${k} is not asked of a model that cannot see the picture`).not.toContain(k);
    expect(schemaKeys).not.toContain('distinguishing');
    expect(schemaKeys).toEqual(expect.arrayContaining(['role', 'personality', 'sex', 'ageYears', 'voice']));
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toMatch(/cannot see that picture/);
    expect(user).not.toContain(REFERENCE_LOOK_BRIEF); // the marker is the orchestrator's channel, not the prompt
    for (const k of LOOK_FIELDS) expect(d[k], `${k} stays empty: "as in the reference picture"`).toBe('');
    expect(d.distinguishing).toEqual([]);
    expect(d).toMatchObject({ role: 'a seamstress in Karrada', personality: 'patient, dry humour', sex: 'FEMALE', ageYears: 41 });
  });
  it('an explicit lookFrom works too; a brief without the marker designs the whole sheet as before', async () => {
    llm.answer = { name: 'X', role: 'r', sex: 'MALE', ageYears: 30, personality: 'p' };
    await designCharacter(seed(), { brief: 'a cook', style: 'ANIME', language: 'EN', lookFrom: 'REFERENCE' });
    expect(llm.calls[0].schemaKeys).not.toContain('hair');
    llm.answer = { name: 'X', role: 'r', sex: 'MALE', ageYears: 30, build: 'slim', face: 'long', hair: 'black', skin: 'pale', eyes: 'grey', distinguishing: [], wardrobe: 'apron', personality: 'p' };
    const full = await designCharacter(seed(), { brief: 'a cook', style: 'ANIME', language: 'EN' });
    expect(llm.calls[1].schemaKeys).toEqual(expect.arrayContaining(['hair', 'wardrobe', 'face']));
    expect(full.hair).toBe('black');
  });
});

const looked = (over: Partial<Character> = {}): Character => ({ ...seed().characters.find((c) => c.id === 'nour')!, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', distinguishing: [], canon: undefined, ...over });

const described: CharacterDescription = { ageRange: '35-45', sex: 'female', build: 'slim', skinTone: 'light olive', faceShape: 'oval', hair: { colour: 'black', length: 'long', texture: 'wavy' }, facialHair: 'none', eyes: 'brown', glasses: 'none', marks: [], clothing: [{ item: 'cardigan', colour: 'green' }], footwear: 'not visible', accessories: [], notVisible: ['shoes'], confidence: {} };

describe('the canonical image and the identity line from a picture', () => {
  it('without a description, name the picture as the look and invent no look token', () => {
    const c = looked();
    expect(referenceIdentityLine(c)).toBe('Identity: build, face, hair, skin, eyes and wardrobe exactly as in the reference picture.');
    const look = referenceLook(c, undefined);
    expect(look.from).toBe('PICTURE');
    const prompt = referenceCanonicalPrompt({ style: c.style, identityLine: look.line });
    expect(prompt).toMatch(/Redraw the person in image 1/);
    expect(prompt).toContain('as in the reference picture');
    // no look the record ever held reaches the prompt
    const original = seed().characters.find((x) => x.id === 'nour')!;
    for (const k of ['hair', 'wardrobe', 'face', 'eyes'] as const) if (original[k]) expect(prompt).not.toContain(original[k]);
  });
  it('with a description, the line is what the picture shows (style first), then what the producer wrote', () => {
    const c = looked({ wardrobe: 'a blue raincoat', distinguishing: ['a scar over the left eyebrow'] });
    const look = referenceLook(c, described);
    expect(look.from).toBe('DESCRIPTION');
    expect(look.line.startsWith(`Identity: ${c.style === 'ANIME' ? '2D anime character' : c.style === 'CARTOON' ? 'stylized 3D animated character' : 'photorealistic real person'}, a woman aged about 35-45;`)).toBe(true);
    expect(look.line).toContain('long wavy black hair');
    expect(look.line).toContain('wearing green cardigan');
    expect(look.line).toContain('wearing a blue raincoat; a scar over the left eyebrow');
    expect(look.notVisible).toContain('footwear');
    expect(look.line).not.toContain('not visible');
  });
  it('state exactly what the producer wrote, and leave the rest to the picture', () => {
    const c = looked({ hair: 'short red curls', wardrobe: 'a blue raincoat', distinguishing: ['a scar over the left eyebrow'] });
    const line = referenceIdentityLine(c);
    expect(line).toBe('Identity: build, face, skin and eyes exactly as in the reference picture; short red curls hair; wearing a blue raincoat; a scar over the left eyebrow.');
    expect(referenceCanonicalPrompt({ style: 'CARTOON', identityLine: line })).toContain(line);
  });
  it('never sends a non-Latin piece the producer wrote to the image model', () => {
    const look = referenceLook(looked({ wardrobe: 'عباءة سوداء' }), described);
    expect(look.nonLatin).toEqual(['wearing عباءة سوداء']);
    expect(look.line).not.toMatch(/عباءة/);
  });
});

describe('the profile', () => {
  it('shows an empty look field as "from the reference picture" while the look is a picture’s', () => {
    const c = looked();
    expect(lookFromReference({ ...c, pendingReference: { assetId: 'up-1', addedAt: 'x' } }, [])).toBe(true);
    expect(lookFromReference({ ...c, pendingReference: undefined, portraitAssetId: 'gen-p' }, [{ id: 'gen-p', provenance: { lookFrom: 'REFERENCE' } }])).toBe(true);
    expect(lookFromReference({ ...c, pendingReference: undefined, portraitAssetId: 'gen-p' }, [{ id: 'gen-p', provenance: {} }])).toBe(false);
    expect(lookFieldText('', true, 'from the reference picture')).toBe('from the reference picture');
    expect(lookFieldText('short red curls', true, 'from the reference picture')).toBe('short red curls');
    expect(lookFieldText('', false, 'from the reference picture')).toBe('—');
  });
});

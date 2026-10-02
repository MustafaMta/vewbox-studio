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
import { referenceIdentityLine, referencePortraitPrompt } from '@/worker/handlers/images';
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

describe('the portrait prompt and the identity line from a picture', () => {
  it('name the picture as the look and invent no look token', () => {
    const c = looked();
    expect(referenceIdentityLine(c)).toBe('Identity: build, face, hair, skin, eyes and wardrobe exactly as in the reference picture.');
    const prompt = referencePortraitPrompt(c);
    expect(prompt).toMatch(/the one in the reference picture/);
    expect(prompt).toContain('as in the reference picture');
    // the description of the old prompt (age and sex, "wearing …") is gone, and so is any look the record ever held
    expect(prompt).not.toMatch(/year-old|\bwearing\b/);
    const original = seed().characters.find((x) => x.id === 'nour')!;
    for (const k of ['hair', 'wardrobe', 'face', 'eyes'] as const) if (original[k]) expect(prompt).not.toContain(original[k]);
  });
  it('state exactly what the producer wrote, and leave the rest to the picture', () => {
    const c = looked({ hair: 'short red curls', wardrobe: 'a blue raincoat', distinguishing: ['a scar over the left eyebrow'] });
    const line = referenceIdentityLine(c);
    expect(line).toBe('Identity: build, face, skin and eyes exactly as in the reference picture; short red curls hair; wearing a blue raincoat; a scar over the left eyebrow.');
    expect(referencePortraitPrompt(c)).toContain(line);
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

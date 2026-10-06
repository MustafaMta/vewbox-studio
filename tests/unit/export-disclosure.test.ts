import { describe, expect, it, vi } from 'vitest';
import type { Asset, Production } from '@/domain/types';

vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');
const { AI_DISCLOSURE, creditLines, disclosureMetadataArgs, disclosureOf } = await import('@/server/media/disclosure');
const { cuesInLanguage } = await import('@/server/media/assembly');

/** The AI disclosure every export carries (MiniMax H3 AUP) and the subtitle-language check (QA Q4). Pure. */

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'VIDEO', src: '', label: id, tags: [], sample: false, origin: 'GENERATED', createdAt: 'x', ...extra });
const p = {
  id: 'p', title: 'The Night Shift', kind: 'SHORT', scenes: [],
  shots: [
    { id: 's1', takes: [{ id: 't1', assetId: 'v1', provider: 'MINIMAX', model: 'MiniMax-H3 (local, pruned int8)' }], selectedTakeId: 't1', dialogue: [{ id: 'l1', characterId: 'c', text: 'Hi', audioAssetId: 'a1' }] },
    { id: 's2', takes: [{ id: 't2', assetId: 'v2', provider: 'MINIMAX', model: 'MiniMax-H3 (local, pruned int8)' }], selectedTakeId: 't2', dialogue: [] },
    { id: 's3', takes: [{ id: 't3', assetId: 'sample-v', provider: 'MINIMAX' }], selectedTakeId: 't3', dialogue: [] },
  ],
  song: { assetId: 'song1' },
} as unknown as Production;
const assets = [asset('v1'), asset('v2'), asset('sample-v', { sample: true }), asset('a1', { kind: 'AUDIO', tags: ['dialogue', 'voice'], provenance: { engine: 'indextts', model: 'IndexTTS-2.5' } }), asset('song1', { kind: 'AUDIO', tags: ['song'], provenance: { provider: 'ACE-STEP', model: 'ACE-Step 1.5' } })];

describe('AI disclosure (licence compliance)', () => {
  it('names the engines the film is really made of: the chosen takes’ model, the voices, the song — not a sample', () => {
    const d = disclosureOf(p, assets);
    expect(d.comment).toBe(AI_DISCLOSURE);
    expect(d.engines).toEqual(['MiniMax-H3 (local, pruned int8)', 'IndexTTS-2.5', 'ACE-Step 1.5']);
    expect(d.description).toBe(`${AI_DISCLOSURE}. Engines: MiniMax-H3 (local, pruned int8); IndexTTS-2.5; ACE-Step 1.5.`);
    expect(disclosureMetadataArgs(d, 'T')).toEqual(['-metadata', `comment=${AI_DISCLOSURE}`, '-metadata', `description=${d.description}`, '-metadata', 'title=T']);
    // the card names each engine once, by its public name (QA 2026-10-06: two internal tags of one H3)
    expect(creditLines(p, { ...d, engines: [...d.engines, 'MiniMax-H3 (local, pruned int8, base 20 steps)', 'OpenMOSS-Team/MOSS-TTS-v1.5'] })).toEqual(['The Night Shift', '', 'AI-generated with Vewbox Studio', 'Video: MiniMax H3', '', 'Engines', 'MiniMax H3', 'IndexTTS 2.5', 'ACE-Step 1.5', 'MOSS-TTS v1.5']);
  });
  it('a film with nothing identifiable still discloses MiniMax H3', () => {
    expect(disclosureOf({ ...p, shots: [], song: undefined } as Production, []).engines).toEqual(['MiniMax H3']);
  });
});

describe('subtitle track language (QA Q4)', () => {
  it('a track is in its language or it is not; an empty track never passes', () => {
    expect(cuesInLanguage([], 'en')).toBe(false);
    expect(cuesInLanguage([{ text: 'We close in ten minutes.' }], 'en')).toBe(true);
    expect(cuesInLanguage([{ text: 'We close in ten minutes.' }], 'ar')).toBe(false);
    expect(cuesInLanguage([{ text: '‏نسد بعد عشر دقايق' }], 'ar')).toBe(true);
    expect(cuesInLanguage([{ text: 'نسد\nWe close' }, { text: 'Hi' }], 'both')).toBe(true);
    expect(cuesInLanguage([{ text: 'We close' }], 'both')).toBe(false);
  });
});

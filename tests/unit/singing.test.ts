import { describe, expect, it } from 'vitest';
import type { Character, Production, Shot } from '@/domain/types';
import { singingTags } from '@/server/story/prompts';

/** The performer rule of a music video: only the assigned singer who is actually in the shot sings on camera;
 *  listeners keep their lips closed; an off-screen singer is heard, never drawn in. */

const character = (id: string, name: string): Character => ({
  id, name, role: 'Lead', style: 'ANIME', sex: 'FEMALE', ageYears: 29, build: 'slim', face: 'oval face', hair: 'short black', skin: 'olive', eyes: 'brown', wardrobe: 'a grey coat',
  distinguishing: [], personality: '', language: 'EN', voice: { pitch: 'Mid', pace: 'Slow', timbre: 'Even', samples: [] }, refs: [], usage: { productions: [] }, createdAt: '', updatedAt: '',
} as unknown as Character);

const shot = (id: string, number: number, characterIds: string[], durationSeconds = 15): Shot => ({
  id, sceneId: 'scene-1', number, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds, characterIds, dialogue: [], transition: 'CUT', takes: [],
} as unknown as Shot);

const hana = character('hana', 'Hana'); const amir = character('amir', 'Amir');
const song = {
  id: 'song', title: 'T', source: 'GENERATED', durationSeconds: 30, caption: '', singerIds: ['hana', 'amir'],
  sections: [
    { id: 's1', kind: 'VERSE', from: 0, to: 15, text: 'line one\nline two', singerIds: ['hana'], performanceMode: 'SOLO' },
    { id: 's2', kind: 'CHORUS', from: 15, to: 30, text: 'together now', singerIds: ['hana', 'amir'], performanceMode: 'DUET' },
  ],
};
const production = (shots: Shot[]): Production => ({ id: 'mv', kind: 'MUSIC_VIDEO', language: 'EN', style: 'ANIME', scenes: [{ id: 'scene-1', number: 1 }], shots, song } as unknown as Production);

describe('singingTags', () => {
  it('lets the assigned singer sing on camera and keeps a non-singer silent', () => {
    const p = production([shot('a', 1, ['hana', 'amir'])]);
    const t = singingTags(p, p.shots[0], [hana, amir]);
    expect(t).toContain('sings <d>[English] line one</d>');
    expect(t).toContain('do not sing');
  });
  it('does not draw an assigned singer who is off screen', () => {
    const p = production([shot('a', 1, ['hana']), shot('b', 2, ['hana'])]); // chorus window: Amir assigned but absent
    const t = singingTags(p, p.shots[1], [hana, amir]);
    expect(t).toContain('sings <d>[English] together now</d>');
    expect(t.match(/sings/g)?.length).toBe(1);
  });
  it('says the song is off camera when nobody on screen is a singer', () => {
    const p = production([shot('a', 1, ['amir'])]); // verse: Hana sings, only Amir is in frame
    const t = singingTags(p, p.shots[0], [hana, amir]);
    expect(t).toMatch(/off camera/);
    expect(t).not.toContain('sings <d>');
  });
});

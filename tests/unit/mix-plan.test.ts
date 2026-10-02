import { describe, expect, it } from 'vitest';
import type { Asset, Production } from '@/domain/types';
import { buildMixPlan, buildTimeline, CUT_RATE } from '@/server/media/assembly';

const asset = (id: string, hasAudio = true, durationSeconds = 5): Asset => ({ id, kind: 'VIDEO', src: `/x/${id}.mp4`, durationSeconds, provenance: { path: `video/${id}.mp4`, probe: { hasAudio } } } as unknown as Asset);
const production = (kind: 'SHORT' | 'MUSIC_VIDEO', takes: Array<{ id: string; seconds: number; trim?: number; dialogue?: boolean }>, song?: string): Production => ({
  id: 'p', kind, scenes: [{ id: 's1', number: 1 }],
  shots: takes.map((t, i) => ({ id: `shot-${i}`, sceneId: 's1', number: i + 1, durationSeconds: t.seconds, dialogue: t.dialogue ? [{ id: `l${i}`, characterId: 'c', text: 'hi' }] : [], selectedTakeId: `take-${i}`, takes: [{ id: `take-${i}`, assetId: t.id, label: 'Take 1', durationSeconds: t.seconds, trimStartFrames: t.trim, provider: 'MINIMAX', status: 'READY' }] })),
  song: song ? { id: 'song', assetId: song, durationSeconds: 30, sections: [], singerIds: [] } : undefined,
} as unknown as Production);

describe('timeline and mix plan', () => {
  it('runs the cut clock in whole frames and drops a continuation guide\'s head frames', () => {
    const p = production('SHORT', [{ id: 'a', seconds: 5 }, { id: 'b', seconds: 5.1667, trim: 22 }]);
    const tl = buildTimeline(p, [asset('a'), asset('b', true, 5.1667)]);
    expect(tl.items[0].frames).toBe(120);
    expect(tl.items[1].startFrame).toBe(120);
    expect(tl.items[1].trimStartFrames).toBe(22);
    expect(tl.items[1].frames).toBe(124 - 22);
    expect(tl.totalFrames).toBe(120 + 102);
  });
  it('a music video with a song master mutes every take soundtrack and routes the song once', () => {
    const p = production('MUSIC_VIDEO', [{ id: 'a', seconds: 5 }, { id: 'b', seconds: 5 }], 'song');
    const tl = buildTimeline(p, [asset('a'), asset('b')]);
    const plan = buildMixPlan(p, tl, { song: { id: 'song', kind: 'AUDIO' } as Asset });
    const takes = plan.tracks.filter((t) => t.kind === 'GENERATED_VIDEO_AUDIO');
    expect(takes).toHaveLength(2);
    expect(takes.every((t) => t.muted && t.gain === 0)).toBe(true);
    const master = plan.tracks.filter((t) => t.kind === 'MASTER_MUSIC');
    expect(master).toHaveLength(1);
    expect(master[0].startSample).toBe(0);
    expect(master[0].gain).toBe(1);
    expect(plan.targetLufs).toBe(-14);
  });
  it('an episode keeps each take\'s own sound at unity, sample-placed by shot frame, with recorded lines only under silent takes', () => {
    const p = production('SHORT', [{ id: 'a', seconds: 5, dialogue: true }, { id: 'b', seconds: 4, dialogue: true }]);
    const tl = buildTimeline(p, [asset('a', true), asset('b', false, 4)]);
    const plan = buildMixPlan(p, tl, { dialogueAudio: [{ assetId: 'line-b', start: 5.2, durationSeconds: 2, shotId: 'shot-1' }] });
    const a = plan.tracks.find((t) => t.sourceAssetId === 'a')!;
    expect(a.gain).toBe(1);
    expect(a.startSample).toBe(0);
    expect(a.durationSamples).toBe(5 * CUT_RATE);
    expect(plan.tracks.some((t) => t.sourceAssetId === 'b')).toBe(false); // silent take: no track
    const line = plan.tracks.find((t) => t.kind === 'DIALOGUE')!;
    expect(line.startSample).toBe(Math.round(5.2 * CUT_RATE));
    expect(plan.targetLufs).toBe(-23);
  });
  it('refuses a plan that routes one source twice', () => {
    const p = production('SHORT', [{ id: 'a', seconds: 5 }]);
    const tl = buildTimeline(p, [asset('a')]);
    expect(() => buildMixPlan(p, tl, { dialogueAudio: [{ assetId: 'a', start: 0 }] })).toThrow();
  });
});

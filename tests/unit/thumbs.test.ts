import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { THUMB_RULES, backgroundFor, hasAlphaFormat, isFigureLike, jpegArgs, makeFramePoster, makeThumbnail, portraitCrop, posterSize, thumbBudget, thumbPathFor, thumbSize } from '@/server/media/thumbs';
import { bestFrameFor, posterOf } from '@/studio/selectors/poster';
import { seed } from '@/domain/sample';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B7: display-size thumbnails and the composed frame poster. The maths is pure;
 *  the two encodes run ffmpeg on a generated picture (as the presentation tests do). */

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('thumbnail rules', () => {
  it('long side at most 960, never upscaled, even sides', () => {
    expect(thumbSize(1344, 768)).toEqual({ width: 960, height: 548 });
    expect(thumbSize(928, 1664)).toEqual({ width: 536, height: 960 });
    expect(thumbSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(thumbSize(1000, 1000)).toEqual({ width: 960, height: 960 });
  });
  it('a figure (tier, a character tag, or portrait orientation) has the 120 KB budget; a still 160 KB', () => {
    expect(isFigureLike({ tier: 'CANONICAL', width: 1344, height: 768 })).toBe(true);
    expect(isFigureLike({ tags: ['take', 'poster'], width: 1344, height: 768 })).toBe(false);
    expect(isFigureLike({ tags: ['character', 'full-body'], width: 1344, height: 768 })).toBe(true);
    expect(isFigureLike({ width: 928, height: 1664 })).toBe(true);
    expect(thumbBudget(true)).toBe(120 * 1024); expect(thumbBudget(false)).toBe(160 * 1024);
    expect(thumbPathFor('image/2026/10/gen-abc.png')).toBe('image/2026/10/gen-abc.thumb.jpg');
    expect(thumbPathFor('image/2026/10/gen.abc.webp')).toBe('image/2026/10/gen.abc.thumb.jpg');
  });
  it('transparency is flattened onto the measured edge colour, else a neutral dark', () => {
    expect(hasAlphaFormat('rgba')).toBe(true); expect(hasAlphaFormat('yuv420p')).toBe(false); expect(hasAlphaFormat('yuvj444p')).toBe(false); expect(hasAlphaFormat('pal8')).toBe(true); expect(hasAlphaFormat('ya8')).toBe(true); expect(hasAlphaFormat('rgb24')).toBe(false); expect(hasAlphaFormat('gray')).toBe(false);
    expect(backgroundFor(undefined)).toBe(THUMB_RULES.fallbackBackground);
    expect(backgroundFor({ edge: 'oklch(1.000 0.000 0.0)' })).toBe('#ffffff');
    expect(jpegArgs('in.png', 'out.jpg', 5, { width: 100, height: 60, maxBytes: 1 })).toEqual(['-v', 'error', '-i', 'in.png', '-frames:v', '1', '-filter_complex', '[0:v]scale=100:60:flags=lanczos,format=yuvj420p', '-q:v', '5', '-update', '1', 'out.jpg']);
    expect(jpegArgs('in.png', 'out.jpg', 5, { width: 100, height: 60, maxBytes: 1, hasAlpha: true, background: '#ffffff', crop: { x: 1, y: 2, w: 50, h: 75 } })[7]).toBe('color=c=0xffffff:s=100x60:d=1[bg];[0:v]crop=50:75:1:2,scale=100:60:flags=lanczos,format=rgba[fg];[bg][fg]overlay=shortest=1,format=yuvj420p');
  });
});

describe('the 2:3 crop around the focal point', () => {
  it('a wide frame keeps its height and slides to the focal point, inside the picture', () => {
    expect(portraitCrop(1344, 768, { x: 0.5, y: 0.4 })).toEqual({ x: 416, y: 0, w: 512, h: 768 });
    expect(portraitCrop(1344, 768, { x: 0.05, y: 0.4 })).toEqual({ x: 0, y: 0, w: 512, h: 768 });
    expect(portraitCrop(1344, 768, { x: 0.98, y: 0.4 })).toEqual({ x: 832, y: 0, w: 512, h: 768 });
  });
  it('a tall picture keeps its width; a 2:3 picture is taken whole', () => {
    expect(portraitCrop(928, 1664, { x: 0.5, y: 0.3 })).toEqual({ x: 0, y: 0, w: 928, h: 1392 });
    expect(portraitCrop(928, 1664, { x: 0.5, y: 0.9 })).toEqual({ x: 0, y: 272, w: 928, h: 1392 });
    expect(portraitCrop(1000, 1500)).toEqual({ x: 0, y: 0, w: 1000, h: 1500 });
  });
  it('the poster is 960×1440 at most and never upscaled', () => {
    expect(posterSize({ w: 512, h: 768 })).toEqual({ width: 512, height: 768 });
    expect(posterSize({ w: 1280, h: 1920 })).toEqual({ width: 960, height: 1440 });
  });
});

describe('the best frame of a production', () => {
  it('the selected take’s poster of the first shot of the last scene, else the first opening frame', () => {
    const s = seed();
    const ep = s.productions.find((p) => p.id === 's1e1')!;
    const best = bestFrameFor(ep, s.assets)!;
    const lastScene = [...ep.scenes].sort((a, b) => a.number - b.number).at(-1)!;
    const first = ep.shots.filter((sh) => sh.sceneId === lastScene.id)[0];
    const takeAsset = s.assets.find((a) => a.id === first.takes.find((t) => t.id === first.selectedTakeId)!.assetId)!;
    if (takeAsset.poster?.startsWith('/api/media/')) expect(best).toMatchObject({ source: 'TAKE_POSTER', shotId: first.id, sceneNumber: lastScene.number, shotNumber: 1 });
    else expect(best).toMatchObject({ source: 'OPENING_FRAME', assetId: ep.shots.find((sh) => sh.openingFrameAssetId)!.openingFrameAssetId, shotId: ep.shots.find((sh) => sh.openingFrameAssetId)!.id });
    expect(bestFrameFor({ scenes: [], shots: [] }, s.assets)).toBeNull();
    // key art wins over the frame poster; a production with neither has no poster
    expect(posterOf(ep, s.assets)?.kind).toBe('KEY_ART');
    expect(posterOf({ framePosterAssetId: ep.posterAssetId }, s.assets)?.kind).toBe('FRAME_POSTER');
    expect(posterOf({}, s.assets)).toBeNull();
  });
});

describe.runIf(hasFfmpeg)('encodes', () => {
  it('a thumbnail fits its budget at display size; a poster is 2:3 around the focal point; originals untouched', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vewbox-thumbs-'));
    const src = path.join(dir, 'frame.png');
    // a busy 1344×768 picture (noise does not compress: the budget loop has to work)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1344x768:rate=1,noise=alls=40:allf=t', '-frames:v', '1', src]);
    const before = fs.statSync(src);
    const t = await makeThumbnail(src, path.join(dir, 'frame.thumb.jpg'), { figure: false });
    expect(t.width).toBe(960); expect(t.height).toBe(548);
    expect(t.bytes).toBeLessThanOrEqual(THUMB_RULES.stillBytes);
    expect(fs.statSync(path.join(dir, 'frame.thumb.jpg')).size).toBe(t.bytes);
    const f = await makeThumbnail(src, path.join(dir, 'frame.fig.jpg'), { figure: true });
    expect(f.bytes).toBeLessThanOrEqual(THUMB_RULES.figureBytes);
    const p = await makeFramePoster(src, path.join(dir, 'poster.jpg'), { focal: { x: 0.2, y: 0.5 } });
    expect(p.crop).toEqual({ x: 13, y: 0, w: 512, h: 768 });
    expect(p.width).toBe(512); expect(p.height).toBe(768);
    expect(p.bytes).toBeLessThanOrEqual(THUMB_RULES.poster.maxBytes);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path.join(dir, 'poster.jpg')]).toString()) as { streams: Array<{ width: number; height: number }> };
    expect(probe.streams[0]).toEqual({ width: 512, height: 768 });
    const after = fs.statSync(src);
    expect(after.size).toBe(before.size); expect(after.mtimeMs).toBe(before.mtimeMs);
    await fsp.rm(dir, { recursive: true, force: true });
  }, 60_000);
});

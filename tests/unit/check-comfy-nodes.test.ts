import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { minimaxH3Video } from '@/server/workflows/minimax-h3';

/** scripts/check-comfy-nodes.mjs verifies the running ComfyUI against the node classes and inputs the studio's graphs
 *  use. It cannot run here (ComfyUI is stopped while generation is paused), so this proves the other half: its NEEDED
 *  table covers every class the local MiniMax H3 graphs emit — the continuation graph included (MiniMaxH3AddGuide,
 *  LoadVideo, GetVideoComponents), with every input those nodes are wired with. */

const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts/check-comfy-nodes.mjs'), 'utf8');
const block = script.slice(script.indexOf('const NEEDED = {'), script.indexOf('\n};', script.indexOf('const NEEDED = {')));
const NEEDED = new Map<string, string[]>();
for (const m of block.matchAll(/(?:^|[,{]\s*|\n\s*)'?([A-Za-z0-9_.]+)'?:\s*\[([^\]]*)\]/g)) NEEDED.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));

const graphs = {
  fl2va: minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5, firstFrame: 'f.png', lastFrame: 'l.png', guides: [{ frameIdx: 0, audio: 'line.wav' }] }),
  ref2va: minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5, referenceImages: ['a.png', 'b.png'], referenceAudio: ['v.wav'], firstFrame: 'f.png', lastFrame: 'l.png' }),
  continuation: minimaxH3Video({ prompt: 'p', width: 1280, height: 720, seconds: 5.92, referenceImages: ['a.png'], guides: [{ frameIdx: 0, image: 'tail.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audio: 'line.wav' }] }),
};

describe('scripts/check-comfy-nodes.mjs covers the H3 graphs', () => {
  it('lists the three nodes of the continuation guide with their inputs', () => {
    expect(NEEDED.get('MiniMaxH3AddGuide')).toEqual(['positive', 'latent', 'frame_idx', 'vae', 'audio_vae', 'image', 'audio']);
    expect(NEEDED.get('LoadVideo')).toEqual(['file']);
    expect(NEEDED.get('GetVideoComponents')).toEqual(['video']);
  });
  it('every class the graphs emit is in the table, with every input the graphs wire', () => {
    for (const [name, g] of Object.entries(graphs)) {
      for (const [id, node] of Object.entries(g)) {
        const needed = NEEDED.get(node.class_type);
        expect(needed, `${name}: node ${id} uses ${node.class_type}, which the check script does not verify`).toBeDefined();
        // autogrow slots (`ref_images.ref_image_0`) are checked by their group name
        const wired = Object.keys(node.inputs).map((k) => k.split('.')[0]);
        for (const k of wired) expect(needed, `${name}: ${node.class_type}.${k} is wired but not verified`).toContain(k);
      }
    }
    // the continuation graph really chains the three nodes
    const classes = Object.values(graphs.continuation).map((n) => n.class_type);
    expect(classes).toEqual(expect.arrayContaining(['LoadVideo', 'GetVideoComponents', 'MiniMaxH3AddGuide']));
    const guide = Object.values(graphs.continuation).find((n) => n.class_type === 'MiniMaxH3AddGuide' && n.inputs.frame_idx === 0)!;
    expect(Object.keys(guide.inputs).sort()).toEqual(['audio', 'audio_vae', 'frame_idx', 'image', 'latent', 'positive', 'vae']);
  });
});

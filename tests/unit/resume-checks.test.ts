import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { GATES, judgeDocker, judgeGpu, parseDockerInfo, parseNvidiaSmi, parseWslConfig, resumePlan, verifyModels } from '../../scripts/lib/resume-checks.mjs';

/** The one-command local resume (cloud directive §14): its judgements, on the outputs the workstation's commands print. */
describe('the machine', () => {
  it('Docker memory: the H3 staging floor and the recommendation', () => {
    const small = judgeDocker(parseDockerInfo(JSON.stringify({ MemTotal: 33 * 1024 ** 3, NCPU: 24, ServerVersion: '28.1' })));
    expect(small.ok).toBe(false);
    expect(small.problems[0]).toMatch(/needs ≥ 46 GiB .*\.wslconfig/);
    const ok = judgeDocker(parseDockerInfo(JSON.stringify({ MemTotal: 46.8 * 1024 ** 3, NCPU: 24 })));
    expect(ok).toMatchObject({ ok: true, warn: expect.stringMatching(/64 GiB is recommended/) });
    expect(parseWslConfig('[wsl2]\nmemory=80GB\nswap=32GB\n')).toEqual({ memory: '80GB', swap: '32GB' });
  });
  it('the GPU: an RTX 5090 with its 32 GB', () => {
    expect(judgeGpu(parseNvidiaSmi('NVIDIA GeForce RTX 5090, 32607, 580.97\n'))).toMatchObject({ ok: true, detail: 'NVIDIA GeForce RTX 5090, 32607 MiB, driver 580.97' });
    expect(judgeGpu(parseNvidiaSmi('NVIDIA GeForce RTX 4090, 24564, 580.97')).problems[0]).toMatch(/no RTX 5090 visible \(NVIDIA GeForce RTX 4090\)/);
    expect(judgeGpu([]).ok).toBe(false);
  });
});

describe('the model files', () => {
  const manifest = { groups: [{ name: 'video-minimax-h3', files: [{ repo: 'r', file: 'vae/a.safetensors', folder: 'vae', bytes: 10 }, { repo: 'r', file: 'x/b.safetensors', folder: 'diffusion_models', as: 'b2.safetensors', bytes: 20 }] }] };
  it('verified by the fetcher AND on the volume at its size', () => {
    const state = { 'vae/a.safetensors': { verified: true }, 'diffusion_models/b2.safetensors': { verified: true } };
    expect(verifyModels(manifest, state, '10 vae/a.safetensors\n20 diffusion_models/b2.safetensors', ['video-minimax-h3'])).toMatchObject({ ok: true, ready: 2 });
    const bad = verifyModels(manifest, { 'vae/a.safetensors': { verified: true } }, '9 vae/a.safetensors', ['video-minimax-h3', 'nope']);
    expect(bad.ok).toBe(false);
    expect(bad.missing).toEqual([{ group: 'video-minimax-h3', file: 'vae/a.safetensors', why: 'size 9, expected 10' }, { group: 'video-minimax-h3', file: 'diffusion_models/b2.safetensors', why: 'not verified by the fetcher' }]);
    expect(bad.unknownGroups).toEqual(['nope']);
  });
  it('the gates’ default groups exist in the real manifest', () => {
    const real = JSON.parse(fs.readFileSync('docker/models/manifest.json', 'utf8'));
    expect(verifyModels(real, {}, '').unknownGroups).toEqual([]);
  });
});

describe('the acceptance checkpoint', () => {
  const resume = JSON.parse(fs.readFileSync('docs/evidence/acceptance-v1/resume.json', 'utf8'));
  it('keeps the checkpoint; new takes use the new code; the cut’s joins are re-checked only when assembly changed', () => {
    const plan = resumePlan(resume, ['src/worker/handlers/take.ts', 'src/server/story/prompts.ts']);
    expect(plan.production.id).toBe('short-efe98843f0');
    expect(plan.newTakesUseNewCode).toBe(true);
    expect(plan.reassemble).toBe(false);
    expect(plan.gates.find((g: { name: string }) => g.name === 'sameVoice')).toMatchObject({ open: true });
    expect(plan.gates.find((g: { name: string }) => g.name === 'continuousBoundary')).toMatchObject({ open: false, stale: undefined });
    const again = resumePlan(resume, ['src/server/media/assembly.ts']);
    expect(again.reassemble).toBe(true);
    expect(again.gates.find((g: { name: string }) => g.name === 'continuousBoundary')?.stale).toMatch(/re-assemble/);
  });
  it('the gates of directive §16, in order', () => {
    expect(GATES.map((g: { name: string }) => g.name)).toEqual(['one English voice', 'one speaking character', 'lip-sync validation', 'two-shot continuous action', '4–8 shot continuous scene', 'intentional camera cut', 'scene transition', 'return to an established location', 'complete Short', 'Music Video', '5–10 minute episode']);
  });
});

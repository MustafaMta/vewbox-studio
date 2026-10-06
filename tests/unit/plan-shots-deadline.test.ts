import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOB_DEADLINE_MS, PLAN_SHOTS_DEADLINE_CAP_MS, jobDeadline, planShotsWorkMs } from '@/server/jobs/deadlines';

/** THE SHOT PLANNER'S DEADLINE SCALES WITH ITS WORK (docs/research/MODEL-EVAL-2026-10.md §7): a flat 60 min stopped
 *  nothing on a one-scene short, but an 8-minute, 11-scene episode is planned scene by scene in two parts each — 11 ×
 *  ≈ 170 s on Gemma 4 31B (measured), far longer on a larger model with experts on the CPU. The deadline is now the
 *  scenes' answer tokens at the model's measured speed, twice over, plus 10 minutes; never below 60 min, capped. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.resetModules(); });

/** 11 scenes of 3–4 beats over 480 s (the benchmark episode, fixtures/ep-script.json): 41 beats in all */
const episode = { targetSeconds: 480, scenes: [4, 4, 4, 4, 4, 4, 3, 4, 3, 4, 3].map((n, i) => ({ id: `s${i + 1}`, beats: Array.from({ length: n }, () => ({})) })) };

describe('planShotsWorkMs', () => {
  it('one short scene keeps the flat 60 min', () => {
    expect(planShotsWorkMs([{ answerTokens: 8000, parts: 1 }], { tokensPerSecond: 52, promptSecondsPerPart: 10 })).toBe(JOB_DEADLINE_MS.PLAN_SHOTS);
  });
  it('grows with the scenes and shrinks with the speed, under the cap', () => {
    const scenes = Array.from({ length: 11 }, () => ({ answerTokens: 13_600, parts: 2 }));
    const gemma = planShotsWorkMs(scenes, { tokensPerSecond: 52, promptSecondsPerPart: 10 });
    const slow = planShotsWorkMs(scenes, { tokensPerSecond: 8, promptSecondsPerPart: 90 });
    // 11 × (13,600 / 52 + 20) s = 3,097 s → ×2 + 10 min ≈ 113 min
    expect(gemma).toBe(Math.round(2 * 11 * (13_600 / 52 + 20) * 1000 + 600_000));
    expect(gemma).toBeGreaterThan(JOB_DEADLINE_MS.PLAN_SHOTS);
    expect(slow).toBeGreaterThan(gemma);
    expect(slow).toBeLessThanOrEqual(PLAN_SHOTS_DEADLINE_CAP_MS);
    expect(planShotsWorkMs(Array.from({ length: 200 }, () => ({ answerTokens: 20_000, parts: 2 })), { tokensPerSecond: 8, promptSecondsPerPart: 90 })).toBe(PLAN_SHOTS_DEADLINE_CAP_MS);
  });
});

describe('jobDeadline with the work', () => {
  it('takes the longer of the flat value and the work, then the scale', () => {
    expect(jobDeadline('PLAN_SHOTS', {}).ms).toBe(JOB_DEADLINE_MS.PLAN_SHOTS);
    expect(jobDeadline('PLAN_SHOTS', {}, 2 * 3_600_000).ms).toBe(2 * 3_600_000);
    expect(jobDeadline('PLAN_SHOTS', {}, 60_000).ms).toBe(JOB_DEADLINE_MS.PLAN_SHOTS);
    expect(jobDeadline('PLAN_SHOTS', { JOB_DEADLINE_SCALE: '2' }, 2 * 3_600_000).ms).toBe(4 * 3_600_000);
  });
});

describe('planShotsWork and the model speed', () => {
  it('sizes each scene by the planner\'s own budget and split rule', async () => {
    const { planShotsWork } = await import('@/server/jobs/work-deadline');
    const { planOutputTokens, sceneBudget } = await import('@/server/story/engine');
    const work = planShotsWork(episode as never, undefined, 16_384);
    expect(work).toHaveLength(11);
    expect(work[0].answerTokens).toBe(planOutputTokens(sceneBudget(episode as never, 4)));
    // ≈ 47 s → 12 shots → 13,600 tokens: two parts in a 16K context (measured: every Gemma scene took two)
    expect(work[0].parts).toBe(2);
    expect(planShotsWork(episode as never, ['s2', 's3'], 16_384)).toHaveLength(2);
    expect(planShotsWork(episode as never, undefined, 65_536)[0].parts).toBe(1);
  });
  it('measured models answer at their speed; an unmeasured local model is assumed slow; hosted is fast', async () => {
    const { llmSpeed, UNMEASURED_LLM_SPEED, HOSTED_LLM_SPEED } = await import('@/server/providers/llm');
    expect(llmSpeed('gemma4:31b-it-qat', 'openai-compatible', 'http://127.0.0.1:11434/v1').tokensPerSecond).toBe(52);
    expect(llmSpeed('qwen3:14b').tokensPerSecond).toBe(100);
    expect(llmSpeed('some-new-model:122b', 'openai-compatible', 'http://llm:11434/v1')).toEqual(UNMEASURED_LLM_SPEED);
    expect(llmSpeed('MiniMax-M3', 'minimax')).toEqual(HOSTED_LLM_SPEED);
  });
});

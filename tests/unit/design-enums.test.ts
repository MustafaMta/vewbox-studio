import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CharacterDesignSchema } from '@/server/story/engine';
import { CharacterDesignFromReferenceSchema, designSex, voicePace, voicePitch } from '@/server/story/schemas';
import { dropNulls } from '@/server/story/lenient';
import { extractJson } from '@/server/providers/llm';

/** THE CHARACTER DESIGN ACCEPTS WHAT THE MODELS WRITE (docs/research/MODEL-EVAL-2026-10.md §3, open item 6): both local
 *  models answered `"sex": "male"` and a described pitch and pace ("mid-high", "rhythmic with theatrical pauses"), and
 *  the strict enums of the design schema sent every local design back for a repair round. The first answers recorded
 *  in the evidence now validate as they are; a genuinely invalid value still fails. */

const EVID = path.join(process.cwd(), 'docs/evidence/model-eval-2026-10/llm');
/** the model's FIRST answer of a recorded design call (the assistant message the repair round quoted back) */
function firstAnswer(model: string, run: number): Record<string, unknown> {
  const rec = JSON.parse(fs.readFileSync(path.join(EVID, model, `design-run${run}.json`), 'utf8')) as { request: Array<{ role: string; content: string }> };
  const answer = rec.request.find((m) => m.role === 'assistant')!.content;
  return dropNulls(JSON.parse(extractJson(answer))) as Record<string, unknown>;
}
const issues = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) => (r.success ? [] : r.error!.issues.map((i) => i.path.join('.')));

describe('the recorded first answers (MODEL-EVAL-2026-10 llm/*/design-run*.json)', () => {
  it('Gemma 4 31B, both runs: valid on the first answer, mapped to the enums', () => {
    const r1 = CharacterDesignSchema.safeParse(firstAnswer('gemma4_31b-it-qat', 1));
    expect(issues(r1)).toEqual([]);
    expect(r1.data).toMatchObject({ sex: 'MALE', voice: { pitch: 'HIGH', pace: 'MEASURED' } }); // "mid-high", "rhythmic with theatrical pauses"
    const r2 = CharacterDesignSchema.safeParse(firstAnswer('gemma4_31b-it-qat', 2));
    expect(issues(r2)).toEqual([]);
    expect(r2.data).toMatchObject({ sex: 'MALE', voice: { pitch: 'LOW', pace: 'SLOW' } }); // "Male", "Medium-low", "Slow and rhythmic"
  });

  it('qwen3:14b: both runs valid, no enum issue (run 1\'s 120+ character role fits the record\'s 200 since Phase 1)', () => {
    const r2 = CharacterDesignSchema.safeParse(firstAnswer('qwen3_14b', 2));
    expect(issues(r2)).toEqual([]);
    expect(r2.data).toMatchObject({ sex: 'MALE', voice: { pitch: 'LOW', pace: 'MEASURED' } }); // "low and gravelly", "measured, with pauses for effect"
    const r1 = CharacterDesignSchema.safeParse(firstAnswer('qwen3_14b', 1));
    expect(issues(r1)).toEqual([]);
    expect(String((r1.data as { role: string }).role).length).toBeGreaterThan(120);
  });

  it('the reference-mode design uses the same reading', () => {
    const a = firstAnswer('gemma4_31b-it-qat', 1);
    const r = CharacterDesignFromReferenceSchema.safeParse({ name: a.name, role: a.role, sex: a.sex, ageYears: a.ageYears, personality: a.personality, voice: a.voice });
    expect(issues(r)).toEqual([]);
  });
});

describe('designSex / voicePitch / voicePace', () => {
  const ok = (s: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, v: unknown) => { const r = s.safeParse(v); return r.success ? r.data : 'REJECTED'; };

  it('maps case and synonyms', () => {
    expect(['male', 'Male', 'MALE', 'man', 'a man', 'boy'].map((v) => ok(designSex, v))).toEqual(Array(6).fill('MALE'));
    expect(['female', 'Female', 'woman', 'F', 'girl'].map((v) => ok(designSex, v))).toEqual(Array(5).fill('FEMALE'));
    expect(['low', 'deep', 'Medium-low', 'low and gravelly', 'baritone'].map((v) => ok(voicePitch, v))).toEqual(Array(5).fill('LOW'));
    expect(['mid', 'Medium', 'middle', 'moderate'].map((v) => ok(voicePitch, v))).toEqual(Array(4).fill('MID'));
    expect(['high', 'mid-high', 'High-pitched', 'squeaky'].map((v) => ok(voicePitch, v))).toEqual(Array(4).fill('HIGH'));
    expect(['slow', 'Slow and rhythmic', 'unhurried', 'leisurely'].map((v) => ok(voicePace, v))).toEqual(Array(4).fill('SLOW'));
    expect(['measured', 'measured, with pauses for effect', 'steady', 'rhythmic with theatrical pauses'].map((v) => ok(voicePace, v))).toEqual(Array(4).fill('MEASURED'));
    expect(['quick', 'fast', 'Rapid-fire', 'brisk'].map((v) => ok(voicePace, v))).toEqual(Array(4).fill('QUICK'));
  });

  it('still rejects genuinely invalid values: no category, contradicting categories, a stray letter, a non-string', () => {
    for (const v of ['unknown', 'robot', 'male or female', 'E', 'A', '', 3]) expect(ok(designSex, v)).toBe('REJECTED');
    for (const v of ['purple', 'low to high', 'gravelly', 'loud']) expect(ok(voicePitch, v)).toBe('REJECTED');
    for (const v of ['slow then fast', 'theatrical', 'pauses']) expect(ok(voicePace, v)).toBe('REJECTED');
    // "female" is never read as MALE (whole words, not substrings)
    expect(ok(designSex, 'female')).toBe('FEMALE');
  });
});

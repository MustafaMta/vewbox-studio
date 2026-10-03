import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import { creationSteps } from '@/components/character/create/preflight';

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status' | 'createdAt'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 3, cancelRequested: false, updatedAt: p.createdAt, ...p });

describe('creation steps (D4: a reload showed the image step failed although a later drawing succeeded)', () => {
  const parent = job({ id: 'p', type: 'CREATE_CHARACTER', status: 'AWAITING_REVIEW', createdAt: '2026-10-03T10:00:00Z', characterId: 'c1', result: { characterId: 'c1', steps: [{ step: 'design', status: 'done' }, { step: 'appearance', status: 'failed', reason: 'no compiler', failureClass: 'INFRASTRUCTURE' }, { step: 'voice', status: 'skipped', reason: 'no voice yet' }] } });
  const failedChild = job({ id: 'a1', type: 'CHARACTER_APPEARANCE', status: 'FAILED', createdAt: '2026-10-03T10:01:00Z', parentId: 'p', characterId: 'c1', error: { code: 'NOT_CONFIGURED', message: 'no compiler' } });
  const laterDraw = job({ id: 'a2', type: 'CHARACTER_APPEARANCE', status: 'COMPLETED', createdAt: '2026-10-03T10:40:00Z', characterId: 'c1' });

  it('a later drawing for the same character supersedes the recorded failure, without the page remembering it', () => {
    const image = creationSteps(parent, [parent, failedChild, laterDraw]).find((s) => s.step === 'image' || (s.step as string) === 'appearance');
    expect(image?.state).toBe('done');
    expect(image?.job?.id).toBe('a2');
  });
  it('without a later job the recorded failure stands', () => {
    const image = creationSteps(parent, [parent, failedChild]).find((s) => s.step === 'image' || (s.step as string) === 'appearance');
    expect(image?.state).toBe('failed');
  });
  it('a later job for ANOTHER character changes nothing', () => {
    const other = job({ ...laterDraw, id: 'a3', characterId: 'c2' });
    const image = creationSteps(parent, [parent, failedChild, other]).find((s) => s.step === 'image' || (s.step as string) === 'appearance');
    expect(image?.state).toBe('failed');
  });
});

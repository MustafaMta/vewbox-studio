import { describe, expect, it } from 'vitest';
import { persistedDraft } from '@/components/character/create/preflight';

/** Acceptance 2026-10-06: /characters/new brought the FINISHED character back in the same tab ("Draw again / Discard")
 *  with no way to start another. What the tab remembers: everything while the creation runs, only the start and the
 *  settings once it is finished. */
describe('persistedDraft', () => {
  const draft = {
    start: 'describe' as const,
    header: { style: 'REALISTIC', language: 'en' },
    describe: { name: 'Rana', brief: 'A night-shift radio operator', voiceMode: 'NONE' },
    sheet: { name: 'Rana' },
    jobId: 'job-1',
    referenceAssetId: 'asset-1',
  };

  it('keeps the brief, the sheet and the running job while the creation runs (a reload finds it)', () => {
    expect(persistedDraft(draft, false)).toEqual(draft);
  });

  it('forgets the job, the brief, the sheet and the reference once the creation is finished', () => {
    const kept = persistedDraft(draft, true);
    expect(kept).toEqual({ start: 'describe', header: draft.header });
    expect(kept).not.toHaveProperty('jobId');
    expect(kept).not.toHaveProperty('referenceAssetId');
    expect(kept).not.toHaveProperty('describe');
    expect(kept).not.toHaveProperty('sheet');
  });

  it('a finished draft stored and read back restores nothing to show (no job to reopen)', () => {
    const back = JSON.parse(JSON.stringify(persistedDraft(draft, true))) as { jobId?: string };
    expect(back.jobId).toBeUndefined();
  });
});

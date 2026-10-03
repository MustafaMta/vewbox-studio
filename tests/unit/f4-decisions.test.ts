import { describe, expect, it } from 'vitest';
import { waitingDecisions } from '@/components/shell/decisions';
import { documentTitle } from '@/components/shell/titles';
import { buildFixture } from '../../scripts/v4-fixture';

/** docs/DESIGN-SYSTEM-V4.md §5.1 (the needs-you count), §6.14, §7.3 and §8.6 B7: what waits for the producer comes
 *  from real state — pipeline gates awaiting approval and draft character images — and is not counted while the
 *  pipeline's part is unknown. Package F4. */

/** The states studio plus a draft picture on a character that was never filmed (the fixture's draft, Layla, has been
 *  in takes, so her look is locked and there is nothing to approve). */
function withDraft() {
  const f = buildFixture('states');
  const c = f.state.characters.find((x) => !x.usage?.videos?.length && x.id !== 'karim');
  if (!c) throw new Error('no unfilmed character in the sample');
  c.canonicalImage = { assetId: `ref-${c.id}-full-body`, status: 'DRAFT', version: 1, generatedAt: '2026-10-03T08:00:00.000Z', check: { ok: true } };
  return { ...f, draft: c };
}

describe('waitingDecisions', () => {
  const f = withDraft();
  it('counts the pipeline gate and a draft picture the producer can approve', () => {
    const d = waitingDecisions(f.state, f.pipeline.productions, f.jobs);
    expect(d.complete).toBe(true);
    expect(d.count).toBe(2);
    expect(d.items.map((x) => x.id)).toEqual(['stage:paper-boats:STORY', `image:${f.draft.id}`]);
    expect(d.items.map((x) => x.href)).toEqual(['/production#needs-you', `/characters/${f.draft.id}`]);
  });
  it('is incomplete while the pipeline has not answered (the count is then not shown)', () => {
    const d = waitingDecisions(f.state, null, f.jobs);
    expect(d.complete).toBe(false);
    expect(d.items.map((x) => x.kind)).toEqual(['image']);
  });
  it('does not count a picture that is being redrawn, or a locked one', () => {
    const drawing = [...f.jobs, { ...f.jobs[0], id: 'redraw', characterId: f.draft.id, payload: { characterId: f.draft.id } }];
    expect(waitingDecisions(f.state, f.pipeline.productions, drawing).items.map((x) => x.id)).toEqual(['stage:paper-boats:STORY']);
    // the fixture's Layla: a draft image, but filmed in takes — locked, nothing to approve
    expect(buildFixture('states').state.characters.find((c) => c.id === 'layla')?.canonicalImage?.status).toBe('DRAFT');
    expect(waitingDecisions(buildFixture('states').state, [], []).items).toEqual([]);
  });
  it('does not count a finished production', () => {
    const state = { ...f.state, productions: f.state.productions.map((p) => (p.id === 'paper-boats' ? { ...p, stage: 'COMPLETE' as const } : p)) };
    expect(waitingDecisions(state, f.pipeline.productions, f.jobs).items.map((x) => x.id)).toEqual([`image:${f.draft.id}`]);
  });
  it('finds nothing in the sample and the empty studio', () => {
    for (const kind of ['sample', 'empty'] as const) { const s = buildFixture(kind); expect(waitingDecisions(s.state, s.pipeline.productions, s.jobs).count).toBe(0); }
  });
});

describe('page titles the shell adds (§7.3)', () => {
  const f = buildFixture('states');
  const title = (pathname: string, waiting?: number) => documentTitle({ pathname, state: f.state, waiting });
  it('Production carries the waiting decisions in front, only when there are some', () => {
    expect(title('/production', 3)).toBe('(3) Production · Vewbox Studio');
    expect(title('/production', 0)).toBe('Production · Vewbox Studio');
    expect(title('/shows', 3)).toBe('Shows · Vewbox Studio');
  });
  it('names the dev-only kit pages', () => {
    expect(title('/kit')).toBe('Interface kit · Vewbox Studio');
    expect(title('/kit-media')).toBe('Media kit · Vewbox Studio');
  });
});

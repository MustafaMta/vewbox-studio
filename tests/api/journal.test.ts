import { describe, expect, it } from 'vitest';
import type { StudioState } from '@/domain/types';
import type { Command } from '@/domain/commands';
import { approvalSubjectHash } from '@/domain/approvals';

/** THE COMMAND JOURNAL AND BOUND APPROVALS OVER HTTP (docs/BACKEND-AUDIT-2026-10.md H9, H10, step 9): a page that
 *  re-sends a batch after a network error gets the stored answer; an approval is refused when the producer looked at
 *  another version of the story than the one there now, and goes stale when the story changes. */

const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4210';
const clientId = `api-journal-${Date.now().toString(36)}`;
const now = () => new Date().toISOString();
const seed = () => Math.random().toString(36).slice(2, 12);
const snapshot = async (): Promise<{ state: StudioState; version: number }> => (await fetch(`${BASE}/api/studio`)).json();
const send = async (commands: Command[], batchId?: string) => { const r = await fetch(`${BASE}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, commands, ...(batchId ? { batchId } : {}) }) }); return { status: r.status, body: await r.json() as { ok: boolean; version: number; replayed?: boolean } }; };

describe('a batch sent twice (audit H10)', () => {
  it('the second send is answered from the journal: same version, applied once', async () => {
    const title = `Journal show ${seed()}`;
    const cmd = { name: 'addShow', args: [{ title, logline: 'x', genre: 'Test', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' }], seed: seed(), at: now() } as unknown as Command;
    const batchId = `b-${seed()}`;
    const a = await send([cmd], batchId);
    const b = await send([cmd], batchId);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ ok: true, replayed: true, version: a.body.version });
    const shows = (await snapshot()).state.shows.filter((s) => s.title === title);
    expect(shows).toHaveLength(1);
    await send([{ name: 'deleteShow', args: [shows[0].id], seed: seed(), at: now() } as unknown as Command]);
  });
});

describe('bound approvals (audit H9)', () => {
  it('an approval of a story the producer did not see is refused; a changed story needs a new approval', async () => {
    const s = await snapshot();
    const p = s.state.productions.find((x) => x.scenes.length > 0)!;
    const url = `${BASE}/api/studio/org/productions/${encodeURIComponent(p.id)}`;
    const decide = (subjectHash?: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'STORY', decision: 'APPROVED', by: 'api test', ...(subjectHash ? { subjectHash } : {}) }) });
    const stale = await decide('0000000000000000');
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('CONFLICT');
    const seen = approvalSubjectHash(p, 'STORY');
    const ok = await decide(seen);
    expect(ok.status).toBe(201);
    expect((await ok.json()).subjectHash).toBe(seen);
    let pipeline = await (await fetch(url)).json() as { stages: Array<{ id: string; status: string; approval: { current: boolean } | null }>; subjects: Record<string, string> };
    expect(pipeline.subjects.STORY).toBe(seen);
    expect(pipeline.stages.find((x) => x.id === 'STORY')).toMatchObject({ status: 'DONE', approval: { current: true } });
    // the story changes: the approval no longer holds
    const scene = p.scenes[0];
    await send([{ name: 'updateScene', args: [p.id, scene.id, { purpose: `${scene.purpose ?? ''} (rewritten)` }], seed: seed(), at: now() } as unknown as Command]);
    pipeline = await (await fetch(url)).json();
    expect(pipeline.stages.find((x) => x.id === 'STORY')).toMatchObject({ status: 'AWAITING_APPROVAL', approval: { current: false } });
    await send([{ name: 'updateScene', args: [p.id, scene.id, { purpose: scene.purpose ?? '' }], seed: seed(), at: now() } as unknown as Command]);
  });
});

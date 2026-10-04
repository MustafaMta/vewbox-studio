import { describe, expect, it } from 'vitest';
import type { StudioState } from '@/domain/types';
import type { Command } from '@/domain/commands';

/** WHAT WAS REMOVED CAN COME BACK, OVER HTTP (docs/BACKEND-AUDIT-2026-10.md C4, step 10): a page deletes a scene that
 *  has a take; the scene is listed by GET /api/studio/deleted and POST /api/studio/restore brings it back with its
 *  shots and takes under the same ids. */

const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4210';
const clientId = `api-restore-${Date.now().toString(36)}`;
const now = () => new Date().toISOString();
const seed = () => Math.random().toString(36).slice(2, 12);
const snapshot = async (): Promise<{ state: StudioState }> => (await fetch(`${BASE}/api/studio`)).json();
const send = (commands: Command[]) => fetch(`${BASE}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, commands }) });

describe('restore (audit C4)', () => {
  it('a deleted scene with takes is listed and restored with its shots and takes', async () => {
    const s = await snapshot();
    const p = s.state.productions.find((x) => x.shots.some((sh) => sh.takes.length > 0))!;
    const shot = p.shots.find((sh) => sh.takes.length > 0)!;
    const scene = p.scenes.find((sc) => sc.id === shot.sceneId)!;
    const takeIds = p.shots.filter((sh) => sh.sceneId === scene.id).flatMap((sh) => sh.takes.map((t) => t.id)).sort();
    expect((await send([{ name: 'deleteScene', args: [p.id, scene.id], seed: seed(), at: now() } as unknown as Command])).status).toBe(200);
    expect((await snapshot()).state.productions.find((x) => x.id === p.id)!.scenes.some((sc) => sc.id === scene.id)).toBe(false);
    const listed = await (await fetch(`${BASE}/api/studio/deleted?productionId=${encodeURIComponent(p.id)}`)).json() as { items: Array<{ kind: string; id: string; takes: number }> };
    expect(listed.items.find((x) => x.kind === 'scene' && x.id === scene.id)).toMatchObject({ takes: takeIds.length });
    const r = await fetch(`${BASE}/api/studio/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'scene', id: scene.id }) });
    expect(r.status).toBe(200);
    const back = (await snapshot()).state.productions.find((x) => x.id === p.id)!;
    expect(back.scenes.some((sc) => sc.id === scene.id)).toBe(true);
    expect(back.shots.filter((sh) => sh.sceneId === scene.id).flatMap((sh) => sh.takes.map((t) => t.id)).sort()).toEqual(takeIds);
    expect((await fetch(`${BASE}/api/studio/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'everything', id: 'x' }) })).status).toBe(400);
  });
});

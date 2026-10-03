import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** /api/media PATH TRAVERSAL (docs/BACKEND-AUDIT-2026-10.md H1, step 2): the URL id is pattern-checked, the file comes
 *  from the asset row, and that stored path must name a file strictly inside its root — as written AND once links are
 *  resolved. A forged or corrupted row can never hand out a file outside the library. */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-media-paths-'));
const lib = path.join(tmp, 'library');
const outside = path.join(tmp, 'outside');
vi.stubEnv('LIBRARY_ROOT', lib);
vi.stubEnv('PUBLIC_ROOT', path.join(tmp, 'public'));

const rows = vi.hoisted(() => ({ byId: new Map<string, Record<string, unknown>>() }));
vi.mock('@/server/db/client', () => ({
  schema: { assets: { id: 'id', storage: 'storage', path: 'path', mimeType: 'mime_type', kind: 'kind', label: 'label', thumb: 'thumb' } },
  db: () => ({ select: () => ({ from: () => ({ where: async (cond: unknown) => { const id = JSON.stringify(cond).match(/"value":"([^"]+)"/)?.[1] ?? [...rows.byId.keys()].find((k) => JSON.stringify(cond).includes(k)); const r = id ? rows.byId.get(id) : undefined; return r ? [r] : []; } }) }) }),
}));

const { resolveLibrary, resolvePublic, realFileFor } = await import('@/server/media');
const { GET, HEAD } = await import('@/app/api/media/[id]/route');

beforeAll(() => {
  fs.mkdirSync(path.join(lib, 'video', '2026', '10'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'public', 'sample'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(lib, 'video', '2026', '10', 'up-ok.mp4'), 'inside');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'SECRET');
  fs.writeFileSync(path.join(tmp, 'public', 'sample', 'a.png'), 'png');
  // a junction (no admin rights needed on Windows) or symlink inside the library that points outside it
  fs.symlinkSync(outside, path.join(lib, 'video', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('stored paths stay inside their root', () => {
  it('refuses .., absolute and drive paths, UNC shares, NUL bytes, empty paths and the root itself', () => {
    const bad = ['../outside/secret.txt', '..\\outside\\secret.txt', 'video/../../outside/secret.txt', path.join(outside, 'secret.txt'), '\\\\server\\share\\x', '/etc/passwd', 'x\0.mp4', '', '.', 'video/..'];
    bad.push('C:Windows\\win.ini', 'video/2026/10/up-ok.mp4:hidden');
    if (process.platform === 'win32') bad.push('C:\\Windows\\win.ini');
    for (const rel of bad) expect(() => resolveLibrary(rel), JSON.stringify(rel)).toThrow(/Path escapes|Malformed/);
    expect(() => resolvePublic('../library/video/2026/10/up-ok.mp4')).toThrow(/Path escapes/);
    expect(resolveLibrary('video/2026/10/up-ok.mp4')).toBe(path.join(lib, 'video', '2026', '10', 'up-ok.mp4'));
  });

  it('a link inside the library that leads outside it is refused once resolved', async () => {
    expect(resolveLibrary('video/escape/secret.txt')).toBe(path.join(lib, 'video', 'escape', 'secret.txt')); // lexically inside…
    await expect(realFileFor({ storage: 'LIBRARY', path: 'video/escape/secret.txt' })).rejects.toThrow(/Path escapes/); // …really outside
    await expect(realFileFor({ storage: 'LIBRARY', path: 'video/2026/10/up-ok.mp4' })).resolves.toBe(fs.realpathSync(path.join(lib, 'video', '2026', '10', 'up-ok.mp4')));
    await expect(realFileFor({ storage: 'LIBRARY', path: 'video/2026/10/missing.mp4' })).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('GET /api/media/[id]', () => {
  const get = (id: string, q = '') => GET(new Request(`http://studio.test/api/media/${id}${q}`), { params: Promise.resolve({ id }) });
  rows.byId.set('up-ok', { id: 'up-ok', storage: 'LIBRARY', path: 'video/2026/10/up-ok.mp4', mimeType: 'video/mp4', kind: 'VIDEO', label: 'ok', thumb: null });
  rows.byId.set('up-dotdot', { id: 'up-dotdot', storage: 'LIBRARY', path: '../outside/secret.txt', mimeType: 'text/plain', kind: 'VIDEO', label: 'x', thumb: null });
  rows.byId.set('up-link', { id: 'up-link', storage: 'LIBRARY', path: 'video/escape/secret.txt', mimeType: 'text/plain', kind: 'VIDEO', label: 'x', thumb: null });
  rows.byId.set('up-thumb', { id: 'up-thumb', storage: 'LIBRARY', path: 'video/2026/10/up-ok.mp4', mimeType: 'image/png', kind: 'IMAGE', label: 'x', thumb: { path: '../outside/secret.txt' } });
  rows.byId.set('sample-pub', { id: 'sample-pub', storage: 'PUBLIC', path: '../outside/secret.txt', mimeType: 'image/png', kind: 'IMAGE', label: 'x', thumb: null });

  it('serves a library file', async () => {
    const r = await get('up-ok');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('inside');
  });

  it('never serves a file outside the library: a forged path, a link, a forged thumbnail, a public escape', async () => {
    for (const [id, q] of [['up-dotdot', ''], ['up-link', ''], ['up-thumb', '?thumb=1'], ['sample-pub', '']] as const) {
      const r = await get(id, q);
      expect(r.status, id).toBe(400);
      expect(await r.text(), id).not.toContain('SECRET');
      const h = await HEAD(new Request(`http://studio.test/api/media/${id}${q}`), { params: Promise.resolve({ id }) });
      expect(h.status, `HEAD ${id}`).toBe(400);
    }
  });

  it('a malformed id is refused before the database is asked', async () => {
    for (const id of ['..', '../etc', 'a b', 'x'.repeat(300), 'take-01\0']) expect((await get(id)).status, id).toBe(400);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commands } from '@/server/studio/engine';
import { collectGarbage, restoreGc, libraryReferences } from '@/server/media/gc';
import { markTestLibrary } from '@/server/test-guard';

/** THE ORPHAN-FILE COLLECTOR on a scratch test library and the test database (step 15): a dry run moves nothing; an
 *  applied run moves exactly the orphan to the trash with a manifest; a run can be put back; an unmarked library is
 *  refused. Never the live library. */

const root = markTestLibrary(fs.mkdtempSync(path.join(os.tmpdir(), 'vewbox-gc-')));
const tag = Math.random().toString(36).slice(2, 8);
const ids = { kept: `up-gc-${tag}` };
const write = (rel: string, body: string, ageDays = 3) => { const abs = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); const t = new Date(Date.now() - ageDays * 24 * 3600_000); fs.utimesSync(abs, t, t); return rel; };
afterAll(async () => { await commands([{ name: 'deleteAsset', args: [ids.kept] }]).catch(() => undefined); fs.rmSync(root, { recursive: true, force: true }); });

describe('library gc (step 15)', () => {
  it('dry run, apply, restore — only files no record refers to move, and they come back', async () => {
    const keptPath = write(`audio/2026/10/${ids.kept}.wav`, 'kept');
    write(`audio/2026/10/${ids.kept}.thumb.jpg`, 'thumb');
    const orphan = write(`video/2026/10/gen-orphan-${tag}.a1.mp4`, 'orphan bytes');
    const recent = write(`image/2026/10/gen-recent-${tag}.png`, 'recent', 0);
    write('notes.txt', 'not the layout');
    await commands([{ name: 'addAsset', args: [{ id: ids.kept, kind: 'AUDIO', src: `/api/media/${ids.kept}`, label: 'kept', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: keptPath } }] }]);
    const refs = await libraryReferences();
    expect(refs.paths.has(keptPath)).toBe(true);

    const dry = await collectGarbage(root);
    expect(dry.mode).toBe('dry-run');
    expect(dry.plan.candidates.map((c) => c.path)).toEqual([orphan]);
    expect(dry.plan.kept).toMatchObject({ referenced: 1, 'thumbnail of a referenced file': 1, 'too recent': 1 });
    expect(dry.plan.unknown).toEqual(['notes.txt']);
    expect(fs.existsSync(path.join(root, orphan))).toBe(true);

    const run = await collectGarbage(root, { apply: true });
    expect(run.moved).toBe(1);
    expect(fs.existsSync(path.join(root, orphan))).toBe(false);
    for (const p of [keptPath, recent]) expect(fs.existsSync(path.join(root, p))).toBe(true);
    const manifest = fs.readFileSync(run.manifest!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(manifest).toEqual([expect.objectContaining({ path: orphan, bytes: 12, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
    // a second dry run finds nothing (the trash is never scanned)
    expect((await collectGarbage(root)).plan.candidates).toEqual([]);

    expect(await restoreGc(root, run.run!)).toEqual({ restored: 1, skipped: [] });
    expect(fs.readFileSync(path.join(root, orphan), 'utf8')).toBe('orphan bytes');
  });

  it('refuses to move files out of a library that is not marked as a test library', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'vewbox-gc-plain-'));
    try {
      await expect(collectGarbage(plain, { apply: true })).rejects.toThrow(/not a test library/);
      await expect(collectGarbage(plain, { apply: true, databaseUrl: 'postgres://x@h/vewbox' })).rejects.toThrow(/confirm-live-library/);
      // a test library with the live database's records is refused too
      await expect(collectGarbage(root, { apply: true, databaseUrl: 'postgres://x@h/vewbox' })).rejects.toThrow(/live one/);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });
});

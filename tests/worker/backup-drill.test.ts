import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { commands } from '@/server/studio/engine';
import { replaceStudio } from '@/server/studio/seed';
import { restoreBackup, takeBackup } from '@/server/ops/backup';
import { markTestLibrary, withDatabase } from '@/server/test-guard';

/** THE BACKUP AND RESTORE DRILL (docs/BACKEND-AUDIT-2026-10.md M6, step 16; docs/OPERATIONS-BACKUP.md), on the test
 *  database and scratch libraries only: back up the studio (pg_dump -Fc + the library manifest, one consistent read),
 *  restore it into a NEW database, verify it against a copy of the library; a changed file, an existing database name
 *  and the live name are refused. Needs pg_dump/pg_restore on PATH or PG_DOCKER_CONTAINER (skipped otherwise). */

const tools = Boolean(process.env.PG_DOCKER_CONTAINER) || spawnSync('pg_dump', ['--version']).status === 0;
const url = process.env.DATABASE_URL!;
const tag = Math.random().toString(36).slice(2, 8);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vewbox-drill-'));
const library = markTestLibrary(path.join(scratch, 'library'));
const copy = path.join(scratch, 'library-copy');
const restored: string[] = [];
const write = (rel: string, body: string | Buffer) => { const abs = path.join(library, ...rel.split('/')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); return rel; };

afterAll(async () => {
  const admin = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} });
  try { for (const name of restored) await admin.unsafe(`drop database if exists "${name}" with (force)`); } finally { await admin.end({ timeout: 5 }); }
  fs.rmSync(scratch, { recursive: true, force: true });
  await replaceStudio('empty');
});

describe.skipIf(!tools)('backup and restore drill (step 16)', () => {
  it('backs up in one consistent read, restores into a new database and verifies it against the library copy', async () => {
    await replaceStudio('sample');
    const video = write(`video/2026/10/drill-v-${tag}.mp4`, Buffer.alloc(4096, 7));
    const image = write(`image/2026/10/drill-i-${tag}.png`, 'png bytes');
    write(`image/2026/10/drill-i-${tag}.thumb.jpg`, 'thumb bytes');
    write(`audio/2026/10/stray-${tag}.wav`, 'nothing names me');
    await commands([
      { name: 'addAsset', args: [{ id: `drill-v-${tag}`, kind: 'VIDEO', src: `/api/media/drill-v-${tag}`, label: 'drill video', tags: [], sample: false, origin: 'GENERATED', provenance: { path: video } }] },
      { name: 'addAsset', args: [{ id: `drill-i-${tag}`, kind: 'IMAGE', src: `/api/media/drill-i-${tag}`, label: 'drill picture', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: image } }] },
    ]);
    const out = path.join(scratch, 'backup');
    const meta = await takeBackup({ databaseUrl: url, libraryRoot: library, outDir: out });
    expect(meta.dump.bytes).toBeGreaterThan(1000);
    expect(meta.counts.assets).toBeGreaterThan(100);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'library-manifest.json'), 'utf8'));
    expect(manifest.files.map((f: { path: string; role: string }) => [f.path, f.role])).toEqual([[`image/2026/10/drill-i-${tag}.png`, 'file'], [`image/2026/10/drill-i-${tag}.thumb.jpg`, 'thumbnail'], [video, 'file']]);
    expect(manifest.unreferenced.map((u: { path: string }) => u.path)).toEqual([`audio/2026/10/stray-${tag}.wav`]);

    // the scratch library copy (as the operating system's copy of the library folder would be)
    fs.cpSync(library, copy, { recursive: true });
    const name = `vewbox_restore_drill_${tag}`; restored.push(name);
    const report = await restoreBackup({ backupDir: out, targetUrl: withDatabase(url, name), libraryRoot: copy });
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    // the restored studio is the one that was backed up
    const r = postgres(withDatabase(url, name), { max: 1, onnotice: () => {} });
    try { expect((await r`select count(*)::int as n from assets where id like ${`drill-%-${tag}`}`)[0].n).toBe(2); } finally { await r.end({ timeout: 5 }); }

    // refusals: the same name again (a restore never overwrites), the live name, a changed file in the library
    await expect(restoreBackup({ backupDir: out, targetUrl: withDatabase(url, name), libraryRoot: copy })).rejects.toThrow(/already exists/);
    await expect(restoreBackup({ backupDir: out, targetUrl: withDatabase(url, 'vewbox'), libraryRoot: copy })).rejects.toThrow(/live database/);
    fs.writeFileSync(path.join(copy, ...video.split('/')), Buffer.alloc(4096, 8));
    const second = `vewbox_restore_drill_${tag}_b`; restored.push(second);
    const tampered = await restoreBackup({ backupDir: out, targetUrl: withDatabase(url, second), libraryRoot: copy });
    expect(tampered.ok).toBe(false);
    expect(tampered.checks.find((c) => c.name === 'library-matches-manifest')).toMatchObject({ ok: false, detail: expect.stringContaining('content differs') });
  });
});

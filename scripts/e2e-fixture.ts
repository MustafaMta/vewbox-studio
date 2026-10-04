/** THE BROWSER SUITE'S STUDIO (docs/TESTING.md) — one committed, deterministic studio for `pnpm test:e2e`.
 *
 *  tests/fixtures/e2e/studio.json is a slice of a real studio: the one finished film the v5 page specs were accepted
 *  against ("The Static Sky": its scenes, shots, takes, cuts, exports, subtitles), its cast and location, the job
 *  history, the organisation's record (runs, handoffs, approvals, events), the story proposal and the model registry.
 *  The media files themselves are not in the repository: `apply` copies them, READ-ONLY, from the producer's library
 *  when it is on this machine, and makes a stand-in of the same kind, size and duration with ffmpeg when it is not
 *  (another machine, CI) — so every run of the suite starts from the same records on every machine.
 *
 *    tsx scripts/e2e-fixture.ts export [--from <postgres url>] [--library <dir>] [--out tests/fixtures/e2e/studio.json]
 *        Read a studio (default: DATABASE_URL of .env/.env.local, read-only; subtitle texts from its library) and
 *        write the fixture. Run it again when the film changes on purpose; review the diff.
 *
 *    tsx scripts/e2e-fixture.ts apply [--database <url>] [--library <dir>] [--source-library <dir>]
 *        Create or migrate the e2e database (default: DATABASE_URL renamed to vewbox_e2e — never the live `vewbox`,
 *        src/server/test-guard.ts refuses it), replace its studio with the fixture through the server's own seeding
 *        path (replaceStudio + persistState), load the other tables, and fill the scratch library. The Playwright
 *        global setup runs this before every suite run.
 *
 *  The specs that need the sample studio (shows, music videos, an episode's workspace, the shell) do not read it from
 *  here: they answer the browser's own GETs from scripts/v4-fixture.ts in the page (scripts/lib/capture.mjs), as before. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql as dsql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { StudioState } from '../src/domain/types';
import { assertNotLiveDatabase, databaseName } from '../src/server/test-guard';
import { ensureTestDatabase, liveLibraryRoot, migrateTestDatabase, readEnvFiles, resolveE2EDatabaseUrl, e2eLibraryRoot } from './lib/test-db';

const execFileP = promisify(execFile);

export const FIXTURE_PATH = path.join('tests', 'fixtures', 'e2e', 'studio.json');

/** The tables carried beside the studio's own (shows … assets, which persistState writes), in insert order: a table
 *  comes after the ones its foreign keys point at. `serial`: a bigserial id whose sequence is moved past the rows. */
const TABLES: Array<{ name: keyof typeof import('../src/server/db/schema'); table: string; order: string[]; serial?: string }> = [
  { name: 'jobs', table: 'jobs', order: ['createdAt', 'id'] },
  { name: 'jobDependencies', table: 'job_dependencies', order: ['jobId', 'dependsOn'] },
  { name: 'jobEvents', table: 'job_events', order: ['id'], serial: 'id' },
  { name: 'jobAttempts', table: 'job_attempts', order: ['jobId', 'attempt'] },
  { name: 'proposals', table: 'proposals', order: ['createdAt', 'id'] },
  { name: 'agentRuns', table: 'agent_runs', order: ['startedAt', 'id'] },
  { name: 'handoffs', table: 'handoffs', order: ['createdAt', 'id'] },
  { name: 'approvals', table: 'approvals', order: ['createdAt', 'id'] },
  { name: 'qaReports', table: 'qa_reports', order: ['createdAt', 'id'] },
  { name: 'studioEvents', table: 'studio_events', order: ['id'], serial: 'id' },
  { name: 'reliabilityEvents', table: 'reliability_events', order: ['createdAt', 'id'] },
  { name: 'worldRevisions', table: 'world_revisions', order: ['createdAt', 'id'] },
  { name: 'worldPins', table: 'world_pins', order: ['createdAt', 'id'] },
  { name: 'worldReads', table: 'world_reads', order: ['id'], serial: 'id' },
  { name: 'audioTimelines', table: 'audio_timelines', order: ['productionId', 'revision'] },
  { name: 'developmentArtifacts', table: 'development_artifacts', order: ['createdAt', 'id'] },
  { name: 'cutNotes', table: 'cut_notes', order: ['createdAt', 'id'] },
  { name: 'models', table: 'models', order: ['name'] },
  { name: 'workflows', table: 'workflows', order: ['name', 'version'] },
];

export interface E2EFixture {
  source: { exportedAt: string; database: string; studioVersion: number; note: string };
  /** the studio as the domain holds it (the shape persistState writes) */
  state: Pick<StudioState, 'shows' | 'seasons' | 'productions' | 'characters' | 'locations' | 'assets' | 'settings'>;
  meta: { intakePausedAt: string | null; intakePausedReason: string | null };
  tables: Record<string, Array<Record<string, unknown>>>;
  /** text files of the library (subtitles) by their library path: small, so they travel with the fixture */
  texts: Record<string, string>;
}

type Row = Record<string, unknown>;
const cmp = (a: Row, b: Row, keys: string[]) => { for (const k of keys) { const x = String(a[k] ?? ''); const y = String(b[k] ?? ''); if (x !== y) return x < y ? -1 : 1; } return 0; };

// ------------------------------------------------------------------------------------------------------------ export

export async function exportFixture(opts: { from?: string; library?: string; out?: string }): Promise<{ out: string; assets: number; texts: number }> {
  const env = { ...readEnvFiles(), ...process.env };
  const url = opts.from || env.DATABASE_URL;
  if (!url) throw new Error('export: no database (DATABASE_URL or --from)');
  const library = path.resolve(opts.library || (process.env.E2E_SOURCE_LIBRARY ?? env.LIBRARY_ROOT ?? './var/library'));
  process.env.DATABASE_URL = url;
  // read-only: snapshot and selects, nothing else (the server modules are imported after the URL is set)
  const [{ loadSnapshot }, { db, schema, closeDb }] = await Promise.all([import('../src/server/studio/snapshot'), import('../src/server/db/client')]);
  try {
    const snap = await loadSnapshot();
    const tables: E2EFixture['tables'] = {};
    for (const t of TABLES) {
      const rows = (await db().select().from(schema[t.name] as unknown as PgTable)) as Row[];
      tables[t.table] = rows.sort((a, b) => cmp(a, b, t.order));
    }
    const [meta] = await db().select().from(schema.studioMeta);
    const texts: Record<string, string> = {};
    for (const a of snap.state.assets) {
      if (a.kind !== 'SUBTITLE' || a.sample) continue;
      const rel = String(a.provenance?.path ?? '');
      if (!rel) continue;
      try { texts[rel] = await fsp.readFile(path.join(library, rel), 'utf8'); } catch { /* the file is gone: a stand-in is written at apply */ }
    }
    const fixture: E2EFixture = {
      source: { exportedAt: new Date().toISOString(), database: databaseName(url) ?? '?', studioVersion: snap.version, note: 'written by scripts/e2e-fixture.ts export; the media files are copied from the library (or stood in for) at apply' },
      state: { shows: snap.state.shows, seasons: snap.state.seasons, productions: snap.state.productions, characters: snap.state.characters, locations: snap.state.locations, assets: snap.state.assets, settings: snap.state.settings },
      meta: { intakePausedAt: meta?.intakePausedAt ?? null, intakePausedReason: meta?.intakePausedReason ?? null },
      tables,
      texts,
    };
    const out = path.resolve(opts.out || FIXTURE_PATH);
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, serialize(fixture));
    return { out, assets: snap.state.assets.length, texts: Object.keys(texts).length };
  } finally { await closeDb(); }
}

/** One record per line, so a re-export diffs by row rather than by 1.8 MB of indentation. */
function serialize(fx: E2EFixture): string {
  const line = (v: unknown) => JSON.stringify(v);
  const rows = (v: unknown[]) => (v.length ? `[\n${v.map((r) => `   ${line(r)}`).join(',\n')}\n  ]` : '[]');
  const group = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `  ${line(k)}: ${Array.isArray(v) ? rows(v) : line(v)}`).join(',\n');
  return `{\n "source": ${line(fx.source)},\n "state": {\n${group(fx.state)}\n },\n "meta": ${line(fx.meta)},\n "tables": {\n${group(fx.tables)}\n },\n "texts": ${JSON.stringify(fx.texts, null, 1)}\n}\n`;
}

// ------------------------------------------------------------------------------------------------------------- apply

export interface ApplyReport { database: string; library: string; sourceLibrary?: string; copied: number; kept: number; standIns: number; texts: number; version: number }

export function readFixture(file = FIXTURE_PATH): E2EFixture {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as E2EFixture;
}

/** The files the fixture's assets name in the library: every library asset's own file and its thumbnail. */
export function libraryFiles(fx: E2EFixture): Array<{ rel: string; kind: string; bytes?: number; width?: number; height?: number; durationSeconds?: number; mimeType?: string }> {
  const out: Array<{ rel: string; kind: string; bytes?: number; width?: number; height?: number; durationSeconds?: number; mimeType?: string }> = [];
  for (const a of fx.state.assets) {
    if (a.sample) continue;
    const rel = String(a.provenance?.path ?? '');
    if (rel) out.push({ rel, kind: a.kind, bytes: a.bytes, width: a.width, height: a.height, durationSeconds: a.durationSeconds, mimeType: a.mimeType });
    if (a.thumb?.path) out.push({ rel: a.thumb.path, kind: 'THUMB', bytes: a.thumb.bytes, width: a.thumb.width, height: a.thumb.height, mimeType: 'image/jpeg' });
  }
  return out;
}

/** A file of the same kind, shape and length as the one the record describes, made with ffmpeg: enough for a player
 *  to load it, seek in it and read its duration. Never used when the real file is available. */
async function standIn(abs: string, f: ReturnType<typeof libraryFiles>[number]): Promise<void> {
  const ext = path.extname(abs).slice(1).toLowerCase();
  const w = Math.max(16, Math.min(f.width ?? 320, 640)); const h = Math.max(16, Math.min(f.height ?? 180, 640));
  const even = (n: number) => (n % 2 ? n + 1 : n);
  const dur = Math.max(1, Math.round((f.durationSeconds ?? 4) * 10) / 10);
  const args: string[] = ['-y', '-v', 'error', '-nostdin'];
  if (f.kind === 'VIDEO') args.push('-f', 'lavfi', '-i', `testsrc2=size=${even(w)}x${even(h)}:rate=10`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050', '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart');
  else if (f.kind === 'AUDIO') args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050', '-t', String(dur), ...(ext === 'wav' ? ['-c:a', 'pcm_s16le'] : ext === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '64k'] : ['-c:a', 'aac', '-b:a', '64k']));
  else if (f.kind === 'SUBTITLE') { await fsp.writeFile(abs, ext === 'srt' ? '1\n00:00:01,000 --> 00:00:03,000\nstand-in\n' : 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nstand-in\n'); return; }
  else args.push('-f', 'lavfi', '-i', `color=c=0x2a2a28:size=${even(w)}x${even(h)}`, '-frames:v', '1');
  await execFileP('ffmpeg', [...args, abs]);
}

export async function applyFixture(opts: { database?: string; library?: string; sourceLibrary?: string; file?: string; log?: (s: string) => void } = {}): Promise<ApplyReport> {
  const log = opts.log ?? ((s: string) => console.log(`[e2e-fixture] ${s}`));
  const fx = readFixture(opts.file);
  const url = opts.database || resolveE2EDatabaseUrl();
  const name = assertNotLiveDatabase(url, 'e2e fixture');
  const library = opts.library ? path.resolve(opts.library) : e2eLibraryRoot();
  const source = opts.sourceLibrary ? path.resolve(opts.sourceLibrary) : liveLibraryRoot();
  if (source && path.resolve(source) === path.resolve(library)) throw new Error('e2e fixture: the scratch library and the source library are the same folder');

  // ---- the library: copy what exists (read-only), stand in for what does not ------------------------------------
  const report: ApplyReport = { database: name, library, sourceLibrary: source, copied: 0, kept: 0, standIns: 0, texts: 0, version: 0 };
  for (const [rel, text] of Object.entries(fx.texts)) { const abs = path.join(library, rel); await fsp.mkdir(path.dirname(abs), { recursive: true }); await fsp.writeFile(abs, text); report.texts++; }
  for (const f of libraryFiles(fx)) {
    if (fx.texts[f.rel] !== undefined) continue;
    const abs = path.join(library, f.rel);
    const have = await fsp.stat(abs).catch(() => null);
    if (have && (f.bytes === undefined || have.size === f.bytes)) { report.kept++; continue; }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const src = source ? path.join(source, f.rel) : '';
    const ok = src && (await fsp.stat(src).catch(() => null))?.isFile();
    if (ok) { await fsp.copyFile(src, abs); report.copied++; }
    else { await standIn(abs, f); report.standIns++; }
  }
  log(`library ${library}: ${report.copied} copied from ${source ?? '(no source library)'}, ${report.kept} kept, ${report.standIns} stand-ins, ${report.texts} texts`);

  // ---- the database: create, migrate, then the server's own seeding path ----------------------------------------
  const made = await ensureTestDatabase(url);
  await migrateTestDatabase(url);
  process.env.DATABASE_URL = url;
  process.env.LIBRARY_ROOT = library;
  const [{ replaceStudio }, { loadSnapshot }, { persistState }, { notifyChange }, { db, schema, closeDb }] = await Promise.all([
    import('../src/server/studio/seed'), import('../src/server/studio/snapshot'), import('../src/server/studio/persist'), import('../src/server/studio/engine'), import('../src/server/db/client'),
  ]);
  try {
    // an empty studio first: every row of the studio's own tables goes (not tombstoned), so the fixture is all there is
    await replaceStudio('empty', false);
    const version = await db().transaction(async (tx) => {
      await tx.execute(dsql`select pg_advisory_xact_lock(hashtext('vewbox-studio'))`);
      const snap = await loadSnapshot(tx);
      const next: StudioState = { ...snap.state, shows: fx.state.shows, seasons: fx.state.seasons, productions: fx.state.productions, characters: fx.state.characters, locations: fx.state.locations, assets: fx.state.assets, settings: fx.state.settings };
      const r = await persistState(tx, snap.hashes, next, { deletedBy: 'e2e-fixture' });
      log(`studio: ${r.inserted} rows inserted, ${r.updated} updated, ${r.deleted} deleted`);
      for (const t of [...TABLES].reverse()) await tx.delete(schema[t.name] as unknown as PgTable);
      for (const t of TABLES) {
        const rows = (fx.tables[t.table] ?? []) as Row[];
        for (let i = 0; i < rows.length; i += 200) await tx.insert(schema[t.name] as unknown as PgTable).values(rows.slice(i, i + 200));
        if (t.serial && rows.length) await tx.execute(dsql.raw(`select setval(pg_get_serial_sequence('${t.table}', '${t.serial}'), (select max(${t.serial}) from ${t.table}))`));
      }
      const now = new Date().toISOString();
      const [m] = await tx.update(schema.studioMeta).set({ version: dsql`${schema.studioMeta.version} + 1`, seedVersion: dsql`${schema.studioMeta.version} + 1`, seedKind: 'e2e', seededAt: now, updatedAt: now, intakePausedAt: fx.meta.intakePausedAt, intakePausedReason: fx.meta.intakePausedReason }).where(dsql`${schema.studioMeta.id} = 'studio'`).returning({ version: schema.studioMeta.version });
      return m.version;
    });
    await notifyChange(version, 'e2e-fixture');
    report.version = version;
    log(`database ${name} (${made}): studio version ${version}, ${fx.state.productions.length} productions, ${fx.state.characters.length} characters, ${fx.state.assets.length} assets, ${Object.values(fx.tables).reduce((n, r) => n + r.length, 0)} rows in ${TABLES.length} other tables`);
    return report;
  } finally { await closeDb(); }
}

// ---- command line ---------------------------------------------------------------------------------------------------
const isMain = (() => { try { return import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`).href; } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const cmd = args[0];
  try {
    if (cmd === 'export') {
      const r = await exportFixture({ from: opt('from'), library: opt('library'), out: opt('out') });
      console.log(`[e2e-fixture] wrote ${r.out}: ${r.assets} assets, ${r.texts} subtitle texts`);
    } else if (cmd === 'apply') {
      await applyFixture({ database: opt('database'), library: opt('library'), sourceLibrary: opt('source-library'), file: opt('file') });
    } else { console.error('usage: tsx scripts/e2e-fixture.ts export [--from <url>] [--library <dir>] [--out <file>] | apply [--database <url>] [--library <dir>] [--source-library <dir>]'); process.exit(2); }
  } catch (e) { console.error(`[e2e-fixture] ${(e as Error).message}`); process.exit(1); }
}

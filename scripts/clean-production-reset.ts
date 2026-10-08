/* CLEAN PRODUCTION RESET (the producer's order, 2026-10-09: "fresh production data on top of the improved engineering").
 *
 * Removes the GENERATED production state only — productions, shows, seasons, scenes, shots, takes, characters,
 * locations, assets and their library files, jobs and their history, the World Bible's revisions and reads, QA reports,
 * hand-offs, agent runs, studio events, the command journal. Keeps everything else: source, git history, model weights
 * (D:\models), the model / agent / tool / skill / department / workflow registries, settings, metrics, migrations,
 * evaluation fixtures (var/eval, LAB) and configuration.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/clean-production-reset.ts            dry run: the manifest
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/clean-production-reset.ts --apply --i-understand-this-deletes
 *
 * The dry run writes the concise audit manifest docs/history/CLEAN-RESET-2026-10-09-manifest.json (counts, names,
 * bytes — not a backup). --apply refuses while any job is running, then deletes for good and verifies the result.
 * Nothing is restored afterwards. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--i-understand-this-deletes');

// generated history, deleted in dependency order (children first); the studio's own tables go through replaceStudio
const HISTORY = ['handoffs', 'qa_reports', 'approvals', 'cut_notes', 'agent_runs', 'world_reads', 'world_pins', 'world_revisions', 'development_artifacts', 'proposals', 'audio_timelines', 'research_items', 'research_runs', 'research_cache', 'studio_events', 'command_log', 'job_events', 'job_attempts', 'job_dependencies', 'resource_leases', 'jobs'] as const;
const STUDIO = ['productions', 'shows', 'seasons', 'scenes', 'shots', 'takes', 'characters', 'character_usage', 'locations', 'assets'] as const;
const MEDIA_DIRS = ['audio', 'image', 'video', 'evidence'];

async function filesUnder(dir: string): Promise<Array<{ file: string; bytes: number }>> {
  const out: Array<{ file: string; bytes: number }> = [];
  const walk = async (d: string) => {
    let entries: import('node:fs').Dirent[] = [];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else if (e.isFile()) out.push({ file: f, bytes: (await fs.stat(f)).size });
    }
  };
  await walk(dir);
  return out;
}

async function counts(db: import('@/server/db/client').Db) {
  const out: Record<string, number> = {};
  for (const t of [...STUDIO, ...HISTORY]) {
    const r = await db.execute(sql.raw(`select count(*)::int as n from ${t}`));
    out[t] = Number((r as unknown as { rows: Array<{ n: number }> }).rows?.[0]?.n ?? (r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  }
  return out;
}

async function main() {
  const { db } = await import('@/server/db/client');
  const { readState } = await import('@/server/studio/engine');
  const { libraryRoot } = await import('@/server/media');
  const root = libraryRoot();
  const { state } = await readState();
  const before = await counts(db());
  const media = (await Promise.all(MEDIA_DIRS.map((d) => filesUnder(path.join(root, d))))).flat();
  const manifest = {
    reset: 'CLEAN VALIDATION RESTART — 2026-10-09 (the producer’s order)',
    at: new Date().toISOString(), applied: false,
    productions: state.productions.map((p) => ({ title: p.title, kind: p.kind, shots: p.shots.length, takes: p.shots.reduce((n, s) => n + s.takes.length, 0) })),
    shows: state.shows.map((s) => s.title), seasons: state.seasons.length,
    characters: state.characters.map((c) => c.name), locations: state.locations.map((l) => l.name),
    counts: before,
    library: { root, files: media.length, bytes: media.reduce((n, f) => n + f.bytes, 0), byDir: Object.fromEntries(MEDIA_DIRS.map((d) => [d, media.filter((f) => f.file.startsWith(path.join(root, d) + path.sep)).length])) },
    kept: ['source and git history', 'model weights (D:\\models) and manifests', 'models, agents, tools, skills, departments, workflows registries', 'settings', 'metrics', 'migrations', 'tests', 'documentation', 'evaluation fixtures (var/eval, LAB)', 'configuration and secrets'],
  };
  const out = path.resolve('docs/history/CLEAN-RESET-2026-10-09-manifest.json');
  await fs.mkdir(path.dirname(out), { recursive: true });
  if (!apply) {
    await fs.writeFile(out, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(JSON.stringify({ ...manifest, kept: undefined }, null, 1));
    console.log(`\nDRY RUN — nothing deleted. Manifest: ${out}\nTo delete for good: add --apply --i-understand-this-deletes`);
    return;
  }
  if (!confirmed) throw new Error('--apply needs --i-understand-this-deletes');
  const running = await db().execute(sql.raw(`select count(*)::int as n from jobs where status in ('QUEUED','PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')`));
  const n = Number((running as unknown as { rows: Array<{ n: number }> }).rows?.[0]?.n ?? 0);
  if (n > 0) throw new Error(`${n} job(s) are still active: stop them first (nothing was deleted)`);
  // 1. the studio's own tables, through the product's reset (settings kept)
  const { replaceStudio } = await import('@/server/studio/seed');
  await replaceStudio('empty', true);
  // 2. the generated history, in one transaction
  await db().transaction(async (tx) => { for (const t of HISTORY) await tx.execute(sql.raw(`delete from ${t}`)); });
  // 3. the library's generated media
  let removed = 0, bytes = 0;
  for (const f of media) { await fs.rm(f.file, { force: true }); removed++; bytes += f.bytes; }
  const after = await counts(db());
  const left = (await Promise.all(MEDIA_DIRS.map((d) => filesUnder(path.join(root, d))))).flat();
  const clean = Object.values(after).every((v) => v === 0) && left.length === 0;
  await fs.writeFile(out, JSON.stringify({ ...manifest, applied: true, appliedAt: new Date().toISOString(), removedFiles: removed, removedBytes: bytes, after, libraryFilesLeft: left.length, clean }, null, 2), 'utf8');
  console.log(JSON.stringify({ removedFiles: removed, removedBytes: bytes, after, libraryFilesLeft: left.length, clean }, null, 1));
  if (!clean) process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });

/** PRESENTATION BACKFILL — docs/DESIGN-SYSTEM-V4.md §2.4 (package B1). New pictures are measured as they are stored
 *  (src/server/media.ts); this fills `assets.presentation` for the pictures stored before that, from their own files.
 *
 *    counts only: pnpm exec tsx --env-file=.env --env-file=.env.local scripts/presentation-backfill.ts --dry-run [--verbose]
 *    fill:        pnpm exec tsx --env-file=.env --env-file=.env.local scripts/presentation-backfill.ts [--expect-db <name>] [--verbose]
 *
 *  It prints the database it will use first; `--expect-db <name>` refuses any other. Only IMAGE rows whose
 *  presentation is empty are read and only their `presentation` is written — through the studio's command engine
 *  (one batch: one lock, one version, one change notice to open pages). Files are opened read-only and never moved,
 *  rewritten or removed; every other asset is untouched. A picture it cannot measure (a missing file, an SVG, a file
 *  ffmpeg cannot decode) is reported and left empty, so running it again changes nothing that is already filled:
 *  a second run fills 0 and writes nothing. */
import fs from 'node:fs';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { Presentation } from '@/domain/presentation';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const expectIdx = args.indexOf('--expect-db');
const expectDb = expectIdx >= 0 ? args[expectIdx + 1] : undefined;
const unknown = args.filter((a, i) => !['--dry-run', '--verbose', '--expect-db'].includes(a) && !(expectIdx >= 0 && i === expectIdx + 1));
if (unknown.length || (expectIdx >= 0 && !expectDb)) { console.error('usage: presentation-backfill.ts [--dry-run] [--verbose] [--expect-db <name>]'); process.exit(2); }

let database = '';
try { const u = new URL(process.env.DATABASE_URL ?? ''); database = decodeURIComponent(u.pathname.replace(/^\//, '')); console.log(`database: ${database} on ${u.hostname}:${u.port || '5432'}`); }
catch { console.error('DATABASE_URL is missing or unreadable (run with --env-file=.env --env-file=.env.local)'); process.exit(2); }
if (expectDb && database !== expectDb) { console.error(`refusing: the database is "${database}", not "${expectDb}" (--expect-db)`); process.exit(2); }

const { db, schema, closeDb } = await import('@/server/db/client');
const { fileFor } = await import('@/server/media');
const { presentationOfAsset, parseOklch, oklchToRgb8 } = await import('@/server/media/presentation');
const { commands, readState } = await import('@/server/studio/engine');

type Outcome = { id: string; label: string; origin: string; tier: string | null } & ({ status: 'measured'; presentation: Presentation } | { status: 'skipped' | 'failed'; reason: string });

const hex = (s?: string) => { const c = parseOklch(s); return c ? `#${oklchToRgb8(c).map((v) => v.toString(16).padStart(2, '0')).join('')}` : '—'; };
const show = (o: Outcome) => {
  const head = `${o.id} [${o.origin}${o.tier ? `/${o.tier}` : ''}] ${o.label.slice(0, 60)}`;
  if (o.status !== 'measured') return `${head}\n    ${o.status}: ${o.reason}`;
  const p = o.presentation;
  return `${head}\n    dominant ${p.dominant ?? '— (neutral)'} ${p.dominant ? `≈ ${hex(p.dominant)}` : ''}\n    edge ${p.edge ?? '—'} ≈ ${hex(p.edge)} · lightBackdrop ${p.lightBackdrop ?? '—'}${p.faceBox ? ` · faceBox ${JSON.stringify(p.faceBox)}` : ''}`;
};

try {
  const A = schema.assets;
  const [{ n: total }] = await db().select({ n: count() }).from(A);
  const [{ n: images }] = await db().select({ n: count() }).from(A).where(eq(A.kind, 'IMAGE'));
  const rows = await db().select({ id: A.id, storage: A.storage, path: A.path, label: A.label, origin: A.origin, tier: A.tier, mimeType: A.mimeType, width: A.width, height: A.height, provenance: A.provenance }).from(A).where(and(eq(A.kind, 'IMAGE'), isNull(A.presentation))).orderBy(A.createdAt);

  const outcomes: Outcome[] = [];
  for (const r of rows) {
    const base = { id: r.id, label: r.label, origin: r.origin, tier: r.tier };
    if (r.mimeType === 'image/svg+xml' || /\.svg$/i.test(r.path)) { outcomes.push({ ...base, status: 'skipped', reason: 'a vector picture (SVG): not decoded on the CPU' }); continue; }
    let file: string;
    try { file = fileFor({ storage: r.storage, path: r.path }); } catch (e) { outcomes.push({ ...base, status: 'failed', reason: (e as Error).message }); continue; }
    if (!r.path || !fs.existsSync(file)) { outcomes.push({ ...base, status: 'failed', reason: 'the file is missing' }); continue; }
    try { outcomes.push({ ...base, status: 'measured', presentation: await presentationOfAsset({ width: r.width ?? undefined, height: r.height ?? undefined, provenance: r.provenance ?? undefined }, file) }); }
    catch (e) { outcomes.push({ ...base, status: 'failed', reason: (e as Error).message.split('\n')[0] }); }
  }
  if (verbose) for (const o of outcomes) console.log(show(o));

  const measured = outcomes.filter((o): o is Extract<Outcome, { status: 'measured' }> => o.status === 'measured');
  let filled = 0, gone = 0, writeFailed = 0;
  if (!dryRun && measured.length) {
    // the batch is built against the studio as it is now: a picture deleted, or measured by MEDIA_PROBE, since the
    // read above is left alone
    const now = new Map((await readState()).state.assets.map((a) => [a.id, a]));
    const todo = measured.filter((o) => { const a = now.get(o.id); if (!a || a.presentation) { gone++; return false; } return true; });
    const update = (o: (typeof todo)[number]) => ({ name: 'updateAsset' as const, args: [o.id, { presentation: o.presentation }] as [string, { presentation: Presentation }] });
    if (todo.length) {
      try { await commands(todo.map(update), 'presentation-backfill'); filled = todo.length; }
      catch (e) {
        console.warn(`the batch was refused (${(e as Error).message}); writing one picture at a time`);
        for (const o of todo) { try { await commands([update(o)], 'presentation-backfill'); filled++; } catch (err) { writeFailed++; console.warn(`  ${o.id}: ${(err as Error).message}`); } }
      }
    }
  }

  const summary = {
    mode: dryRun ? 'dry run (nothing written)' : 'fill',
    database,
    assets: total,
    nonImageAssetsUntouched: total - images,
    images,
    imagesAlreadyWithPresentation: images - rows.length,
    imagesWithoutPresentation: rows.length,
    measurable: measured.length,
    ...(dryRun ? { wouldFill: measured.length } : { filled, leftAlone: gone, writeFailed }),
    withDominant: measured.filter((o) => o.presentation.dominant).length,
    neutral: measured.filter((o) => !o.presentation.dominant).length,
    lightBackdrop: measured.filter((o) => o.presentation.lightBackdrop).length,
    withFaceBox: measured.filter((o) => o.presentation.faceBox).length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
  };
  console.log(JSON.stringify(summary, null, 2));
  for (const o of outcomes) if (o.status !== 'measured' && !verbose) console.log(`${o.status}: ${o.id} — ${o.reason}`);
} finally { await closeDb(); }

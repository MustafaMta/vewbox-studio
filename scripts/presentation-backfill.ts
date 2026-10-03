/** PRESENTATION BACKFILL — docs/DESIGN-SYSTEM-V4.md §2.4 (package B1) and docs/CONTRACTS-REDESIGN-BACKEND.md B7.
 *  New pictures are measured and get their display-size thumbnail as they are stored (src/server/media.ts); this
 *  fills what was stored before that, from the files themselves, in three passes:
 *
 *    1. presentation  IMAGE rows without `presentation` are measured (dominant, edge, lightBackdrop, faceBox);
 *    2. thumbs        IMAGE rows in the library without `thumb` get a JPEG beside the original (long side ≤ 960 px,
 *                     ≤ 120 KB for a figure, ≤ 160 KB for a still) and the row points at it;
 *    3. posters       a production with neither key art (`posterAssetId`) nor a frame poster gets one composed from
 *                     its best frame (src/studio/selectors/poster.ts): a 2:3 crop around the focal point, no text,
 *                     stored as a DERIVED asset and recorded as `framePosterAssetId`.
 *
 *    counts only: pnpm exec tsx --env-file=.env --env-file=.env.local scripts/presentation-backfill.ts --dry-run [--verbose]
 *    fill:        pnpm exec tsx --env-file=.env --env-file=.env.local scripts/presentation-backfill.ts [--expect-db <name>] [--only presentation|thumbs|posters] [--verbose]
 *
 *  It prints the database it will use first and REFUSES the shared studio database `vewbox` unless `--allow-vewbox`
 *  is given; `--expect-db <name>` refuses any other. Writes go through the studio's command engine (one batch per
 *  pass: one lock, one version, one change notice). Originals are opened read-only and never moved, rewritten or
 *  removed; derived files are written beside them. A picture it cannot handle is reported and left as it is, so
 *  running it again changes nothing that is already filled: a second run fills 0, makes 0 and writes nothing. */
import fs from 'node:fs';
import path from 'node:path';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { Presentation } from '@/domain/presentation';
import type { AssetThumb } from '@/domain/types';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const allowShared = args.includes('--allow-vewbox');
const valueOf = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const expectDb = valueOf('--expect-db');
const only = valueOf('--only');
const FLAGS = ['--dry-run', '--verbose', '--expect-db', '--only', '--allow-vewbox'];
const unknown = args.filter((a, i) => !FLAGS.includes(a) && !(['--expect-db', '--only'].includes(args[i - 1] ?? '')));
if (unknown.length || (args.includes('--expect-db') && !expectDb) || (args.includes('--only') && !['presentation', 'thumbs', 'posters'].includes(only ?? ''))) { console.error('usage: presentation-backfill.ts [--dry-run] [--verbose] [--expect-db <name>] [--only presentation|thumbs|posters] [--allow-vewbox]'); process.exit(2); }
const runs = (pass: 'presentation' | 'thumbs' | 'posters') => !only || only === pass;

let database = '';
try { const u = new URL(process.env.DATABASE_URL ?? ''); database = decodeURIComponent(u.pathname.replace(/^\//, '')); console.log(`database: ${database} on ${u.hostname}:${u.port || '5432'}`); }
catch { console.error('DATABASE_URL is missing or unreadable (run with --env-file=.env --env-file=.env.local)'); process.exit(2); }
if (expectDb && database !== expectDb) { console.error(`refusing: the database is "${database}", not "${expectDb}" (--expect-db)`); process.exit(2); }
if (database === 'vewbox' && !allowShared) { console.error('refusing: "vewbox" is the shared studio database; run against a copy, or pass --allow-vewbox on purpose'); process.exit(2); }

const { db, schema, closeDb } = await import('@/server/db/client');
const { adoptFile, assetFromStored, fileFor, libraryRoot, resolveLibrary } = await import('@/server/media');
const { presentationOfAsset, parseOklch, oklchToRgb8 } = await import('@/server/media/presentation');
const { isFigureLike, makeFramePoster, makeThumbnail, thumbPathFor } = await import('@/server/media/thumbs');
const { ffmpeg, tmpDir } = await import('@/server/media/ffmpeg');
const { thumbSrc } = await import('@/server/studio/snapshot');
const { bestFrameFor } = await import('@/studio/selectors/poster');
const { commands, readState } = await import('@/server/studio/engine');
const { nid } = await import('@/domain/ids');
console.log(`library: ${libraryRoot()}`);

type Outcome = { id: string; label: string; origin: string; tier: string | null } & ({ status: 'measured'; presentation: Presentation } | { status: 'skipped' | 'failed'; reason: string });

const hex = (s?: string) => { const c = parseOklch(s); return c ? `#${oklchToRgb8(c).map((v) => v.toString(16).padStart(2, '0')).join('')}` : '—'; };
const show = (o: Outcome) => {
  const head = `${o.id} [${o.origin}${o.tier ? `/${o.tier}` : ''}] ${o.label.slice(0, 60)}`;
  if (o.status !== 'measured') return `${head}\n    ${o.status}: ${o.reason}`;
  const p = o.presentation;
  return `${head}\n    dominant ${p.dominant ?? '— (neutral)'} ${p.dominant ? `≈ ${hex(p.dominant)}` : ''}\n    edge ${p.edge ?? '—'} ≈ ${hex(p.edge)} · lightBackdrop ${p.lightBackdrop ?? '—'}${p.faceBox ? ` · faceBox ${JSON.stringify(p.faceBox)}` : ''}`;
};
const firstLine = (e: unknown) => (e as Error).message.split('\n')[0];

try {
  const A = schema.assets;
  const [{ n: total }] = await db().select({ n: count() }).from(A);
  const [{ n: images }] = await db().select({ n: count() }).from(A).where(eq(A.kind, 'IMAGE'));
  const summary: Record<string, unknown> = { mode: dryRun ? 'dry run (nothing written)' : 'fill', database, assets: total, nonImageAssetsUntouched: total - images, images };

  // ---- pass 1: presentation ------------------------------------------------------------------------------------------
  if (runs('presentation')) {
    const rows = await db().select({ id: A.id, storage: A.storage, path: A.path, label: A.label, origin: A.origin, tier: A.tier, mimeType: A.mimeType, width: A.width, height: A.height, provenance: A.provenance }).from(A).where(and(eq(A.kind, 'IMAGE'), isNull(A.presentation))).orderBy(A.createdAt);
    const outcomes: Outcome[] = [];
    for (const r of rows) {
      const base = { id: r.id, label: r.label, origin: r.origin, tier: r.tier };
      if (r.mimeType === 'image/svg+xml' || /\.svg$/i.test(r.path)) { outcomes.push({ ...base, status: 'skipped', reason: 'a vector picture (SVG): not decoded on the CPU' }); continue; }
      let file: string;
      try { file = fileFor({ storage: r.storage, path: r.path }); } catch (e) { outcomes.push({ ...base, status: 'failed', reason: (e as Error).message }); continue; }
      if (!r.path || !fs.existsSync(file)) { outcomes.push({ ...base, status: 'failed', reason: 'the file is missing' }); continue; }
      try { outcomes.push({ ...base, status: 'measured', presentation: await presentationOfAsset({ width: r.width ?? undefined, height: r.height ?? undefined, provenance: r.provenance ?? undefined }, file) }); }
      catch (e) { outcomes.push({ ...base, status: 'failed', reason: firstLine(e) }); }
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
    summary.presentation = {
      imagesAlreadyWithPresentation: images - rows.length, imagesWithoutPresentation: rows.length, measurable: measured.length,
      ...(dryRun ? { wouldFill: measured.length } : { filled, leftAlone: gone, writeFailed }),
      withDominant: measured.filter((o) => o.presentation.dominant).length, neutral: measured.filter((o) => !o.presentation.dominant).length, lightBackdrop: measured.filter((o) => o.presentation.lightBackdrop).length, withFaceBox: measured.filter((o) => o.presentation.faceBox).length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length, failed: outcomes.filter((o) => o.status === 'failed').length,
    };
    for (const o of outcomes) if (o.status !== 'measured' && !verbose) console.log(`presentation ${o.status}: ${o.id} — ${o.reason}`);
  }

  // ---- pass 2: thumbnails ----------------------------------------------------------------------------------------------
  if (runs('thumbs')) {
    const rows = await db().select({ id: A.id, storage: A.storage, path: A.path, label: A.label, origin: A.origin, tier: A.tier, tags: A.tags, mimeType: A.mimeType, width: A.width, height: A.height, presentation: A.presentation, provenance: A.provenance }).from(A).where(and(eq(A.kind, 'IMAGE'), isNull(A.thumb))).orderBy(A.createdAt);
    const made: Array<{ id: string; thumb: AssetThumb; figure: boolean }> = [];
    const problems: Array<{ id: string; status: 'skipped' | 'failed'; reason: string }> = [];
    for (const r of rows) {
      if (r.storage !== 'LIBRARY') { problems.push({ id: r.id, status: 'skipped', reason: 'a bundled sample (public folder), not in the library' }); continue; }
      if (r.mimeType === 'image/svg+xml' || /\.svg$/i.test(r.path)) { problems.push({ id: r.id, status: 'skipped', reason: 'a vector picture (SVG)' }); continue; }
      let file: string;
      try { file = fileFor({ storage: r.storage, path: r.path }); } catch (e) { problems.push({ id: r.id, status: 'failed', reason: (e as Error).message }); continue; }
      if (!r.path || !fs.existsSync(file)) { problems.push({ id: r.id, status: 'failed', reason: 'the file is missing' }); continue; }
      const figure = isFigureLike({ tier: r.tier, tags: r.tags, width: r.width ?? undefined, height: r.height ?? undefined });
      const rel = thumbPathFor(r.path);
      if (dryRun) { made.push({ id: r.id, thumb: { src: thumbSrc(r.id), path: rel, width: 0, height: 0, bytes: 0 }, figure }); continue; }
      try {
        const pix = (r.provenance?.probe as { pixFmt?: string } | undefined)?.pixFmt;
        const t = await makeThumbnail(file, resolveLibrary(rel), { width: r.width ?? undefined, height: r.height ?? undefined, pixFmt: pix, figure, presentation: r.presentation ?? undefined });
        made.push({ id: r.id, thumb: { src: thumbSrc(r.id), path: rel, ...t }, figure });
        if (verbose) console.log(`thumb ${r.id} [${figure ? 'figure' : 'still'}] ${t.width}×${t.height} ${(t.bytes / 1024).toFixed(0)} KB ← ${r.label.slice(0, 50)}`);
      } catch (e) { problems.push({ id: r.id, status: 'failed', reason: firstLine(e) }); }
    }
    let written = 0, gone = 0, writeFailed = 0;
    if (!dryRun && made.length) {
      const now = new Map((await readState()).state.assets.map((a) => [a.id, a]));
      const todo = made.filter((m) => { const a = now.get(m.id); if (!a || a.thumb) { gone++; return false; } return true; });
      const update = (m: (typeof todo)[number]) => ({ name: 'updateAsset' as const, args: [m.id, { thumb: m.thumb }] as [string, { thumb: AssetThumb }] });
      if (todo.length) {
        try { await commands(todo.map(update), 'presentation-backfill'); written = todo.length; }
        catch (e) {
          console.warn(`the batch was refused (${(e as Error).message}); writing one picture at a time`);
          for (const m of todo) { try { await commands([update(m)], 'presentation-backfill'); written++; } catch (err) { writeFailed++; console.warn(`  ${m.id}: ${(err as Error).message}`); } }
        }
      }
    }
    summary.thumbs = {
      imagesAlreadyWithThumb: images - rows.length, imagesWithoutThumb: rows.length,
      ...(dryRun ? { wouldMake: made.length } : { made: made.length, written, leftAlone: gone, writeFailed, figures: made.filter((m) => m.figure).length, stills: made.filter((m) => !m.figure).length, largestKb: made.length ? Math.round(Math.max(...made.map((m) => m.thumb.bytes)) / 1024) : 0 }),
      skipped: problems.filter((p) => p.status === 'skipped').length, failed: problems.filter((p) => p.status === 'failed').length,
    };
    for (const p of problems) if (verbose || p.status === 'failed') console.log(`thumb ${p.status}: ${p.id} — ${p.reason}`);
  }

  // ---- pass 3: frame posters -------------------------------------------------------------------------------------------
  if (runs('posters')) {
    const { state } = await readState();
    const assetsById = new Map(state.assets.map((a) => [a.id, a]));
    const candidates = state.productions.filter((p) => !(p.posterAssetId && assetsById.has(p.posterAssetId)) && !(p.framePosterAssetId && assetsById.has(p.framePosterAssetId)));
    const results: Array<{ productionId: string; title: string; status: 'made' | 'would-make' | 'skipped' | 'failed'; detail: string }> = [];
    for (const p of candidates) {
      const best = bestFrameFor(p, state.assets);
      if (!best) { results.push({ productionId: p.id, title: p.title, status: 'skipped', detail: 'no frame yet (no selected take with a poster frame, no opening frame)' }); continue; }
      const frame = assetsById.get(best.assetId)!;
      const row = (await db().select({ storage: A.storage, path: A.path, provenance: A.provenance }).from(A).where(eq(A.id, frame.id)))[0];
      let file: string;
      try { file = fileFor(row); } catch (e) { results.push({ productionId: p.id, title: p.title, status: 'failed', detail: (e as Error).message }); continue; }
      if (!fs.existsSync(file)) { results.push({ productionId: p.id, title: p.title, status: 'failed', detail: `the frame's file is missing (${frame.id})` }); continue; }
      const where = `shot ${best.sceneNumber ?? '?'}.${best.shotNumber}`;
      if (dryRun) { results.push({ productionId: p.id, title: p.title, status: 'would-make', detail: `${best.source === 'TAKE_POSTER' ? 'the selected take’s poster frame' : 'the opening frame'} of ${where} (${frame.id})` }); continue; }
      try {
        const dir = await tmpDir('frame-poster');
        const out = path.join(dir, 'poster.jpg');
        // a take's poster JPEG is 640 px wide: the same frame is taken from the take's video at its native size
        let input = file, from = frame.id, size: { width?: number; height?: number; pixFmt?: string } = { width: frame.width, height: frame.height, pixFmt: (row.provenance?.probe as { pixFmt?: string } | undefined)?.pixFmt };
        if (best.videoAssetId) {
          const v = (await db().select({ storage: A.storage, path: A.path }).from(A).where(eq(A.id, best.videoAssetId)))[0];
          const videoFile = v ? fileFor(v) : '';
          if (videoFile && fs.existsSync(videoFile)) {
            await ffmpeg(['-v', 'error', '-ss', String(best.frameSeconds ?? 0.5), '-i', videoFile, '-an', '-frames:v', '1', '-update', '1', path.join(dir, 'frame.png')], { timeoutMs: 120_000 });
            input = path.join(dir, 'frame.png'); from = best.videoAssetId; size = {};
          }
        }
        const made = await makeFramePoster(input, out, { ...size, presentation: frame.presentation });
        const id = nid('gen');
        const stored = await adoptFile(id, out, { expectKind: 'IMAGE' });
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        const asset = assetFromStored(id, stored, { label: `${p.title} — frame poster (${where})`, tags: ['poster', 'frame-poster'], origin: 'DERIVED', provenance: { kind: 'FRAME_POSTER', from, posterFrameAssetId: frame.id, frameSeconds: from === best.videoAssetId ? best.frameSeconds : undefined, source: best.source, shotId: best.shotId, takeId: best.takeId, sceneNumber: best.sceneNumber, shotNumber: best.shotNumber, crop: made.crop, focal: made.focal } });
        // the poster keeps the frame's focal point as its own portrait focal, so a later crop of the poster agrees
        asset.presentation = { ...(asset.presentation ?? {}), portraitFocal: made.focal };
        await commands([{ name: 'addAsset', args: [asset] }, { name: 'updateProduction', args: [p.id, { framePosterAssetId: id }] }], 'presentation-backfill');
        results.push({ productionId: p.id, title: p.title, status: 'made', detail: `${id} ${made.width}×${made.height} ${(made.bytes / 1024).toFixed(0)} KB from ${from} (${best.source.toLowerCase().replace('_', ' ')} of ${where}), crop ${JSON.stringify(made.crop)}` });
      } catch (e) { results.push({ productionId: p.id, title: p.title, status: 'failed', detail: firstLine(e) }); }
    }
    summary.posters = {
      productions: state.productions.length, withKeyArt: state.productions.filter((p) => p.posterAssetId && assetsById.has(p.posterAssetId)).length, withFramePoster: state.productions.filter((p) => !p.posterAssetId && p.framePosterAssetId && assetsById.has(p.framePosterAssetId)).length,
      candidates: candidates.length, ...(dryRun ? { wouldMake: results.filter((r) => r.status === 'would-make').length } : { made: results.filter((r) => r.status === 'made').length }), skipped: results.filter((r) => r.status === 'skipped').length, failed: results.filter((r) => r.status === 'failed').length,
    };
    for (const r of results) console.log(`poster ${r.status}: ${r.productionId} “${r.title}” — ${r.detail}`);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally { await closeDb(); }

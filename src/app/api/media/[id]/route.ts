import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { assertSafeId, fileFor } from '@/server/media';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Serve a library file with HTTP Range support, so video and audio seek. Paths come from the asset row, never from
 *  the URL; the id is validated before it touches the database. */
async function lookup(id: string) {
  assertSafeId(id);
  const rows = await db().select({ id: schema.assets.id, storage: schema.assets.storage, path: schema.assets.path, mimeType: schema.assets.mimeType, kind: schema.assets.kind, label: schema.assets.label, thumb: schema.assets.thumb }).from(schema.assets).where(eq(schema.assets.id, id));
  return rows[0];
}

/** `?thumb=1` on a picture that has its display-size derivative (B7): that JPEG beside the original; otherwise the
 *  original itself, so an <img> never breaks on a picture made before thumbnails existed. */
function fileAndType(req: Request, a: NonNullable<Awaited<ReturnType<typeof lookup>>>): { file: string; type: string } {
  const wantThumb = new URL(req.url).searchParams.get('thumb') === '1';
  if (wantThumb && a.thumb?.path && a.storage === 'LIBRARY') return { file: fileFor({ storage: a.storage, path: a.thumb.path }), type: 'image/jpeg' };
  return { file: fileFor(a), type: a.mimeType ?? 'application/octet-stream' };
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, '_').slice(0, 120);

export async function HEAD(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const a = await lookup(id);
    if (!a) return new Response(null, { status: 404 });
    const { file, type } = fileAndType(_req, a);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) return new Response(null, { status: 404 });
    return new Response(null, { status: 200, headers: { 'Content-Length': String(st.size), 'Content-Type': type, 'Accept-Ranges': 'bytes' } });
  } catch (e) { return errorResponse(e); }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const a = await lookup(id);
    if (!a) return new Response('Not found', { status: 404 });
    const { file, type } = fileAndType(req, a);
    const st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile()) return new Response('File missing', { status: 404 });
    const download = new URL(req.url).searchParams.get('download');
    const base: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'Last-Modified': st.mtime.toUTCString(), 'X-Content-Type-Options': 'nosniff' };
    if (download) base['Content-Disposition'] = `attachment; filename="${safeName(a.label || a.id)}"`;
    const range = req.headers.get('range');
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) return new Response('Bad range', { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : st.size - 1;
      if (!m[1] && m[2]) { start = Math.max(0, st.size - Number(m[2])); end = st.size - 1; }
      if (start >= st.size || end >= st.size || start > end) return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
      end = Math.min(end, start + 8 * 1024 * 1024 - 1); // cap each chunk so a player cannot ask for the whole file at once
      const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) } });
    }
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(stream, { status: 200, headers: { ...base, 'Content-Length': String(st.size) } });
  } catch (e) { return errorResponse(e); }
}

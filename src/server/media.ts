import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileTypeFromBuffer } from 'file-type';
import { StudioError } from '@/domain/errors';
import type { Asset, AssetKind, AssetThumb, AssetTier } from '@/domain/types';
import type { Presentation } from '@/domain/presentation';
import { env } from './env';
import { log } from './log';
import { measurePresentation } from './media/presentation';
import { isFigureLike, makeThumbnail, thumbPathFor } from './media/thumbs';
import { thumbSrc } from './studio/snapshot';

const execFileP = promisify(execFile);

/** THE LIBRARY ON DISK — every file the studio stores lives under LIBRARY_ROOT as `{kind}/{yyyy}/{mm}/{assetId}.{ext}`.
 *  Paths are built from ids the server minted, never from client strings; MIME types come from the bytes, not the
 *  filename; every media file is probed with ffprobe before it is accepted. */

export const ALLOWED_TYPES: Record<string, { kind: AssetKind; ext: string }> = {
  'image/png': { kind: 'IMAGE', ext: 'png' }, 'image/jpeg': { kind: 'IMAGE', ext: 'jpg' }, 'image/webp': { kind: 'IMAGE', ext: 'webp' }, 'image/heic': { kind: 'IMAGE', ext: 'heic' }, 'image/avif': { kind: 'IMAGE', ext: 'avif' },
  'video/mp4': { kind: 'VIDEO', ext: 'mp4' }, 'video/quicktime': { kind: 'VIDEO', ext: 'mov' }, 'video/webm': { kind: 'VIDEO', ext: 'webm' }, 'video/x-matroska': { kind: 'VIDEO', ext: 'mkv' },
  'audio/mpeg': { kind: 'AUDIO', ext: 'mp3' }, 'audio/wav': { kind: 'AUDIO', ext: 'wav' }, 'audio/x-wav': { kind: 'AUDIO', ext: 'wav' }, 'audio/vnd.wave': { kind: 'AUDIO', ext: 'wav' }, 'audio/flac': { kind: 'AUDIO', ext: 'flac' }, 'audio/x-flac': { kind: 'AUDIO', ext: 'flac' }, 'audio/ogg': { kind: 'AUDIO', ext: 'ogg' }, 'audio/opus': { kind: 'AUDIO', ext: 'opus' }, 'audio/mp4': { kind: 'AUDIO', ext: 'm4a' }, 'audio/x-m4a': { kind: 'AUDIO', ext: 'm4a' }, 'audio/aac': { kind: 'AUDIO', ext: 'aac' },
  'text/vtt': { kind: 'SUBTITLE', ext: 'vtt' }, 'application/x-subrip': { kind: 'SUBTITLE', ext: 'srt' },
};

export const libraryRoot = () => path.resolve(env().LIBRARY_ROOT);
export const publicRoot = () => path.resolve(env().PUBLIC_ROOT);

const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,79}$/i;
export function assertSafeId(id: string): string {
  if (!SAFE_ID.test(id)) throw new StudioError('INVALID', 'Malformed asset id.');
  return id;
}

/** Where a new file of this kind goes, relative to the library root. */
export function libraryPathFor(assetId: string, kind: AssetKind, ext: string): string {
  assertSafeId(assetId);
  const d = new Date();
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return path.posix.join(kind.toLowerCase(), String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), `${assetId}.${safeExt}`);
}

/** Resolve a stored relative path to an absolute path inside the allowed root; refuses anything that escapes. */
/** A stored path names a FILE strictly inside its root: never the root itself, never outside it (`..`, an absolute or
 *  drive path, a UNC share), never with a NUL byte or a colon (a Windows drive-relative path or an alternate data
 *  stream; the paths the server mints — `{kind}/{yyyy}/{mm}/{id}.{ext}` — never have one). */
function inside(root: string, rel: string, what: string): string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0') || rel.replace(/^[a-zA-Z]:[\\/]/, '').includes(':')) throw new StudioError('INVALID', `Malformed path in the ${what}.`);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new StudioError('INVALID', `Path escapes the ${what}.`);
  return abs;
}
export function resolveLibrary(rel: string): string { return inside(libraryRoot(), rel, 'library'); }
export function resolvePublic(rel: string): string { return inside(publicRoot(), rel, 'public folder'); }

export function fileFor(asset: { storage: string; path: string }): string {
  return asset.storage === 'PUBLIC' ? resolvePublic(asset.path) : resolveLibrary(asset.path);
}

/** The file a stored path names, as it really is on disk: symlinks and junctions resolved, and the result still inside
 *  the real root of its storage (a link inside the library cannot hand out a file elsewhere). Rejects with ENOENT
 *  when the file does not exist, INVALID when it escapes. */
export async function realFileFor(asset: { storage: string; path: string }): Promise<string> {
  const file = fileFor(asset);
  const [root, real] = await Promise.all([fsp.realpath(asset.storage === 'PUBLIC' ? publicRoot() : libraryRoot()), fsp.realpath(file)]);
  if (!real.startsWith(root + path.sep)) throw new StudioError('INVALID', 'Path escapes the library.');
  return real;
}

/** An asset's file on disk: a bundled sample from the public folder (its `src` path), anything else from the library
 *  (`provenance.path`). The one copy of this rule (it was repeated in seven places, audit B1). */
export const assetFile = (a: Pick<Asset, 'sample' | 'src' | 'provenance'>): string => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export async function sniff(buf: Buffer, declared?: string): Promise<{ mime: string; kind: AssetKind; ext: string }> {
  const ft = await fileTypeFromBuffer(buf.subarray(0, 4100));
  let mime = ft?.mime as string | undefined;
  // subtitles are text; file-type does not detect them. SVG is never accepted from outside: it can carry script and
  // would run in the studio's origin when opened directly (the bundled sample art is the only SVG, served from /sample).
  if (!mime) {
    const head = buf.subarray(0, 512).toString('utf8');
    if (/^WEBVTT/.test(head)) mime = 'text/vtt';
    else if (/^\s*1\s*\r?\n\d\d:\d\d:\d\d/.test(head)) mime = 'application/x-subrip';
    else if (/^\s*<(\?xml|svg)/i.test(head) || declared === 'image/svg+xml') throw new StudioError('INVALID', 'SVG files are not accepted; use PNG, JPEG or WebP.');
  }
  if (!mime) throw new StudioError('INVALID', 'The file type could not be recognised.');
  const allowed = ALLOWED_TYPES[mime];
  if (!allowed) throw new StudioError('INVALID', `Files of type ${mime} are not accepted.`);
  return { mime, ...allowed };
}

export interface Probe { width?: number; height?: number; durationSeconds?: number; fps?: number; videoCodec?: string; audioCodec?: string; hasVideo: boolean; hasAudio: boolean; container?: string; sampleRate?: number; channels?: number; frames?: number; bitrate?: number; pixFmt?: string; colorSpace?: string }

/** ffprobe as JSON; throws when the file is not decodable. */
export async function ffprobe(file: string): Promise<Probe> {
  try {
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { maxBuffer: 8 * 1024 * 1024 });
    const j = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string; bit_rate?: string }; streams?: Array<Record<string, string | number>> };
    const v = j.streams?.find((s) => s.codec_type === 'video' && (s.disposition as unknown as { attached_pic?: number })?.attached_pic !== 1);
    const a = j.streams?.find((s) => s.codec_type === 'audio');
    const fpsOf = (r?: string | number) => { if (!r || typeof r !== 'string') return undefined; const [n, d] = r.split('/').map(Number); return d ? n / d : n; };
    const dur = j.format?.duration ? Number(j.format.duration) : v?.duration ? Number(v.duration) : a?.duration ? Number(a.duration) : undefined;
    return {
      width: v ? Number(v.width) : undefined, height: v ? Number(v.height) : undefined, durationSeconds: dur && Number.isFinite(dur) ? dur : undefined,
      fps: fpsOf(v?.avg_frame_rate) || fpsOf(v?.r_frame_rate), videoCodec: v?.codec_name as string | undefined, audioCodec: a?.codec_name as string | undefined,
      hasVideo: Boolean(v), hasAudio: Boolean(a), container: j.format?.format_name, sampleRate: a?.sample_rate ? Number(a.sample_rate) : undefined, channels: a?.channels ? Number(a.channels) : undefined,
      frames: v?.nb_frames ? Number(v.nb_frames) : undefined, bitrate: j.format?.bit_rate ? Number(j.format.bit_rate) : undefined, pixFmt: v?.pix_fmt as string | undefined, colorSpace: v?.color_space as string | undefined,
    };
  } catch (e) {
    throw new StudioError('INVALID', `The file could not be read as media: ${(e as Error).message.split('\n')[0]}`);
  }
}

/** A full decode pass: catches files that probe fine but do not play. Returns the number of frames decoded. */
export async function decodeCheck(file: string): Promise<{ ok: boolean; frames: number; error?: string }> {
  try {
    const { stderr } = await execFileP('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { maxBuffer: 8 * 1024 * 1024 });
    return { ok: !stderr.trim(), frames: -1, error: stderr.trim() || undefined };
  } catch (e) { return { ok: false, frames: 0, error: (e as Error).message.split('\n')[0] }; }
}

export async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => { fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => resolve()).on('error', reject); });
  return hash.digest('hex');
}

/** `presentation`: a picture's measured presentation (src/server/media/presentation.ts); `presentationError` when the
 *  measure was tried and failed (the file is stored all the same: a picture without it is shown neutral). `thumb`: the
 *  display-size JPEG written beside the picture (src/server/media/thumbs.ts), absent when it could not be made. */
export interface StoredFile { relPath: string; absPath: string; bytes: number; mime: string; kind: AssetKind; ext: string; sha256: string; probe?: Probe; presentation?: Presentation; presentationError?: string; thumb?: Omit<AssetThumb, 'src'> }

/** THE THUMBNAIL AT INGEST (docs/CONTRACTS-REDESIGN-BACKEND.md B7): every picture the library takes in gets its
 *  display-size JPEG beside it, once, here. The original is only read. A failure is logged and leaves the field empty
 *  (scripts/presentation-backfill.ts fills it later); it never fails the ingest. */
async function thumbAtIngest(kind: AssetKind, relPath: string, absPath: string, probe: Probe | undefined, presentation: Presentation | undefined): Promise<Pick<StoredFile, 'thumb'>> {
  if (kind !== 'IMAGE') return {};
  const rel = thumbPathFor(relPath);
  try {
    const made = await makeThumbnail(absPath, resolveLibrary(rel), { width: probe?.width, height: probe?.height, pixFmt: probe?.pixFmt, figure: isFigureLike({ width: probe?.width, height: probe?.height }), presentation });
    return { thumb: { path: rel, ...made } };
  } catch (e) {
    log.warn({ file: path.basename(absPath), err: (e as Error).message.split('\n')[0] }, 'picture thumbnail could not be made at ingest');
    return {};
  }
}

/** THE INGEST CALL (docs/DESIGN-SYSTEM-V4.md §2.4): every picture the library takes in — an upload, a drawn image, a
 *  poster frame, an established frame — is measured once, here, as it is stored. A failure is logged and leaves the
 *  field empty; it never fails the ingest. */
async function presentationAtIngest(kind: AssetKind, absPath: string, probe?: Probe): Promise<Pick<StoredFile, 'presentation' | 'presentationError'>> {
  if (kind !== 'IMAGE') return {};
  try { return { presentation: await measurePresentation(absPath, { width: probe?.width, height: probe?.height }) }; }
  catch (e) {
    const message = (e as Error).message.split('\n')[0];
    log.warn({ file: path.basename(absPath), err: message }, 'picture presentation could not be measured at ingest');
    return { presentationError: message };
  }
}

/** Write bytes into the library under a fresh asset id, verifying type and decodability. */
export async function storeBuffer(assetId: string, buf: Buffer, opts: { declaredType?: string; expectKind?: AssetKind; probe?: boolean } = {}): Promise<StoredFile> {
  const max = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (buf.length === 0) throw new StudioError('INVALID', 'The file is empty.');
  if (buf.length > max) throw new StudioError('INVALID', `The file is larger than ${env().MAX_UPLOAD_MB} MB.`);
  const { mime, kind, ext } = await sniff(buf, opts.declaredType);
  if (opts.expectKind && kind !== opts.expectKind) throw new StudioError('INVALID', `Expected ${opts.expectKind.toLowerCase()}, got ${kind.toLowerCase()}.`);
  const relPath = libraryPathFor(assetId, kind, ext);
  const absPath = resolveLibrary(relPath);
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.part`;
  await fsp.writeFile(tmp, buf);
  let probe: Probe | undefined;
  if (opts.probe !== false && kind !== 'SUBTITLE') {
    try { probe = await ffprobe(tmp); if (kind !== 'IMAGE') { const d = await decodeCheck(tmp); if (!d.ok) throw new StudioError('INVALID', `The file does not decode cleanly: ${d.error}`); } }
    catch (e) { await fsp.rm(tmp, { force: true }); throw e; }
  }
  await fsp.rename(tmp, absPath);
  const sha = await sha256File(absPath);
  const presentation = await presentationAtIngest(kind, absPath, probe);
  return { relPath, absPath, bytes: buf.length, mime, kind, ext, sha256: sha, probe, ...presentation, ...await thumbAtIngest(kind, relPath, absPath, probe, presentation.presentation) };
}

/** Move a file the worker produced (already on disk, e.g. an ffmpeg output) into the library. */
export async function adoptFile(assetId: string, srcAbs: string, opts: { expectKind?: AssetKind } = {}): Promise<StoredFile> {
  const head = Buffer.alloc(4100);
  const fh = await fsp.open(srcAbs, 'r');
  try { await fh.read(head, 0, 4100, 0); } finally { await fh.close(); }
  const { mime, kind, ext } = await sniff(head);
  if (opts.expectKind && kind !== opts.expectKind) throw new StudioError('INVALID', `Expected ${opts.expectKind.toLowerCase()}, got ${kind.toLowerCase()}.`);
  const relPath = libraryPathFor(assetId, kind, ext);
  const absPath = resolveLibrary(relPath);
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const probe = kind === 'SUBTITLE' ? undefined : await ffprobe(srcAbs);
  if (kind !== 'IMAGE' && kind !== 'SUBTITLE') { const d = await decodeCheck(srcAbs); if (!d.ok) throw new StudioError('INVALID', `The file does not decode cleanly: ${d.error}`); }
  try { await fsp.rename(srcAbs, absPath); } catch { await fsp.copyFile(srcAbs, absPath); await fsp.rm(srcAbs, { force: true }); }
  const st = await fsp.stat(absPath);
  const presentation = await presentationAtIngest(kind, absPath, probe);
  return { relPath, absPath, bytes: st.size, mime, kind, ext, sha256: await sha256File(absPath), probe, ...presentation, ...await thumbAtIngest(kind, relPath, absPath, probe, presentation.presentation) };
}

export async function removeFile(rel: string): Promise<void> {
  try { await fsp.rm(resolveLibrary(rel), { force: true }); } catch (e) { log.warn({ rel, err: (e as Error).message }, 'could not remove library file'); }
}

/** The asset record fields the server fills for a stored file. `tier` (character/location imagery only): SECONDARY
 *  for optional material, RAW for intermediate output; CANONICAL is set by `setIdentityView`, not here. */
export function assetFromStored(id: string, stored: StoredFile, meta: { label: string; tags: string[]; origin: Asset['origin']; jobId?: string; provenance?: Record<string, unknown>; poster?: string; tier?: Exclude<AssetTier, 'CANONICAL'> }): Omit<Asset, 'createdAt'> {
  return {
    id, kind: stored.kind, src: `/api/media/${id}`, poster: meta.poster, label: meta.label, tags: meta.tags, sample: false, origin: meta.origin, mimeType: stored.mime, bytes: stored.bytes, sha256: stored.sha256,
    width: stored.probe?.width, height: stored.probe?.height, durationSeconds: stored.probe?.durationSeconds, fps: stored.probe?.fps,
    provenance: { ...(meta.provenance ?? {}), path: stored.relPath, probe: stored.probe }, jobId: meta.jobId,
    ...(meta.tier ? { tier: meta.tier } : {}),
    ...(stored.presentation ? { presentation: stored.presentation } : {}),
    ...(stored.thumb ? { thumb: { src: thumbSrc(id), ...stored.thumb } } : {}),
  };
}

/** Remove a picture's derived thumbnail (the original is handled by `removeFile`). */
export async function removeThumb(relPath: string): Promise<void> { await removeFile(thumbPathFor(relPath)); }

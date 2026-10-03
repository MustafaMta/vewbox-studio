import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { AssetKind } from '@/domain/types';
import { command } from '@/server/studio/engine';
import { assetFromStored, removeFile, storeBuffer } from '@/server/media';
import { validateReferenceImage } from '@/server/media/image-check';
import { json, route } from '@/server/http';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** A character reference picture (the page itself refuses over 20 MB; a little headroom for the multipart). */
const REFERENCE_PICTURE_MAX_BYTES = 25 * 1024 * 1024;

/** Upload: multipart with `file`, optional `label`, `tags` (comma separated), `expect` (IMAGE | VIDEO | AUDIO) and
 *  `purpose`. The bytes are sniffed, probed and stored before the record exists, so a record never points at a bad
 *  file.
 *
 *  `purpose: 'character-reference'` (contract §1.2): the picture is a character reference. It must be an image, and
 *  it is measured on the CPU (size, sharpness; no face detector runs at upload, so `faces` stays undefined and the
 *  reasons say "face detection not available" — the face is found when the image is drawn, by the MediaPipe graph in
 *  ComfyUI) before anything is generated from it. The
 *  measurement is stored on the asset (`provenance.validation`, which the CREATE_CHARACTER orchestrator and
 *  `setPendingReference` carry on) and returned as `{ asset, validation }`. An unusable picture is still stored —
 *  the page shows the reasons and removes it — but nothing will draw from it. */
export const POST = route(async (req) => {
  const form = await req.formData().catch(() => { throw new StudioError('INVALID', 'Expected multipart form data.'); });
  const file = form.get('file');
  if (!(file instanceof File)) throw new StudioError('INVALID', 'No file was sent.');
  const label = String(form.get('label') ?? file.name).slice(0, 200);
  const tags = String(form.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const expect = form.get('expect') ? (String(form.get('expect')) as AssetKind) : undefined;
  const purpose = form.get('purpose') ? String(form.get('purpose')) : undefined;
  const reference = purpose === 'character-reference';
  if (reference && expect && expect !== 'IMAGE') throw new StudioError('INVALID', 'A character reference must be a picture (expect IMAGE).');
  // the size is refused before the body is read into memory (finding 18): a reference picture is at most 25 MB, any
  // upload at most the studio's MAX_UPLOAD_MB
  const cap = reference ? REFERENCE_PICTURE_MAX_BYTES : env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > cap) throw new StudioError('INVALID', `The file is ${(file.size / 1024 / 1024).toFixed(0)} MB; ${reference ? 'a reference picture' : 'an upload'} is at most ${Math.round(cap / 1024 / 1024)} MB.`, { bytes: file.size, maxBytes: cap });
  const id = nid('up');
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await storeBuffer(id, buf, { declaredType: file.type, expectKind: reference ? 'IMAGE' : expect });
  try {
    const validation = reference ? await validateReferenceImage(stored.absPath) : undefined;
    const provenance = { originalName: file.name.slice(0, 200), ...(reference ? { purpose, validation } : {}) };
    const r = await command('addAsset', [assetFromStored(id, stored, { label, tags, origin: 'UPLOAD', provenance })], 'upload');
    return json(reference ? { asset: r.asset, validation } : { asset: r.asset }, { status: 201 });
  } catch (e) { await removeFile(stored.relPath); throw e; }
});

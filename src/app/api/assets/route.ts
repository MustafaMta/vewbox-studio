import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { AssetKind } from '@/domain/types';
import { command } from '@/server/studio/engine';
import { assetFromStored, removeFile, storeBuffer } from '@/server/media';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Upload: multipart with `file`, optional `label`, `tags` (comma separated) and `expect` (IMAGE | VIDEO | AUDIO).
 *  The bytes are sniffed, probed and stored before the record exists, so a record never points at a bad file. */
export const POST = route(async (req) => {
  const form = await req.formData().catch(() => { throw new StudioError('INVALID', 'Expected multipart form data.'); });
  const file = form.get('file');
  if (!(file instanceof File)) throw new StudioError('INVALID', 'No file was sent.');
  const label = String(form.get('label') ?? file.name).slice(0, 200);
  const tags = String(form.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const expect = form.get('expect') ? (String(form.get('expect')) as AssetKind) : undefined;
  const id = nid('up');
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await storeBuffer(id, buf, { declaredType: file.type, expectKind: expect });
  try {
    const r = await command('addAsset', [assetFromStored(id, stored, { label, tags, origin: 'UPLOAD', provenance: { originalName: file.name.slice(0, 200) } })], 'upload');
    return json({ asset: r.asset }, { status: 201 });
  } catch (e) { await removeFile(stored.relPath); throw e; }
});

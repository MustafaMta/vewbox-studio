import path from 'node:path';
import type { HandlerContext } from './index';
import type { Asset, Production, Shot, StudioState } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { MINIMAX_H3_LOCAL } from '@/domain/video-capability';
import { primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import { FACE_REFERENCE_KIND, FACE_REFERENCE_SIDE, canvasFor, derivedFaceReference, faceCropSquare, faceReferenceFor, faceReferenceMode, type FaceReferenceProvenance } from '@/domain/face-reference';
import { castOf } from '@/studio/selectors';
import { commands } from '@/server/studio/engine';
import { assetFile, assetFromStored } from '@/server/media';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { detectFaces, isQaUnavailable } from '@/server/providers/qa-service';
import type { JobOutputs } from '@/server/jobs/outputs';

/** DERIVE THE FACE REFERENCES A SHOT NEEDS (src/domain/face-reference.ts), before its shot pack is resolved: for each
 *  pictured character whose canonical image has no face reference yet, when the studio has it on and the shot frames
 *  faces close — find the face on the canonical image (the ASR service's YuNet, `POST /qa/faces`), cut a square around
 *  it, enlarge it (lanczos) and store it as a DERIVED asset whose provenance names the canonical image, its version, the
 *  face box and the crop. It is committed at once (the next take reuses it) and never added to the character's
 *  references. Nothing here can fail the take: an offline detector, a picture without a face or a failed crop is an
 *  event, and the shot is made with the full-body canonical image alone. Returns the state with the new assets. */
export async function withFaceReferences(ctx: HandlerContext, state: StudioState, p: Production, sh: Shot, opts: { backend: 'local' | 'api'; out: Pick<JobOutputs, 'adopt'> }): Promise<StudioState> {
  if (opts.backend !== 'local') return state;
  const mode = faceReferenceMode(state.settings);
  if (mode === 'OFF') return state;
  const canvas = canvasFor(ASPECT_INFO[p.aspect] ?? ASPECT_INFO.WIDE_16_9);
  const cast = castOf(state, p);
  let assets = state.assets;
  for (const characterId of sh.characterIds) {
    const c = cast.find((x) => x.id === characterId);
    if (!c || primaryImageSourceOf(c) !== 'CANONICAL') continue;
    const canonId = primaryImageOf(c)!;
    const canon = assets.find((a) => a.id === canonId);
    if (!canon || canon.kind !== 'IMAGE' || canon.unavailable || canon.sample) continue;
    const d = faceReferenceFor({ cap: MINIMAX_H3_LOCAL, mode, framing: sh.framing, canvas, characterId, canonical: canon, derived: derivedFaceReference(assets, canonId) });
    if (!d.derive) continue;
    try {
      const file = assetFile(canon);
      const found = await detectFaces(file);
      if (isQaUnavailable(found)) { await ctx.event('warn', `${c.name}: no face reference (the face detector is not available: ${found.reason}); the canonical image alone conditions the shot`, { characterId }); continue; }
      if (!found.faces.length) { await ctx.event('warn', `${c.name}: no face found on the canonical image; no face reference`, { characterId, assetId: canonId }); continue; }
      const [x, y, w, h] = found.faces[0].box;
      const size = { width: found.width, height: found.height };
      const crop = faceCropSquare({ x, y, w, h }, size);
      const dir = await tmpDir('face-ref');
      const outFile = path.join(dir, `${canonId}-face.png`);
      await ffmpeg(['-y', '-i', file, '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${FACE_REFERENCE_SIDE}:${FACE_REFERENCE_SIDE}:flags=lanczos`, '-frames:v', '1', outFile]);
      const { id, stored } = await opts.out.adopt(`face-ref:${canonId}`, outFile, { expectKind: 'IMAGE' });
      const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
      const provenance: FaceReferenceProvenance = {
        kind: FACE_REFERENCE_KIND, derivedFrom: canonId, characterId, canonicalVersion: c.canonicalImage?.version, canonicalSize: size,
        faceBox: { x: r4(x / size.width), y: r4(y / size.height), w: r4(w / size.width), h: r4(h / size.height) }, crop, side: FACE_REFERENCE_SIDE, detector: found.detector,
      };
      const asset = assetFromStored(id, stored, { label: `${c.name} — face reference (derived from canonical image v${c.canonicalImage?.version ?? '?'})`, tags: ['face-reference', 'production-reference', 'derived'], origin: 'DERIVED', jobId: ctx.job.id, provenance: provenance as unknown as Record<string, unknown> });
      await commands([{ name: 'addAsset', args: [asset] }], 'worker');
      assets = [...assets, { ...asset, createdAt: new Date().toISOString() } as Asset];
      await ctx.event('info', `${c.name}: face reference derived from the canonical image (face ${Math.round(h)} px tall in ${size.width}x${size.height}; crop ${crop.w} px enlarged to ${FACE_REFERENCE_SIDE})`, { characterId, assetId: id, provenance });
    } catch (e) {
      await ctx.event('warn', `${c.name}: the face reference could not be derived (${(e as Error).message.split('\n')[0]}); the canonical image alone conditions the shot`, { characterId });
    }
  }
  return assets === state.assets ? state : { ...state, assets };
}

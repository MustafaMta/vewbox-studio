import type { Asset, GenerationSettings } from './types';
import type { Framing } from './vocabulary';
import type { VideoCapability } from './video-capability';

/** THE DERIVED FACE REFERENCE (continuity gaps 2026-10-06, gap 8; research G13; final directive §12: "Temporary
 *  production references may be created internally where necessary; they must derive from the canonical identity,
 *  remain traceable, never replace the canonical image and never clutter the character profile").
 *
 *  The problem, measured on the node's own code (ComfyUI v0.38.1 MiniMaxH3ReferenceToVideo): with `ref_image_size=match`
 *  a reference is scaled DOWN to the generation's pixel area. Our canonical image is a whole standing figure, 928x1664;
 *  at 1344x768 it is encoded at ~768x1376, and its face — about a tenth of the figure's height — keeps ~120–150 px.
 *  MinimaxStoryBuilder's sheets.py reached the same arithmetic ("~140px of face: not enough for reference-to-video to
 *  hold a likeness"). Identity lives in those face pixels, most of all in close framings.
 *
 *  The remedy: beside the full-body canonical image (which stays the identity and is always sent), a square crop of the
 *  canonical image's face, enlarged so the engine encodes the face at several hundred pixels — derived once per
 *  canonical version, stored as a DERIVED asset whose provenance names the canonical asset, its version, the face box
 *  and the crop (traceable), never added to the character's references (no profile clutter). It is sent only on a
 *  close framing, only when the canonical's encoded face is under the engine's `minFacePx` (AUTO), and only when the
 *  studio turned it on (OFF until the GPU validation promotes it). Pure. */

export const FACE_REFERENCE_KIND = 'FACE_REFERENCE';
/** The enlarged crop's side in pixels: the face then fills ~45 % of it, ≈ 350 px encoded (START; G13). */
export const FACE_REFERENCE_SIDE = 768;

export interface FaceBox { x: number; y: number; w: number; h: number }
export interface FaceReferenceProvenance {
  kind: typeof FACE_REFERENCE_KIND;
  /** the canonical image it was cut from, and that image's version */
  derivedFrom: string;
  characterId: string;
  canonicalVersion?: number;
  canonicalSize: { width: number; height: number };
  /** the face box on the canonical image, 0–1 fractions */
  faceBox: FaceBox;
  /** the crop on the canonical image in pixels, and the side it was enlarged to */
  crop: { x: number; y: number; w: number; h: number };
  side: number;
  detector: string;
}

export type FaceReferenceMode = NonNullable<GenerationSettings['faceReference']>;
export const faceReferenceMode = (s?: { generation?: GenerationSettings }): FaceReferenceMode => s?.generation?.faceReference ?? 'OFF';

/** The generation canvas the node encodes against (minimax-h3.ts: multiples of 32, area capped at 768x1344). */
export function canvasFor(size: { width: number; height: number }): { width: number; height: number } {
  const snap = (n: number) => Math.max(32, Math.round(n / 32) * 32);
  let w = snap(size.width), h = snap(size.height);
  const cap = 768 * 1344;
  if (w * h > cap) { const s = Math.sqrt(cap / (w * h)); w = snap(w * s); h = snap(h * s); }
  return { width: w, height: h };
}

/** The size the engine encodes a reference picture at (the node's own rule, from the capability). */
export function encodedRefSize(cap: VideoCapability, canvas: { width: number; height: number }, ref: { width: number; height: number }): { width: number; height: number; scale: number } {
  const sizing = cap.refs.imageSizing ?? { mode: 'match', maxShortEdge: 2048, multiple: 32 };
  const scale = sizing.mode === 'match' ? Math.min(1, Math.sqrt((canvas.width * canvas.height) / (ref.width * ref.height))) : Math.min(1, sizing.maxShortEdge / Math.min(ref.width, ref.height));
  const m = sizing.multiple;
  return { width: Math.max(m, Math.round((ref.width * scale) / m) * m), height: Math.max(m, Math.round((ref.height * scale) / m) * m), scale };
}

/** Face pixels (the face box's height) the engine keeps of a picture whose face box is `face` (fractions). */
export const encodedFacePx = (cap: VideoCapability, canvas: { width: number; height: number }, ref: { width: number; height: number }, face: FaceBox): number => Math.round(face.h * encodedRefSize(cap, canvas, ref).height);

export const faceReferenceProvenance = (a: Pick<Asset, 'provenance'> | undefined): FaceReferenceProvenance | undefined => {
  const pv = a?.provenance as Partial<FaceReferenceProvenance> | undefined;
  return pv?.kind === FACE_REFERENCE_KIND && typeof pv.derivedFrom === 'string' && pv.faceBox && pv.canonicalSize ? (pv as FaceReferenceProvenance) : undefined;
};

/** The face reference already derived from this canonical image (the newest usable one), if any. */
export function derivedFaceReference(assets: Asset[], canonicalAssetId: string): Asset | undefined {
  return [...assets].reverse().find((a) => a.kind === 'IMAGE' && !a.unavailable && !a.sample && faceReferenceProvenance(a)?.derivedFrom === canonicalAssetId);
}

/** The square crop around a face box (pixels), centred a little below the box's middle (chin, hair), `margin` times the
 *  box's long side, held inside the picture. */
export function faceCropSquare(box: { x: number; y: number; w: number; h: number }, image: { width: number; height: number }, margin = 2.2): { x: number; y: number; w: number; h: number } {
  const side = Math.min(image.width, image.height, Math.round(Math.max(box.w, box.h) * margin));
  const cx = box.x + box.w / 2, cy = box.y + box.h * 0.55;
  const x = Math.round(Math.min(Math.max(0, cx - side / 2), image.width - side));
  const y = Math.round(Math.min(Math.max(0, cy - side / 2), image.height - side));
  return { x, y, w: side, h: side };
}

export interface FaceReferenceDecision {
  characterId: string;
  /** send the derived face crop with this shot */
  use: boolean;
  /** the worker should derive one first (none exists yet for this canonical image) */
  derive: boolean;
  assetId?: string;
  /** the canonical image's face pixels after the engine's scaling, when known */
  facePx?: number;
  reason: string;
}

/** Whether a shot sends a character's derived face reference (see the module note). */
export function faceReferenceFor(o: { cap: VideoCapability; mode: FaceReferenceMode; framing: Framing; canvas: { width: number; height: number }; characterId: string; canonical?: Pick<Asset, 'id' | 'width' | 'height'>; derived?: Asset }): FaceReferenceDecision {
  const base = { characterId: o.characterId, use: false, derive: false };
  const cfg = o.cap.refs.faceReference;
  if (!cfg) return { ...base, reason: `${o.cap.id} takes no derived face reference` };
  if (o.mode === 'OFF') return { ...base, reason: 'the studio has the derived face reference off' };
  if (!cfg.framings.includes(o.framing)) return { ...base, reason: `a ${o.framing.toLowerCase().replace(/_/g, ' ')} frames the face small: the full-body canonical image is enough` };
  if (!o.canonical) return { ...base, reason: 'no canonical image to derive from' };
  const pv = faceReferenceProvenance(o.derived);
  if (!o.derived || !pv) return { ...base, derive: true, reason: 'no face reference derived from this canonical image yet' };
  const facePx = encodedFacePx(o.cap, o.canvas, pv.canonicalSize, pv.faceBox);
  if (o.mode === 'AUTO' && facePx >= cfg.minFacePx) return { ...base, facePx, assetId: o.derived.id, reason: `the canonical image keeps ${facePx} px of face (≥ ${cfg.minFacePx}): no face crop needed` };
  return { ...base, use: true, facePx, assetId: o.derived.id, reason: o.mode === 'ON' ? `face crop on every close framing (studio: ON); the canonical keeps ${facePx} px of face` : `the canonical image keeps only ${facePx} px of face after the engine's scaling (< ${cfg.minFacePx}): its face crop is sent beside it` };
}

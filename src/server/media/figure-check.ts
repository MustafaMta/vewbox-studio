import type { GrayImage } from './image-check';

/** FULL BODY IN FRAME, ON THE CPU — the canonical character image must show the whole figure, head to feet, with a
 *  margin, on a plain background (docs/CONTRACTS-IDENTITY-PACK.md v2 §2). The background is found by flooding from the
 *  picture's border through small steps between neighbouring pixels, so a studio vignette and a soft floor shadow stay
 *  background while the figure's outline stops the flood; the figure's bounding box must then keep clear of every
 *  edge and fill a sensible share of the height. A head or feet cut by the frame touch an edge and fail
 *  (docs/evidence/image-v2/REPORT.md: every generated canonical image passed, every deliberately cropped control
 *  failed). Decode with `grayPixels(file, 640)`. */

/** 1 = figure, 0 = background reached from the border. `step` = the largest grey-level step between neighbours the
 *  background flood may take (5 on a ~640 px image). The flood starts only from border pixels near the border's median
 *  grey (`seedTolerance`): a figure cut by the frame touches the border, and seeding inside it would flood the cut
 *  legs or head into "background" and hide exactly the failure this check is for. */
export function figureMask(img: GrayImage, opts: { step?: number; seedTolerance?: number } = {}): Uint8Array {
  const { data, width: w, height: h } = img;
  const step = opts.step ?? 5, tol = opts.seedTolerance ?? 28;
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const values = border.map((i) => data[i]).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] ?? 128;
  const seed = (i: number) => { if (!bg[i] && Math.abs(data[i] - median) <= tol) { bg[i] = 1; stack.push(i); } };
  for (const i of border) seed(i);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, v = data[i];
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of nb) if (j >= 0 && j < w * h && !bg[j] && Math.abs(data[j] - v) <= step) { bg[j] = 1; stack.push(j); }
  }
  const fig = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fig[i] = bg[i] ? 0 : 1;
  return fig;
}

/** Drop the specks: keep the 4-connected components of a mask that are at least `minFraction` of the picture or of
 *  the largest component's size (a figure can fall apart into torso and legs where a garment matches the backdrop;
 *  grain in a studio photograph's last rows must not read as "feet at the edge"). */
export function withoutSpecks(mask: Uint8Array, w: number, h: number, minFraction = 0.002): Uint8Array {
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start]) continue;
    const id = sizes.length; let size = 0;
    label[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!; size++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) if (j >= 0 && j < w * h && mask[j] && !label[j]) { label[j] = id; stack.push(j); }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  const min = Math.max(1, Math.min(minFraction * w * h, 0.02 * largest));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = label[i] && sizes[label[i]] >= min ? 1 : 0;
  return out;
}

export interface FramingCheck {
  ok: boolean;
  /** the figure's bounding box in fractions of the picture */
  box: { x: number; y: number; w: number; h: number } | null;
  /** margins to the picture edges, fractions */
  margins: { top: number; bottom: number; left: number; right: number } | null;
  reasons: string[];
}

export const FRAMING_RULES = { minMargin: 0.01, minHeight: 0.55, maxHeight: 0.97 } as const;

/** Whole figure inside the picture: its box must not touch any edge (a cut head or cut feet touch the top or bottom)
 *  and must fill a sensible share of the height (a tiny figure is not a usable identity image). Rows and columns count
 *  as figure when more than `minFill` of them is figure, so specks and grain are ignored. */
export function fullBodyInFrame(img: GrayImage, rules: { minMargin?: number; minHeight?: number; maxHeight?: number; step?: number; minFill?: number } = {}): FramingCheck {
  const { width: w, height: h } = img;
  const minMargin = rules.minMargin ?? FRAMING_RULES.minMargin, minHeight = rules.minHeight ?? FRAMING_RULES.minHeight, maxHeight = rules.maxHeight ?? FRAMING_RULES.maxHeight;
  const mask = withoutSpecks(figureMask(img, { step: rules.step }), w, h);
  const fill = rules.minFill ?? 0.002;
  const rowHas = (y: number) => { let n = 0; for (let x = 0; x < w; x++) n += mask[y * w + x]; return n > fill * w; };
  const colHas = (x: number) => { let n = 0; for (let y = 0; y < h; y++) n += mask[y * w + x]; return n > fill * h; };
  let top = -1, bottom = -1, left = -1, right = -1;
  for (let y = 0; y < h && top < 0; y++) if (rowHas(y)) top = y;
  for (let y = h - 1; y >= 0 && bottom < 0; y--) if (rowHas(y)) bottom = y;
  for (let x = 0; x < w && left < 0; x++) if (colHas(x)) left = x;
  for (let x = w - 1; x >= 0 && right < 0; x--) if (colHas(x)) right = x;
  if (top < 0 || left < 0) return { ok: false, box: null, margins: null, reasons: ['no figure found on the background'] };
  const box = { x: left / w, y: top / h, w: (right - left + 1) / w, h: (bottom - top + 1) / h };
  const margins = { top: top / h, bottom: (h - 1 - bottom) / h, left: left / w, right: (w - 1 - right) / w };
  const reasons: string[] = [];
  if (margins.top < minMargin) reasons.push('the head touches or leaves the top edge');
  if (margins.bottom < minMargin) reasons.push('the feet touch or leave the bottom edge');
  // no side-edge rule: a hard floor shadow (anime) or a backdrop seam reaches the sides of good pictures, while a
  // relaxed standing figure never does (REPORT: both false alarms in 36 pictures came from that rule)
  if (box.h < minHeight) reasons.push(`the figure fills only ${Math.round(box.h * 100)} % of the height (at least ${Math.round(minHeight * 100)} %)`);
  if (box.h > maxHeight) reasons.push('the figure fills the whole height: no margin');
  return { ok: reasons.length === 0, box, margins, reasons };
}

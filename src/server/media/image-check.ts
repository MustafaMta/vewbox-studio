import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffprobe } from '@/server/media';

const execFileP = promisify(execFile);

/** REFERENCE IMAGE VALIDATION — on the CPU, before any generation is queued from an uploaded picture. Size comes
 *  from ffprobe; sharpness is the variance of the Laplacian over a downscaled greyscale decode (ffmpeg → raw pixels →
 *  a small pure-JS pass), the classic blur measure. Face detection is NOT available on the CPU in this build: no
 *  face model is installed with the Node dependencies (`@vladmandic/human` needs its own weights and a TensorFlow
 *  backend), so `faces` stays undefined and the reasons say so. The ComfyUI MediaPipe graph (`faceCheck`) can fill
 *  `faces`/`faceBoxHeight` later when the GPU is free; `facesFromMask` reads its mask output. */

export interface ReferenceValidation {
  ok: boolean;
  width: number;
  height: number;
  /** variance of the Laplacian on the downscaled greyscale image; higher is sharper (in focus ≳ 60, blurred ≲ 20);
   *  absent when the picture could not be decoded for the measure (never NaN: the record is stored as JSON) */
  sharpness?: number;
  /** undefined when no detector ran */
  faces?: number;
  /** height of the largest face box as a fraction of the image height */
  faceBoxHeight?: number;
  reasons: string[];
}

export const REFERENCE_RULES = { minSide: 512, maxPixels: 24_000_000, minSharpness: 30, minFaceHeight: 0.18, analysisSide: 768 } as const;
export const FACE_DETECTION_NOTE = 'face detection not available (size and sharpness only)';

export interface GrayImage { data: Uint8Array; width: number; height: number }

/** Decode a picture to 8-bit greyscale, downscaled so the long side is at most `maxSide` (the sharpness measure is
 *  compared at one scale). */
export async function grayPixels(file: string, maxSide = REFERENCE_RULES.analysisSide, size?: { width: number; height: number }): Promise<GrayImage> {
  const p = size ?? await ffprobe(file);
  const w0 = Number(p.width) || 0, h0 = Number(p.height) || 0;
  if (!w0 || !h0) throw new Error('the picture has no dimensions');
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const width = Math.max(1, Math.floor(w0 * s)), height = Math.max(1, Math.floor(h0 * s));
  const { stdout } = await execFileP('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-frames:v', '1', '-vf', `scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const data = new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length);
  if (data.length < width * height) throw new Error(`decoded ${data.length} bytes for ${width}x${height}`);
  return { data: data.subarray(0, width * height), width, height };
}

/** Variance of the 4-neighbour Laplacian over the interior pixels. Flat → 0; fine detail → hundreds. */
export function laplacianVariance(img: GrayImage): number {
  const { data, width: w, height: h } = img;
  if (w < 3 || h < 3) return 0;
  let n = 0, sum = 0, sumSq = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      n++; sum += v; sumSq += v * v;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface FaceBoxPx { x: number; y: number; w: number; h: number; area: number }

/** Connected components (4-neighbour) of a binary mask image, largest first; components under `minFraction` of the
 *  picture are noise. Used on the MediaPipe face-oval mask that `faceCheck` renders. */
export function facesFromMask(img: GrayImage, opts: { threshold?: number; minFraction?: number } = {}): FaceBoxPx[] {
  const { data, width: w, height: h } = img;
  const thr = opts.threshold ?? 128; const minArea = Math.max(1, Math.floor((opts.minFraction ?? 0.001) * w * h));
  const seen = new Uint8Array(w * h);
  const boxes: FaceBoxPx[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start] < thr) continue;
    let minX = w, minY = h, maxX = -1, maxY = -1, area = 0;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && data[j] >= thr) { seen[j] = 1; stack.push(j); }
    }
    if (area >= minArea) boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  return boxes.sort((a, b) => b.area - a.area);
}

/** The decision, with every reason spelled out for the page. Face rules apply only when a detector ran. */
export function judgeReference(m: { width: number; height: number; sharpness: number; faces?: number; faceBoxHeight?: number }, rules = REFERENCE_RULES): ReferenceValidation {
  const reasons: string[] = [];
  const short = Math.min(m.width, m.height);
  if (short < rules.minSide) reasons.push(`too small: ${m.width}×${m.height}; the short side must be at least ${rules.minSide} px`);
  if (m.width * m.height > rules.maxPixels) reasons.push(`too large: ${m.width}×${m.height} is over ${Math.round(rules.maxPixels / 1e6)} megapixels`);
  if (!Number.isFinite(m.sharpness)) reasons.push('the picture could not be decoded for the sharpness check');
  else if (m.sharpness < rules.minSharpness) reasons.push(`blurry: sharpness ${m.sharpness.toFixed(1)} is below ${rules.minSharpness}`);
  if (m.faces === undefined) reasons.push(FACE_DETECTION_NOTE);
  else if (m.faces === 0) reasons.push('no face found — use a clearer picture of the face');
  else if (m.faces > 1) reasons.push(`${m.faces} faces found — one person only`);
  else if (m.faceBoxHeight !== undefined && m.faceBoxHeight < rules.minFaceHeight) reasons.push(`the face is too small: ${Math.round(m.faceBoxHeight * 100)} % of the height, at least ${Math.round(rules.minFaceHeight * 100)} % is needed`);
  const ok = reasons.every((r) => r === FACE_DETECTION_NOTE);
  return { ok, width: m.width, height: m.height, ...(Number.isFinite(m.sharpness) ? { sharpness: Math.round(m.sharpness * 10) / 10 } : {}), faces: m.faces, faceBoxHeight: m.faceBoxHeight, reasons };
}

/** Validate an uploaded reference picture on the CPU. Throws `INVALID` (from ffprobe) when the file is not an image. */
export async function validateReferenceImage(file: string, opts: { rules?: typeof REFERENCE_RULES } = {}): Promise<ReferenceValidation> {
  const rules = opts.rules ?? REFERENCE_RULES;
  const p = await ffprobe(file);
  const width = Number(p.width) || 0, height = Number(p.height) || 0;
  let sharpness = NaN;
  if (width && height) { try { sharpness = laplacianVariance(await grayPixels(file, rules.analysisSide, { width, height })); } catch { sharpness = NaN; } }
  return judgeReference({ width, height, sharpness }, rules);
}

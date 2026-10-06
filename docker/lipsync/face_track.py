"""Face tracking for the lip-sync corrector, without InsightFace (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §C.3).

LatentSync 1.6 aligns every frame's face to a fixed template from three points — the two eyebrow centres and the nose
centre — found with InsightFace (`buffalo_l`: det + 2d106 landmarks). InsightFace's model packs are non-commercial, so
the Vewbox build replaces that detector:

- **YuNet** (OpenCV Zoo, MIT) finds the faces in each frame and chooses the one to correct (by identity against the
  speaker's canonical image when one is given — SFace, Apache-2.0 —, else by a box hint, else the largest face), linked
  frame to frame by box overlap;
- **MediaPipe Face Landmarker** (Apache-2.0) gives the 478-point mesh on a crop around that face;
- the mesh is mapped to the 68-point layout with **LatentSync 1.5's own table** (`mediapipe_lm478_to_face_alignment_lm68`,
  latentsync/utils/image_processor.py at commit 75a4a17, Apache-2.0 © ByteDance), and the three alignment points are the
  1.5 release's: mean of lm68[17:22], lm68[22:27], lm68[27:36];
- the 68 points are smoothed over time with 1.5's `laplacianSmooth` (alpha 0.3), so the aligned crop does not shake.

Everything in this module is pure numpy (plus cv2 for the warps in `composite`), so it is unit-tested on CPU
(docker/lipsync/tests). The model-facing code is in corrector.py.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

# LatentSync 1.5 (Apache-2.0, ByteDance): MediaPipe 478-mesh index for each of the 68 face-alignment points.
LM68_FROM_MP478: tuple[int, ...] = (
    162, 234, 93, 58, 172, 136, 149, 148, 152, 377, 378, 365, 397, 288, 323, 454, 389,  # 0-16 jaw
    71, 63, 105, 66, 107,  # 17-21 eyebrow (image left)
    336, 296, 334, 293, 301,  # 22-26 eyebrow (image right)
    168, 197, 5, 4, 75, 97, 2, 326, 305,  # 27-35 nose
    33, 160, 158, 133, 153, 144,  # 36-41 eye
    362, 385, 387, 263, 373, 380,  # 42-47 eye
    61, 39, 37, 0, 267, 269, 291, 405, 314, 17, 84, 181,  # 48-59 outer lips
    78, 82, 13, 312, 308, 317, 14, 87,  # 60-67 inner lips
)
assert len(LM68_FROM_MP478) == 68

Box = tuple[float, float, float, float]  # x0, y0, x1, y1

# START values (calibrated on the evaluation takes; see docs/MODELS.md, lip-sync corrector)
TRACK_IOU_MIN = 0.25  # a detection continues the chosen face when its box overlaps the last one this much
IDENTITY_MIN = 0.30  # SFace cosine below which a face is not taken for the speaker on identity alone
MAX_GAP_FRAMES = 6  # frames without a face that are bridged by interpolating the alignment points
SMOOTH_ALPHA = 0.3  # LatentSync 1.5 laplacianSmooth default
MIN_FACE_PX = 128  # research §C.3 (c): the corrector works on faces at least this tall (START)


def lm68_from_mp478(xy478: np.ndarray) -> np.ndarray:
    """(478, ≥2) mesh points in pixels → (68, 2) face-alignment points."""
    xy = np.asarray(xy478, dtype=np.float64)
    if xy.shape[0] < 468:
        raise ValueError(f"expected the 478-point mesh, got {xy.shape[0]} points")
    return xy[list(LM68_FROM_MP478), :2].copy()


def align_points3(lm68: np.ndarray) -> np.ndarray:
    """The three points LatentSync aligns to its template: eyebrow centres (image left, image right) and the nose."""
    p = np.asarray(lm68, dtype=np.float64)
    return np.stack([p[17:22].mean(0), p[22:27].mean(0), p[27:36].mean(0)])


class LaplacianSmooth:
    """LatentSync 1.5's temporal landmark smoother (latentsync/utils/affine_transform.py, Apache-2.0): each point moves
    towards its new position with a weight that falls off with the squared displacement relative to the face width, so
    jitter is damped and real motion passes."""

    def __init__(self, alpha: float = SMOOTH_ALPHA) -> None:
        self.alpha = alpha
        self.last: np.ndarray | None = None

    def reset(self) -> None:
        self.last = None

    def smooth(self, pts: np.ndarray) -> np.ndarray:
        cur = np.asarray(pts, dtype=np.float64)
        if self.last is None or self.last.shape != cur.shape:
            self.last = cur.copy()
            return cur.copy()
        width = max(1e-6, float(cur[:, 0].max() - cur[:, 0].min()))
        d2 = np.sum((cur - self.last) ** 2, axis=1)
        w = np.exp(-d2 / (width * self.alpha))[:, None]
        out = self.last * w + cur * (1 - w)
        self.last = out.copy()
        return out


# LatentSync's alignment template (latentsync/utils/affine_transform.py AlignRestore, align_points=3): the two eyebrow
# centres and the nose centre in a 75×100 face box, scaled by resolution/256·2.8; the aligned crop is face_size
# (75·r × 100·r, width × height) and is then resized to resolution².
def template(resolution: int = 512) -> tuple[np.ndarray, tuple[int, int]]:
    ratio = resolution / 256 * 2.8
    tpl = np.array([[19 - 2, 30 - 10], [56 + 2, 30 - 10], [37.5, 45 - 5]], dtype=np.float64) * ratio
    return tpl, (int(75 * ratio), int(100 * ratio))


def similarity_from_points(points: np.ndarray, tpl: np.ndarray, smooth: bool = True, p_bias: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray | None]:
    """numpy port of AlignRestore.transformation_from_points (LatentSync 1.6, Apache-2.0), same arithmetic: Procrustes
    similarity (unbiased std normalisation, SVD, reflection fix) from the 3 points to the template, plus upstream's
    temporal 'bias' smoothing of the nose term (0.2 old + 0.8 new, added to the translation as upstream does).
    Returns (2×3 matrix frame → aligned crop, p_bias)."""
    p1 = np.asarray(points, dtype=np.float64)
    p2 = np.asarray(tpl, dtype=np.float64)
    c1, c2 = p1.mean(0), p2.mean(0)
    p1c, p2c = p1 - c1, p2 - c2
    s1, s2 = np.std(p1c, ddof=1), np.std(p2c, ddof=1)
    p1n, p2n = p1c / s1, p2c / s2
    cov = p1n.T @ p2n
    u, _s, vh = np.linalg.svd(cov)
    v = vh.T
    r = v @ u.T
    if np.linalg.det(r) < 0:
        v[:, -1] = -v[:, -1]
        r = v @ u.T
    sr = (s2 / s1) * r
    t = c2.reshape(2, 1) - (s2 / s1) * (r @ c1.reshape(2, 1))
    m = np.concatenate([sr, t], axis=1)
    if smooth:
        bias = p2n[2] - p1n[2]
        if p_bias is not None:
            bias = p_bias * 0.2 + bias * 0.8
        p_bias = bias
        m[:, 2] = m[:, 2] + bias
    return m, p_bias


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return float(inter / ua) if ua > 0 else 0.0


def area(b: Box) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


RIVAL_MARGIN = 0.05  # a face is the speaker only if it resembles the speaker this much more than any other character
# How frontal the face is, 1 − |yaw|/90 (yaw from the Face Landmarker's transformation matrix): full strength up to
# 30° of yaw, nothing from 42° (a profile), linear between. START, measured 2026-10-06 on the acceptance takes: frontal
# shots −23…+8°, 3/4 views 20–35° (they align and correct well), near-profiles 30–70° (the mouth flattens and the
# smile is lost: never corrected). The 2-D mesh measure (`frontalness`) is NOT used for this: on stylised faces the mesh
# stays frontal-looking in profile.
FRONTAL_LO, FRONTAL_HI = 1 - 42 / 90, 1 - 30 / 90
STRENGTH_RAMP = 4  # frames over which the edit fades in / out around profile frames and lost runs


@dataclass
class Detection:
    box: Box
    score: float
    identity: float | None = None  # SFace cosine against the speaker's reference, when one was given
    rival: float | None = None  # the best SFace cosine against the OTHER characters' references (when given)


def choose_face(dets: Sequence[Detection], prev: Box | None, hint: Box | None = None, identity_min: float = IDENTITY_MIN, iou_min: float = TRACK_IOU_MIN, rival_margin: float = RIVAL_MARGIN) -> int | None:
    """Which detection is the face to correct in this frame.

    1. With identities (a reference was given): the best-matching face at or above `identity_min` that also resembles
       the speaker more than any other character of the shot (by `rival_margin`, when their references were given);
       ties and near-ties (within 0.05) go to the one that continues the previous box.
    2. Else the face that continues the previous box (IoU ≥ `iou_min`).
    3. Else (first frame, or the track was lost) the face overlapping the hint box most, else the largest face.
    None when there is no detection, or when identities were measured and no face qualifies (the speaker is not in
    this frame — e.g. turned to a profile the detector misses: another character must not be corrected in their place;
    measured 2026-10-06 on a stylised two-shot, where SFace gave the listener 0.3+ against the speaker's picture)."""
    if not dets:
        return None
    cont = [iou(prev, d.box) if prev is not None else 0.0 for d in dets]
    if any(d.identity is not None for d in dets):
        ok = [i for i, d in enumerate(dets) if d.identity is not None and d.identity >= identity_min and (d.rival is None or d.identity >= d.rival + rival_margin)]
        if not ok:
            return None
        best = max(d.identity for i, d in enumerate(dets) if i in ok)  # type: ignore[type-var]
        near = [i for i in ok if (dets[i].identity or 0.0) >= best - 0.05]
        return max(near, key=lambda i: (cont[i], dets[i].identity or 0.0))
    if prev is not None:
        i = int(np.argmax(cont))
        if cont[i] >= iou_min:
            return i
    if hint is not None:
        ov = [iou(hint, d.box) for d in dets]
        i = int(np.argmax(ov))
        if ov[i] > 0:
            return i
    return int(np.argmax([area(d.box) for d in dets]))


def frontalness(xy478: np.ndarray) -> float:
    """How frontal the face is, from the 2-D mesh: the nose tip's distance to the nearer cheek contour over its distance
    to the farther one (MediaPipe 4 = nose tip, 234 / 454 = the left / right face edge). 1 for a frontal face, → 0 as
    it turns to a profile. LatentSync is trained on near-frontal talking heads and its 3-point alignment degenerates in
    profile (both eyebrow centres collapse together)."""
    xy = np.asarray(xy478, dtype=np.float64)[:, :2]
    dl = float(np.linalg.norm(xy[4] - xy[234]))
    dr = float(np.linalg.norm(xy[4] - xy[454]))
    hi = max(dl, dr)
    return min(dl, dr) / hi if hi > 1e-6 else 0.0


def yaw_degrees(matrix: np.ndarray) -> float:
    """Head yaw (rotation about the vertical axis, degrees; 0 = facing the camera) from the Face Landmarker's 4×4
    facial transformation matrix."""
    r = np.asarray(matrix, dtype=np.float64)[:3, :3]
    return float(np.degrees(np.arctan2(r[0, 2], r[2, 2])))


def frontal_from_yaw(yaw: float | None, mesh_frontalness: float | None = None) -> float | None:
    """1 − |yaw|/90; without a yaw, a conservative stand-in from the 2-D measure (never full strength)."""
    if yaw is not None:
        return max(0.0, 1.0 - abs(yaw) / 90.0)
    if mesh_frontalness is None:
        return None
    return (FRONTAL_LO + FRONTAL_HI) / 2 if mesh_frontalness >= 0.22 else 0.0


def edit_strength(edit: Sequence[bool], frontal: Sequence[float | None], lo: float = FRONTAL_LO, hi: float = FRONTAL_HI, ramp: int = STRENGTH_RAMP) -> np.ndarray:
    """Per frame, how much of the regenerated mouth is blended in (0..1): 0 where the frame is not edited or the face is
    in profile (frontalness ≤ lo), 1 when frontal (≥ hi), linear between; then eroded and ramped over `ramp` frames so
    the edit fades in and out instead of popping when the head turns or the face is lost."""
    n = len(edit)
    s = np.zeros(n, dtype=np.float64)
    for i in range(n):
        f = frontal[i]
        if edit[i] and f is not None:
            s[i] = float(np.clip((f - lo) / max(1e-6, hi - lo), 0.0, 1.0))
        elif edit[i]:
            s[i] = 1.0  # bridged frame: inherits the neighbours below
    # bridged frames take the lower of their neighbours' strengths
    for i in range(n):
        if edit[i] and frontal[i] is None:
            left = next((s[j] for j in range(i - 1, -1, -1) if frontal[j] is not None), 0.0)
            right = next((s[j] for j in range(i + 1, n) if frontal[j] is not None), 0.0)
            s[i] = min(left, right)
    if ramp > 0 and n:
        # each frame is limited by its distance (in frames) to the nearest weaker frame: a linear ramp of `ramp` frames
        out = s.copy()
        for i in range(n):
            for j in range(max(0, i - ramp), min(n, i + ramp + 1)):
                out[i] = min(out[i], s[j] + abs(i - j) / (ramp + 1))
        s = out
    return np.clip(s, 0.0, 1.0)


# ------------------------------------------------------------------------------------------------ occlusion gate
# A hand, a cup or a glass in front of the mouth: LatentSync paints a mouth over it (seen on the acceptance take where
# Clara sips her tea). Two signals, both robust to speech (the lips move every frame, an occluder changes far more):
# (1) BEFORE generation, on the original aligned crops: how far each frame's lower face departs from the clip's own
#     per-pixel median lower face; (2) AFTER generation: how much the model changed the region in that frame. A frame
#     is OCCLUDED when either is an outlier against the clip's own median. START values, calibrated 2026-10-06.
OCCLUSION_FACTOR = 2.2  # an outlier is above FACTOR × the clip's median …
OCCLUSION_FLOOR = 10.0  # … and above median + FLOOR (luma-ish units, 0–255)
OCCLUSION_DILATE = 2  # frames either side of an occluded run are also left alone (the occluder enters and leaves)


def region_deviation(crops: np.ndarray, region: np.ndarray, size: int = 128) -> np.ndarray:
    """Per frame, the mean absolute difference (0–255, over the colour channels) between the frame's `region` and the
    clip's per-pixel median of that region. `crops`: (n, H, W, 3) uint8 aligned faces; `region`: (H, W) bool."""
    import cv2  # type: ignore

    n = len(crops)
    if n == 0:
        return np.zeros(0)
    small = np.stack([cv2.resize(c, (size, size), interpolation=cv2.INTER_AREA) for c in crops]).astype(np.float32)
    reg = cv2.resize(region.astype(np.uint8), (size, size), interpolation=cv2.INTER_NEAREST).astype(bool)
    if not reg.any():
        return np.zeros(n)
    med = np.median(small, axis=0)
    d = np.abs(small - med[None]).mean(axis=3)
    return d[:, reg].mean(axis=1)


def outliers(scores: np.ndarray, factor: float = OCCLUSION_FACTOR, floor: float = OCCLUSION_FLOOR, valid: np.ndarray | None = None) -> np.ndarray:
    """Frames whose score is above max(factor × median, median + floor); the median over `valid` frames only."""
    s = np.asarray(scores, dtype=np.float64)
    v = np.ones(len(s), dtype=bool) if valid is None else np.asarray(valid, dtype=bool)
    if not v.any():
        return np.zeros(len(s), dtype=bool)
    med = float(np.median(s[v]))
    return v & (s > max(factor * med, med + floor))


HAND_OVERLAP_MIN = 0.04  # a hand whose outline covers this share of the regenerated region occludes the mouth


def hand_overlap(hands: Sequence[np.ndarray], affine: np.ndarray, region: np.ndarray, crop_size: tuple[int, int], resolution: int) -> float:
    """The share of the regenerated region (`region`, resolution² bool, in the aligned crop) covered by the convex
    outline of any hand. `hands`: (21, 2) landmark arrays in FRAME pixels; `affine`: 2×3 frame → aligned crop of size
    `crop_size` (w, h), which is then resized to resolution². A held cup sits inside the hand's outline, so a hand
    landmarker catches the common occluders (MediaPipe Hand Landmarker, Apache-2.0)."""
    import cv2  # type: ignore

    if not hands or not region.any():
        return 0.0
    sx, sy = resolution / crop_size[0], resolution / crop_size[1]
    canvas = np.zeros((resolution, resolution), np.uint8)
    a = np.asarray(affine, dtype=np.float64)
    for h in hands:
        p = np.asarray(h, dtype=np.float64)[:, :2]
        q = p @ a[:, :2].T + a[:, 2]
        q[:, 0] *= sx
        q[:, 1] *= sy
        hull = cv2.convexHull(np.round(q).astype(np.int32))
        cv2.fillConvexPoly(canvas, hull, 1)
    return float((canvas.astype(bool) & region).sum() / region.sum())


def dilate(flags: np.ndarray, k: int = OCCLUSION_DILATE) -> np.ndarray:
    f = np.asarray(flags, dtype=bool)
    out = f.copy()
    for i in np.flatnonzero(f):
        out[max(0, i - k): i + k + 1] = True
    return out


def suppress(strength: np.ndarray, flags: np.ndarray, ramp: int = STRENGTH_RAMP) -> np.ndarray:
    """Strength 0 on the flagged frames, faded back in over `ramp` frames either side (the edit never pops)."""
    s = np.asarray(strength, dtype=np.float64).copy()
    f = np.asarray(flags, dtype=bool)
    s[f] = 0.0
    if ramp > 0:
        out = s.copy()
        zero = np.flatnonzero(f)
        for i in range(len(s)):
            if zero.size:
                dist = int(np.min(np.abs(zero - i)))
                out[i] = min(out[i], dist / (ramp + 1))
        s = out
    return np.clip(s, 0.0, 1.0)


def fill_gaps(points: Sequence[np.ndarray | None], max_gap: int = MAX_GAP_FRAMES) -> tuple[list[np.ndarray | None], list[bool]]:
    """Alignment points per frame with short gaps (≤ `max_gap` frames between two found faces) bridged by linear
    interpolation. Returns (points, found): `found` is False for every frame that had no face of its own — bridged
    frames get points (the model needs a crop for every frame of its window) but the composite leaves them untouched.
    Longer gaps, and frames before the first / after the last face, are held at the nearest found points."""
    n = len(points)
    out: list[np.ndarray | None] = [None if p is None else np.asarray(p, dtype=np.float64) for p in points]
    found = [p is not None for p in points]
    idx = [i for i in range(n) if found[i]]
    if not idx:
        return out, found
    for a, b in zip(idx, idx[1:]):
        gap = b - a - 1
        if gap <= 0:
            continue
        pa, pb = out[a], out[b]
        for k in range(1, gap + 1):
            if gap <= max_gap:
                t = k / (gap + 1)
                out[a + k] = pa * (1 - t) + pb * t  # type: ignore[operator]
            else:
                out[a + k] = (pa if k <= gap / 2 else pb).copy()  # type: ignore[union-attr]
    for i in range(idx[0]):
        out[i] = out[idx[0]].copy()  # type: ignore[union-attr]
    for i in range(idx[-1] + 1, n):
        out[i] = out[idx[-1]].copy()  # type: ignore[union-attr]
    return out, found


def bridged(found: Sequence[bool], max_gap: int = MAX_GAP_FRAMES) -> list[bool]:
    """Frames the composite may edit: a frame with its own face, or one inside a short gap between two found faces."""
    n = len(found)
    out = list(found)
    idx = [i for i in range(n) if found[i]]
    for a, b in zip(idx, idx[1:]):
        if 0 < b - a - 1 <= max_gap:
            for k in range(a + 1, b):
                out[k] = True
    return out


def crop_square(box: Box, scale: float, width: int, height: int) -> tuple[int, int, int]:
    """A square crop (x0, y0, side) centred on `box`, `scale` × its larger side, in image pixels (may extend past the
    image; the caller pads)."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    side = int(math.ceil(max(box[2] - box[0], box[3] - box[1]) * scale))
    return int(round(cx - side / 2)), int(round(cy - side / 2)), max(8, side)


def pick_mesh_near(centres: Sequence[tuple[float, float]], target: tuple[float, float]) -> int | None:
    """The mesh (by its centre) nearest the target point — the crop around the chosen face may also hold a neighbour."""
    if not centres:
        return None
    d = [(c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 for c in centres]
    return int(np.argmin(d))


# ------------------------------------------------------------------------------------------------ compositing


def face_weight(mask_keep: np.ndarray, feather_frac: float = 0.06, erode_frac: float = 0.02) -> np.ndarray:
    """The blend weight in the aligned crop: 1 where LatentSync regenerates (mask.png black), 0 where the original
    stays, with the edge pulled in by `erode_frac` of the crop width and softened over `feather_frac` — so the seam sits
    inside the regenerated region, where the model's own paste-back already holds the original pixels."""
    import cv2  # type: ignore

    m = 1.0 - np.clip(np.asarray(mask_keep, dtype=np.float32), 0.0, 1.0)
    h, w = m.shape[:2]
    e = max(1, int(round(erode_frac * w)))
    if e > 1:
        m = cv2.erode(m, np.ones((e, e), np.uint8))
    k = max(3, int(round(feather_frac * w)) | 1)
    return np.clip(cv2.GaussianBlur(m, (k, k), 0), 0.0, 1.0)


def composite(original: np.ndarray, generated_crop: np.ndarray, weight_crop: np.ndarray, affine: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Paste the regenerated mouth region back into the ORIGINAL frame: `generated_crop` (the model's aligned face,
    H×W×3 uint8) and `weight_crop` (H×W in 0..1, see `face_weight`) are warped back with the inverse of `affine`
    (2×3, frame → crop) and blended; every pixel outside the weight stays exactly the original (eyes, brows, hair,
    background, the other characters). Returns (frame, weight in frame coordinates)."""
    import cv2  # type: ignore

    h, w = original.shape[:2]
    inv = cv2.invertAffineTransform(np.asarray(affine, dtype=np.float64))
    gen = cv2.warpAffine(generated_crop, inv, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wt = cv2.warpAffine(weight_crop.astype(np.float32), inv, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    wt3 = wt[:, :, None]
    out = original.astype(np.float32) * (1 - wt3) + gen.astype(np.float32) * wt3
    return np.clip(np.rint(out), 0, 255).astype(np.uint8), wt


def masked_stats(a: np.ndarray, b: np.ndarray, weight: np.ndarray, inside: float = 0.5, outside: float = 0.001) -> dict[str, float | int]:
    """Mean absolute luma difference between two frames inside the regenerated region (weight ≥ `inside`) and outside
    it (weight ≤ `outside`): the second must be ~0 for a mask that held (research §C.3 acceptance: ≤ 2 luma)."""
    def luma(x: np.ndarray) -> np.ndarray:
        x = x.astype(np.float32)
        return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]

    d = np.abs(luma(a) - luma(b))
    ins = weight >= inside
    outs = weight <= outside
    return {
        "inside_mad": round(float(d[ins].mean()), 3) if ins.any() else 0.0,
        "outside_mad": round(float(d[outs].mean()), 3) if outs.any() else 0.0,
        "inside_px": int(ins.sum()),
    }


@dataclass
class TrackReport:
    frames: int = 0
    found: int = 0
    bridged: int = 0
    edited: int = 0
    face_height_px: list[float] = field(default_factory=list)
    identity: list[float] = field(default_factory=list)
    lost_runs: list[tuple[int, int]] = field(default_factory=list)
    profile: int = 0
    strength_mean: float = 0.0
    full_strength: int = 0

    def summary(self) -> dict[str, object]:
        hs = np.asarray(self.face_height_px, dtype=float)
        ids = np.asarray(self.identity, dtype=float)
        return {
            "frames": self.frames, "frames_with_face": self.found, "frames_bridged": self.bridged, "frames_edited": self.edited,
            "frames_profile": self.profile, "strength_mean": self.strength_mean, "frames_full_strength": self.full_strength,
            "face_height_px": {"median": round(float(np.median(hs)), 1), "min": round(float(hs.min()), 1)} if hs.size else None,
            "identity_to_reference": {"median": round(float(np.median(ids)), 4), "min": round(float(ids.min()), 4)} if ids.size else None,
            "lost_runs": [list(r) for r in self.lost_runs],
            "min_face_px": MIN_FACE_PX,
        }


def runs_of(flags: Sequence[bool], value: bool = False) -> list[tuple[int, int]]:
    """[start, end] (inclusive) of each run of `value`."""
    out: list[tuple[int, int]] = []
    i, n = 0, len(flags)
    while i < n:
        if flags[i] == value:
            j = i
            while j + 1 < n and flags[j + 1] == value:
                j += 1
            out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out

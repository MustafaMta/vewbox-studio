"""SFace cosine of each redraw to its upload, without OpenCV (the A/B's tools/flux-vs-qwen-identity.py needs cv2 and
a scratch library volume; this one runs in the studio's own ASR image, which already has onnxruntime and numpy).
The same licence-clean models on the models volume: YuNet 2023mar (MIT) for the face box and five landmarks, SFace
2021dec (Apache-2.0) for the 128-d embedding; the decoding, the similarity alignment to the 112x112 ArcFace template
and the input layout follow OpenCV's FaceDetectorYN / FaceRecognizerSF. Pictures arrive as raw RGB24 decoded by ffmpeg
(manifest.json: key, upload/output .rgb files and sizes).

  docker run --rm --entrypoint python -v vewbox_models:/models:ro -v <dir with manifest + .rgb>:/data \
    -v <this folder>:/tools:ro vewbox/asr:dev /tools/sface.py
"""
import json
import math

import numpy as np
import onnxruntime as ort

ID = "/models/identity"
ort.set_default_logger_severity(3)
det = ort.InferenceSession(f"{ID}/face_detection_yunet_2023mar.onnx", providers=["CPUExecutionProvider"])
rec = ort.InferenceSession(f"{ID}/face_recognition_sface_2021dec.onnx", providers=["CPUExecutionProvider"])
DST = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float64)


def load(name, w, h):
    return np.fromfile(f"/data/{name}", dtype=np.uint8).reshape(h, w, 3)


def resize(rgb, s):
    """Bilinear resize by the factor s (pixel centres aligned, as cv2.resize INTER_LINEAR)."""
    h, w = rgb.shape[:2]
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    xs = np.clip((np.arange(nw) + 0.5) / s - 0.5, 0, w - 1)
    ys = np.clip((np.arange(nh) + 0.5) / s - 0.5, 0, h - 1)
    x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = (xs - x0)[None, :, None], (ys - y0)[:, None, None]
    img = rgb.astype(np.float32)
    top = img[y0][:, x0] * (1 - fx) + img[y0][:, x1] * fx
    bot = img[y1][:, x0] * (1 - fx) + img[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def detect(rgb):
    # the ONNX file has a fixed 640x640 input (OpenCV reshapes the net; onnxruntime cannot): letterbox to 640, detect,
    # and map the box and landmarks back to the picture
    s = 640 / max(rgb.shape[:2])
    small = resize(rgb, s)
    h, w = small.shape[:2]
    pw = ph = 640
    pad = np.zeros((ph, pw, 3), dtype=np.float32)
    pad[:h, :w] = small[:, :, ::-1]  # BGR, no scaling (blobFromImage defaults)
    blob = pad.transpose(2, 0, 1)[None]
    names = [o.name for o in det.get_outputs()]
    out = dict(zip(names, det.run(None, {det.get_inputs()[0].name: blob})))
    best = None
    for stride in (8, 16, 32):
        cols, rows = pw // stride, ph // stride
        cls = np.clip(out[f"cls_{stride}"].reshape(-1), 0, 1)
        obj = np.clip(out[f"obj_{stride}"].reshape(-1), 0, 1)
        bbox = out[f"bbox_{stride}"].reshape(-1, 4)
        kps = out[f"kps_{stride}"].reshape(-1, 10)
        score = np.sqrt(cls * obj)
        i = int(np.argmax(score))
        if best is None or score[i] > best[0]:
            r, c = divmod(i, cols)
            cx, cy = (c + bbox[i, 0]) * stride, (r + bbox[i, 1]) * stride
            bw, bh = math.exp(bbox[i, 2]) * stride, math.exp(bbox[i, 3]) * stride
            lm = np.array([[(kps[i, 2 * n] + c) * stride, (kps[i, 2 * n + 1] + r) * stride] for n in range(5)]) / s
            best = (float(score[i]), ((cx - bw / 2) / s, (cy - bh / 2) / s, bw / s, bh / s), lm)
    return best if best and best[0] >= 0.6 else None


def umeyama(src, dst):
    """Similarity transform (rotation, uniform scale, translation) mapping src onto dst, least squares."""
    n = src.shape[0]
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s, d = src - mu_s, dst - mu_d
    cov = d.T @ s / n
    u, sig, vt = np.linalg.svd(cov)
    sgn = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sgn[1, 1] = -1
    rot = u @ sgn @ vt
    var = (s ** 2).sum() / n
    scale = np.trace(np.diag(sig) @ sgn) / var
    t = mu_d - scale * rot @ mu_s
    return np.hstack([scale * rot, t[:, None]])


def warp(rgb, m, size=112):
    """warpAffine(…, INTER_LINEAR) with the src→dst matrix m: sample the source at the inverse of each output pixel."""
    a = np.vstack([m, [0, 0, 1]])
    inv = np.linalg.inv(a)
    ys, xs = np.mgrid[0:size, 0:size]
    pts = np.stack([xs.ravel(), ys.ravel(), np.ones(size * size)])
    sx, sy = (inv @ pts)[:2]
    h, w = rgb.shape[:2]
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = sx - x0, sy - y0
    img = rgb.astype(np.float32)

    def px(x, y):
        ok = (x >= 0) & (x < w) & (y >= 0) & (y < h)
        v = np.zeros((x.size, 3), dtype=np.float32)
        v[ok] = img[y[ok], x[ok]]
        return v

    v = (px(x0, y0) * ((1 - fx) * (1 - fy))[:, None] + px(x0 + 1, y0) * (fx * (1 - fy))[:, None]
         + px(x0, y0 + 1) * ((1 - fx) * fy)[:, None] + px(x0 + 1, y0 + 1) * (fx * fy)[:, None])
    return v.reshape(size, size, 3)


def embed(rgb):
    f = detect(rgb)
    if f is None:
        return None
    aligned = warp(rgb, umeyama(f[2], DST))  # RGB (blobFromImage swapRB on a BGR image)
    v = rec.run(None, {rec.get_inputs()[0].name: aligned.transpose(2, 0, 1)[None].astype(np.float32)})[0].reshape(-1)
    return v / np.linalg.norm(v)


man = json.load(open("/data/manifest.json"))
cache = {}
out = []
for p in man:
    if p["upload"] not in cache:
        cache[p["upload"]] = embed(load(p["upload"], p["uw"], p["uh"]))
    a = cache[p["upload"]]
    b = embed(load(p["output"], p["ow"], p["oh"]))
    out.append({"key": p["key"], "sface": None if a is None or b is None else round(float(a @ b), 3), "uploadFace": a is not None, "outputFace": b is not None})
    print(out[-1], flush=True)
json.dump(out, open("/data/sface.json", "w"), indent=1)

"""FLUX vs QWEN — identity similarity of the Image Reference redraws to their upload (docs/research/FLUX-VS-QWEN.md).

CPU only, licence-clean models already on the models volume (docs/research/CHARACTER-IMAGE-V2.md §4):
  YuNet 2023mar (MIT) face box + 5 landmarks, SFace 2021dec (Apache-2.0) 128-d face embedding, cosine;
  DINOv2-small (Apache-2.0) CLS embedding of the face crop (YuNet box, 40 % margin), cosine;
  CCIP caformer (OpenRAIL) anime character difference (whole picture), lower = more alike, threshold in metrics.json.
Run in a throwaway Python container (nothing is installed in the services); the libraries live in a scratch volume:

  docker run --rm --dns 1.1.1.1 --entrypoint sh -v fvq-pylibs:/pylibs vewbox/models:dev \
    -c "pip install -q --target /pylibs onnxruntime==1.22.1 opencv-python-headless==4.12.0.88 numpy==2.2.6"
  docker run --rm --entrypoint python -e PYTHONPATH=/pylibs -v fvq-pylibs:/pylibs:ro -v vewbox_models:/models:ro \
    -v D:/volexar-studio/volexar-studio/var/flux-vs-qwen:/data -v <worktree>/tools:/tools:ro \
    -v <worktree>/docs/evidence/flux-vs-qwen:/out vewbox/models:dev /tools/flux-vs-qwen-identity.py

CCIP is only meaningful anime-to-anime (ir3): across media it calls a photo of a woman and an anime man "the same"
(difference 0.132 < 0.178, checked on this set). SFace on stylised faces is advisory.
"""
import json
import os

import cv2
import numpy as np
import onnxruntime as ort

ID = "/models/identity"
DATA = "/data"
OUT = "/out/identity.json"
report = json.load(open("/out/report.json"))
FIX = {"ir1-headshot-to-cartoon": "fixtures/upload-photo-headshot.png", "ir2-photo-to-realistic": "fixtures/upload-photo-fullbody.png", "ir3-anime-to-anime": "fixtures/upload-anime.png"}
if os.path.exists("/out/extra-uploads.json"):
    for x in json.load(open("/out/extra-uploads.json"))["reads"]:
        FIX[x["key"]] = x["file"]

det = cv2.FaceDetectorYN.create(f"{ID}/face_detection_yunet_2023mar.onnx", "", (320, 320), 0.6, 0.3, 5000)
rec = cv2.FaceRecognizerSF.create(f"{ID}/face_recognition_sface_2021dec.onnx", "")
dino = ort.InferenceSession(f"{ID}/dinov2-small/model.onnx", providers=["CPUExecutionProvider"])
ccip_feat = ort.InferenceSession(f"{ID}/ccip/model_feat.onnx", providers=["CPUExecutionProvider"])
ccip_metric = ort.InferenceSession(f"{ID}/ccip/model_metrics.onnx", providers=["CPUExecutionProvider"])
ccip_threshold = json.load(open(f"{ID}/ccip/metrics.json"))["threshold"]


def face(img):
    h, w = img.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return None
    return max(faces, key=lambda f: f[2] * f[3])


def sface(img, f):
    aligned = rec.alignCrop(img, f)
    return rec.feature(aligned).flatten()


def dino_vec(img, f):
    x, y, w, h = [float(v) for v in f[:4]]
    m = 0.4 * max(w, h)
    x0, y0 = max(0, int(x - m)), max(0, int(y - m))
    x1, y1 = min(img.shape[1], int(x + w + m)), min(img.shape[0], int(y + h + m))
    crop = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2RGB)
    crop = cv2.resize(crop, (224, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    crop = (crop - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    inp = {dino.get_inputs()[0].name: crop.transpose(2, 0, 1)[None]}
    out = dino.run(None, inp)[0]
    v = out[0, 0] if out.ndim == 3 else out[0]
    return v / np.linalg.norm(v)


def ccip_vec(img):
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (384, 384), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    rgb = (rgb - 0.5) / 0.5
    return ccip_feat.run(None, {ccip_feat.get_inputs()[0].name: rgb.transpose(2, 0, 1)[None]})[0][0]


def ccip_diff(a, b):
    return float(ccip_metric.run(None, {ccip_metric.get_inputs()[0].name: np.stack([a, b]).astype(np.float32)})[0][0, 1])


def save_face(img, f, name):
    """256² head crop (YuNet box + 40 % margin) for the side-by-side likeness sheets."""
    os.makedirs(f"{DATA}/faces", exist_ok=True)
    if f is None:
        crop = np.zeros((256, 256, 3), np.uint8)
    else:
        x, y, w, h = [float(v) for v in f[:4]]
        m = 0.4 * max(w, h)
        x0, y0 = max(0, int(x - m)), max(0, int(y - m))
        x1, y1 = min(img.shape[1], int(x + w + m)), min(img.shape[0], int(y + h + m))
        crop = cv2.resize(img[y0:y1, x0:x1], (256, 256), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f"{DATA}/faces/{name}.png", crop)


cos = lambda a, b: float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
rows = []
refs = {}
for key, rel in FIX.items():
    img = cv2.imread(f"{DATA}/{rel}")
    f = face(img)
    save_face(img, f, f"{key}-UPLOAD")
    refs[key] = {"img": img, "face": f, "sface": sface(img, f) if f is not None else None, "dino": dino_vec(img, f) if f is not None else None, "ccip": ccip_vec(img)}
for r in report["records"]:
    if r["phase"] not in ("reference", "reference-extra") or not r.get("file"):
        continue
    ref = refs[r["key"]]
    img = cv2.imread(f"{DATA}/{r['file']}")
    f = face(img)
    save_face(img, f, os.path.splitext(os.path.basename(r["file"]))[0])
    row = {"arm": r["arm"], "key": r["key"], "variant": r.get("variant"), "seed": r["seed"], "faceFound": f is not None}
    if f is not None and ref["face"] is not None:
        row["sfaceCos"] = round(cos(ref["sface"], sface(img, f)), 3)
        row["dinoFaceCos"] = round(cos(ref["dino"], dino_vec(img, f)), 3)
    row["ccipDiff"] = round(ccip_diff(ref["ccip"], ccip_vec(img)), 3)
    rows.append(row)
    print(row, flush=True)
json.dump({"models": {"face": "YuNet 2023mar + SFace 2021dec (OpenCV Zoo)", "dino": "DINOv2-small ONNX (CLS, face crop with 40 % margin)", "ccip": f"CCIP caformer (deepghs/ccip_onnx), same character when difference <= {ccip_threshold:.3f}"}, "thresholds": {"sfaceCos": 0.363, "ccipDiff": ccip_threshold}, "rows": rows}, open(OUT, "w"), indent=2)
print("written", OUT)

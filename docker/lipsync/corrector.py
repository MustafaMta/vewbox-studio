"""The lip-sync corrector: LatentSync 1.6 (ByteDance; code Apache-2.0, weights CreativeML Open RAIL++-M) re-draws the
mouth region of an EXISTING take to follow the authoritative audio. It never generates a video, never changes the
frame count, the frame rate, the framing or anything outside the mouth region (docs/research/FILM-PIPELINE-RESEARCH-
2026-10-05.md §C.3; directive 2026-10-06 §16).

How this differs from upstream `LipsyncPipeline.__call__` (latentsync/pipelines/lipsync_pipeline.py at a229c39):
- **no InsightFace**: faces come from face_track.py (YuNet + MediaPipe → the 1.5 release's 68-point alignment points);
- **native frame rate**: upstream re-encodes the clip to 25 fps (`read_video(change_fps=True)`) and writes 25 fps; here
  the frames are decoded at the take's own rate (H3: 24 fps) and the Whisper chunks are taken at that rate
  (`feature2chunks(fps=…)` supports it), so frame i of the output is frame i of the take;
- **original pixels outside the mouth**: upstream pastes the whole aligned crop back (the upper face resampled twice);
  here only the regenerated region (mask.png's black area, eroded and feathered) is blended into the ORIGINAL frame —
  eyes, brows, hair, the other characters and the background stay bit-identical before encoding;
- frames where the speaker's face is not found (beyond a short bridged gap) are left untouched;
- the take's own audio track is copied unchanged (the cut decides which audio plays).

The diffusion loop itself (UNet, DDIM, CFG, mask/reference latents, the 16-frame windows, the surrounding-pixel
paste-back) is upstream's, called through the pipeline object's own helpers.
"""
from __future__ import annotations

import gc
import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

import face_track as ft

LATENTSYNC_DIR = os.environ.get("LATENTSYNC_DIR", "/opt/latentsync")
WEIGHTS_DIR = os.environ.get("LIPSYNC_WEIGHTS_DIR", "/models/lipsync/latentsync-1.6")
VAE_DIR = os.environ.get("LIPSYNC_VAE_DIR", "/models/lipsync/sd-vae-ft-mse")
UNET_CKPT = os.path.join(WEIGHTS_DIR, "latentsync_unet.pt")
WHISPER_CKPT = os.path.join(WEIGHTS_DIR, "whisper", "tiny.pt")
UNET_CONFIG = os.path.join(LATENTSYNC_DIR, "configs", "unet", "stage2_512.yaml")
SCHEDULER_DIR = os.path.join(LATENTSYNC_DIR, "configs")
MASK_PATH = os.path.join(LATENTSYNC_DIR, "latentsync", "utils", "mask.png")
YUNET_PATH = os.environ.get("LIPSYNC_YUNET_PATH", "/models/identity/face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.environ.get("LIPSYNC_SFACE_PATH", "/models/identity/face_recognition_sface_2021dec.onnx")
LANDMARKER_PATH = os.environ.get("LIPSYNC_FACE_LANDMARKER_PATH", "/models/qa/face_landmarker.task")
RESOLUTION = 512
NUM_FRAMES = 16  # stage2_512.yaml data.num_frames
MAX_SECONDS = float(os.environ.get("LIPSYNC_MAX_SECONDS", "30"))
YUNET_SCORE_MIN = 0.6
MESH_CROP_SCALE = 1.8  # the crop the Face Landmarker sees: this × the YuNet box's larger side
MESH_CROP_PX = 384

DEFAULTS = {"steps": 20, "guidance": 1.5, "seed": 1247, "feather": 0.06, "erode": 0.02, "crf": 12}


class Unavailable(RuntimeError):
    """Weights or a dependency are missing."""


class InputError(ValueError):
    """The request cannot be corrected (no video, too long, no face)."""


def weights_status() -> dict[str, Any]:
    files = {"unet": UNET_CKPT, "whisper": WHISPER_CKPT, "vae_config": os.path.join(VAE_DIR, "config.json"), "vae": os.path.join(VAE_DIR, "diffusion_pytorch_model.safetensors"), "yunet": YUNET_PATH, "landmarker": LANDMARKER_PATH, "sface": SFACE_PATH, "latentsync_code": UNET_CONFIG}
    present = {k: os.path.isfile(v) for k, v in files.items()}
    missing = [f"{k} ({files[k]})" for k, ok in present.items() if not ok and k != "sface"]
    return {"present": present, "missing": missing, "ready": not missing}


# ------------------------------------------------------------------------------------------------ media


def probe(path: str) -> dict[str, Any]:
    out = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_read_packets:format=duration", "-of", "json", path], check=True, capture_output=True, timeout=120).stdout
    j = json.loads(out or b"{}")
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)

    def rate(s: str | None) -> float | None:
        try:
            n, d = (s or "0/0").split("/")
            return float(n) / float(d) if float(d) else None
        except (ValueError, ZeroDivisionError):
            return None

    return {"width": int(v["width"]) if v else None, "height": int(v["height"]) if v else None, "fps": (rate(v.get("avg_frame_rate")) or rate(v.get("r_frame_rate"))) if v else None, "fps_str": (v.get("avg_frame_rate") or v.get("r_frame_rate")) if v else None, "frames": int(v.get("nb_read_packets") or 0) if v else 0, "has_video": v is not None, "has_audio": a is not None, "duration": float(j.get("format", {}).get("duration") or 0)}


def read_frames(path: str, w: int, h: int) -> np.ndarray:
    """Every frame at the stream's own rate (no resampling), RGB uint8 (n, h, w, 3)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-an", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True, timeout=600).stdout
    n = len(raw) // (w * h * 3)
    if n == 0:
        raise InputError("no frame could be decoded")
    return np.frombuffer(raw[: n * w * h * 3], dtype=np.uint8).reshape(n, h, w, 3)


def write_video(frames: np.ndarray, fps_str: str, out_path: str, audio_from: str | None, crf: int) -> None:
    """Encode the frames at the take's exact rate (H.264 yuv420p, the cut's format) and copy the take's own audio."""
    n, h, w, _ = frames.shape
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", fps_str, "-i", "-"]
    if audio_from:
        cmd += ["-i", audio_from, "-map", "0:v:0", "-map", "1:a:0?", "-c:a", "copy"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    p = subprocess.run(cmd, input=frames.tobytes(), capture_output=True, timeout=1200)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg could not encode the corrected take: {p.stderr.decode(errors='replace')[-600:]}")


def driving_audio(audio_path: str, offset: float, duration: float, out_wav: str) -> None:
    """The audio the mouth must follow, on the clip's clock: `offset` seconds of silence first (or its head cut when
    negative), padded with silence / cut to the clip's duration, 16 kHz mono (what LatentSync's Whisper reads)."""
    filt = []
    if offset > 0:
        ms = int(round(offset * 1000))
        filt.append(f"adelay={ms}:all=1")
    elif offset < 0:
        filt.append(f"atrim=start={-offset:.6f},asetpts=PTS-STARTPTS")
    filt.append("apad")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", audio_path, "-af", ",".join(filt), "-t", f"{duration:.6f}", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out_wav]
    subprocess.run(cmd, check=True, capture_output=True, timeout=300)


# ------------------------------------------------------------------------------------------------ face tracking


class FaceTracker:
    """YuNet + optional SFace + MediaPipe Face Landmarker (CPU)."""

    def __init__(self) -> None:
        import cv2  # type: ignore
        from mediapipe.tasks.python import vision  # type: ignore
        from mediapipe.tasks.python.core import base_options  # type: ignore

        self.cv2 = cv2
        self.det = cv2.FaceDetectorYN.create(YUNET_PATH, "", (320, 320), YUNET_SCORE_MIN, 0.3, 5000)
        self.rec = cv2.FaceRecognizerSF.create(SFACE_PATH, "") if os.path.isfile(SFACE_PATH) else None
        opts = vision.FaceLandmarkerOptions(base_options=base_options.BaseOptions(model_asset_path=LANDMARKER_PATH), running_mode=vision.RunningMode.IMAGE, num_faces=2, min_face_detection_confidence=0.3, min_face_presence_confidence=0.3)
        self.lm = vision.FaceLandmarker.create_from_options(opts)
        self.vision = vision

    def close(self) -> None:
        try:
            self.lm.close()
        except Exception:  # noqa: BLE001
            pass

    def detect(self, bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        self.det.setInputSize((w, h))
        _, faces = self.det.detect(bgr)
        return faces if faces is not None else np.zeros((0, 15), dtype=np.float32)

    def embed(self, bgr: np.ndarray, face: np.ndarray) -> np.ndarray | None:
        if self.rec is None:
            return None
        return self.rec.feature(self.rec.alignCrop(bgr, face)).flatten()

    def reference(self, path: str) -> np.ndarray:
        img = self.cv2.imread(path, self.cv2.IMREAD_COLOR)
        if img is None:
            raise InputError("the reference image could not be decoded")
        h, w = img.shape[:2]
        if max(h, w) > 1600:
            s = 1600 / max(h, w)
            img = self.cv2.resize(img, (int(w * s), int(h * s)), interpolation=self.cv2.INTER_AREA)
        faces = self.detect(img)
        if len(faces) == 0:
            raise InputError("no face found in the reference image")
        f = max(faces, key=lambda r: float(r[2] * r[3]))
        v = self.embed(img, f)
        if v is None:
            raise Unavailable(f"SFace weights missing ({SFACE_PATH}): a reference cannot be matched")
        return v

    def mesh(self, rgb: np.ndarray, box: ft.Box) -> np.ndarray | None:
        """The 478-point mesh of the face in `box`, in frame pixels (None when the landmarker finds no face)."""
        import mediapipe as mp  # type: ignore

        h, w = rgb.shape[:2]
        x0, y0, side = ft.crop_square(box, MESH_CROP_SCALE, w, h)
        crop = np.full((side, side, 3), 127, dtype=np.uint8)
        sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x0 + side), min(h, y0 + side)
        if sx1 <= sx0 or sy1 <= sy0:
            return None
        crop[sy0 - y0: sy1 - y0, sx0 - x0: sx1 - x0] = rgb[sy0:sy1, sx0:sx1]
        scale = MESH_CROP_PX / side
        small = self.cv2.resize(crop, (MESH_CROP_PX, MESH_CROP_PX), interpolation=self.cv2.INTER_AREA if scale < 1 else self.cv2.INTER_CUBIC)
        res = self.lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
        meshes = [np.asarray([(p.x * MESH_CROP_PX, p.y * MESH_CROP_PX) for p in f], dtype=np.float64) for f in (res.face_landmarks or [])]
        if not meshes:
            return None
        i = ft.pick_mesh_near([tuple(m.mean(0)) for m in meshes], (MESH_CROP_PX / 2, MESH_CROP_PX / 2))
        m = meshes[i]  # type: ignore[index]
        return m / scale + np.asarray([x0, y0], dtype=np.float64)


@dataclass
class Track:
    points3: list[np.ndarray]
    edit: list[bool]
    boxes: list[ft.Box | None]
    report: ft.TrackReport
    frontal: list[float | None]
    strength: np.ndarray


def track_speaker(tracker: FaceTracker, frames: np.ndarray, ref_vec: np.ndarray | None, hint: ft.Box | None, others: Sequence[np.ndarray] = ()) -> Track:
    """The speaker's face through the clip. `ref_vec`: the speaker's SFace embedding; `others`: the embeddings of the
    other characters in the shot (a face is taken for the speaker only if it resembles the speaker more than them)."""
    import cv2  # type: ignore

    n = len(frames)
    rep = ft.TrackReport(frames=n)
    smoother = ft.LaplacianSmooth()
    prev: ft.Box | None = None
    lost = 0
    pts: list[np.ndarray | None] = []
    boxes: list[ft.Box | None] = []
    frontal: list[float | None] = []
    for rgb in frames:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        faces = tracker.detect(bgr)
        dets = []
        for f in faces:
            box = (float(f[0]), float(f[1]), float(f[0] + f[2]), float(f[1] + f[3]))
            ident = rival = None
            if ref_vec is not None:
                v = tracker.embed(bgr, f)
                if v is not None:
                    ident = ft_cos(v, ref_vec)
                    rival = max((ft_cos(v, o) for o in others), default=None)
            dets.append(ft.Detection(box=box, score=float(f[14]), identity=ident, rival=rival))
        i = ft.choose_face(dets, prev, hint)
        m = tracker.mesh(rgb, dets[i].box) if i is not None else None
        if i is None or m is None:
            pts.append(None)
            boxes.append(None)
            frontal.append(None)
            lost += 1
            if lost > ft.MAX_GAP_FRAMES:
                smoother.reset()
                prev = None
            continue
        lost = 0
        prev = dets[i].box
        lm68 = smoother.smooth(ft.lm68_from_mp478(m))
        pts.append(ft.align_points3(lm68))
        boxes.append(dets[i].box)
        frontal.append(round(ft.frontalness(m), 3))
        rep.face_height_px.append(dets[i].box[3] - dets[i].box[1])
        if dets[i].identity is not None:
            rep.identity.append(dets[i].identity)  # type: ignore[arg-type]
    filled, found = ft.fill_gaps(pts)
    edit = ft.bridged(found)
    strength = ft.edit_strength(edit, [f if found[k] else None for k, f in enumerate(frontal)])
    rep.found = int(sum(found))
    rep.bridged = int(sum(edit) - sum(found))
    rep.lost_runs = ft.runs_of(found, False)
    rep.profile = int(sum(1 for f in frontal if f is not None and f <= ft.FRONTAL_LO))
    rep.strength_mean = round(float(strength.mean()), 3) if n else 0.0
    rep.full_strength = int((strength >= 0.999).sum())
    if rep.found == 0:
        raise InputError("the speaker's face was not found in any frame")
    return Track(points3=[p for p in filled], edit=edit, boxes=boxes, report=rep, frontal=frontal, strength=strength)  # type: ignore[misc]


def align_crops(frames: np.ndarray, track: Track) -> tuple[list[np.ndarray], np.ndarray, tuple[int, int]]:
    """Each frame's similarity transform onto LatentSync's template and the aligned 512² face crop (grey 127 outside
    the frame, as upstream's kornia warp fills)."""
    import cv2  # type: ignore

    tpl, (face_w, face_h) = ft.template(RESOLUTION)
    affines: list[np.ndarray] = []
    crops = np.zeros((len(frames), RESOLUTION, RESOLUTION, 3), dtype=np.uint8)
    p_bias = None
    for i, fr in enumerate(frames):
        m, p_bias = ft.similarity_from_points(track.points3[i], tpl, True, p_bias)
        affines.append(m)
        crop = cv2.warpAffine(fr, m, (face_w, face_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(127, 127, 127))
        crops[i] = cv2.resize(crop, (RESOLUTION, RESOLUTION), interpolation=cv2.INTER_LANCZOS4)
    return affines, crops, (face_w, face_h)


def references(tracker: "FaceTracker", reference: str | None, others: Sequence[str]) -> tuple[np.ndarray | None, list[np.ndarray]]:
    if not reference:
        return None, []
    return tracker.reference(reference), [tracker.reference(o) for o in others]


def track_only(video: str, debug_dir: str, reference: str | None = None, hint: ft.Box | None = None, others: Sequence[str] = ()) -> dict[str, Any]:
    """The CPU half alone (no model): tracking and alignment, with the aligned crops written for inspection."""
    import cv2  # type: ignore

    info = probe(video)
    frames = read_frames(video, info["width"], info["height"])
    tracker = FaceTracker()
    try:
        ref_vec, other_vecs = references(tracker, reference, others)
        track = track_speaker(tracker, frames, ref_vec, hint, other_vecs)
    finally:
        tracker.close()
    _aff, crops, _ = align_crops(frames, track)
    write_debug(debug_dir, frames, frames, crops, list(crops), track, float(info["fps"] or 24))
    mask = cv2.imread(MASK_PATH, cv2.IMREAD_GRAYSCALE) if os.path.isfile(MASK_PATH) else None
    if mask is not None:  # the regenerated region drawn on a few aligned crops
        m = cv2.resize(mask, (RESOLUTION, RESOLUTION)) < 128
        for i in range(0, len(frames), max(1, len(frames) // 8)):
            c = crops[i].copy()
            c[m] = (0.5 * c[m] + 0.5 * np.array([255, 0, 255])).astype(np.uint8)
            cv2.imwrite(os.path.join(debug_dir, f"masked_{i:04d}.jpg"), cv2.cvtColor(c, cv2.COLOR_RGB2BGR))
    return {"frames": len(frames), "track": track.report.summary()}


def write_debug(d: str, frames: np.ndarray, result: np.ndarray, crops: np.ndarray, out_crops: list[np.ndarray], track: Track, fps: float) -> None:
    """For looking at the result (evaluation): per frame the speaker's box and whether it was edited (track.json); for
    every 16 frames a sheet of the face, ORIGINAL above CORRECTED, frame by frame (pairs_<first frame>.jpg); a few
    aligned 512² crops before/after."""
    import cv2  # type: ignore

    os.makedirs(d, exist_ok=True)
    n = len(frames)
    with open(os.path.join(d, "track.json"), "w") as f:
        json.dump({"fps": fps, "edit": track.edit, "frontal": track.frontal, "strength": [round(float(s), 3) for s in track.strength], "boxes": [None if b is None else [round(v, 1) for v in b] for b in track.boxes], "points3": [p.round(2).tolist() for p in track.points3]}, f)
    known = [b for b in track.boxes if b is not None]
    last = known[0] if known else (0.0, 0.0, float(frames.shape[2]), float(frames.shape[1]))
    tiles_o, tiles_c = [], []
    for i in range(n):
        b = track.boxes[i] or last
        last = b
        w, h = b[2] - b[0], b[3] - b[1]
        x0, y0, side = ft.crop_square((b[0], b[1] + 0.15 * h, b[2], b[3] + 0.15 * h), 1.25, frames.shape[2], frames.shape[1])
        def cut(img: np.ndarray) -> np.ndarray:
            pad = np.full((side, side, 3), 0, np.uint8)
            sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(img.shape[1], x0 + side), min(img.shape[0], y0 + side)
            pad[sy0 - y0: sy1 - y0, sx0 - x0: sx1 - x0] = img[sy0:sy1, sx0:sx1]
            t = cv2.resize(pad, (192, 192), interpolation=cv2.INTER_AREA if side > 192 else cv2.INTER_CUBIC)
            cv2.putText(t, f"{i} {track.strength[i]:.1f}",(4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)
            return t
        tiles_o.append(cut(frames[i]))
        tiles_c.append(cut(result[i]))
    for s in range(0, n, 16):
        o = np.concatenate(tiles_o[s:s + 16] + [np.zeros((192, 192, 3), np.uint8)] * (16 - len(tiles_o[s:s + 16])), axis=1)
        c = np.concatenate(tiles_c[s:s + 16] + [np.zeros((192, 192, 3), np.uint8)] * (16 - len(tiles_c[s:s + 16])), axis=1)
        cv2.imwrite(os.path.join(d, f"pairs_{s:04d}.jpg"), cv2.cvtColor(np.concatenate([o, c], axis=0), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    for i in range(0, n, max(1, n // 6)):
        cv2.imwrite(os.path.join(d, f"aligned_{i:04d}.jpg"), cv2.cvtColor(np.concatenate([crops[i], out_crops[i]], axis=1), cv2.COLOR_RGB2BGR))


def ft_cos(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float64).ravel()
    b = b.astype(np.float64).ravel()
    den = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / den) if den > 0 else 0.0


# ------------------------------------------------------------------------------------------------ the model


class Corrector:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.pipe: Any = None
        self.loaded_at: float | None = None
        self.load_info: dict[str, Any] = {}

    # -- lifecycle
    def load(self) -> None:
        if self.pipe is not None:
            return
        st = weights_status()
        if not st["ready"]:
            raise Unavailable("weights or code missing: " + "; ".join(st["missing"]) + " (manifest group lipsync-latentsync-1.6, docs/MODELS.md)")
        if LATENTSYNC_DIR not in sys.path:
            sys.path.insert(0, LATENTSYNC_DIR)
        import torch  # type: ignore
        from diffusers import AutoencoderKL, DDIMScheduler  # type: ignore
        from omegaconf import OmegaConf  # type: ignore
        from latentsync.models.unet import UNet3DConditionModel  # type: ignore
        from latentsync.pipelines.lipsync_pipeline import LipsyncPipeline  # type: ignore
        from latentsync.whisper.audio2feature import Audio2Feature  # type: ignore

        if not torch.cuda.is_available():
            raise Unavailable("CUDA is not available in the lipsync container")
        t0 = time.time()
        torch.cuda.reset_peak_memory_stats()
        cfg = OmegaConf.load(UNET_CONFIG)
        dtype = torch.float16
        scheduler = DDIMScheduler.from_pretrained(SCHEDULER_DIR)
        audio_encoder = Audio2Feature(model_path=WHISPER_CKPT, device="cuda", num_frames=cfg.data.num_frames, audio_feat_length=cfg.data.audio_feat_length)
        vae = AutoencoderKL.from_pretrained(VAE_DIR, torch_dtype=dtype, local_files_only=True)
        vae.config.scaling_factor = 0.18215
        vae.config.shift_factor = 0
        unet = UNet3DConditionModel.from_config(OmegaConf.to_container(cfg.model))
        ckpt = torch.load(UNET_CKPT, map_location="cpu", weights_only=True)
        res = unet.load_state_dict(ckpt["state_dict"], strict=False)
        del ckpt
        unet = unet.to(dtype=dtype)
        pipe = LipsyncPipeline(vae=vae, audio_encoder=audio_encoder, unet=unet, scheduler=scheduler).to("cuda")
        self.pipe = pipe
        self.cfg = cfg
        self.dtype = dtype
        self.loaded_at = time.time()
        self.load_info = {"seconds": round(time.time() - t0, 1), "missing_keys": len(res.missing_keys), "unexpected_keys": len(res.unexpected_keys), "vram_after_load_mb": int(torch.cuda.memory_allocated() / 1048576)}
        if res.unexpected_keys or len(res.missing_keys) > 0:
            print(f"[lipsync] unet state dict: {len(res.missing_keys)} missing, {len(res.unexpected_keys)} unexpected keys (first: {(res.missing_keys or res.unexpected_keys)[:5]})", flush=True)
        print(f"[lipsync] loaded in {self.load_info['seconds']} s, {self.load_info['vram_after_load_mb']} MB allocated", flush=True)

    def unload(self) -> bool:
        was = self.pipe is not None
        self.pipe = None
        gc.collect()
        try:
            import torch  # type: ignore

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass
        try:
            import ctypes

            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception:  # noqa: BLE001
            pass
        self.loaded_at = None
        return was

    # -- one correction
    def correct(self, video: str, audio: str, out_path: str, *, audio_offset: float = 0.0, reference: str | None = None, others: Sequence[str] = (), hint: ft.Box | None = None, steps: int = DEFAULTS["steps"], guidance: float = DEFAULTS["guidance"], seed: int = DEFAULTS["seed"], feather: float = DEFAULTS["feather"], erode: float = DEFAULTS["erode"], crf: int = DEFAULTS["crf"], workdir: str = "/tmp", debug_dir: str | None = None) -> dict[str, Any]:
        import cv2  # type: ignore
        import torch  # type: ignore

        t0 = time.time()
        info = probe(video)
        if not info["has_video"] or not info["width"]:
            raise InputError("the file has no video stream")
        if info["duration"] > MAX_SECONDS:
            raise InputError(f"the clip is {info['duration']:.1f} s; the corrector takes at most {MAX_SECONDS:.0f} s")
        fps = float(info["fps"] or 24.0)
        frames = read_frames(video, info["width"], info["height"])
        n = len(frames)
        t_decode = time.time()

        tracker = FaceTracker()
        try:
            ref_vec, other_vecs = references(tracker, reference, others)
            track = track_speaker(tracker, frames, ref_vec, hint, other_vecs)
        finally:
            tracker.close()
        t_track = time.time()

        affines, crops, (face_w, face_h) = align_crops(frames, track)
        if LATENTSYNC_DIR not in sys.path:
            sys.path.insert(0, LATENTSYNC_DIR)
        from latentsync.utils.image_processor import ImageProcessor, load_fixed_mask  # type: ignore

        with self.lock:
            self.load()
            pipe, cfg, dtype = self.pipe, self.cfg, self.dtype
            torch.cuda.reset_peak_memory_stats()
            t_model = time.time()
            wav = os.path.join(workdir, "drive.wav")
            driving_audio(audio, audio_offset, n / fps, wav)
            feats = pipe.audio_encoder.audio2feat(wav)
            chunks = pipe.audio_encoder.feature2chunks(feature_array=feats, fps=fps)
            if len(chunks) < n:
                chunks = chunks + [chunks[-1]] * (n - len(chunks))
            chunks = chunks[:n]

            mask_image = load_fixed_mask(RESOLUTION, MASK_PATH)
            ip = ImageProcessor(RESOLUTION, device="cpu", mask_image=mask_image)
            device = pipe._execution_device
            do_cfg = guidance > 1.0
            pipe.scheduler.set_timesteps(steps, device=device)
            timesteps = pipe.scheduler.timesteps
            generator = torch.Generator(device="cuda").manual_seed(int(seed))
            extra = pipe.prepare_extra_step_kwargs(generator, 0.0)
            all_latents = pipe.prepare_latents(n, pipe.vae.config.latent_channels, RESOLUTION, RESOLUTION, dtype, device, generator)
            out_crops: list[np.ndarray] = []
            with torch.no_grad():
                for w0 in range(0, n, NUM_FRAMES):
                    w1 = min(n, w0 + NUM_FRAMES)
                    audio_embeds = torch.stack(chunks[w0:w1]).to(device, dtype=dtype)
                    if do_cfg:
                        audio_embeds = torch.cat([torch.zeros_like(audio_embeds), audio_embeds])
                    faces = torch.from_numpy(crops[w0:w1])
                    ref_px, masked_px, masks = ip.prepare_masks_and_masked_images(faces, affine_transform=False)
                    mask_lat, masked_lat = pipe.prepare_mask_latents(masks, masked_px, RESOLUTION, RESOLUTION, dtype, device, generator, do_cfg)
                    ref_lat = pipe.prepare_image_latents(ref_px, device, dtype, generator, do_cfg)
                    latents = all_latents[:, :, w0:w1]
                    for t in timesteps:
                        x = torch.cat([latents] * 2) if do_cfg else latents
                        x = pipe.scheduler.scale_model_input(x, t)
                        x = torch.cat([x, mask_lat, masked_lat, ref_lat], dim=1)
                        noise = pipe.unet(x, t, encoder_hidden_states=audio_embeds).sample
                        if do_cfg:
                            u, a = noise.chunk(2)
                            noise = u + guidance * (a - u)
                        latents = pipe.scheduler.step(noise, t, latents, **extra).prev_sample
                    dec = pipe.decode_latents(latents)
                    dec = pipe.paste_surrounding_pixels_back(dec, ref_px, 1 - masks, device, dtype)
                    out_crops.extend(list(pipe.pixel_values_to_images(dec)))
            vram_peak = int(torch.cuda.max_memory_allocated() / 1048576)
            vram_reserved = int(torch.cuda.max_memory_reserved() / 1048576)
            t_infer = time.time()

        keep = cv2.resize(mask_image[0].numpy().astype(np.float32), (face_w, face_h), interpolation=cv2.INTER_LINEAR)
        weight = ft.face_weight(keep, feather, erode)
        result = frames.copy()
        inside: list[float] = []
        edited = 0
        for i in range(n):
            s = float(track.strength[i])
            if s <= 0.0:
                continue
            gen = cv2.resize(out_crops[i], (face_w, face_h), interpolation=cv2.INTER_CUBIC)
            result[i], wt = ft.composite(frames[i], gen, weight * s, affines[i])
            edited += 1
            if i % 6 == 0:
                inside.append(float(ft.masked_stats(frames[i], result[i], wt)["inside_mad"]))
        track.report.edited = edited
        if debug_dir:
            write_debug(debug_dir, frames, result, crops, out_crops, track, fps)
        write_video(result, info["fps_str"] or f"{fps}", out_path, video if info["has_audio"] else None, crf)
        t_end = time.time()
        return {
            "frames": n, "fps": round(fps, 3), "size": [info["width"], info["height"]], "out_frames": probe(out_path)["frames"],
            "track": track.report.summary(),
            "params": {"steps": steps, "guidance": guidance, "seed": seed, "feather": feather, "erode": erode, "crf": crf, "audio_offset": audio_offset, "num_frames": NUM_FRAMES, "resolution": RESOLUTION},
            "mouth_change_mad": round(float(np.mean(inside)), 3) if inside else None,
            "timing_s": {"decode": round(t_decode - t0, 2), "track": round(t_track - t_decode, 2), "model": round(t_infer - t_model, 2), "composite_encode": round(t_end - t_infer, 2), "total": round(t_end - t0, 2)},
            "vram_peak_allocated_mb": vram_peak, "vram_peak_reserved_mb": vram_reserved, "load": self.load_info,
            "model": "LatentSync 1.6 (latentsync_unet.pt, whisper tiny, sd-vae-ft-mse), YuNet + MediaPipe face tracking (no InsightFace)",
        }

"""Picture QA on CPU beside the audio service (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §C.2 Tier 1, §D).

(a) Mouth activity — MediaPipe Face Landmarker (Apache-2.0): per frame, the inner-lip gap over the mouth width (MAR)
    of every face; faces are linked into tracks by box IoU; each track's MAR series is scored against the audio that
    will play in the cut (the authoritative line, or the video's own track): mouth activity inside vs outside the
    speech windows, the correlation of MAR with the speech envelope, the best lag within ±N frames, which track is the
    speaker, and non-speaking tracks whose mouths move with the vocals (NON_SPEAKER_TALKING / EXTRA_SINGER).
(b) Face identity — OpenCV YuNet (MIT) + SFace (Apache-2.0) via cv2.FaceDetectorYN / cv2.FaceRecognizerSF: per sampled
    frame, the cosine similarity of the best-matching face to each character's canonical image (faces are assigned
    one-to-one when several characters are checked), with min / median / p10 / drift.
(c) SyncNet (Tier 2) — an interface only. Its weights (`syncnet_v2.model`) have no stated licence: it stays disabled
    (internal QA only, after a legal check) and answers {available: false, reason}.

No InsightFace, no non-commercial weights. Every threshold below is a START value to calibrate on real H3 takes on the
workstation (research §4 G1, G2, G7); none was measured here. The pure functions (tracking, envelopes, scoring, lag
search, identity aggregation) need only numpy and are unit-tested in docker/asr/tests.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import subprocess
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterator, Sequence

import numpy as np

# ------------------------------------------------------------------------------------------------ configuration

YUNET_PATH = os.environ.get("QA_YUNET_PATH", "/models/identity/face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.environ.get("QA_SFACE_PATH", "/models/identity/face_recognition_sface_2021dec.onnx")
LANDMARKER_PATH = os.environ.get("QA_FACE_LANDMARKER_PATH", "/models/qa/face_landmarker.task")
# The .task bundle is published on Google's storage, not Hugging Face, so the models fetcher cannot fetch it; the
# service fetches it once (pinned bytes) unless QA_AUTOFETCH=0. docker/models/manifest.json records it.
LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
LANDMARKER_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
LANDMARKER_BYTES = 3758596
AUTOFETCH = os.environ.get("QA_AUTOFETCH", "1") != "0"
SYNCNET_DIR = os.environ.get("SYNCNET_DIR", "/models/qa/syncnet")
MAX_SIDE = int(os.environ.get("QA_MAX_SIDE", "960"))  # frames are scaled so the long side is at most this
MAX_FACES = int(os.environ.get("QA_MAX_FACES", "4"))
MAX_VIDEO_SECONDS = float(os.environ.get("QA_MAX_VIDEO_S", "120"))
AUDIO_SR = 16000

# ---- START thresholds (calibrate on the workstation; none measured here)
TRACK_IOU_MIN_START = 0.3  # a face box continues a track when IoU with its last box ≥ this
TRACK_MAX_GAP_START = 6  # frames a track may miss before it ends
MIN_TRACK_FRAMES_START = 12  # a track shorter than this (0.5 s at 24 fps) is listed but not scored
MOUTH_ACTIVE_MIN_START = 0.35  # mean |dMAR/dt| (MAR units per second) at or above which a mouth "moves"
ACTIVITY_RATIO_MIN_START = 1.3  # inside-speech activity / outside-speech activity expected of a speaker
EXTRA_CORR_START = 0.30  # a non-speaker whose MAR correlates this well with the vocals is flagged
MAX_LAG_MS_DEFAULT = 200  # lag search range (research §C.2: ±200 ms)
VAD_ABOVE_FLOOR_DB_START = 12.0  # energy VAD: a frame is speech when ≥ this many dB above the clip's 10th percentile
VAD_MIN_DBFS_START = -45.0  # … and above this absolute level
VAD_MIN_RUN_FRAMES = 3  # speech runs shorter than this are dropped
ENVELOPE_FLOOR_DB = -60.0
SFACE_COSINE_THRESHOLD_START = 0.363  # OpenCV's SFace same-identity cosine threshold (research §D)
SFACE_REVIEW_BELOW_START = 0.50  # research §D: review 0.363–0.50, pass ≥ 0.50
YUNET_SCORE_MIN_START = 0.6
DRIFT_REVIEW_START = 0.15  # research §D: facial drift within a take, review if the drop exceeds this

# MediaPipe Face Mesh indices (478-point topology): inner-lip vertical pairs and the mouth corners
LIP_PAIRS = ((82, 87), (13, 14), (312, 317))
MOUTH_CORNERS = (61, 291)

START_THRESHOLDS = {
    "track_iou_min": TRACK_IOU_MIN_START, "track_max_gap": TRACK_MAX_GAP_START, "min_track_frames": MIN_TRACK_FRAMES_START,
    "mouth_active_min": MOUTH_ACTIVE_MIN_START, "activity_ratio_min": ACTIVITY_RATIO_MIN_START, "extra_corr": EXTRA_CORR_START,
    "vad_above_floor_db": VAD_ABOVE_FLOOR_DB_START, "vad_min_dbfs": VAD_MIN_DBFS_START,
}


class QaUnavailable(RuntimeError):
    """A dependency or weight is missing."""


class QaInputError(ValueError):
    """The request cannot be measured (no video stream, empty audio, bad windows)."""


# ------------------------------------------------------------------------------------------------ pure: geometry, tracks

Box = tuple[float, float, float, float]  # x0, y0, x1, y1


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return float(inter / ua) if ua > 0 else 0.0


def associate(track_boxes: Sequence[Box], det_boxes: Sequence[Box], min_iou: float = TRACK_IOU_MIN_START) -> list[tuple[int, int]]:
    """Greedy one-to-one matching of detections to tracks by IoU, highest first; pairs below `min_iou` stay apart."""
    pairs = sorted(((iou(t, d), ti, di) for ti, t in enumerate(track_boxes) for di, d in enumerate(det_boxes)), reverse=True)
    used_t: set[int] = set()
    used_d: set[int] = set()
    out = []
    for v, ti, di in pairs:
        if v < min_iou:
            break
        if ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        out.append((ti, di))
    return sorted(out)


@dataclass
class Track:
    id: int
    frames: list[int] = field(default_factory=list)
    boxes: list[Box] = field(default_factory=list)
    values: list[float] = field(default_factory=list)


def track_faces(per_frame: Sequence[Sequence[tuple[Box, float]]], min_iou: float = TRACK_IOU_MIN_START, max_gap: int = TRACK_MAX_GAP_START) -> list[Track]:
    """Link per-frame detections (box, value) into tracks: a detection continues the live track whose last box overlaps
    it best; a track not seen for more than `max_gap` frames ends; an unmatched detection starts a new track."""
    tracks: list[Track] = []
    live: list[int] = []
    for f, dets in enumerate(per_frame):
        live = [ti for ti in live if f - tracks[ti].frames[-1] <= max_gap + 1]
        pairs = associate([tracks[ti].boxes[-1] for ti in live], [d[0] for d in dets], min_iou)
        matched = set()
        for li, di in pairs:
            t = tracks[live[li]]
            t.frames.append(f)
            t.boxes.append(dets[di][0])
            t.values.append(dets[di][1])
            matched.add(di)
        for di, (box, val) in enumerate(dets):
            if di in matched:
                continue
            tracks.append(Track(id=len(tracks), frames=[f], boxes=[box], values=[val]))
            live.append(len(tracks) - 1)
    return tracks


def track_series(track: Track, n_frames: int) -> np.ndarray:
    s = np.full(n_frames, np.nan)
    s[np.asarray(track.frames, dtype=int)] = track.values
    return s


def mouth_aperture(xy: np.ndarray) -> float:
    """Inner-lip gap / mouth width from 478 face-mesh points in pixels (MAR). NaN for a degenerate mouth."""
    gap = float(np.mean([np.linalg.norm(xy[u] - xy[l]) for u, l in LIP_PAIRS]))
    width = float(np.linalg.norm(xy[MOUTH_CORNERS[0]] - xy[MOUTH_CORNERS[1]]))
    return gap / width if width > 1e-6 else float("nan")


def landmarks_box(xy: np.ndarray) -> Box:
    return (float(xy[:, 0].min()), float(xy[:, 1].min()), float(xy[:, 0].max()), float(xy[:, 1].max()))


# ------------------------------------------------------------------------------------------------ pure: audio


def frame_envelope_db(audio: np.ndarray, sr: int, fps: float, n_frames: int) -> np.ndarray:
    """RMS level (dBFS, floored at ENVELOPE_FLOOR_DB) of the audio under each video frame [i/fps, (i+1)/fps)."""
    out = np.full(n_frames, ENVELOPE_FLOOR_DB)
    for i in range(n_frames):
        a = int(round(i * sr / fps))
        b = int(round((i + 1) * sr / fps))
        seg = audio[a:b]
        if seg.size:
            rms = float(np.sqrt(np.mean(np.square(seg.astype(np.float64)))))
            out[i] = max(ENVELOPE_FLOOR_DB, 20 * math.log10(rms) if rms > 0 else ENVELOPE_FLOOR_DB)
    return out


def place_audio(audio: np.ndarray, sr: int, offset: float) -> np.ndarray:
    """The audio as it sits under the picture: `offset` seconds of silence first (offset > 0), or its first -offset
    seconds cut (offset < 0) — the authoritative line placed at its planned start in the shot."""
    n = int(round(abs(offset) * sr))
    if offset > 0:
        return np.concatenate([np.zeros(n, dtype=audio.dtype), audio])
    if offset < 0:
        return audio[n:]
    return audio


def parse_windows(obj: Any) -> list[tuple[float, float]]:
    """Speech windows from JSON: [{start, end}, …], [[start, end], …], or an /align answer ({words: [{start, end}]})."""
    if obj is None:
        return []
    if isinstance(obj, dict):
        obj = obj.get("words") or obj.get("windows") or []
    out = []
    for w in obj:
        if isinstance(w, dict):
            s, e = w.get("start"), w.get("end")
        elif isinstance(w, (list, tuple)) and len(w) == 2:
            s, e = w
        else:
            raise QaInputError(f"a speech window must be {{start, end}} or [start, end], got {w!r}")
        if s is None or e is None:
            continue
        s, e = float(s), float(e)
        if not (math.isfinite(s) and math.isfinite(e)) or e < s:
            raise QaInputError(f"bad speech window {w!r}")
        out.append((s, e))
    return out


def speech_mask_from_windows(windows: Sequence[tuple[float, float]], fps: float, n_frames: int) -> np.ndarray:
    """A frame is speech when its centre lies inside a window."""
    centres = (np.arange(n_frames) + 0.5) / fps
    m = np.zeros(n_frames, dtype=bool)
    for s, e in windows:
        m |= (centres >= s) & (centres < e)
    return m


def drop_short_runs(mask: np.ndarray, min_run: int) -> np.ndarray:
    out = mask.copy()
    i = 0
    n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i < min_run:
                out[i:j] = False
            i = j
        else:
            i += 1
    return out


def speech_mask_from_envelope(env_db: np.ndarray, above_floor_db: float = VAD_ABOVE_FLOOR_DB_START, min_dbfs: float = VAD_MIN_DBFS_START, min_run: int = VAD_MIN_RUN_FRAMES) -> np.ndarray:
    """Energy VAD: louder than the clip's quiet floor (10th percentile) by `above_floor_db` and above `min_dbfs`."""
    if env_db.size == 0:
        return np.zeros(0, dtype=bool)
    floor = float(np.percentile(env_db, 10))
    return drop_short_runs((env_db >= floor + above_floor_db) & (env_db >= min_dbfs), min_run)


# ------------------------------------------------------------------------------------------------ pure: scoring


def mouth_activity(aperture: np.ndarray, fps: float) -> np.ndarray:
    """|dMAR/dt| per second between consecutive frames (NaN where either frame has no face)."""
    act = np.full(aperture.shape, np.nan)
    if aperture.size > 1:
        act[1:] = np.abs(np.diff(aperture)) * fps
    return act


def activity_stats(activity: np.ndarray, speech: np.ndarray) -> dict[str, Any]:
    vis = np.isfinite(activity)
    inside = activity[vis & speech]
    outside = activity[vis & ~speech]
    mi = float(np.mean(inside)) if inside.size else None
    mo = float(np.mean(outside)) if outside.size else None
    ratio = None
    if mi is not None and mo is not None:
        ratio = mi / mo if mo > 1e-9 else (float("inf") if mi > 1e-9 else 1.0)
    return {"inside": mi, "outside": mo, "ratio": ratio, "inside_frames": int(inside.size), "outside_frames": int(outside.size)}


def pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3:
        return None
    x, y = a[ok] - a[ok].mean(), b[ok] - b[ok].mean()
    den = math.sqrt(float(np.dot(x, x)) * float(np.dot(y, y)))
    return float(np.dot(x, y) / den) if den > 1e-12 else None


def lagged_correlation(mouth: np.ndarray, audio: np.ndarray, max_lag: int) -> list[tuple[int, float | None]]:
    """Pearson r of mouth[t] against audio[t - lag] for lag in [-max_lag, max_lag]. A positive lag means the mouth
    moves LATER than the sound (the picture is late; delaying the audio by `lag` frames would line them up)."""
    n = len(mouth)
    out = []
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            a, b = mouth[lag:], audio[: n - lag]
        else:
            a, b = mouth[: n + lag], audio[-lag:]
        out.append((lag, pearson(a, b)))
    return out


def best_lag(corrs: Sequence[tuple[int, float | None]]) -> tuple[int | None, float | None]:
    """The lag with the highest r; ties go to the smallest |lag|."""
    valid = [(lag, r) for lag, r in corrs if r is not None]
    if not valid:
        return None, None
    lag, r = max(valid, key=lambda x: (round(x[1], 9), -abs(x[0])))
    return lag, r


def score_track(aperture: np.ndarray, env_db: np.ndarray, speech: np.ndarray, fps: float, max_lag: int) -> dict[str, Any]:
    act = mouth_activity(aperture, fps)
    stats = activity_stats(act, speech)
    corrs = lagged_correlation(aperture, env_db, max_lag)
    lag, r = best_lag(corrs)
    r0 = dict(corrs).get(0)
    return {
        "activity_inside": _r(stats["inside"]), "activity_outside": _r(stats["outside"]), "activity_ratio": _r(stats["ratio"]),
        "inside_frames": stats["inside_frames"], "outside_frames": stats["outside_frames"],
        "corr_lag0": _r(r0), "corr_best": _r(r), "best_lag_frames": lag, "best_lag_ms": None if lag is None else round(lag * 1000.0 / fps, 1),
        "lag_at_search_edge": lag is not None and max_lag > 0 and abs(lag) == max_lag,
    }


def speaker_rank_key(s: dict[str, Any]) -> tuple[float, float]:
    """Speakers are the tracks whose mouths follow the audio best: correlation first, then the activity ratio."""
    r = s.get("corr_best")
    ratio = s.get("activity_ratio")
    return (r if r is not None else -2.0, min(ratio, 1e6) if ratio is not None else 0.0)


def flag_tracks(scores: dict[int, dict[str, Any]], speakers: Sequence[int], mode: str = "speech") -> dict[int, list[str]]:
    """Per scored track, the findings: for speakers MOUTH_STILL_WHILE_SPEAKING and MOUTH_MOVING_WHILE_SILENT; for every
    other track NON_SPEAKER_TALKING (EXTRA_SINGER in singing mode) when its mouth moves during the vocals and follows
    them (correlation or activity ratio)."""
    flags: dict[int, list[str]] = {}
    for tid, s in scores.items():
        f: list[str] = []
        inside, outside, ratio, r = s.get("activity_inside"), s.get("activity_outside"), s.get("activity_ratio"), s.get("corr_best")
        if tid in speakers:
            if inside is not None and inside < MOUTH_ACTIVE_MIN_START:
                f.append("MOUTH_STILL_WHILE_SPEAKING")
            if outside is not None and outside >= MOUTH_ACTIVE_MIN_START and ratio is not None and ratio < ACTIVITY_RATIO_MIN_START:
                f.append("MOUTH_MOVING_WHILE_SILENT")
            if s.get("lag_at_search_edge"):
                f.append("LAG_AT_SEARCH_EDGE")
        else:
            moving = inside is not None and inside >= MOUTH_ACTIVE_MIN_START
            follows = (r is not None and r >= EXTRA_CORR_START) or (ratio is not None and ratio >= ACTIVITY_RATIO_MIN_START)
            if moving and follows:
                f.append("EXTRA_SINGER" if mode == "singing" else "NON_SPEAKER_TALKING")
        flags[tid] = f
    return flags


def score_tracks(tracks: Sequence[Track], n_frames: int, env_db: np.ndarray, speech: np.ndarray, fps: float, max_lag: int, speakers: int = 1, mode: str = "speech") -> dict[str, Any]:
    """Every track scored, the `speakers` best-following tracks chosen, findings flagged."""
    out_tracks = []
    scores: dict[int, dict[str, Any]] = {}
    for t in tracks:
        boxes = np.asarray(t.boxes, dtype=float)
        rec: dict[str, Any] = {
            "id": t.id, "frames": len(t.frames), "first_frame": t.frames[0], "last_frame": t.frames[-1],
            "mean_box": [round(float(v), 1) for v in boxes.mean(axis=0)], "face_height_px": round(float(np.median(boxes[:, 3] - boxes[:, 1])), 1),
        }
        if len(t.frames) < MIN_TRACK_FRAMES_START:
            rec.update({"scored": False, "reason": f"track shorter than {MIN_TRACK_FRAMES_START} frames"})
        else:
            s = score_track(track_series(t, n_frames), env_db, speech, fps, max_lag)
            rec.update({"scored": True, **s})
            scores[t.id] = s
        out_tracks.append(rec)
    ranked = sorted(scores, key=lambda tid: speaker_rank_key(scores[tid]), reverse=True)
    chosen = ranked[: max(0, speakers)] if speech.any() else []
    flags = flag_tracks(scores, chosen, mode)
    for rec in out_tracks:
        rec["is_speaker"] = rec["id"] in chosen
        rec["flags"] = flags.get(rec["id"], [])
    return {"tracks": out_tracks, "speaker_tracks": chosen}


# ------------------------------------------------------------------------------------------------ pure: identity


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64).ravel()
    b = np.asarray(b, dtype=np.float64).ravel()
    den = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / den) if den > 0 else 0.0


def assign_faces(sim: np.ndarray) -> dict[int, tuple[int, float]]:
    """faces × characters cosine matrix → {character: (face, cosine)}, one face per character and one character per
    face, best pairs first. With one character this is simply the best face."""
    sim = np.asarray(sim, dtype=float)
    if sim.size == 0:
        return {}
    pairs = sorted(((sim[f, c], f, c) for f in range(sim.shape[0]) for c in range(sim.shape[1])), reverse=True)
    used_f: set[int] = set()
    out: dict[int, tuple[int, float]] = {}
    for v, f, c in pairs:
        if c in out or f in used_f:
            continue
        out[c] = (f, float(v))
        used_f.add(f)
    return out


def aggregate_identity(values: Sequence[float | None], threshold: float = SFACE_COSINE_THRESHOLD_START) -> dict[str, Any]:
    """A character's per-frame cosine series (None = not found in that frame) → the numbers the verdict reads."""
    v = np.asarray([x for x in values if x is not None], dtype=float)
    if v.size == 0:
        return {"frames": len(values), "frames_with_face": 0, "min": None, "median": None, "mean": None, "p10": None, "below_threshold": 0, "share_below": None, "drift": None, "threshold": threshold}
    below = int((v < threshold).sum())
    return {
        "frames": len(values), "frames_with_face": int(v.size), "min": _r(float(v.min())), "median": _r(float(np.median(v))), "mean": _r(float(v.mean())),
        "p10": _r(float(np.percentile(v, 10))), "below_threshold": below, "share_below": _r(below / v.size),
        "drift": _r(float(v[0] - v[1:].min())) if v.size > 1 else 0.0, "threshold": threshold,
    }


def _r(x: float | None, nd: int = 4) -> float | None:
    if x is None:
        return None
    if isinstance(x, float) and math.isinf(x):
        return 1e6
    return round(float(x), nd)


# ------------------------------------------------------------------------------------------------ media (ffmpeg)


def probe(path: str) -> dict[str, Any]:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration", "-of", "json", path], check=True, capture_output=True, timeout=60).stdout
    j = json.loads(out or b"{}")
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)

    def rate(s: str | None) -> float | None:
        try:
            n, d = (s or "0/0").split("/")
            return float(n) / float(d) if float(d) else None
        except (ValueError, ZeroDivisionError):
            return None

    return {"width": int(v["width"]) if v else None, "height": int(v["height"]) if v else None, "fps": (rate(v.get("avg_frame_rate")) or rate(v.get("r_frame_rate"))) if v else None, "has_video": v is not None, "has_audio": a is not None, "duration": float(j.get("format", {}).get("duration") or 0)}


def scaled_size(w: int, h: int, max_side: int = MAX_SIDE) -> tuple[int, int]:
    s = min(1.0, max_side / max(w, h))
    return max(2, int(round(w * s / 2)) * 2), max(2, int(round(h * s / 2)) * 2)


def read_frames(path: str, fps: float, size: tuple[int, int]) -> Iterator[np.ndarray]:
    """BGR frames resampled to `fps` and scaled to `size`, decoded by ffmpeg."""
    w, h = size
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-an", "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    n = w * h * 3
    try:
        assert proc.stdout is not None
        while True:
            buf = proc.stdout.read(n)
            if len(buf) < n:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
    finally:
        proc.kill()
        proc.wait()


def read_audio(path: str, sr: int = AUDIO_SR) -> np.ndarray:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"], check=True, capture_output=True, timeout=600).stdout
    return np.frombuffer(pcm, dtype=np.float32)


# ------------------------------------------------------------------------------------------------ models

_fetch_lock = threading.Lock()


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def ensure_landmarker() -> str:
    """The Face Landmarker bundle on the volume, fetched once from its pinned URL and sha256 when missing."""
    if os.path.isfile(LANDMARKER_PATH):
        return LANDMARKER_PATH
    if not AUTOFETCH:
        raise QaUnavailable(f"{LANDMARKER_PATH} is missing and QA_AUTOFETCH=0 (fetch it: docs/MODELS.md, QA weights)")
    with _fetch_lock:
        if os.path.isfile(LANDMARKER_PATH):
            return LANDMARKER_PATH
        os.makedirs(os.path.dirname(LANDMARKER_PATH), exist_ok=True)
        part = LANDMARKER_PATH + ".partial"
        try:
            urllib.request.urlretrieve(LANDMARKER_URL, part)  # noqa: S310 (pinned https URL)
        except Exception as e:  # noqa: BLE001
            raise QaUnavailable(f"could not fetch the Face Landmarker bundle: {e}") from e
        got = _sha256(part)
        if got != LANDMARKER_SHA256:
            os.unlink(part)
            raise QaUnavailable(f"face_landmarker.task sha256 mismatch: got {got}, expected {LANDMARKER_SHA256}")
        os.replace(part, LANDMARKER_PATH)
        print(f"[qa] fetched {LANDMARKER_PATH} ({os.path.getsize(LANDMARKER_PATH)} bytes, sha256 verified)", flush=True)
    return LANDMARKER_PATH


def _missing(*mods: str) -> list[str]:
    return [m for m in mods if importlib.util.find_spec(m) is None]


def status() -> dict[str, dict[str, Any]]:
    """Per capability: whether it can run and why not. Cheap: no heavy imports."""
    out: dict[str, dict[str, Any]] = {}
    miss = _missing("cv2", "mediapipe")
    reason = None
    if miss:
        reason = f"python packages missing: {', '.join(miss)} (rebuild the asr image)"
    elif not os.path.isfile(LANDMARKER_PATH) and not AUTOFETCH:
        reason = f"{LANDMARKER_PATH} missing and QA_AUTOFETCH=0"
    out["mouth"] = {"available": reason is None, "reason": reason, "weights_present": os.path.isfile(LANDMARKER_PATH), "fetch_on_first_use": not os.path.isfile(LANDMARKER_PATH) and AUTOFETCH, "model": "MediaPipe Face Landmarker (float16/1)", "device": "cpu"}
    miss = _missing("cv2")
    reason = None
    if miss:
        reason = "python package missing: cv2 (opencv-python-headless; rebuild the asr image)"
    else:
        absent = [p for p in (YUNET_PATH, SFACE_PATH) if not os.path.isfile(p)]
        if absent:
            reason = f"weights not on the models volume: {', '.join(absent)} (manifest group qa-identity)"
    out["identity"] = {"available": reason is None, "reason": reason, "model": "YuNet 2023mar + SFace 2021dec", "device": "cpu"}
    out["syncnet"] = syncnet_status()
    return out


def syncnet_status() -> dict[str, Any]:
    """SyncNet (Tier 2) is an interface only: no runner is wired while its weights' licence is unresolved."""
    if not os.path.isdir(SYNCNET_DIR):
        return {"available": False, "reason": f"disabled: SYNCNET_DIR ({SYNCNET_DIR}) does not exist; syncnet_v2.model has no stated licence (internal QA only, legal check owed)"}
    return {"available": False, "reason": f"{SYNCNET_DIR} exists but no SyncNet runner is wired in this build (interface only until the licence of syncnet_v2.model is confirmed)"}


def syncnet_check(video_path: str, audio_path: str | None = None) -> dict[str, Any]:
    """The Tier-2 hook. A wired runner would return {available: true, offset_frames, lse_c, lse_d, fps: 25,
    per_frame_conf} with the clip resampled to 25 fps / 16 kHz as syncnet_python's run_pipeline.py does."""
    return syncnet_status()


class FaceIdentity:
    """YuNet detector + SFace embedder, CPU."""

    def __init__(self) -> None:
        st = status()["identity"]
        if not st["available"]:
            raise QaUnavailable(st["reason"])
        import cv2  # type: ignore

        self.cv2 = cv2
        self.det = cv2.FaceDetectorYN.create(YUNET_PATH, "", (320, 320), YUNET_SCORE_MIN_START, 0.3, 5000)
        self.rec = cv2.FaceRecognizerSF.create(SFACE_PATH, "")

    def faces(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, faces = self.det.detect(img)
        return faces if faces is not None else np.zeros((0, 15), dtype=np.float32)

    def embed(self, img: np.ndarray, face: np.ndarray) -> np.ndarray:
        return self.rec.feature(self.rec.alignCrop(img, face)).flatten()


_id_lock = threading.Lock()
_identity: FaceIdentity | None = None


def identity_tools() -> FaceIdentity:
    global _identity
    with _id_lock:
        if _identity is None:
            _identity = FaceIdentity()
        return _identity


def unload() -> None:
    global _identity
    with _id_lock:
        _identity = None


# ------------------------------------------------------------------------------------------------ runners


def mouth_check(video_path: str, audio_path: str | None = None, windows: Any = None, fps: float | None = None, mode: str = "speech", speakers: int = 1, max_lag_ms: float = MAX_LAG_MS_DEFAULT, audio_offset: float = 0.0) -> dict[str, Any]:
    """Tier 1 lip-sync check of one clip. `audio_path` is the audio that will play in the cut (else the video's own
    track), starting `audio_offset` seconds into the clip; `windows` the speech/word windows in seconds of the clip
    (else an energy VAD on that audio)."""
    st = status()["mouth"]
    if not st["available"]:
        raise QaUnavailable(st["reason"])
    if mode not in ("speech", "singing"):
        raise QaInputError("mode must be speech or singing")
    info = probe(video_path)
    if not info["has_video"]:
        raise QaInputError("the file has no video stream")
    if info["duration"] > MAX_VIDEO_SECONDS:
        raise QaInputError(f"the clip is {info['duration']:.1f} s; the limit is {MAX_VIDEO_SECONDS:.0f} s per call")
    fps = float(fps or info["fps"] or 24.0)
    if audio_path is None and not info["has_audio"]:
        raise QaInputError("no audio: the video has no audio track and none was sent")
    audio = read_audio(audio_path or video_path)
    if audio.size == 0:
        raise QaInputError("no audio could be decoded")
    audio = place_audio(audio, AUDIO_SR, audio_offset)
    task = ensure_landmarker()
    try:
        import mediapipe as mp  # type: ignore
        from mediapipe.tasks.python import vision  # type: ignore
        from mediapipe.tasks.python.core import base_options  # type: ignore
    except Exception as e:  # noqa: BLE001
        raise QaUnavailable(f"mediapipe could not be imported: {type(e).__name__}: {e}") from e

    t0 = time.time()
    size = scaled_size(info["width"], info["height"])
    opts = vision.FaceLandmarkerOptions(base_options=base_options.BaseOptions(model_asset_path=task), running_mode=vision.RunningMode.VIDEO, num_faces=MAX_FACES, min_face_detection_confidence=0.5, min_face_presence_confidence=0.5, min_tracking_confidence=0.5)
    per_frame: list[list[tuple[Box, float]]] = []
    try:
        landmarker = vision.FaceLandmarker.create_from_options(opts)
    except OSError as e:  # the native library: libEGL.so.1 / libGLESv2.so.2 must be installed (docker/asr/Dockerfile)
        raise QaUnavailable(f"MediaPipe's native library could not be loaded: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise QaUnavailable(f"the Face Landmarker could not be created from {task}: {type(e).__name__}: {e}") from e
    with landmarker as lm:
        for i, bgr in enumerate(read_frames(video_path, fps, size)):
            rgb = np.ascontiguousarray(bgr[:, :, ::-1])
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(round(i * 1000.0 / fps)))
            dets: list[tuple[Box, float]] = []
            for face in res.face_landmarks or []:
                xy = np.asarray([(p.x * size[0], p.y * size[1]) for p in face], dtype=float)
                dets.append((landmarks_box(xy), mouth_aperture(xy)))
            per_frame.append(dets)
    n = len(per_frame)
    if n == 0:
        raise QaInputError("no frames could be decoded")
    env = frame_envelope_db(audio, AUDIO_SR, fps, n)
    win = parse_windows(windows)
    speech = speech_mask_from_windows(win, fps, n) if win else speech_mask_from_envelope(env)
    tracks = track_faces(per_frame)
    max_lag = max(0, int(round(max_lag_ms * fps / 1000.0)))
    scored = score_tracks(tracks, n, env, speech, fps, max_lag, speakers, mode)
    return {
        "available": True, "fps": round(fps, 3), "frames": n, "size": list(size), "duration": round(n / fps, 3),
        "audio_source": "upload" if audio_path else "video", "audio_offset": audio_offset, "windows_source": "windows" if win else "energy",
        "speech_frames": int(speech.sum()), "faces_per_frame_max": max((len(d) for d in per_frame), default=0),
        "max_lag_frames": max_lag, "mode": mode, **scored, "thresholds": START_THRESHOLDS,
        "syncnet": syncnet_status(), "model": st["model"], "ms": int((time.time() - t0) * 1000),
    }


def faces_in_image(path: str, max_side: int = 1600) -> dict[str, Any]:
    """YuNet face boxes on one still picture, in the picture's OWN pixels (the detector runs on a copy scaled to
    `max_side`; the boxes are scaled back). Used to cut a derived face reference from a canonical image
    (src/domain/face-reference.ts). Largest face first."""
    tools = identity_tools()
    cv2 = tools.cv2
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise QaInputError("the picture could not be decoded")
    h, w = img.shape[:2]
    s = min(1.0, max_side / max(h, w))
    small = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA) if s < 1.0 else img
    t0 = time.time()
    faces = tools.faces(small)
    out = [{"box": [round(float(f[0]) / s, 1), round(float(f[1]) / s, 1), round(float(f[2]) / s, 1), round(float(f[3]) / s, 1)], "score": round(float(f[14]), 3)} for f in faces]
    out.sort(key=lambda x: -(x["box"][2] * x["box"][3]))
    return {"available": True, "width": int(w), "height": int(h), "faces": out, "detector": "YuNet 2023mar", "ms": int((time.time() - t0) * 1000)}


def identity_check(video_path: str, references: dict[str, str], sample_fps: float = 2.0, threshold: float = SFACE_COSINE_THRESHOLD_START) -> dict[str, Any]:
    """SFace cosine of each character's canonical face against the faces of frames sampled at `sample_fps`.
    `references` maps characterId → image path."""
    if not references:
        raise QaInputError("no reference image")
    tools = identity_tools()
    cv2 = tools.cv2
    info = probe(video_path)
    if not info["has_video"]:
        raise QaInputError("the file has no video stream")
    if info["duration"] > MAX_VIDEO_SECONDS:
        raise QaInputError(f"the clip is {info['duration']:.1f} s; the limit is {MAX_VIDEO_SECONDS:.0f} s per call")
    t0 = time.time()
    chars = list(references)
    ref_vecs: dict[str, np.ndarray] = {}
    ref_info: dict[str, dict[str, Any]] = {}
    for cid, p in references.items():
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        if img is None:
            ref_info[cid] = {"available": False, "reason": "the reference image could not be decoded"}
            continue
        h, w = img.shape[:2]
        if max(h, w) > 1600:  # YuNet on a 1664-px canonical image is slow and gains nothing
            s = 1600 / max(h, w)
            img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        faces = tools.faces(img)
        if len(faces) == 0:
            ref_info[cid] = {"available": False, "reason": "no face found in the reference image"}
            continue
        f = max(faces, key=lambda r: float(r[2] * r[3]))
        ref_vecs[cid] = tools.embed(img, f)
        ref_info[cid] = {"available": True, "faces_in_reference": int(len(faces)), "face_box": [round(float(v), 1) for v in f[:4]], "score": round(float(f[14]), 3)}
    active = [c for c in chars if c in ref_vecs]
    series: dict[str, list[dict[str, Any]]] = {c: [] for c in active}
    size = scaled_size(info["width"], info["height"], max(MAX_SIDE, 1280))
    n = 0
    faces_max = 0
    for i, img in enumerate(read_frames(video_path, sample_fps, size)):
        n += 1
        t = round(i / sample_fps, 3)
        faces = tools.faces(img) if active else np.zeros((0, 15))
        faces_max = max(faces_max, len(faces))
        vecs = [tools.embed(img, f) for f in faces]
        sim = np.asarray([[cosine(v, ref_vecs[c]) for c in active] for v in vecs]) if vecs else np.zeros((0, len(active)))
        best = assign_faces(sim)
        for ci, c in enumerate(active):
            if ci in best:
                fi, v = best[ci]
                series[c].append({"t": t, "cosine": round(v, 4), "box": [round(float(x), 1) for x in faces[fi][:4]]})
            else:
                series[c].append({"t": t, "cosine": None, "box": None})
    characters: dict[str, Any] = {}
    for c in chars:
        if c not in ref_vecs:
            characters[c] = {"reference": ref_info[c], "series": [], "summary": None}
            continue
        characters[c] = {"reference": ref_info[c], "series": series[c], "summary": aggregate_identity([s["cosine"] for s in series[c]], threshold)}
    return {
        "available": True, "sample_fps": sample_fps, "frames": n, "faces_per_frame_max": faces_max, "size": list(size), "characters": characters,
        "threshold": threshold, "review_below": SFACE_REVIEW_BELOW_START, "drift_review": DRIFT_REVIEW_START,
        "model": "YuNet 2023mar + SFace 2021dec (cosine)", "ms": int((time.time() - t0) * 1000),
    }

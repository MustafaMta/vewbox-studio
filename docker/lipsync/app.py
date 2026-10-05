"""Lip-sync corrector service (docker/lipsync; docs/MODELS.md "lip-sync corrector").

GET  /health   weights present, loaded or not, GPU memory, the detector, the licences
POST /lipsync  multipart: video (the take), audio (the authoritative audio the mouth must follow), audio_offset (s: where
               that audio starts in the clip; default 0), reference (optional image: the speaker's canonical picture,
               chooses the face by SFace identity), others (optional, repeated: the other characters' pictures — a
               face is taken for the speaker only if it resembles the speaker more than them), hint_box (optional JSON [x0,y0,x1,y1] in video pixels: the speaker's
               face track from /qa/mouth), steps, guidance, seed, feather, erode
               -> the corrected MP4 (same frame count, rate and size; the take's own audio copied), with the report as
               base64url JSON in the `X-Lipsync-Report` header
POST /unload   drop the model from the GPU (the worker's lease calls it when another family takes the card)

One correction at a time. With LIPSYNC_KEEP_LOADED=0 (the default) the weights are dropped after every request, so
nothing of this service stays on the card when MiniMax H3 comes back — a worker that predates the LIPSYNC GPU family
cannot unload it. The service never fetches weights; it never generates a video.
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import tempfile
import time
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

import corrector as cr

KEEP_LOADED = os.environ.get("LIPSYNC_KEEP_LOADED", "0") == "1"
app = FastAPI(title="vewbox-lipsync")
C = cr.Corrector()
_busy = {"since": None}

LICENCES = {
    "latentsync_code": "Apache-2.0 (github.com/bytedance/LatentSync @ a229c39)",
    "latentsync_weights": "CreativeML Open RAIL++-M (ByteDance/LatentSync-1.6): commercial use allowed; the Attachment A use restrictions pass downstream",
    "whisper_tiny": "MIT (OpenAI; byte-identical to openai's tiny.pt)",
    "vae": "MIT (stabilityai/sd-vae-ft-mse)",
    "yunet": "MIT", "sface": "Apache-2.0", "mediapipe_face_landmarker": "Apache-2.0",
    "insightface": "not used (non-commercial model packs)",
}


def gpu_mem() -> dict[str, int] | None:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        m = pynvml.nvmlDeviceGetMemoryInfo(pynvml.nvmlDeviceGetHandleByIndex(0))
        return {"used_mb": int(m.used / 1048576), "total_mb": int(m.total / 1048576)}
    except Exception:  # noqa: BLE001
        return None


@app.get("/health")
def health() -> dict[str, Any]:
    st = cr.weights_status()
    return {
        "ok": True, "service": "lipsync", "model": "LatentSync 1.6", "detector": "YuNet 2023mar + MediaPipe Face Landmarker (no InsightFace)",
        "available": st["ready"], "reason": None if st["ready"] else "missing: " + "; ".join(st["missing"]),
        "weights": st["present"], "loaded": C.pipe is not None, "keep_loaded": KEEP_LOADED, "busy_since": _busy["since"],
        "gpu": gpu_mem(), "licences": LICENCES, "defaults": cr.DEFAULTS, "max_seconds": cr.MAX_SECONDS,
    }


@app.post("/unload")
def unload() -> dict[str, Any]:
    if _busy["since"]:
        return {"unloaded": False, "reason": "a correction is running"}
    return {"unloaded": C.unload(), "gpu": gpu_mem()}


async def _save(up: UploadFile, d: str, name: str) -> str:
    p = os.path.join(d, name + os.path.splitext(up.filename or "")[1])
    with open(p, "wb") as f:
        shutil.copyfileobj(up.file, f)
    return p


@app.post("/lipsync")
async def lipsync(
    video: UploadFile = File(...), audio: UploadFile = File(...), reference: UploadFile | None = File(None),
    others: list[UploadFile] | None = File(None),
    audio_offset: float = Form(0.0), hint_box: str | None = Form(None), steps: int = Form(cr.DEFAULTS["steps"]),
    guidance: float = Form(cr.DEFAULTS["guidance"]), seed: int = Form(cr.DEFAULTS["seed"]),
    feather: float = Form(cr.DEFAULTS["feather"]), erode: float = Form(cr.DEFAULTS["erode"]),
) -> Response:
    if not (1 <= steps <= 100) or not (1.0 <= guidance <= 5.0) or not (0.0 <= feather <= 0.3) or not (0.0 <= erode <= 0.2) or abs(audio_offset) > 600:
        raise HTTPException(422, "steps 1-100, guidance 1-5, feather 0-0.3, erode 0-0.2, |audio_offset| <= 600")
    hint = None
    if hint_box:
        try:
            b = json.loads(hint_box)
            hint = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"hint_box must be [x0, y0, x1, y1]: {e}") from e
    st = cr.weights_status()
    if not st["ready"]:
        raise HTTPException(503, "missing: " + "; ".join(st["missing"]))
    if _busy["since"]:
        raise HTTPException(409, f"a correction is already running (since {_busy['since']})")
    d = tempfile.mkdtemp(prefix="lipsync-")
    _busy["since"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        vp = await _save(video, d, "video")
        ap = await _save(audio, d, "audio")
        rp = await _save(reference, d, "reference") if reference is not None and reference.filename else None
        ops = [await _save(o, d, f"other{k}") for k, o in enumerate(others or []) if o.filename]
        out = os.path.join(d, "corrected.mp4")
        try:
            report = await run_in_threadpool(C.correct, vp, ap, out, audio_offset=audio_offset, reference=rp, others=ops, hint=hint, steps=steps, guidance=guidance, seed=seed, feather=feather, erode=erode, workdir=d)
        except cr.InputError as e:
            raise HTTPException(422, str(e)) from e
        except cr.Unavailable as e:
            raise HTTPException(503, str(e)) from e
        report["gpu_after"] = gpu_mem()
        with open(out, "rb") as f:
            body = f.read()
        hdr = base64.urlsafe_b64encode(json.dumps(report, separators=(",", ":")).encode()).decode()
        return Response(content=body, media_type="video/mp4", headers={"X-Lipsync-Report": hdr})
    finally:
        _busy["since"] = None
        if not KEEP_LOADED:
            C.unload()
        shutil.rmtree(d, ignore_errors=True)


@app.exception_handler(RuntimeError)
async def runtime_error(_req: Any, exc: RuntimeError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})

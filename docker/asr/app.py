"""Transcription service — faster-whisper large-v3 (float16) with word timestamps and VAD.

POST /transcribe  multipart: file, language (ar|en|auto), prompt (optional), words (1|0)  -> JSON segments/words
POST /unload      drop the model from the GPU (the worker calls this when another family needs the card)
GET  /health      model name, loaded flag, GPU memory
"""
from __future__ import annotations

import os
import tempfile
import threading
import time
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "/models/asr/faster-whisper-large-v3")
MODEL_NAME = os.environ.get("ASR_MODEL_NAME", "large-v3")
COMPUTE = os.environ.get("ASR_COMPUTE_TYPE", "float16")
IRAQI_PROMPT = "شلونك؟ هواية زين. شنو صار؟ وين چنت؟ اكو شي؟ ماكو. خوش. گلب."

app = FastAPI(title="vewbox-asr")
_lock = threading.Lock()
_model: Any = None
_loaded_at: float | None = None


def gpu_mem() -> dict[str, int] | None:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        m = pynvml.nvmlDeviceGetMemoryInfo(h)
        return {"used_mb": int(m.used / 1048576), "total_mb": int(m.total / 1048576)}
    except Exception:  # noqa: BLE001
        return None


def model():
    global _model, _loaded_at
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            path = MODEL_DIR if os.path.isdir(MODEL_DIR) and os.path.exists(os.path.join(MODEL_DIR, "model.bin")) else MODEL_NAME
            t0 = time.time()
            _model = WhisperModel(path, device="cuda", compute_type=COMPUTE)
            _loaded_at = time.time()
            print(f"[asr] loaded {path} ({COMPUTE}) in {time.time() - t0:.1f}s", flush=True)
        return _model


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "compute": COMPUTE, "loaded": _model is not None, "gpu": gpu_mem(), "weights_present": os.path.exists(os.path.join(MODEL_DIR, "model.bin"))}


@app.post("/unload")
def unload():
    global _model
    with _lock:
        _model = None
    try:
        import gc

        gc.collect()
        import torch  # type: ignore

        torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem()}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("auto"), prompt: str = Form(""), words: str = Form("1"), beam_size: int = Form(5)):
    if not os.path.exists(os.path.join(MODEL_DIR, "model.bin")):
        raise HTTPException(status_code=503, detail="Whisper weights are not downloaded yet (docker/models: asr-whisper)")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(file.filename or "a.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        lang = None if language in ("", "auto") else language
        initial = prompt or (IRAQI_PROMPT if lang == "ar" else None)
        t0 = time.time()
        m = model()
        with _lock:
            segments, info = m.transcribe(path, language=lang, task="transcribe", beam_size=beam_size, word_timestamps=words == "1", vad_filter=True, vad_parameters={"min_silence_duration_ms": 300}, initial_prompt=initial, condition_on_previous_text=False)
            out = []
            for s in segments:
                out.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3), "words": [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word, "probability": round(w.probability, 3)} for w in (s.words or [])]})
        return JSONResponse({"language": info.language, "language_probability": round(info.language_probability, 3), "duration": round(info.duration, 3), "segments": out, "text": " ".join(x["text"] for x in out).strip(), "ms": int((time.time() - t0) * 1000), "model": MODEL_NAME})
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

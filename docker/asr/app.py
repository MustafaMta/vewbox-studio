"""Audio analysis service — faster-whisper large-v3 (float16) with word timestamps and VAD, and Demucs stems.

POST /transcribe  multipart: file, language (ar|en|auto), prompt (optional), words (1|0)  -> JSON segments/words
POST /separate    multipart: file, stems (two|four)  -> zip of WAV stems (vocals + no_vocals, or the four htdemucs stems)
POST /unload      drop the models from the GPU (the worker calls this when another family needs the card)
GET  /health      model names, loaded flags, GPU memory

Two Whisper models, one on the card at a time (docs/research/MODEL-STACK-2026-10.md §3.9, §7.2): ASR_MODEL_DIR serves
every language; ASR_MODEL_DIR_AR (the CTranslate2 copy of whisper-large-v3-arabic-dialectal-v2) serves `language=ar`
when its model.bin exists. Each is loaded lazily on first use, and loading one drops the other first. The response's
`model` says which one transcribed.
"""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "/models/asr/faster-whisper-large-v3")
MODEL_NAME = os.environ.get("ASR_MODEL_NAME", "large-v3")
# the Arabic-dialect model; empty = Arabic stays on the default model
MODEL_DIR_AR = os.environ.get("ASR_MODEL_DIR_AR", "")
MODEL_NAME_AR = os.environ.get("ASR_MODEL_NAME_AR", "large-v3-arabic-dialectal-v2")
COMPUTE = os.environ.get("ASR_COMPUTE_TYPE", "float16")
IRAQI_PROMPT = "شلونك؟ هواية زين. شنو صار؟ وين چنت؟ اكو شي؟ ماكو. خوش. گلب."

# the Whisper models by key: "default" (every language) and "ar" (language=ar when its weights exist)
MODELS: dict[str, dict[str, str]] = {"default": {"dir": MODEL_DIR, "name": MODEL_NAME}}
if MODEL_DIR_AR:
    MODELS["ar"] = {"dir": MODEL_DIR_AR, "name": MODEL_NAME_AR}

app = FastAPI(title="vewbox-asr")
_lock = threading.Lock()
_model: Any = None
_model_key: str | None = None  # which of MODELS is on the card
_loaded_at: float | None = None


def weights_present(key: str) -> bool:
    return os.path.exists(os.path.join(MODELS[key]["dir"], "model.bin"))


def model_key_for(lang: str | None) -> str:
    """`ar` goes to the dialect model when it is configured and converted; everything else (and `ar` before the
    conversion) to the default model."""
    return "ar" if lang == "ar" and "ar" in MODELS and weights_present("ar") else "default"


def gpu_mem() -> dict[str, int] | None:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        m = pynvml.nvmlDeviceGetMemoryInfo(h)
        return {"used_mb": int(m.used / 1048576), "total_mb": int(m.total / 1048576)}
    except Exception:  # noqa: BLE001
        return None


def model(key: str = "default"):
    """The Whisper model for `key`, loaded lazily. One model is on the card at a time: a different key drops the
    loaded one (and its VRAM) before loading."""
    global _model, _model_key, _loaded_at
    with _lock:
        if _model is not None and _model_key != key:
            print(f"[asr] dropping {_model_key} for {key}", flush=True)
            _model = None
            _model_key = None
            try:
                import gc

                gc.collect()
                import torch  # type: ignore

                torch.cuda.empty_cache()
            except Exception:  # noqa: BLE001
                pass
        if _model is None:
            from faster_whisper import WhisperModel

            spec = MODELS[key]
            path = spec["dir"] if weights_present(key) else spec["name"]
            t0 = time.time()
            _model = WhisperModel(path, device="cuda", compute_type=COMPUTE)
            _model_key = key
            _loaded_at = time.time()
            print(f"[asr] loaded {key}: {path} ({COMPUTE}) in {time.time() - t0:.1f}s", flush=True)
        return _model


_demucs: Any = None
_demucs_lock = threading.Lock()
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")


def demucs_model():
    global _demucs
    with _demucs_lock:
        if _demucs is None:
            import torch  # type: ignore
            from demucs.pretrained import get_model  # type: ignore

            t0 = time.time()
            m = get_model(DEMUCS_MODEL)
            m.to("cuda" if torch.cuda.is_available() else "cpu").eval()
            _demucs = m
            print(f"[asr] loaded demucs {DEMUCS_MODEL} in {time.time() - t0:.1f}s", flush=True)
        return _demucs


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "compute": COMPUTE,
        "loaded": _model is not None,
        "loaded_model": MODELS[_model_key]["name"] if _model_key else None,
        # per key: the folder, whether its model.bin exists, whether it is the one on the card
        "models": {k: {"name": v["name"], "dir": v["dir"], "weights_present": weights_present(k), "loaded": _model_key == k} for k, v in MODELS.items()},
        "demucs": DEMUCS_MODEL,
        "demucs_loaded": _demucs is not None,
        "gpu": gpu_mem(),
        "weights_present": weights_present("default"),
    }


@app.post("/separate")
async def separate(file: UploadFile = File(...), stems: str = Form("two")):
    """Split a mix into stems with Demucs. `two` = vocals + no_vocals (the accompaniment summed); `four` = all htdemucs stems."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    work = tempfile.mkdtemp(prefix="sep-")
    try:
        src = os.path.join(work, "in" + (os.path.splitext(file.filename or "a.wav")[1] or ".wav"))
        with open(src, "wb") as f:
            f.write(data)
        wav = os.path.join(work, "in.wav")
        # decode anything ffmpeg understands to 44.1 kHz stereo for the model
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav], check=True, timeout=600)
        import torch  # type: ignore
        import soundfile as sf  # type: ignore
        from demucs.apply import apply_model  # type: ignore

        audio, sr = sf.read(wav, dtype="float32", always_2d=True)  # (frames, channels)
        t0 = time.time()
        m = demucs_model()
        with _demucs_lock, torch.no_grad():
            x = torch.from_numpy(audio.T).unsqueeze(0).to(next(m.parameters()).device)
            ref = x.mean(0)
            x = (x - ref.mean()) / (ref.std() + 1e-8)
            out = apply_model(m, x, shifts=1, split=True, overlap=0.25, progress=False)[0]
            out = out * (ref.std() + 1e-8) + ref.mean()
        names = list(m.sources)  # ['drums', 'bass', 'other', 'vocals'] for htdemucs
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            def put(name: str, tensor):
                b = io.BytesIO()
                sf.write(b, tensor.cpu().numpy().T, sr, format="WAV", subtype="PCM_16")
                z.writestr(f"{name}.wav", b.getvalue())
            vi = names.index("vocals")
            put("vocals", out[vi])
            if stems == "four":
                for i, n in enumerate(names):
                    if i != vi:
                        put(n, out[i])
            else:
                acc = sum(out[i] for i in range(len(names)) if i != vi)
                put("no_vocals", acc)
        return Response(content=buf.getvalue(), media_type="application/zip", headers={"X-Separation-Ms": str(int((time.time() - t0) * 1000)), "X-Demucs-Model": DEMUCS_MODEL})
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {e}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


def release_host_memory() -> dict[str, Any]:
    """Hand the heap the dropped models lived in back to the system: freed memory stays in glibc's arenas after gc
    (docs/research/MODEL-STACK-2026-10.md §1.2); malloc_trim(0) returns it. Reports resident memory after."""
    import gc

    gc.collect()
    trimmed = False
    try:
        import ctypes

        trimmed = bool(ctypes.CDLL("libc.so.6").malloc_trim(0))
    except Exception:  # noqa: BLE001
        pass
    rss_mb = None
    try:
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    rss_mb = int(line.split()[1]) // 1024
    except Exception:  # noqa: BLE001
        pass
    return {"malloc_trim": trimmed, "rss_mb": rss_mb}


@app.post("/unload")
def unload():
    global _model, _model_key, _demucs
    with _lock:
        _model = None
        _model_key = None
    with _demucs_lock:
        _demucs = None
    try:
        import gc

        gc.collect()
        import torch  # type: ignore

        torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem(), "host": release_host_memory()}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("auto"), prompt: str = Form(""), words: str = Form("1"), beam_size: int = Form(5)):
    if not weights_present("default"):
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
        # decode with ffmpeg to 16 kHz mono float32 and hand the samples over: independent of the PyAV version
        # faster-whisper happens to be paired with, and accepts every container ffmpeg does
        import numpy as np  # type: ignore

        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True, timeout=600).stdout
        audio = np.frombuffer(pcm, dtype=np.float32)
        if audio.size == 0:
            raise HTTPException(status_code=400, detail="no audio could be decoded from the file")
        key = model_key_for(lang)
        m = model(key)
        with _lock:
            segments, info = m.transcribe(audio, language=lang, task="transcribe", beam_size=beam_size, word_timestamps=words == "1", vad_filter=True, vad_parameters={"min_silence_duration_ms": 300}, initial_prompt=initial, condition_on_previous_text=False)
            out = []
            for s in segments:
                out.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3), "words": [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word, "probability": round(w.probability, 3)} for w in (s.words or [])]})
        return JSONResponse({"language": info.language, "language_probability": round(info.language_probability, 3), "duration": round(info.duration, 3), "segments": out, "text": " ".join(x["text"] for x in out).strip(), "ms": int((time.time() - t0) * 1000), "model": MODELS[key]["name"]})
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {e.stderr.decode(errors='ignore')[:200]}") from e
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

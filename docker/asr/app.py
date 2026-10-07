"""Audio analysis service — faster-whisper large-v3 (float16) with word timestamps and VAD, and Demucs stems.

POST /transcribe  multipart: file, language (ar|en|auto), prompt (optional), words (1|0)  -> JSON segments/words
POST /separate    multipart: file, stems (two|four)  -> zip of WAV stems (vocals + no_vocals, or the four htdemucs stems)
POST /unload      drop the models from the GPU (the worker calls this when another family needs the card)
GET  /health      model names, loaded flags, GPU memory, and per-capability availability (with the reason when not)
POST /align       multipart: file, text, language (en|ar), start/end (optional, seconds), chars (1|0) -> word/char times
                  of the KNOWN text (wav2vec2 CTC forced alignment, align.py; CUDA when available, else CPU)
POST /qa/mouth    multipart: video, audio (optional; else the video's own track), audio_offset (s), windows (JSON,
                  optional), fps, mode (speech|singing), speakers, max_lag_ms -> per face track mouth activity vs
                  speech (qa.py, CPU)
POST /qa/identity multipart: video, references (one or more images), characters (JSON: ids in file order, or
                  {filename: id}), sample_fps -> SFace cosine series per character against its canonical image (qa.py, CPU)

align.py and qa.py are imported lazily-safe: if either module or one of its dependencies (transformers, mediapipe,
opencv) is missing, the service still starts, transcription and separation keep working, and /health says why the
capability is unavailable; the endpoint answers 503 with that reason.

Two Whisper models, one on the card at a time (docs/research/MODEL-STACK-2026-10.md §3.9, §7.2): ASR_MODEL_DIR serves
every language; ASR_MODEL_DIR_AR (the CTranslate2 copy of whisper-large-v3-arabic-dialectal-v2) serves `language=ar`
when its model.bin exists. Each is loaded lazily on first use, and loading one drops the other first. The response's
`model` says which one transcribed.
"""
from __future__ import annotations

import io
import json
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
from starlette.concurrency import run_in_threadpool

# alignment and picture QA: optional capabilities; a missing module or dependency must not stop the service
try:
    import align as align_mod  # type: ignore
    _align_import_error: str | None = None
except Exception as _e:  # noqa: BLE001
    align_mod = None  # type: ignore[assignment]
    _align_import_error = f"{type(_e).__name__}: {_e}"
try:
    import qa as qa_mod  # type: ignore
    _qa_import_error: str | None = None
except Exception as _e:  # noqa: BLE001
    qa_mod = None  # type: ignore[assignment]
    _qa_import_error = f"{type(_e).__name__}: {_e}"
# Qwen3-ASR-1.7B, the primary recogniser (qwen3asr.py); Whisper stays as the reference
try:
    import qwen3asr as qwen_mod  # type: ignore
    _qwen_import_error: str | None = None
except Exception as _e:  # noqa: BLE001
    qwen_mod = None  # type: ignore[assignment]
    _qwen_import_error = f"{type(_e).__name__}: {_e}"
# the Iraqi phonology gate's ear (phonemes.py): which consonant a dialect word was spoken with
try:
    import phonemes as phon_mod  # type: ignore
    _phon_import_error: str | None = None
except Exception as _e:  # noqa: BLE001
    phon_mod = None  # type: ignore[assignment]
    _phon_import_error = f"{type(_e).__name__}: {_e}"
# the letters whose sound the gate checks: Iraqi چ (/tʃ/) and گ (/ɡ/)
DIALECT_LETTERS = ("چ", "گ")

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
        "capabilities": capabilities(),
    }


def capabilities() -> dict[str, Any]:
    """Per capability: {available, reason} (and model details), without importing torch, transformers or mediapipe."""
    out: dict[str, Any] = {}
    if align_mod is None:
        out["align"] = {lang: {"available": False, "reason": f"align.py could not be imported ({_align_import_error})"} for lang in ("en", "ar")}
    else:
        try:
            out["align"] = align_mod.status()
        except Exception as e:  # noqa: BLE001
            out["align"] = {lang: {"available": False, "reason": f"status failed: {e}"} for lang in ("en", "ar")}
    if qa_mod is None:
        why = f"qa.py could not be imported ({_qa_import_error})"
        out["qa_mouth"] = {"available": False, "reason": why}
        out["qa_identity"] = {"available": False, "reason": why}
        out["syncnet"] = {"available": False, "reason": why}
    else:
        try:
            st = qa_mod.status()
            out["qa_mouth"], out["qa_identity"], out["syncnet"] = st["mouth"], st["identity"], st["syncnet"]
        except Exception as e:  # noqa: BLE001
            out["qa_mouth"] = out["qa_identity"] = out["syncnet"] = {"available": False, "reason": f"status failed: {e}"}
    out["qwen3_asr"] = qwen_mod.status() if qwen_mod is not None else {"available": False, "reason": f"qwen3asr.py could not be imported ({_qwen_import_error})"}
    out["phonemes"] = phon_mod.status() if phon_mod is not None else {"available": False, "reason": f"phonemes.py could not be imported ({_phon_import_error})"}
    return out


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
    for mod in (align_mod, qa_mod, qwen_mod, phon_mod):
        if mod is not None:
            try:
                mod.unload()
            except Exception:  # noqa: BLE001
                pass
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


@app.post("/transcribe_qwen")
async def transcribe_qwen(file: UploadFile = File(...), language: str = Form("auto")):
    """Qwen3-ASR-1.7B: the text and the language the model DETECTED (language=auto, the default and the check), or a
    forced language (ar|en; detected_language is then null — a forced run can translate, never trust it as a check).
    Text only: word times come from /align (CTC) or Whisper."""
    if qwen_mod is None:
        raise HTTPException(status_code=503, detail=f"Qwen3-ASR is not available: {_qwen_import_error}")
    if not qwen_mod.weights_present():
        raise HTTPException(status_code=503, detail=qwen_mod.status()["reason"])
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(file.filename or "a.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        import numpy as np  # type: ignore

        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True, timeout=600).stdout
        audio = np.frombuffer(pcm, dtype=np.float32)
        if audio.size == 0:
            raise HTTPException(status_code=400, detail="no audio could be decoded from the file")
        lang = None if language in ("", "auto") else language
        if lang not in (None, "ar", "en"):
            raise HTTPException(status_code=400, detail="language must be auto, ar or en")
        out = await run_in_threadpool(qwen_mod.transcribe, audio, lang)
        return JSONResponse({**out, "duration": round(audio.size / 16000, 3)})
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {e.stderr.decode(errors='ignore')[:200]}") from e
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


# ------------------------------------------------------------------------------------------------ alignment and QA


def _float_or_none(v: str, name: str) -> float | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        x = float(v)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"{name} must be a number") from e
    if x != x or x in (float("inf"), float("-inf")) or x < 0:
        raise HTTPException(status_code=400, detail=f"{name} must be a finite number ≥ 0")
    return x


async def _save(upload: UploadFile, work: str, name: str) -> str:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"empty file: {name}")
    path = os.path.join(work, name + (os.path.splitext(upload.filename or "")[1] or ".bin"))
    with open(path, "wb") as f:
        f.write(data)
    return path


@app.post("/align")
async def align_endpoint(file: UploadFile = File(...), text: str = Form(...), language: str = Form("en"), start: str = Form(""), end: str = Form(""), chars: str = Form("1")):
    """Word and character times of the KNOWN text in the audio (CTC forced alignment, align.py)."""
    if align_mod is None:
        raise HTTPException(status_code=503, detail=f"alignment unavailable: align.py could not be imported ({_align_import_error})")
    lang = (language or "").strip().lower()
    if lang not in ("en", "ar"):
        raise HTTPException(status_code=400, detail="language must be en or ar")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    st = align_mod.status()[lang]
    if not st["available"]:
        raise HTTPException(status_code=503, detail=f"alignment ({lang}) unavailable: {st['reason']}")
    t_start, t_end = _float_or_none(start, "start"), _float_or_none(end, "end")
    if t_start is not None and t_end is not None and t_end <= t_start:
        raise HTTPException(status_code=400, detail="end must be after start")
    work = tempfile.mkdtemp(prefix="align-")
    try:
        src = await _save(file, work, "in")
        cmd = ["ffmpeg", "-v", "error"]
        if t_start is not None:
            cmd += ["-ss", f"{t_start:.3f}"]
        if t_end is not None:
            cmd += ["-t", f"{t_end - (t_start or 0.0):.3f}"]
        cmd += ["-i", src, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]
        import numpy as np  # type: ignore

        pcm = subprocess.run(cmd, check=True, capture_output=True, timeout=600).stdout
        audio = np.frombuffer(pcm, dtype=np.float32)
        if audio.size == 0:
            raise HTTPException(status_code=400, detail="no audio could be decoded from the file (or the window is empty)")
        try:
            out = await run_in_threadpool(align_mod.align_audio, audio, text, lang, t_start or 0.0)
        except align_mod.AlignmentUnavailable as e:
            raise HTTPException(status_code=503, detail=f"alignment ({lang}) unavailable: {e}") from e
        except align_mod.AlignmentError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        if chars != "1":
            out.pop("chars", None)
        return JSONResponse(out)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {e.stderr.decode(errors='ignore')[:200]}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/qa/phonemes")
async def qa_phonemes(file: UploadFile = File(...), text: str = Form(...), language: str = Form("ar"), every: str = Form("0")):
    """The phonemes heard in each dialect word of a KNOWN Arabic line: the line is force-aligned (align.py) and the
    span of every word holding چ or گ (every=1: every word) is read by the phoneme recogniser (phonemes.py). Reports
    only what was heard; the studio judges it (src/server/media/iraqi-phonology.ts)."""
    if phon_mod is None:
        raise HTTPException(status_code=503, detail=f"phoneme recognition unavailable: {_phon_import_error}")
    if not phon_mod.weights_present():
        raise HTTPException(status_code=503, detail=phon_mod.status()["reason"])
    if align_mod is None:
        raise HTTPException(status_code=503, detail=f"alignment unavailable: {_align_import_error}")
    if (language or "").strip().lower() != "ar":
        raise HTTPException(status_code=400, detail="the phonology gate reads Arabic lines (language=ar)")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    work = tempfile.mkdtemp(prefix="phon-")
    try:
        src = await _save(file, work, "in")
        import numpy as np  # type: ignore

        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True, timeout=600).stdout
        audio = np.frombuffer(pcm, dtype=np.float32)
        if audio.size == 0:
            raise HTTPException(status_code=400, detail="no audio could be decoded from the file")
        try:
            al = await run_in_threadpool(align_mod.align_audio, audio, text, "ar", 0.0)
        except align_mod.AlignmentUnavailable as e:
            raise HTTPException(status_code=503, detail=f"alignment (ar) unavailable: {e}") from e
        except align_mod.AlignmentError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        words = al["words"]
        want = None if every == "1" else [k for k, w in enumerate(words) if any(ch in (w.get("text") or "") for ch in DIALECT_LETTERS)]
        t0 = time.time()
        heard = await run_in_threadpool(phon_mod.word_phonemes, audio, words, want)
        return JSONResponse({"model": phon_mod.NAME, "align_model": al.get("model"), "coverage": al.get("coverage"), "words": heard, "duration": round(audio.size / 16000, 3), "ms": int((time.time() - t0) * 1000)})
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {e.stderr.decode(errors='ignore')[:200]}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/qa/mouth")
async def qa_mouth(video: UploadFile = File(...), audio: UploadFile | None = File(None), windows: str = Form(""), fps: str = Form(""), mode: str = Form("speech"), speakers: int = Form(1), max_lag_ms: float = Form(200), audio_offset: float = Form(0.0)):
    """Tier-1 lip-sync check: mouth activity of every face track against the speech of the audio that plays in the cut."""
    if qa_mod is None:
        raise HTTPException(status_code=503, detail=f"mouth QA unavailable: qa.py could not be imported ({_qa_import_error})")
    st = qa_mod.status()["mouth"]
    if not st["available"]:
        raise HTTPException(status_code=503, detail=f"mouth QA unavailable: {st['reason']}")
    try:
        win = json.loads(windows) if windows.strip() else None
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"windows is not JSON: {e}") from e
    f = _float_or_none(fps, "fps")
    if f is not None and not (1 <= f <= 120):
        raise HTTPException(status_code=400, detail="fps must be within 1–120")
    if not (0 <= max_lag_ms <= 2000) or not (0 <= speakers <= 8) or not (-600 <= audio_offset <= 600):
        raise HTTPException(status_code=400, detail="max_lag_ms must be within 0–2000, speakers within 0–8 and audio_offset within ±600 s")
    work = tempfile.mkdtemp(prefix="qa-mouth-")
    try:
        vpath = await _save(video, work, "video")
        apath = await _save(audio, work, "audio") if audio is not None else None
        try:
            out = await run_in_threadpool(qa_mod.mouth_check, vpath, apath, win, f, mode, speakers, max_lag_ms, audio_offset)
        except qa_mod.QaUnavailable as e:
            raise HTTPException(status_code=503, detail=f"mouth QA unavailable: {e}") from e
        except qa_mod.QaInputError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return JSONResponse(out)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {(e.stderr or b'').decode(errors='ignore')[:200]}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/qa/faces")
async def qa_faces(image: UploadFile = File(...)):
    """YuNet face boxes on one picture, in its own pixels (a derived face reference is cut from them)."""
    if qa_mod is None:
        raise HTTPException(status_code=503, detail=f"face detection unavailable: qa.py could not be imported ({_qa_import_error})")
    st = qa_mod.status()["identity"]
    if not st["available"]:
        raise HTTPException(status_code=503, detail=f"face detection unavailable: {st['reason']}")
    work = tempfile.mkdtemp(prefix="qa-faces-")
    try:
        path = await _save(image, work, "image")
        try:
            out = await run_in_threadpool(qa_mod.faces_in_image, path)
        except qa_mod.QaUnavailable as e:
            raise HTTPException(status_code=503, detail=f"face detection unavailable: {e}") from e
        except qa_mod.QaInputError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return JSONResponse(out)
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/qa/identity")
async def qa_identity(video: UploadFile = File(...), references: list[UploadFile] = File(...), characters: str = Form(...), sample_fps: float = Form(2.0)):
    """SFace cosine of each character's canonical face against the faces of sampled frames."""
    if qa_mod is None:
        raise HTTPException(status_code=503, detail=f"identity QA unavailable: qa.py could not be imported ({_qa_import_error})")
    st = qa_mod.status()["identity"]
    if not st["available"]:
        raise HTTPException(status_code=503, detail=f"identity QA unavailable: {st['reason']}")
    if not (0.1 <= sample_fps <= 30):
        raise HTTPException(status_code=400, detail="sample_fps must be within 0.1–30")
    try:
        mapping = json.loads(characters)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"characters is not JSON: {e}") from e
    if isinstance(mapping, list):
        if len(mapping) != len(references):
            raise HTTPException(status_code=400, detail=f"characters lists {len(mapping)} ids for {len(references)} reference files")
        ids = [str(x) for x in mapping]
    elif isinstance(mapping, dict):
        missing = [r.filename for r in references if (r.filename or "") not in mapping]
        if missing:
            raise HTTPException(status_code=400, detail=f"characters has no id for reference file(s): {missing}")
        ids = [str(mapping[r.filename or ""]) for r in references]
    else:
        raise HTTPException(status_code=400, detail="characters must be a JSON array or object")
    if len(set(ids)) != len(ids) or any(not i for i in ids):
        raise HTTPException(status_code=400, detail="character ids must be non-empty and unique (one canonical image each)")
    work = tempfile.mkdtemp(prefix="qa-id-")
    try:
        vpath = await _save(video, work, "video")
        refs = {cid: await _save(r, work, f"ref-{k}") for k, (cid, r) in enumerate(zip(ids, references))}
        try:
            out = await run_in_threadpool(qa_mod.identity_check, vpath, refs, sample_fps)
        except qa_mod.QaUnavailable as e:
            raise HTTPException(status_code=503, detail=f"identity QA unavailable: {e}") from e
        except qa_mod.QaInputError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return JSONResponse(out)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"the file could not be decoded: {(e.stderr or b'').decode(errors='ignore')[:200]}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)

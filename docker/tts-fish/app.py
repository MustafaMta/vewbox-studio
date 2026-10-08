"""FISH AUDIO S2 PRO — EVALUATION ONLY, NOT COMMERCIAL-SAFE (Fish Audio Research License: research and non-commercial
use; commercial use needs a separate licence from Fish Audio). Profile `fish`; never part of `up`; the app routes to it
only when the Voice Studio's evaluation mode is on (docs/VOICE-ENGINE.md).

The model is loaded by upstream's own ModelManager and called through upstream's own inference wrapper — the exact
code path of `tools/api_server.py` POST /v1/tts (fishaudio/fish-speech @ FISH_COMMIT, non-streaming) — so a result here
is what upstream gives. This file only adds the studio's contract around it:

POST /synthesize  multipart: text (inline [tags] and <|speaker:i|> pass through unchanged), language, reference (audio),
                  reference_text, seed?, temperature? (0.1-1, 0.8), top_p? (0.1-1, 0.8), repetition_penalty? (0.9-2, 1.1),
                  chunk_length? (100-1000, 200), max_new_tokens? (64-4096, 1024), normalize? (true)
                  -> audio/wav PCM-16 (true peak <= -1 dBTP, the live services' limiter); headers x-sample-rate,
                     x-duration, x-engine, x-model, x-engine-version, x-seed, x-params, x-true-peak, x-gain-reduction,
                     x-input-true-peak, x-ms, x-peak-vram-mb, x-license
POST /unload      stop upstream's model thread (its queue's None) and drop the decoder: the GPU lease calls it
GET  /health      loaded, weights present, licence, GPU memory

One call = one output: no engine-internal retry, no best-of-N.
"""
from __future__ import annotations

import io
import json
import os
import random
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from vewbox_tts_shared import _parse_number, _pkg_version, check_reference, gpu_mem, limit_peaks, seed_everything  # noqa: E402

FISH_ROOT = os.environ.get("FISH_ROOT", "/opt/fish-speech")
sys.path.insert(0, FISH_ROOT)
MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models")
CKPT = Path(MODEL_ROOT) / "tts" / "fish-s2-pro"
FISH_COMMIT = os.environ.get("FISH_COMMIT", "214da3cd841bda85da2496b96cd3c4d7edb1337e")
MODEL = "fishaudio/s2-pro@1de9996"
LICENSE = "Fish Audio Research License (non-commercial; evaluation only)"
WEIGHTS = ["codec.pth", "model-00001-of-00002.safetensors", "model-00002-of-00002.safetensors", "tokenizer.json", "config.json", "model.safetensors.index.json", "tokenizer_config.json", "special_tokens_map.json", "chat_template.jinja"]
ENGINE_VERSION = f"fish-speech@{FISH_COMMIT[:7]}; {MODEL}; torch {_pkg_version('torch')}"

app = FastAPI(title="vewbox-tts-fish")
_lock = threading.Lock()
_manager: Any = None


def missing_weights() -> list[str]:
    return [f for f in WEIGHTS if not (CKPT / f).is_file()]


def torch_peak_mb() -> int | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return int(torch.cuda.max_memory_reserved() / 1048576)
    except Exception:  # noqa: BLE001
        pass
    return None


def manager():
    """Upstream's ModelManager, exactly as tools/api_server.py builds it (mode tts, bf16, no compile: the lease unloads
    the model whenever another family takes the card, and a compile would repeat after every reload)."""
    global _manager
    with _lock:
        if _manager is None:
            from tools.server.model_manager import ModelManager  # type: ignore

            t0 = time.time()
            _manager = ModelManager(mode="tts", device="cuda", half=False, compile=os.environ.get("FISH_COMPILE") == "1",
                                    llama_checkpoint_path=str(CKPT), decoder_checkpoint_path=str(CKPT / "codec.pth"), decoder_config_name="modded_dac_vq")
            print(f"[fish] loaded {MODEL} in {time.time() - t0:.1f}s (warm-up included); peak {torch_peak_mb()} MB", flush=True)
        return _manager


@app.get("/health")
def health():
    missing = missing_weights()
    return {"ok": True, "engine": "fish-s2-pro", "model": MODEL, "license": LICENSE, "commercial_use": False, "loaded": _manager is not None,
            "engine_version": ENGINE_VERSION, "weights_present": not missing, "missing": missing, "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb()}


@app.post("/unload")
def unload():
    global _manager
    with _lock:
        m = _manager
        _manager = None
        if m is not None:
            try:
                m.llama_queue.put(None)  # upstream's worker loop ends on None; its model and caches go with it
            except Exception:  # noqa: BLE001
                pass
            m.tts_inference_engine = None
            m.decoder_model = None
    import gc

    gc.collect()
    time.sleep(0.5)
    gc.collect()
    try:
        import torch  # type: ignore

        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass
    rss_mb = None
    try:
        import ctypes

        ctypes.CDLL("libc.so.6").malloc_trim(0)
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    rss_mb = int(line.split()[1]) // 1024
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem(), "host": {"rss_mb": rss_mb}}


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...), language: str = Form("en"), dialect: str = Form(""), engine_name: str = Form("", alias="engine"),
    reference: UploadFile = File(...), reference_text: str = Form(""), seed: str = Form(""),
    temperature: str = Form(""), top_p: str = Form(""), repetition_penalty: str = Form(""), chunk_length: str = Form(""),
    max_new_tokens: str = Form(""), normalize: str = Form(""), raw: str = Form(""),
):
    missing = missing_weights()
    if missing:
        raise HTTPException(status_code=503, detail=f"Fish S2 Pro weights are not in the store (manifest group eval-tts-fish-s2-pro): {', '.join(missing)}")
    if engine_name and engine_name != "fish-s2-pro":
        raise HTTPException(status_code=400, detail=f"this service runs fish-s2-pro, not {engine_name}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text longer than 2000 characters; split it")
    if not reference_text.strip():
        raise HTTPException(status_code=400, detail="reference_text is required: S2 Pro clones from the recording and its transcript")
    params: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True)),
        "temperature": _parse_number(temperature, "temperature", 0.1, 1.0, 0.8),
        "top_p": _parse_number(top_p, "top_p", 0.1, 1.0, 0.8),
        "repetition_penalty": _parse_number(repetition_penalty, "repetition_penalty", 0.9, 2.0, 1.1),
        "chunk_length": int(_parse_number(chunk_length, "chunk_length", 100, 1000, 200, integer=True)),
        "max_new_tokens": int(_parse_number(max_new_tokens, "max_new_tokens", 64, 4096, 1024, integer=True)),
        "normalize": normalize.strip().lower() not in ("0", "false", "no", "off"),
    }
    data = await reference.read()
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="reference recording is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref_path = f.name
    try:
        ref_info = check_reference(ref_path)
        from fish_speech.utils.schema import ServeReferenceAudio, ServeTTSRequest  # type: ignore
        from tools.server.inference import inference_wrapper  # type: ignore

        m = manager()
        req = ServeTTSRequest(text=text, references=[ServeReferenceAudio(audio=data, text=reference_text.strip())], seed=params["seed"], format="wav", streaming=False,
                              temperature=params["temperature"], top_p=params["top_p"], repetition_penalty=params["repetition_penalty"],
                              chunk_length=params["chunk_length"], max_new_tokens=params["max_new_tokens"], normalize=params["normalize"])
        t0 = time.time()
        with _lock:
            try:
                import torch  # type: ignore

                if torch.cuda.is_available() and torch.cuda.is_initialized():
                    torch.cuda.reset_peak_memory_stats()  # this request's peak (the loaded weights included)
                seed_everything(params["seed"])
                engine = m.tts_inference_engine
                sr = int(engine.decoder_model.sample_rate)
                wav = np.asarray(next(inference_wrapper(req, engine)), dtype=np.float32).reshape(-1)  # upstream /v1/tts: next(inference(req, engine))
            except HTTPException:
                raise
            except Exception as ex:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"fish failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
        ms = int((time.time() - t0) * 1000)
        if wav.size == 0 or not np.isfinite(wav).all():
            raise HTTPException(status_code=500, detail="the engine returned no usable audio")
        # RAW (listening comparisons): the engine's samples as produced — no limiter, 32-bit float
        is_raw = raw.strip().lower() in ("1", "true", "yes")
        lim = {"input_true_peak_db": float("nan"), "output_true_peak_db": float("nan"), "gain_reduction_db": 0.0} if is_raw else None
        if not is_raw:
            wav, lim = limit_peaks(wav, sr)
        buf = io.BytesIO()
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="FLOAT" if is_raw else "PCM_16", format="WAV") as out:
            out.software = "vewbox-tts fish-s2-pro (evaluation)"
            out.comment = f"synthetic speech; engine=fish-s2-pro; seed={params['seed']}; not a voice reference; {LICENSE}"
            out.write(wav)
        dur = wav.shape[0] / sr
        print(f"[fish] {language} {len(text)} chars seed {params['seed']} -> {dur:.2f}s in {ms} ms (RTF {ms / 1000 / max(dur, 1e-3):.2f}); peak in {lim['input_true_peak_db']:.1f} dBTP; ref {ref_info['seconds']:.1f}s; vram peak {torch_peak_mb()} MB", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers={
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": "fish-s2-pro", "x-model": MODEL, "x-ms": str(ms),
            "x-engine-version": ENGINE_VERSION, "x-seed": str(params["seed"]), "x-params": json.dumps(params),
            "x-true-peak": f"{lim['output_true_peak_db']:.2f}", "x-gain-reduction": f"{lim['gain_reduction_db']:.2f}", "x-input-true-peak": f"{lim['input_true_peak_db']:.2f}",
            "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-license": "fish-audio-research-non-commercial", "x-raw": "1" if is_raw else "0",
        })
    finally:
        try:
            os.unlink(ref_path)
        except OSError:
            pass

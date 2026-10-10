"""VEWBOX-IQ — the studio's Iraqi (Baghdadi) voice renderer: Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT)
with the Vewbox-IQ adaptation when a checkpoint is given (docs/VEWBOX-IQ.md, docs/research/iraqi-voice-production.md).
Profile `iq`; never part of `up`; the studio reaches it through the evaluation registry
(src/server/providers/voice-eval-engines.ts, engine id `vewbox-iq`) — never pickEngine — until a native listener passes it.

The model is loaded by the library's own `from_local(..., t3_model="v3")` (docker/tts-iq/iq_model.py: the v3 T3 file,
verified; S3Gen selectable by IQ_S3GEN) and called through the library's own `generate` — the code path of the official
V3 Space — so a result here is what upstream gives plus the adaptation. This file only adds the studio's contract:

POST /synthesize  multipart: text, language (ar|en → language_id), reference (audio → audio_prompt_path), reference_text
                  (accepted, unused: the model clones from audio alone), seed?, exaggeration? (0-2, 0.5), cfg_weight?
                  (0-1, 0.5), temperature? (0.05-2, 0.8), repetition_penalty? (1-2, 1.2), min_p? (0-1, 0.05), top_p? (0-1, 1.0),
                  speed? (accepted for parity; no duration control exists — a value other than 1 is reported, not applied),
                  raw? (1 = 32-bit float, no limiter)
                  -> audio/wav 24 kHz; headers x-sample-rate, x-duration, x-engine, x-model, x-engine-version, x-seed,
                     x-params, x-true-peak, x-gain-reduction, x-input-true-peak, x-ms, x-peak-vram-mb, x-license, x-raw,
                     x-watermark
POST /unload      drop the model from the card: the GPU lease calls it
GET  /health      loaded, weights present, base + S3Gen + adapter + revisions, watermark note, licence, GPU memory

One call = one generation (max_new_tokens 1000 = 40 s inside the library): no engine-internal retry, no best-of-N. The
seed is applied to torch/cuda/random before generate, so the same request gives the same take. No secrets: the weights
are local; the environment is never printed.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vewbox_tts_shared import _parse_number, _pkg_version, check_reference, gpu_mem, limit_peaks  # noqa: E402

import iq_model  # noqa: E402

ENGINE = "vewbox-iq"
BASE_DIR = iq_model.default_base_dir()
S3GEN_FILE = iq_model.s3gen_choice()
ADAPTER_DIR = (os.environ.get("IQ_ADAPTER_DIR") or "").strip() or None
LANGUAGES = {"ar": "ar", "en": "en"}  # the studio's codes are the library's language_id values
ENGINE_VERSION = f"chatterbox@{iq_model.CODE_COMMIT[:7]}; ResembleAI/chatterbox@{iq_model.BASE_REVISION[:8]} t3 v3 + {S3GEN_FILE}; adapter {Path(ADAPTER_DIR).name if ADAPTER_DIR else 'none'}; torch {_pkg_version('torch')}; transformers {_pkg_version('transformers')}; peft {_pkg_version('peft') or '-'}"

app = FastAPI(title="vewbox-tts-iq")
_lock = threading.Lock()
_model: Any = None
_base_info: dict[str, Any] | None = None
_adapter_info: dict[str, Any] | None = None


def missing_weights() -> list[str]:
    return iq_model.missing_base_files(BASE_DIR, S3GEN_FILE)


def adapter_problem() -> str | None:
    if not ADAPTER_DIR:
        return None
    try:
        iq_model.detect_adapter(Path(ADAPTER_DIR))
        return None
    except Exception as ex:  # noqa: BLE001
        return str(ex)


def torch_peak_mb() -> int | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return int(torch.cuda.max_memory_reserved() / 1048576)
    except Exception:  # noqa: BLE001
        pass
    return None


def model():
    global _model, _base_info, _adapter_info
    with _lock:
        if _model is None:
            t0 = time.time()
            m, info = iq_model.load_base(BASE_DIR, "cuda", S3GEN_FILE)
            ad = iq_model.apply_adapter(m, Path(ADAPTER_DIR), "cuda") if ADAPTER_DIR else None
            _model, _base_info, _adapter_info = m, info, ad
            print(f"[iq] loaded {iq_model.model_label(info, ad)} in {time.time() - t0:.1f}s; s3gen {S3GEN_FILE}; adapter {ad['form'] if ad else 'none'}; peak {torch_peak_mb()} MB", flush=True)
        return _model


def model_name() -> str:
    return iq_model.model_label(_base_info or {"s3gen_file": S3GEN_FILE}, _adapter_info if _model is not None else ({"adapter_dir": ADAPTER_DIR, "provenance": None} if ADAPTER_DIR else None))


@app.get("/health")
def health():
    missing = missing_weights()
    return {
        "ok": True, "engine": ENGINE, "model": model_name(), "engine_version": ENGINE_VERSION, "license": iq_model.LICENSE, "commercial_use": True,
        "evaluation_only": True, "loaded": _model is not None, "weights_present": not missing, "missing": missing,
        "base": _base_info or {"base_dir": str(BASE_DIR), "base_repo": "ResembleAI/chatterbox", "base_revision": iq_model.BASE_REVISION, "code": f"resemble-ai/chatterbox@{iq_model.CODE_COMMIT}", "t3_file": iq_model.T3_FILE, "s3gen_file": S3GEN_FILE, "load_path": "ChatterboxMultilingualTTS.from_local(t3_model='v3')"},
        "adapter": _adapter_info or ({"adapter_dir": ADAPTER_DIR, "loaded": False, "problem": adapter_problem()} if ADAPTER_DIR else None),
        "watermark": iq_model.WATERMARK, "languages": sorted(LANGUAGES), "sample_rate": 24000, "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb(),
    }


@app.post("/unload")
def unload():
    global _model, _base_info, _adapter_info
    with _lock:
        _model = None
        _base_info = None
        _adapter_info = None
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
    reference: UploadFile = File(...), reference_text: str = Form(""), seed: str = Form(""), speed: str = Form(""),
    exaggeration: str = Form(""), cfg_weight: str = Form(""), temperature: str = Form(""), repetition_penalty: str = Form(""), min_p: str = Form(""), top_p: str = Form(""),
    raw: str = Form(""),
    # the pack rule (iq_model.prepare_dual_conditionals): `reference` stays the identity (speaker embedding + S3Gen reference);
    # `prompt_reference`, when sent, supplies the T3 speech-prompt tokens alone (an Arabic clip of the same identity)
    prompt_reference: UploadFile | None = File(None),
):
    missing = missing_weights()
    if missing:
        raise HTTPException(status_code=503, detail=f"Chatterbox Multilingual V3 weights are not in the store (manifest group voice-chatterbox-mtl-v3): {', '.join(missing)}")
    bad = adapter_problem()
    if bad:
        raise HTTPException(status_code=503, detail=f"IQ_ADAPTER_DIR is not a Vewbox-IQ checkpoint: {bad}")
    if engine_name and engine_name != ENGINE:
        raise HTTPException(status_code=400, detail=f"this service runs {ENGINE}, not {engine_name}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text longer than 2000 characters; split it")
    lang = LANGUAGES.get(language.strip().lower())
    if lang is None:
        raise HTTPException(status_code=400, detail=f"language must be ar or en (got {language!r}); Iraqi is the adaptation, not a tag — send ar with Baghdadi spelling")
    params: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True)),
        "exaggeration": _parse_number(exaggeration, "exaggeration", 0.0, 2.0, 0.5),
        "cfg_weight": _parse_number(cfg_weight, "cfg_weight", 0.0, 1.0, 0.5),
        "temperature": _parse_number(temperature, "temperature", 0.05, 2.0, 0.8),
        "repetition_penalty": _parse_number(repetition_penalty, "repetition_penalty", 1.0, 2.0, 1.2),
        "min_p": _parse_number(min_p, "min_p", 0.0, 1.0, 0.05),
        "top_p": _parse_number(top_p, "top_p", 0.0, 1.0, 1.0),
    }
    speed_v = _parse_number(speed, "speed", 0.5, 2.0, 1.0)
    data = await reference.read()
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="reference recording is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref_path = f.name
    prompt_path: str | None = None
    if prompt_reference is not None:
        pdata = await prompt_reference.read()
        if len(pdata) >= 1000:
            with tempfile.NamedTemporaryFile(suffix=os.path.splitext(prompt_reference.filename or "prompt.wav")[1] or ".wav", delete=False) as f:
                f.write(pdata)
                prompt_path = f.name
    dual: dict[str, Any] | None = None
    try:
        ref_info = check_reference(ref_path)
        if prompt_path:
            check_reference(prompt_path)
        m = model()
        t0 = time.time()
        with _lock:
            try:
                import torch  # type: ignore

                if torch.cuda.is_available() and torch.cuda.is_initialized():
                    torch.cuda.reset_peak_memory_stats()  # this request's peak (the loaded weights included)
                iq_model.seed_everything(params["seed"])
                if prompt_path:
                    dual = iq_model.prepare_dual_conditionals(m, ref_path, prompt_path, params["exaggeration"])
                out = m.generate(text, language_id=lang, audio_prompt_path=None if prompt_path else ref_path, exaggeration=params["exaggeration"], cfg_weight=params["cfg_weight"],
                                 temperature=params["temperature"], repetition_penalty=params["repetition_penalty"], min_p=params["min_p"], top_p=params["top_p"])
                wav = np.asarray(out.detach().float().cpu().numpy(), dtype=np.float32).reshape(-1)
                sr = int(m.sr)
            except HTTPException:
                raise
            except (AssertionError, ValueError) as ex:
                raise HTTPException(status_code=400, detail=f"vewbox-iq refused the input: {str(ex)[:300]}") from ex
            except Exception as ex:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"vewbox-iq failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
        ms = int((time.time() - t0) * 1000)
        if wav.size == 0 or not np.isfinite(wav).all():
            raise HTTPException(status_code=500, detail="the engine returned no usable audio")
        # RAW (listening comparisons): the engine's samples as produced — no limiter, 32-bit float
        is_raw = raw.strip().lower() in ("1", "true", "yes")
        lim = {"input_true_peak_db": float("nan"), "output_true_peak_db": float("nan"), "gain_reduction_db": 0.0} if is_raw else None
        if not is_raw:
            wav, lim = limit_peaks(wav, sr)
        label = model_name()
        buf = io.BytesIO()
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="FLOAT" if is_raw else "PCM_16", format="WAV") as out_file:
            out_file.software = f"vewbox-tts {ENGINE}"
            out_file.comment = f"synthetic speech; engine={ENGINE}; model={label}; seed={params['seed']}; not a voice reference; perth watermark; {iq_model.LICENSE}"
            out_file.write(wav)
        dur = wav.shape[0] / sr
        prompt_note = f"; prompt tokens from a {dual['prompt_seconds']} s clip" if dual else ""
        print(f"[iq] {lang} {len(text)} chars seed {params['seed']} -> {dur:.2f}s in {ms} ms (RTF {ms / 1000 / max(dur, 1e-3):.2f}); peak in {lim['input_true_peak_db']:.1f} dBTP; ref {ref_info['seconds']:.1f}s{prompt_note}; exaggeration {params['exaggeration']} cfg {params['cfg_weight']}{'; speed ignored' if speed_v != 1.0 else ''}; vram peak {torch_peak_mb()} MB", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers={
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": ENGINE, "x-model": label, "x-ms": str(ms),
            **({"x-prompt-reference": json.dumps(dual)} if dual else {}),
            "x-engine-version": ENGINE_VERSION, "x-seed": str(params["seed"]), "x-params": json.dumps(params),
            "x-true-peak": f"{lim['output_true_peak_db']:.2f}", "x-gain-reduction": f"{lim['gain_reduction_db']:.2f}", "x-input-true-peak": f"{lim['input_true_peak_db']:.2f}",
            "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-license": "mit-chatterbox-mtl-v3-vewbox-iq", "x-raw": "1" if is_raw else "0", "x-watermark": "perth-implicit",
            **({"x-speed-ignored": f"{speed_v:g}"} if speed_v != 1.0 else {}),
        })
    finally:
        for p in (ref_path, prompt_path):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass

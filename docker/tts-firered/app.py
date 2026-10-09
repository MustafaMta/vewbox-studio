"""FIREREDTTS3-BASE — EVALUATION ONLY (Apache-2.0 LICENSE; the README's Usage Disclaimer says zero-shot cloning is
"intended solely for academic research purposes" — noted, decided by the producer, never inferred). Profile `firered`;
never part of `up`; the studio reaches it only through the evaluation registry (src/server/providers/voice-eval-engines.ts)
— never pickEngine (docs/VOICE-ENGINE.md, docs/research/FIREREDTTS3-INTEGRATION-2026-10.md).

The model is loaded and called through upstream's own `fireredtts3.core.FireRedTTS3.generate` (FireRedTeam/FireRedTTS3
@ FIRERED_COMMIT) — the code path of its README example and gradio_base.py — so a result here is what upstream gives,
with two documented deviations: PyTorch SDPA instead of flash-attn (no sm_120 wheel; §3 of the research note) and no
text front-end (the studio prepares the line; upstream's wetext/fastText/LLM normalisers are not installed). This file
only adds the studio's contract around it:

POST /synthesize  multipart: text, language (ar|en → <|Arabic|> / <|English|>), reference (audio), reference_text (REQUIRED:
                  the backbone continues `<|lang|><|sot|>{reference_text}{text}<|eot|>` from the reference's latents),
                  seed?, n_timesteps? (1-50, 10), inference_cfg? (0-5, 2.0), stop_threshold? (0.05-0.95, 0.5),
                  do_split? (true), cross_fade_ms? (0-500, 50), raw? (1 = 32-bit float, no limiter)
                  -> audio/wav PCM-16 (true peak <= -1 dBTP, the live services' limiter); headers x-sample-rate,
                     x-duration, x-engine, x-model, x-engine-version, x-seed, x-params, x-true-peak, x-gain-reduction,
                     x-input-true-peak, x-ms, x-peak-vram-mb, x-license, x-raw
POST /unload      drop the model from the card: the GPU lease calls it
GET  /health      loaded, weights present, attention implementation, licence, GPU memory

One call = one output: no engine-internal retry, no best-of-N. No secrets: the weights are local; the environment is
never printed.
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

from vewbox_tts_shared import _decode_with_ffmpeg, _parse_number, _pkg_version, check_reference, gpu_mem, limit_peaks, seed_everything  # noqa: E402

FIRERED_ROOT = os.environ.get("FIRERED_ROOT", "/opt/fireredtts3")
sys.path.insert(0, FIRERED_ROOT)
MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models")
CKPT = Path(MODEL_ROOT) / "voice" / "fireredtts3-base"  # the manifest folder (group eval-tts-fireredtts3-base)
FIRERED_COMMIT = os.environ.get("FIRERED_COMMIT", "7a1f3a7282ff184cc1c7f070556baaf5f08b5216")
REVISION = "dcf1bdcd1b8b25b382fa84c3e34eb82e3054a610"
ENGINE = "fireredtts3"
MODEL = "FireRedTTS3-Base"
LICENSE = "Apache-2.0 (README: zero-shot cloning intended for academic research — evaluation only)"
# upstream builds its Qwen3 configs with attn_implementation='flash_attention_2'; sdpa is this service's default (research note §3)
ATTN = os.environ.get("FIRERED_ATTN", "sdpa").strip() or "sdpa"
WEIGHTS = ["fireredtts3_base/model.safetensors", "fireredtts3_base/config.json", "redae/model.safetensors", "redae/config.json",
           "campp/campplus_voxceleb.bin", "text_tokenizer/tokenizer.json", "text_tokenizer/tokenizer_config.json", "text_tokenizer/vocab.json"]
# the studio's language codes → upstream's MULTI_LANG_TAGS names (fireredtts3/utils/text_tokenizer.py); no Arabic dialect exists upstream
LANGUAGES = {"ar": "Arabic", "en": "English"}
ENGINE_VERSION = f"FireRedTTS3@{FIRERED_COMMIT[:7]}; {MODEL}@{REVISION[:8]}; attn {ATTN}; torch {_pkg_version('torch')}; transformers {_pkg_version('transformers')}"

app = FastAPI(title="vewbox-tts-firered")
_lock = threading.Lock()
_model: Any = None


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


def use_attention(impl: str) -> None:
    """Upstream hard-codes attn_implementation='flash_attention_2' in the Qwen3 configs it builds (fireredtts3_base.py
    Qwen3_1_7B_ConfigDict; redae.py encoder and Qwen3ClsDownsample) and transformers 5 refuses to construct such a model
    without the flash_attn package. Every one of them is built as Qwen3Model(config) / Qwen3ForCausalLM(config): set
    the implementation on the config before the base class checks it. Applied once, before upstream is imported."""
    if impl == "flash_attention_2":
        return
    import transformers  # type: ignore

    for cls in (transformers.Qwen3Model, transformers.Qwen3ForCausalLM):
        orig = cls.__init__
        if getattr(orig, "_vewbox_attn", None):
            continue

        def patched(self, config, *a, _orig=orig, **k):  # type: ignore[no-untyped-def]
            try:
                config._attn_implementation = impl
            except Exception:  # noqa: BLE001 — older/newer transformers without the setter
                setattr(config, "_attn_implementation_internal", impl)
            return _orig(self, config, *a, **k)

        patched._vewbox_attn = impl  # type: ignore[attr-defined]
        cls.__init__ = patched  # type: ignore[method-assign]


def attention_in_effect() -> str | None:
    try:
        return str(_model.tts_core.backbone_llm.config._attn_implementation)
    except Exception:  # noqa: BLE001
        return None


def model():
    """Upstream's FireRedTTS3, as its README builds it, without the optional text front-ends: use_fasttext=False (the
    language is always given; lid.176.ftz is not fetched), use_wetext=False (Chinese/English only, fetches FST models on
    first use — the container is offline), use_llm_tn=False (an external LLM endpoint and key: the producer's secrets
    rule). The studio prepares the line itself (prepareLineText)."""
    global _model
    with _lock:
        if _model is None:
            use_attention(ATTN)
            from fireredtts3.core import FireRedTTS3  # type: ignore

            t0 = time.time()
            _model = FireRedTTS3(str(CKPT), use_fasttext=False, use_wetext=False, use_llm_tn=False)
            print(f"[firered] loaded {MODEL} ({REVISION[:8]}) in {time.time() - t0:.1f}s; attention {attention_in_effect()}; peak {torch_peak_mb()} MB", flush=True)
        return _model


@app.get("/health")
def health():
    missing = missing_weights()
    return {"ok": True, "engine": ENGINE, "model": MODEL, "revision": REVISION, "code": f"FireRedTeam/FireRedTTS3@{FIRERED_COMMIT}", "license": LICENSE, "commercial_use": True,
            "evaluation_only": True, "loaded": _model is not None, "attention": attention_in_effect() if _model is not None else ATTN, "engine_version": ENGINE_VERSION,
            "weights_present": not missing, "missing": missing, "languages": sorted(LANGUAGES), "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb()}


@app.post("/unload")
def unload():
    global _model
    with _lock:
        _model = None
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


def load_reference(path: str) -> tuple[np.ndarray, int]:
    """The reference as mono float32 samples (libsndfile, ffmpeg for the rest); upstream resamples to RedAE's rate."""
    try:
        data, sr = sf.read(path, dtype="float32", always_2d=True)
    except Exception:  # noqa: BLE001
        data, sr = _decode_with_ffmpeg(path)
    return data.mean(axis=1).astype(np.float32), int(sr)


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...), language: str = Form("en"), dialect: str = Form(""), engine_name: str = Form("", alias="engine"),
    reference: UploadFile = File(...), reference_text: str = Form(""), seed: str = Form(""),
    n_timesteps: str = Form(""), inference_cfg: str = Form(""), stop_threshold: str = Form(""), do_split: str = Form(""), cross_fade_ms: str = Form(""),
    raw: str = Form(""),
):
    missing = missing_weights()
    if missing:
        raise HTTPException(status_code=503, detail=f"FireRedTTS3-Base weights are not in the store (manifest group eval-tts-fireredtts3-base): {', '.join(missing)}")
    if engine_name and engine_name != ENGINE:
        raise HTTPException(status_code=400, detail=f"this service runs {ENGINE}, not {engine_name}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text longer than 2000 characters; split it")
    lang_name = LANGUAGES.get(language.strip().lower())
    if lang_name is None:
        raise HTTPException(status_code=400, detail=f"language must be ar or en (got {language!r}); FireRedTTS3 has no Arabic dialect tag")
    if not reference_text.strip():
        raise HTTPException(status_code=400, detail="reference_text is required: FireRedTTS3 continues the reference's transcript into the new text")
    params: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True)),
        "n_timesteps": int(_parse_number(n_timesteps, "n_timesteps", 1, 50, 10, integer=True)),
        "inference_cfg": _parse_number(inference_cfg, "inference_cfg", 0.0, 5.0, 2.0),
        "stop_threshold": _parse_number(stop_threshold, "stop_threshold", 0.05, 0.95, 0.5),
        "do_split": do_split.strip().lower() not in ("0", "false", "no", "off"),
        "cross_fade_ms": _parse_number(cross_fade_ms, "cross_fade_ms", 0.0, 500.0, 50.0),
    }
    data = await reference.read()
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="reference recording is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref_path = f.name
    try:
        ref_info = check_reference(ref_path)
        ref_wav, ref_sr = load_reference(ref_path)
        m = model()
        t0 = time.time()
        with _lock:
            try:
                import torch  # type: ignore

                if torch.cuda.is_available() and torch.cuda.is_initialized():
                    torch.cuda.reset_peak_memory_stats()  # this request's peak (the loaded weights included)
                seed_everything(params["seed"])  # upstream's fix_seed(seed) runs again inside generate: the same take for the same request
                prompt = torch.from_numpy(ref_wav).unsqueeze(0)  # (1, T) float32, as torchaudio.load gives upstream's example
                out, sr = m.generate(text=text, language=lang_name, prompt_text=reference_text.strip(), prompt_audio=prompt, prompt_audio_sr=ref_sr,
                                     seed=params["seed"], n_timesteps=params["n_timesteps"], inference_cfg=params["inference_cfg"], stop_threshold=params["stop_threshold"],
                                     do_clean=True, do_tn=False, do_split=params["do_split"], cross_fade_ms=params["cross_fade_ms"])
                wav = np.asarray(out.detach().float().cpu().numpy(), dtype=np.float32).reshape(-1)
                sr = int(sr)
            except HTTPException:
                raise
            except AssertionError as ex:
                raise HTTPException(status_code=400, detail=f"firered refused the input: {str(ex)[:300]}") from ex
            except Exception as ex:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"firered failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
        ms = int((time.time() - t0) * 1000)
        if wav.size == 0 or not np.isfinite(wav).all():
            raise HTTPException(status_code=500, detail="the engine returned no usable audio")
        # RAW (listening comparisons): the engine's samples as produced — no limiter, 32-bit float
        is_raw = raw.strip().lower() in ("1", "true", "yes")
        lim = {"input_true_peak_db": float("nan"), "output_true_peak_db": float("nan"), "gain_reduction_db": 0.0} if is_raw else None
        if not is_raw:
            wav, lim = limit_peaks(wav, sr)
        buf = io.BytesIO()
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="FLOAT" if is_raw else "PCM_16", format="WAV") as out_file:
            out_file.software = f"vewbox-tts {ENGINE} (evaluation)"
            out_file.comment = f"synthetic speech; engine={ENGINE}; seed={params['seed']}; not a voice reference; {LICENSE}"
            out_file.write(wav)
        dur = wav.shape[0] / sr
        print(f"[firered] {language} {len(text)} chars seed {params['seed']} -> {dur:.2f}s in {ms} ms (RTF {ms / 1000 / max(dur, 1e-3):.2f}); peak in {lim['input_true_peak_db']:.1f} dBTP; ref {ref_info['seconds']:.1f}s; vram peak {torch_peak_mb()} MB", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers={
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": ENGINE, "x-model": MODEL, "x-ms": str(ms),
            "x-engine-version": ENGINE_VERSION, "x-seed": str(params["seed"]), "x-params": json.dumps(params),
            "x-true-peak": f"{lim['output_true_peak_db']:.2f}", "x-gain-reduction": f"{lim['gain_reduction_db']:.2f}", "x-input-true-peak": f"{lim['input_true_peak_db']:.2f}",
            "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-license": "apache-2.0-evaluation-only-research-cloning-disclaimer", "x-raw": "1" if is_raw else "0",
        })
    finally:
        try:
            os.unlink(ref_path)
        except OSError:
            pass

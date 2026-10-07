"""SOUND EFFECTS AND AMBIENCE — MOSS-SoundEffect v2.0 (OpenMOSS, 1.3 B DiT + flow matching, DAC VAE, Qwen3-1.7B text
encoder, Apache-2.0): an ambience bed, footsteps, rain, a door, a crowd, from a text description, 48 kHz mono, up to
30 s per call. The frozen production stack's sound-effect engine (docs/MASTER-PRODUCTION-PLAN.md); it replaces the 8 B
v1 (MossTTSDelay) that the tts-moss image served.

The studio's contract is unchanged (src/server/providers/sfx.ts):
POST /sfx     multipart: prompt (1-600 chars), duration? (0.5-30 s, default 10), seed?
              -> audio/wav PCM-16 48 kHz (true peak <= -1 dBTP, the live services' limiter), headers x-duration,
                 x-sample-rate, x-model, x-engine-version, x-seed, x-ms, x-true-peak, x-peak-vram-mb, x-steps, x-cfg
POST /unload  drop the model from the GPU (the studio's lease calls it when another family takes the card)
GET  /health  loaded, weights present, the layout, GPU memory, peak VRAM since load

Weights come from the store (manifest group sfx-moss-soundeffect-v2), stored flat in one folder with the three
config.json files under distinct names. The upstream loader wants the diffusers layout, so a symlinked layout is built
at start (LAYOUT below). The DAC VAE is a pickle (vae_128d_48k.pth): its sha256 is pinned in the manifest and it is
loaded only inside this container. One call = one output: no engine-internal retry, no best-of-N.
"""
from __future__ import annotations

import io
import json
import os
import random
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import Response

from vewbox_tts_shared import _parse_number, _pkg_version, gpu_mem, limit_peaks, seed_everything  # noqa: E402

MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models")
STORE = Path(MODEL_ROOT) / "sfx" / "moss-soundeffect-v2"
LAYOUT_DIR = Path(os.environ.get("SFX_LAYOUT_DIR", "/tmp/moss-soundeffect-v2"))
MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
UPSTREAM = "OpenMOSS/MOSS-TTS@4cf2dab88fc8711aef93089b3b75c0ae07373e47 (moss_soundeffect_v2)"
# the model card's recommended settings
STEPS = int(os.environ.get("SFX_STEPS", "100"))
CFG = float(os.environ.get("SFX_CFG", "4.0"))
SHIFT = float(os.environ.get("SFX_SHIFT", "5.0"))
MAX_SECONDS = 30.0

# the diffusers layout the upstream loader reads -> the flat file in the store
LAYOUT = {
    "model_index.json": "model_index.json",
    "scheduler/scheduler_config.json": "scheduler_config.json",
    "transformer/config.json": "transformer.config.json",
    "transformer/diffusion_pytorch_model.safetensors": "diffusion_pytorch_model.safetensors",
    "text_encoder/config.json": "text_encoder.config.json",
    "text_encoder/generation_config.json": "generation_config.json",
    "text_encoder/model-00001-of-00002.safetensors": "model-00001-of-00002.safetensors",
    "text_encoder/model-00002-of-00002.safetensors": "model-00002-of-00002.safetensors",
    "text_encoder/model.safetensors.index.json": "model.safetensors.index.json",
    "tokenizer/merges.txt": "merges.txt",
    "tokenizer/tokenizer.json": "tokenizer.json",
    "tokenizer/tokenizer_config.json": "tokenizer_config.json",
    "tokenizer/vocab.json": "vocab.json",
    "vae/config.json": "vae.config.json",
    "vae/vae_128d_48k.pth": "vae_128d_48k.pth",
}

app = FastAPI(title="vewbox-sfx")
_lock = threading.Lock()
_pipe: Any = None


def missing_weights() -> list[str]:
    return [src for src in LAYOUT.values() if not (STORE / src).is_file()]


def build_layout() -> Path:
    """The symlinked diffusers layout over the flat store (rebuilt every start: the links are cheap and always right)."""
    for rel, src in LAYOUT.items():
        link = LAYOUT_DIR / rel
        link.parent.mkdir(parents=True, exist_ok=True)
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(STORE / src)
    return LAYOUT_DIR


def manifest_revision() -> str:
    try:
        state = json.loads((Path(MODEL_ROOT) / ".manifest-state.json").read_text())
        rec = state.get("sfx/moss-soundeffect-v2/diffusion_pytorch_model.safetensors") or {}
        rev = rec.get("revision")
        return f"@{rev[:7]}" if rev else ""
    except Exception:  # noqa: BLE001
        return ""


ENGINE_VERSION = f"moss-soundeffect-v2{manifest_revision()}; {UPSTREAM}; diffusers {_pkg_version('diffusers')}; transformers {_pkg_version('transformers')}; torch {_pkg_version('torch')}"


def torch_peak_mb() -> int | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return int(torch.cuda.max_memory_reserved() / 1048576)
    except Exception:  # noqa: BLE001
        pass
    return None


def pipeline():
    global _pipe
    with _lock:
        if _pipe is None:
            import torch  # type: ignore
            from moss_soundeffect_v2 import MossSoundEffectPipeline  # type: ignore

            t0 = time.time()
            _pipe = MossSoundEffectPipeline.from_pretrained(str(build_layout()), torch_dtype=torch.bfloat16, device="cuda")
            print(f"[sfx] loaded {MODEL} in {time.time() - t0:.1f}s; peak {torch_peak_mb()} MB", flush=True)
        return _pipe


@app.get("/health")
def health():
    missing = missing_weights()
    return {"ok": True, "engine": "moss-soundeffect-v2", "model": MODEL, "loaded": _pipe is not None, "engine_version": ENGINE_VERSION,
            "weights_present": not missing, "missing": missing, "steps": STEPS, "cfg": CFG, "shift": SHIFT, "max_seconds": MAX_SECONDS,
            "compile": os.environ.get("TORCHDYNAMO_DISABLE") != "1", "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb()}


@app.post("/unload")
def unload():
    global _pipe
    with _lock:
        _pipe = None
    import gc

    gc.collect()
    try:
        import torch  # type: ignore

        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass
    rss_mb = None
    trimmed = False
    try:
        import ctypes

        trimmed = bool(ctypes.CDLL("libc.so.6").malloc_trim(0))
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    rss_mb = int(line.split()[1]) // 1024
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem(), "host": {"malloc_trim": trimmed, "rss_mb": rss_mb}}


@app.post("/sfx")
async def sfx(prompt: str = Form(...), duration: str = Form(""), seed: str = Form("")):
    missing = missing_weights()
    if missing:
        raise HTTPException(status_code=503, detail=f"MOSS-SoundEffect v2 weights are not in the store (manifest group sfx-moss-soundeffect-v2): {', '.join(missing)}")
    prompt = prompt.strip()
    if not prompt or len(prompt) > 600:
        raise HTTPException(status_code=400, detail="the description must be 1-600 characters")
    secs = _parse_number(duration, "duration", 0.5, MAX_SECONDS, 10.0) if duration.strip() else 10.0
    sd = int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True))
    pipe = pipeline()
    t0 = time.time()
    with _lock:
        try:
            seed_everything(sd)
            audio = pipe(prompt=prompt, seconds=secs, num_inference_steps=STEPS, cfg_scale=CFG, sigma_shift=SHIFT, seed=sd, progress_bar_cmd=lambda x, **_: x)
            wav = audio.detach().float().cpu().numpy()[0, 0]
        except Exception as ex:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"sfx failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
    ms = int((time.time() - t0) * 1000)
    if wav.size == 0 or not np.isfinite(wav).all():
        raise HTTPException(status_code=500, detail="the engine returned no usable audio")
    sr = int(pipe.sample_rate)
    wav, lim = limit_peaks(wav, sr)
    buf = io.BytesIO()
    with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="PCM_16", format="WAV") as out:
        out.software = "vewbox-sfx moss-soundeffect-v2"
        out.comment = f"synthetic sound effect; engine=moss-soundeffect-v2; seed={sd}"
        out.write(wav)
    dur = wav.shape[0] / sr
    print(f"[sfx] {prompt[:60]!r} {secs}s seed {sd} -> {dur:.2f}s in {ms} ms; peak {torch_peak_mb()} MB", flush=True)
    return Response(content=buf.getvalue(), media_type="audio/wav", headers={
        "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": "moss-soundeffect-v2", "x-model": MODEL, "x-ms": str(ms),
        "x-engine-version": ENGINE_VERSION, "x-seed": str(sd), "x-true-peak": f"{lim['output_true_peak_db']:.2f}",
        "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-steps": str(STEPS), "x-cfg": str(CFG),
    })

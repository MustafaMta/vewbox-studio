"""Voice BENCH service — candidate cloning engines behind the studio's /synthesize contract (docker/tts/app.py), for
the controlled benchmark of docs/research/VOICE-BENCH-2026-10.md. Never one of the live services: it runs in its own
container (compose profile `bench`), on its own port, from the models volume read-only.

BENCH_ENGINE=voxcpm2 : VoxCPM2 (OpenBMB, 2 B, Apache-2.0) cloning — reference clip (+ its transcript for the
                       continuation mode); emotion as VoxCPM2's "(style)" instruction prefix. 48 kHz.
BENCH_ENGINE=dots    : dots.tts-soar (rednote-hilab, 2 B, Apache-2.0) — reference clip + transcript (x-vector only
                       without one). 48 kHz.
BENCH_ENGINE=moss    : MOSS-TTS v1.5 (OpenMOSS, 8 B, Apache-2.0) — reference clip; `duration` (seconds) becomes the
                       model's token budget (tokens = seconds × the codec's frame rate). 24 kHz.

POST /synthesize  multipart: text, language (en|ar), reference (audio), reference_text?, emotion?, seed?, speed?,
                  duration? (target seconds; honoured by moss only — the others report `duration_control: none`),
                  mode? (voxcpm2: clone|continue; default clone)
                  -> audio/wav PCM-16 (true peak <= -1 dBTP, the live services' limiter), headers as docker/tts/app.py
                  plus x-attempts (always 1: no engine-internal retry), x-peak-vram-mb, x-duration-control
POST /unload      drop the model
GET  /health      engine, version, loaded, weights present, GPU memory, peak VRAM since load

Engine-internal "retry on bad case" loops are OFF so that attempt #1 is what is measured (directive §20).
"""
from __future__ import annotations

import io
import json
import os
import random
import re
import tempfile
import threading
import time
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

# the live services' measurement stack: same limiter, true-peak meter, seeding, reference check
from vewbox_tts_shared import _parse_number, _pkg_version, check_reference, gpu_mem, limit_peaks, seed_everything  # noqa: E402

ENGINE = os.environ.get("BENCH_ENGINE", "voxcpm2")
MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models")
app = FastAPI(title=f"vewbox-tts-bench-{ENGINE}")
_lock = threading.Lock()
_engine: Any = None

# emotion word -> a short English style instruction (VoxCPM2 "(…)" prefix). The live IndexTTS map (8-dim vectors) is
# in docker/tts/app.py EMOTIONS; these are the same categories said in words.
STYLE = {
    "calm": "calm, relaxed", "neutral": "neutral, even", "angry": "angry, raised voice, tense", "furious": "furious, shouting",
    "sad": "sad, quiet, close to tears", "afraid": "afraid, whispering, tense", "scared": "frightened, whispering",
    "happy": "happy, excited, bright", "surprised": "surprised", "tired": "tired, low energy", "tender": "tender, gentle, soft",
    "nostalgic": "warm, nostalgic, slow", "firm": "firm, decisive", "probing": "suspicious, probing", "humour": "dry, amused",
    "muttering": "muttering to himself, low", "whisper": "whispering", "flat": "flat, matter-of-fact", "low": "low, sombre",
}


def style_for(emotion: str | None) -> str | None:
    if not emotion:
        return None
    e = emotion.strip().lower()
    for k, v in STYLE.items():
        if re.search(rf"\b{k}", e):
            return v
    return re.sub(r"[()（）\[\]]", " ", e)[:60].strip() or None


def torch_peak_mb() -> int | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return int(torch.cuda.max_memory_reserved() / 1048576)
    except Exception:  # noqa: BLE001
        pass
    return None


def _manifest_rev(key: str) -> str:
    try:
        with open(os.path.join(MODEL_ROOT, ".manifest-state.json"), encoding="utf-8") as f:
            rec = json.load(f).get(key) or {}
        return f"@{str(rec.get('revision') or '')[:7]} sha256:{str(rec.get('sha256') or '')[:12]}"
    except Exception:  # noqa: BLE001
        return ""


# ------------------------------------------------------------------------------------------------ engines
class VoxEngine:
    name = "voxcpm2"
    model = "openbmb/VoxCPM2 (clone)"
    duration_control = "none"

    def __init__(self) -> None:
        from voxcpm import VoxCPM  # type: ignore

        d = os.path.join(MODEL_ROOT, "tts", "voxcpm2")
        self.vox = VoxCPM(voxcpm_model_path=d, zipenhancer_model_path=None, enable_denoiser=False, optimize=False, device="cuda")
        self.sample_rate = int(self.vox.tts_model.sample_rate)
        self.version = f"voxcpm {_pkg_version('voxcpm')}; model openbmb/VoxCPM2{_manifest_rev('tts/voxcpm2/model.safetensors')}; torch {_pkg_version('torch')}"

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, p: dict[str, Any]) -> np.ndarray:
        style = style_for(emotion)
        body = f"({style}){text}" if style else text
        kw: dict[str, Any] = {"text": body, "reference_wav_path": ref, "cfg_value": float(p["cfg"]), "inference_timesteps": int(p["steps"]), "normalize": False, "denoise": False, "retry_badcase": False}
        if p.get("mode") == "continue" and ref_text:
            kw.update(prompt_wav_path=ref, prompt_text=ref_text)
        seed_everything(int(p["seed"]))
        return np.asarray(self.vox.generate(**kw), dtype=np.float32).reshape(-1)


class DotsEngine:
    name = "dots"
    model = "dots-studio/dots.tts-soar"
    duration_control = "none"

    def __init__(self) -> None:
        from dots_tts.runtime import DotsTtsRuntime  # type: ignore

        d = os.path.join(MODEL_ROOT, "tts", "bench", "dots.tts-soar")
        # max_generate_length: audio patches per request (the runtime's default 500); raised for the 25–30 s monologues
        self.rt = DotsTtsRuntime.from_pretrained(d, precision="bfloat16", optimize=False, max_generate_length=int(os.environ.get("DOTS_MAX_PATCHES", "1000")))
        self.sample_rate = int(self.rt.sample_rate)
        self.version = f"dots.tts {_pkg_version('dots.tts')}; model dots.tts-soar{_manifest_rev('tts/bench/dots.tts-soar/model.safetensors')}; torch {_pkg_version('torch')}"

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, p: dict[str, Any]) -> np.ndarray:
        # dots.tts 0.3.1 generate() has no seed argument: the global generators are seeded (seed_everything)
        seed_everything(int(p["seed"]))
        kw: dict[str, Any] = {"text": text, "prompt_audio_path": ref, "num_steps": int(p["steps"]), "guidance_scale": float(p["cfg"]), "language": language, "normalize_text": False}
        if ref_text:
            kw["prompt_text"] = ref_text
        res = self.rt.generate(**kw)
        wav = res["audio"]
        self.sample_rate = int(res.get("sample_rate") or self.sample_rate)
        try:
            import torch  # type: ignore

            if isinstance(wav, torch.Tensor):
                wav = wav.detach().float().cpu().numpy()
        except Exception:  # noqa: BLE001
            pass
        return np.asarray(wav, dtype=np.float32).reshape(-1)


class MossEngine:
    name = "moss"
    model = "OpenMOSS-Team/MOSS-TTS-v1.5"
    duration_control = "tokens"

    def __init__(self) -> None:
        import torch  # type: ignore
        from transformers import AutoModel, AutoProcessor  # type: ignore

        torch.backends.cuda.enable_cudnn_sdp(False)  # the model card: cuDNN SDPA is broken for this model
        d = os.path.join(MODEL_ROOT, "tts", "bench", "moss-tts-v1.5")
        codec = os.path.join(MODEL_ROOT, "tts", "bench", "moss-audio-tokenizer")
        self.proc = AutoProcessor.from_pretrained(d, trust_remote_code=True, codec_path=codec)
        self.proc.audio_tokenizer = self.proc.audio_tokenizer.to("cuda")
        attn = os.environ.get("MOSS_ATTN", "sdpa")
        self.net = AutoModel.from_pretrained(d, trust_remote_code=True, attn_implementation=attn, torch_dtype=torch.bfloat16).to("cuda").eval()
        self.sample_rate = int(self.proc.model_config.sampling_rate)
        # frames per second of the codec: tokens = seconds × this (MOSS-Audio-Tokenizer, 24 kHz)
        self.frame_rate = float(os.environ.get("MOSS_FRAME_RATE", "12.5"))
        self.version = f"moss-tts v1.5{_manifest_rev('tts/bench/moss-tts-v1.5/model-00001-of-00004.safetensors')}; transformers {_pkg_version('transformers')}; torch {_pkg_version('torch')}"

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, p: dict[str, Any]) -> np.ndarray:
        import torch  # type: ignore

        msg: dict[str, Any] = {"text": text, "reference": [ref], "language": "English" if language == "en" else "Arabic"}
        if p.get("duration"):
            msg["tokens"] = max(4, int(round(float(p["duration"]) * self.frame_rate)))
            p["tokens"] = msg["tokens"]
        batch = self.proc([[self.proc.build_user_message(**msg)]], mode="generation")
        seed_everything(int(p["seed"]))
        with torch.no_grad():
            out = self.net.generate(input_ids=batch["input_ids"].to("cuda"), attention_mask=batch["attention_mask"].to("cuda"), max_new_tokens=int(p.get("max_new_tokens", 4096)))
        m = list(self.proc.decode(out))[0]
        audio = m.audio_codes_list[0]
        return audio.detach().float().cpu().numpy().reshape(-1)


class SfxEngine:
    """MOSS-SoundEffect (OpenMOSS, 8 B MossTTSDelay, Apache-2.0): ambience and sound effects from a text description,
    same architecture, modelling code and audio tokenizer as MOSS-TTS v1.5 (the model card's usage: an
    `ambient_sound` user message, ~12.5 tokens per second, audio_temperature 1.5 / top_p 0.6 / top_k 50 /
    repetition_penalty 1.2). 24 kHz mono. Never speech or song: the studio's dialogue and songs have their own engines."""

    name = "sfx"
    model = "OpenMOSS-Team/MOSS-SoundEffect"
    duration_control = "tokens"

    def __init__(self) -> None:
        import torch  # type: ignore
        from transformers import AutoModel, AutoProcessor  # type: ignore

        torch.backends.cuda.enable_cudnn_sdp(False)  # the model card: cuDNN SDPA is broken for this model
        d = os.path.join(MODEL_ROOT, "sfx", "moss-soundeffect")
        codec = os.path.join(MODEL_ROOT, "tts", "bench", "moss-audio-tokenizer")
        self.proc = AutoProcessor.from_pretrained(d, trust_remote_code=True, codec_path=codec)
        self.proc.audio_tokenizer = self.proc.audio_tokenizer.to("cuda")
        self.net = AutoModel.from_pretrained(d, trust_remote_code=True, attn_implementation=os.environ.get("MOSS_ATTN", "sdpa"), torch_dtype=torch.bfloat16).to("cuda").eval()
        self.sample_rate = int(self.proc.model_config.sampling_rate)
        self.frame_rate = float(os.environ.get("MOSS_FRAME_RATE", "12.5"))
        self.version = f"moss-soundeffect{_manifest_rev('sfx/moss-soundeffect/model-00001-of-00004.safetensors')}; transformers {_pkg_version('transformers')}; torch {_pkg_version('torch')}"

    def effect(self, prompt: str, seconds: float | None, seed: int) -> np.ndarray:
        import torch  # type: ignore

        msg: dict[str, Any] = {"ambient_sound": prompt}
        if seconds:
            msg["tokens"] = max(4, int(round(seconds * self.frame_rate)))
        batch = self.proc([[self.proc.build_user_message(**msg)]], mode="generation")
        seed_everything(seed)
        with torch.no_grad():
            out = self.net.generate(input_ids=batch["input_ids"].to("cuda"), attention_mask=batch["attention_mask"].to("cuda"), max_new_tokens=4096,
                                    audio_temperature=1.5, audio_top_p=0.6, audio_top_k=50, audio_repetition_penalty=1.2)
        m = list(self.proc.decode(out))[0]
        return m.audio_codes_list[0].detach().float().cpu().numpy().reshape(-1)


ENGINES = {"voxcpm2": VoxEngine, "dots": DotsEngine, "moss": MossEngine, "sfx": SfxEngine}
WEIGHTS = {
    "voxcpm2": ["tts/voxcpm2/model.safetensors", "tts/voxcpm2/audiovae.pth"],
    "dots": ["tts/bench/dots.tts-soar/model.safetensors", "tts/bench/dots.tts-soar/vocoder.safetensors"],
    "moss": ["tts/bench/moss-tts-v1.5/model-00004-of-00004.safetensors", "tts/bench/moss-audio-tokenizer/model-00002-of-00002.safetensors"],
    "sfx": ["sfx/moss-soundeffect/model-00004-of-00004.safetensors", "tts/bench/moss-audio-tokenizer/model-00002-of-00002.safetensors"],
}
DEFAULTS = {"voxcpm2": {"cfg": 2.0, "steps": 10}, "dots": {"cfg": 1.2, "steps": 10}, "moss": {"cfg": 0.0, "steps": 0}, "sfx": {"cfg": 0.0, "steps": 0}}


def weights_present() -> bool:
    return all(os.path.exists(os.path.join(MODEL_ROOT, f)) for f in WEIGHTS[ENGINE])


def engine():
    global _engine
    with _lock:
        if _engine is None:
            t0 = time.time()
            _engine = ENGINES[ENGINE]()
            print(f"[tts-bench] loaded {_engine.model} in {time.time() - t0:.1f}s; peak {torch_peak_mb()} MB", flush=True)
        return _engine


@app.get("/health")
def health():
    return {"ok": True, "engine": ENGINE, "loaded": _engine is not None, "engine_version": getattr(_engine, "version", None), "weights_present": weights_present(), "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb(), "duration_control": ENGINES[ENGINE].duration_control}


@app.post("/unload")
def unload():
    global _engine
    with _lock:
        _engine = None
    import gc

    gc.collect()
    try:
        import torch  # type: ignore

        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass
    # the freed host memory (an 8 B model's weights pass through the heap) goes back to the system, as the live
    # voice services do it (docker/tts/app.py release_host_memory: malloc_trim); reports resident memory after
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
    """BENCH_ENGINE=sfx only: an ambience or sound effect from a description -> audio/wav PCM-16 (true peak <= -1 dBTP),
    headers x-duration, x-model, x-engine-version, x-seed, x-ms, x-peak-vram-mb."""
    if ENGINE != "sfx":
        raise HTTPException(status_code=404, detail="this service is not the sound-effect engine (BENCH_ENGINE=sfx)")
    if not weights_present():
        raise HTTPException(status_code=503, detail="MOSS-SoundEffect weights are not in the store (manifest group sfx-moss-soundeffect)")
    prompt = prompt.strip()
    if not prompt or len(prompt) > 600:
        raise HTTPException(status_code=400, detail="the description must be 1-600 characters")
    secs = _parse_number(duration, "duration", 0.5, 60.0, 0.0) if duration.strip() else None
    sd = int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True))
    e = engine()
    t0 = time.time()
    with _lock:
        try:
            wav = e.effect(prompt, secs, sd)
        except Exception as ex:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"sfx failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
    ms = int((time.time() - t0) * 1000)
    if wav.size == 0:
        raise HTTPException(status_code=500, detail="the engine returned no audio")
    sr = int(e.sample_rate)
    wav, lim = limit_peaks(wav, sr)
    buf = io.BytesIO()
    with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="PCM_16", format="WAV") as out:
        out.software = "vewbox-sfx moss-soundeffect"
        out.comment = f"synthetic sound effect; engine=moss-soundeffect; seed={sd}"
        out.write(wav)
    dur = wav.shape[0] / sr
    print(f"[sfx] {prompt[:60]!r} {secs}s seed {sd} -> {dur:.2f}s in {ms} ms; peak {torch_peak_mb()} MB", flush=True)
    return Response(content=buf.getvalue(), media_type="audio/wav", headers={
        "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": e.name, "x-model": e.model, "x-ms": str(ms), "x-engine-version": e.version,
        "x-seed": str(sd), "x-true-peak": f"{lim['output_true_peak_db']:.2f}", "x-peak-vram-mb": str(torch_peak_mb() or ""),
    })


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...), language: str = Form("en"), reference: UploadFile = File(...), reference_text: str = Form(""),
    emotion: str = Form(""), seed: str = Form(""), speed: str = Form(""), duration: str = Form(""), mode: str = Form(""),
    cfg: str = Form(""), steps: str = Form(""),
):
    if ENGINE == "sfx":
        raise HTTPException(status_code=404, detail="the sound-effect engine does not speak: POST /sfx")
    if not weights_present():
        raise HTTPException(status_code=503, detail=f"{ENGINE} weights are not in the models volume (fetch the eval-voice-* group)")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    d = DEFAULTS[ENGINE]
    p: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True)),
        "cfg": _parse_number(cfg, "cfg", 0.0, 10.0, d["cfg"]),
        "steps": int(_parse_number(steps, "steps", 0, 100, d["steps"], integer=True)),
        "mode": (mode or "clone").strip(),
    }
    if duration.strip():
        p["duration"] = _parse_number(duration, "duration", 0.3, 60.0, 0.0)
    data = await reference.read()
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref = f.name
    try:
        ref_info = check_reference(ref)
        e = engine()
        t0 = time.time()
        with _lock:
            try:
                wav = e.synthesize(text, language, ref, reference_text.strip() or None, emotion or None, p)
            except Exception as ex:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"{ENGINE} failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
        ms = int((time.time() - t0) * 1000)
        if wav.size == 0:
            raise HTTPException(status_code=500, detail="the engine returned no audio")
        sr = int(e.sample_rate)
        wav, lim = limit_peaks(wav, sr)
        buf = io.BytesIO()
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="PCM_16", format="WAV") as out:
            out.software = f"vewbox-tts-bench {e.name}"
            out.comment = f"synthetic speech; engine={e.name}; seed={p['seed']}; benchmark; not a voice reference"
            out.write(wav)
        dur = wav.shape[0] / sr
        print(f"[tts-bench] {ENGINE} {len(text)} chars seed {p['seed']} -> {dur:.2f}s in {ms} ms; ref {ref_info['seconds']:.1f}s; peak {torch_peak_mb()} MB", flush=True)
        headers = {
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": e.name, "x-model": e.model, "x-ms": str(ms), "x-engine-version": e.version,
            "x-seed": str(p["seed"]), "x-params": json.dumps({k: v for k, v in p.items() if isinstance(v, (int, float))}), "x-true-peak": f"{lim['output_true_peak_db']:.2f}",
            "x-gain-reduction": f"{lim['gain_reduction_db']:.2f}", "x-attempts": "1", "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-duration-control": e.duration_control,
        }
        return Response(content=buf.getvalue(), media_type="audio/wav", headers=headers)
    finally:
        try:
            os.unlink(ref)
        except OSError:
            pass

"""Voice service — one HTTP contract over two engines.

VEWBOX_ENGINE=indextts : IndexTTS 2.5 (indextts.infer_v2_5.IndexTTS2), languages EN/AR/ZH/JA/ES, emotion vectors.
VEWBOX_ENGINE=habibi   : Habibi-TTS Iraqi specialised model (F5-TTS DiT + vocos), Arabic (IRQ).

POST /synthesize  multipart: text, language (en|ar), dialect?, reference (audio file), reference_text?, emotion?,
                  emotion_alpha?, speed? (0.5–2), seed? (int; one is drawn and reported when absent),
                  Habibi only: nfe_step? (4–128), cfg_strength? | cfg? (0–5), sway_sampling_coef? (-1…1)
                  -> audio/wav (PCM-16, true peak <= -1 dBTP); headers x-sample-rate, x-duration, x-engine, x-model,
                  x-engine-version, x-seed, x-params (json), x-true-peak (dBTP after the limiter), x-gain-reduction (dB), x-ms
POST /unload      drop the model from the GPU
GET  /health      engine, version, loaded, weights present, GPU memory

This file is bind-mounted into the running containers: a change needs `docker compose up -d --no-deps tts tts-habibi`.
"""
from __future__ import annotations

import io
import json
import os
import random
import re
import subprocess
import tempfile
import threading
import time
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

ENGINE = os.environ.get("VEWBOX_ENGINE", "indextts")
MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models/tts")
app = FastAPI(title=f"vewbox-tts-{ENGINE}")
_lock = threading.Lock()
_engine: Any = None

# Output ceiling. -1 dBTP leaves headroom for any later resampling or codec; the worker's QA reads the same figure.
PEAK_CEILING_DBTP = float(os.environ.get("VEWBOX_PEAK_CEILING_DBTP", "-1.0"))
# The reference the engines clone from: shorter than a second carries no timbre; longer than a minute is a mistake
# (the worker sends a trimmed window of at most 12 s).
REFERENCE_MIN_SECONDS = 1.0
REFERENCE_MAX_SECONDS = 60.0


def gpu_mem() -> dict[str, int] | None:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        m = pynvml.nvmlDeviceGetMemoryInfo(pynvml.nvmlDeviceGetHandleByIndex(0))
        return {"used_mb": int(m.used / 1048576), "total_mb": int(m.total / 1048576)}
    except Exception:  # noqa: BLE001
        return None


# ------------------------------------------------------------------------------------------------ engine version
def _pkg_version(name: str) -> str | None:
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:  # noqa: BLE001
        return None


def _git_describe(repo: str) -> str | None:
    try:
        out = subprocess.run(["git", "-C", repo, "describe", "--tags", "--always"], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def engine_version() -> str:
    """What exactly produced the audio: package versions plus the model file, so an identity can pin them. The
    environment may override it (VEWBOX_ENGINE_VERSION) when an image tag is more useful than package metadata."""
    forced = os.environ.get("VEWBOX_ENGINE_VERSION")
    if forced:
        return forced
    if ENGINE == "indextts":
        parts = [f"indextts {_pkg_version('indextts') or '?'}", f"repo {_git_describe('/opt/index-tts') or 'v2.5.0'}", "model IndexTTS-2.5"]
    else:
        parts = [f"habibi-tts {_pkg_version('habibi-tts') or '?'}", f"f5-tts {_pkg_version('f5-tts') or '?'}", "model Specialized/IRQ/model_100000"]
    parts.append(f"torch {_pkg_version('torch') or '?'}")
    return "; ".join(parts)


ENGINE_VERSION = engine_version()


# ------------------------------------------------------------------------------------------------ seeding
def seed_everything(seed: int) -> None:
    """Both engines draw noise (IndexTTS's GPT sampling and flow matching, F5's ODE start): seed every generator so
    the same request gives the same take."""
    random.seed(seed)
    np.random.seed(seed % (2**32))
    try:
        import torch  # type: ignore

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------------------------------------------------ peak limiter
def _sliding_min(a: np.ndarray, before: int, after: int) -> np.ndarray:
    """out[i] = min(a[i-before : i+after+1]) with 1.0 outside the array (unity gain). O(n) block prefix/suffix minima
    (van Herk), so a 50 ms window over a minute of audio is still cheap."""
    w = before + after + 1
    if w <= 1:
        return a
    padded = np.concatenate([np.ones(before), a, np.ones(after)])
    n = padded.shape[0]
    blocks = -(-n // w)
    full = np.concatenate([padded, np.ones(blocks * w - n)]).reshape(blocks, w)
    prefix = np.minimum.accumulate(full, axis=1).ravel()
    suffix = np.minimum.accumulate(full[:, ::-1], axis=1)[:, ::-1].ravel()
    idx = np.arange(a.shape[0])
    return np.minimum(suffix[idx], prefix[idx + w - 1])


def _moving_mean(a: np.ndarray, before: int, after: int) -> np.ndarray:
    """out[i] = mean(a[i-before : i+after+1]) with 1.0 outside the array."""
    w = before + after + 1
    if w <= 1:
        return a
    padded = np.concatenate([np.ones(before), a, np.ones(after)])
    cs = np.concatenate([[0.0], np.cumsum(padded)])
    return (cs[w:] - cs[:-w]) / w


def true_peak(wav: np.ndarray, oversample: int = 4) -> float:
    """Inter-sample peak (linear), estimated by sinc interpolation at `oversample`× (zero-padded FFT), the way
    EBU R128 / ITU-R BS.1770 true peak is defined."""
    n = wav.shape[0]
    if n == 0:
        return 0.0
    up = np.fft.irfft(np.fft.rfft(wav.astype(np.float64)), n=n * oversample) * oversample
    return float(max(np.max(np.abs(up)), np.max(np.abs(wav))))


def limit_peaks(wav: np.ndarray, sr: int, ceiling_db: float = PEAK_CEILING_DBTP, lookahead_ms: float = 5.0, release_ms: float = 50.0) -> tuple[np.ndarray, dict[str, float]]:
    """Look-ahead peak limiter followed by a true-peak trim. Only the gain curve is computed with numpy; nothing
    is clipped. The gain at every sample is provably <= the gain that sample needs (each smoothing stage averages
    values that are all <= the needed gain), so the sample peak never exceeds the ceiling; a final static trim takes
    care of inter-sample peaks measured at 4× oversampling. Returns the limited audio and what was done."""
    x = np.asarray(wav, dtype=np.float64)
    if x.ndim != 1:
        x = x.reshape(-1)
    if x.shape[0] == 0:
        return x.astype(np.float32), {"input_peak_db": -np.inf, "input_true_peak_db": -np.inf, "output_true_peak_db": -np.inf, "gain_reduction_db": 0.0, "limited_samples": 0}
    if not np.all(np.isfinite(x)):
        x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    ceiling = 10 ** (ceiling_db / 20)
    peak = np.abs(x)
    input_peak = float(peak.max())
    input_tp = true_peak(x)
    needed = np.minimum(1.0, ceiling / np.maximum(peak, 1e-12))
    la = max(1, int(sr * lookahead_ms / 1000))
    rel = max(1, int(sr * release_ms / 1000))
    gain = _sliding_min(needed, la, la)  # hold the reduction around each peak
    gain = _moving_mean(gain, la // 2, la // 2)  # soften the attack (window lies inside the hold)
    gain = _sliding_min(gain, rel, 0)  # keep the reduction for the release time
    gain = _moving_mean(gain, 0, rel)  # ease back to unity (window lies inside the hold)
    y = x * gain
    limited = int(np.count_nonzero(gain < 0.999))
    tp = true_peak(y)
    trim = 1.0
    if tp > ceiling:
        trim = ceiling / tp
        y = y * trim
        tp = tp * trim
    y = np.clip(y, -1.0, 1.0)  # never reached; a guard for the PCM-16 conversion
    db = lambda v: float(20 * np.log10(v)) if v > 0 else -np.inf  # noqa: E731
    stats = {"input_peak_db": db(input_peak), "input_true_peak_db": db(input_tp), "output_true_peak_db": db(tp), "gain_reduction_db": db(float(gain.min()) * trim), "limited_samples": limited}
    return y.astype(np.float32), stats


# ------------------------------------------------------------------------------------------------ reference check
def _decode_with_ffmpeg(src: str) -> tuple[np.ndarray, int]:
    out = src + ".decoded.wav"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-c:a", "pcm_s16le", out], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise ValueError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "ffmpeg could not decode it")
    try:
        data, sr = sf.read(out, dtype="float32", always_2d=True)
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass
    return data, int(sr)


def check_reference(path: str) -> dict[str, float]:
    """The reference must be a decodable recording with at least a second of signal. Returns duration and peak;
    raises HTTPException(400) with a message that says what to upload instead."""
    try:
        data, sr = sf.read(path, dtype="float32", always_2d=True)
    except Exception:  # noqa: BLE001 — not a format libsndfile reads (m4a, mp3 variants…): let ffmpeg try
        try:
            data, sr = _decode_with_ffmpeg(path)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"reference recording could not be decoded ({e}); upload a WAV, FLAC, MP3 or M4A recording of the voice") from e
    seconds = data.shape[0] / sr if sr else 0.0
    if seconds < REFERENCE_MIN_SECONDS:
        raise HTTPException(status_code=400, detail=f"reference recording is {seconds:.2f} s; at least {REFERENCE_MIN_SECONDS:.0f} s of speech is needed (3–15 s works best)")
    if seconds > REFERENCE_MAX_SECONDS:
        raise HTTPException(status_code=400, detail=f"reference recording is {seconds:.1f} s; send a window of at most {REFERENCE_MAX_SECONDS:.0f} s (the engines use 12–15 s)")
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak < 1e-4:
        raise HTTPException(status_code=400, detail="reference recording is silent")
    return {"seconds": seconds, "sample_rate": float(sr), "peak": peak}


def _parse_number(raw: str, name: str, lo: float, hi: float, default: float, integer: bool = False) -> float:
    if raw is None or str(raw).strip() == "":
        return default
    try:
        v = float(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"{name} must be a number") from e
    if not (lo <= v <= hi):
        raise HTTPException(status_code=400, detail=f"{name} must be between {lo:g} and {hi:g}")
    return int(round(v)) if integer else v


# IndexTTS 2.5 emotion vector order: happy, angry, sad, afraid, disgusted, melancholic, surprised, calm
EMOTIONS = {
    "happy": [1, 0, 0, 0, 0, 0, 0, 0], "joy": [1, 0, 0, 0, 0, 0, 0, 0], "laugh": [0.9, 0, 0, 0, 0, 0, 0.2, 0],
    "angry": [0, 1, 0, 0, 0, 0, 0, 0], "anger": [0, 1, 0, 0, 0, 0, 0, 0], "furious": [0, 1, 0, 0, 0, 0, 0, 0],
    "sad": [0, 0, 1, 0, 0, 0, 0, 0], "cry": [0, 0, 1, 0, 0, 0, 0, 0], "grief": [0, 0, 0.8, 0, 0, 0.5, 0, 0],
    "afraid": [0, 0, 0, 1, 0, 0, 0, 0], "fear": [0, 0, 0, 1, 0, 0, 0, 0], "scared": [0, 0, 0, 1, 0, 0, 0, 0], "nervous": [0, 0, 0, 0.6, 0, 0, 0.2, 0],
    "disgust": [0, 0, 0, 0, 1, 0, 0, 0], "melancholic": [0, 0, 0, 0, 0, 1, 0, 0], "tired": [0, 0, 0.2, 0, 0, 0.8, 0, 0], "quiet": [0, 0, 0, 0, 0, 0.4, 0, 0.8],
    "surprised": [0, 0, 0, 0, 0, 0, 1, 0], "surprise": [0, 0, 0, 0, 0, 0, 1, 0], "shock": [0, 0, 0, 0.3, 0, 0, 0.9, 0],
    "calm": [0, 0, 0, 0, 0, 0, 0, 1], "neutral": [0, 0, 0, 0, 0, 0, 0, 1], "warm": [0.4, 0, 0, 0, 0, 0, 0, 0.8], "gentle": [0.2, 0, 0, 0, 0, 0, 0, 0.9], "firm": [0, 0.3, 0, 0, 0, 0, 0, 0.8],
}


def emotion_vector(text: str | None) -> list[float] | None:
    if not text:
        return None
    t = text.lower()
    for k, v in EMOTIONS.items():
        if re.search(rf"\b{k}", t):
            return [float(x) for x in v]
    return None


class IndexEngine:
    name = "indextts"
    model = "IndexTTS-2.5"
    sample_rate = 22050

    def __init__(self) -> None:
        from indextts.infer_v2_5 import IndexTTS2  # type: ignore

        ck = os.path.join(MODEL_ROOT, "indextts-2.5")
        # use_cuda_kernel=False: the bundled BigVGAN kernel is built for sm_70/80 only and cannot run on Blackwell
        self.tts = IndexTTS2(cfg_path=os.path.join(ck, "config.yaml"), model_dir=ck, use_bf16=True, device="cuda:0", use_cuda_kernel=False, use_deepspeed=False, use_qwen_emo=False)

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, alpha: float, params: dict[str, Any]) -> tuple[np.ndarray, int]:
        seed_everything(int(params["seed"]))
        speed = float(params["speed"])
        lang = "AR" if language == "ar" else "EN"
        vec = emotion_vector(emotion)
        kwargs: dict[str, Any] = {"spk_audio_prompt": ref, "text": text, "lang": lang, "output_path": None, "use_random": False, "interval_silence": 200, "max_text_tokens_per_segment": 120, "duration_factor": max(0.5, min(2.0, 1.0 / speed))}
        if vec:
            kwargs["emo_vector"] = vec
            kwargs["emo_alpha"] = alpha
        sr, wav = self.tts.infer(**kwargs)
        wav = np.asarray(wav)
        if wav.ndim == 2:
            wav = wav[:, 0] if wav.shape[1] <= 2 else wav[0]
        return wav.astype(np.float32) / 32768.0, int(sr)


class HabibiEngine:
    name = "habibi"
    model = "Habibi-TTS IRQ (F5-TTS v1)"
    sample_rate = 24000

    def __init__(self) -> None:
        from importlib.resources import files

        from f5_tts.infer.utils_infer import load_model, load_vocoder  # type: ignore
        from hydra.utils import get_class  # type: ignore
        from omegaconf import OmegaConf  # type: ignore

        hb = os.path.join(MODEL_ROOT, "habibi", "Specialized", "IRQ")
        cfg = OmegaConf.load(str(files("f5_tts").joinpath("configs/F5TTS_v1_Base.yaml")))
        model_cls = get_class(f"f5_tts.model.{cfg.model.backbone}")
        self.vocoder = load_vocoder(vocoder_name="vocos", is_local=False, local_path="", device="cuda")
        # `net`, not `model`: the class attribute `model` is the human-readable name sent back in the x-model header
        self.net = load_model(model_cls, cfg.model.arch, os.path.join(hb, "model_100000.safetensors"), mel_spec_type="vocos", vocab_file=os.path.join(hb, "vocab.txt"), device="cuda")

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, alpha: float, params: dict[str, Any]) -> tuple[np.ndarray, int]:
        from f5_tts.infer.utils_infer import preprocess_ref_audio_text  # type: ignore
        from habibi_tts.infer.utils_infer import infer_process  # type: ignore

        # F5 has no emotion input: delivery comes from the reference. `emotion`/`alpha` are accepted for API parity.
        ref_audio, ref_txt = preprocess_ref_audio_text(ref, ref_text or "")
        seed_everything(int(params["seed"]))  # after preprocessing, which may run Whisper when no reference text was given
        wav, sr, _ = infer_process(ref_audio, ref_txt, text, self.net, self.vocoder, mel_spec_type="vocos", nfe_step=int(params["nfe_step"]), cfg_strength=float(params["cfg_strength"]), sway_sampling_coef=float(params["sway_sampling_coef"]), speed=float(params["speed"]), cross_fade_duration=0.15, target_rms=0.1, device="cuda", dialect_id=None)
        return np.asarray(wav, dtype=np.float32), int(sr)


def engine():
    global _engine
    with _lock:
        if _engine is None:
            t0 = time.time()
            _engine = IndexEngine() if ENGINE == "indextts" else HabibiEngine()
            print(f"[tts] loaded {_engine.model} in {time.time() - t0:.1f}s", flush=True)
        return _engine


def weights_present() -> bool:
    if ENGINE == "indextts":
        return os.path.exists(os.path.join(MODEL_ROOT, "indextts-2.5", "gpt.pth"))
    return os.path.exists(os.path.join(MODEL_ROOT, "habibi", "Specialized", "IRQ", "model_100000.safetensors"))


@app.get("/health")
def health():
    return {"ok": True, "engine": ENGINE, "engines": [ENGINE], "engine_version": ENGINE_VERSION, "loaded": _engine is not None, "weights_present": weights_present(), "gpu": gpu_mem(), "peak_ceiling_dbtp": PEAK_CEILING_DBTP}


def release_host_memory() -> dict[str, Any]:
    """Hand the heap the dropped model lived in back to the system. Freed Python/torch CPU memory stays in glibc's
    arenas after gc (docs/research/MODEL-STACK-2026-10.md §1.2: ~21 GB of host RAM held after a GPU unload);
    malloc_trim(0) returns it. Reports the process's resident memory after."""
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
    global _engine
    with _lock:
        _engine = None
    try:
        import gc

        gc.collect()
        import torch  # type: ignore

        torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem(), "host": release_host_memory()}


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...), language: str = Form("en"), dialect: str = Form(""), engine_name: str = Form("", alias="engine"),
    reference: UploadFile = File(...), reference_text: str = Form(""), emotion: str = Form(""), emotion_alpha: float = Form(0.7),
    speed: str = Form(""), seed: str = Form(""), nfe_step: str = Form(""), cfg_strength: str = Form(""), cfg: str = Form(""), sway_sampling_coef: str = Form(""),
):
    if not weights_present():
        raise HTTPException(status_code=503, detail=f"{ENGINE} weights are still downloading; try again in a few minutes")
    if engine_name and engine_name != ENGINE:
        raise HTTPException(status_code=400, detail=f"this service runs {ENGINE}, not {engine_name}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text longer than 2000 characters; split it")
    # the parameters actually used are echoed back (x-params) so an identity can pin them and a take can be redone
    params: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, random.randint(0, 2**31 - 1), integer=True)),
        "speed": _parse_number(speed, "speed", 0.5, 2.0, 1.0),
    }
    if ENGINE == "habibi":
        params["nfe_step"] = int(_parse_number(nfe_step, "nfe_step", 4, 128, 32, integer=True))
        params["cfg_strength"] = _parse_number(cfg_strength or cfg, "cfg_strength", 0.0, 5.0, 2.0)
        params["sway_sampling_coef"] = _parse_number(sway_sampling_coef, "sway_sampling_coef", -1.0, 1.0, -1.0)
    else:
        params["emotion_alpha"] = _parse_number(str(emotion_alpha), "emotion_alpha", 0.0, 1.0, 0.7)
    data = await reference.read()
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="reference recording is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref_path = f.name
    try:
        ref_info = check_reference(ref_path)
        t0 = time.time()
        e = engine()
        with _lock:
            wav, sr = e.synthesize(text, language, ref_path, reference_text or None, emotion or None, float(params.get("emotion_alpha", emotion_alpha)), params)
        if wav.size == 0:
            raise HTTPException(status_code=500, detail="the engine returned no audio")
        wav, limiter = limit_peaks(wav, sr)
        buf = io.BytesIO()
        # the file carries its own provenance (WAV INFO chunk: ISFT/ICMT, read by ffprobe as encoder/comment) so that
        # a generated line can never pass for a recording when someone tries to clone a voice from it
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="PCM_16", format="WAV") as out:
            out.software = f"vewbox-tts {e.name}"
            out.comment = f"synthetic speech; engine={e.name}; seed={params['seed']}; not a voice reference"
            out.write(wav)
        dur = wav.shape[0] / sr
        ms = int((time.time() - t0) * 1000)
        print(f"[tts] {ENGINE} {language} {len(text)} chars seed {params['seed']} -> {dur:.2f}s in {ms} ms; peak in {limiter['input_true_peak_db']:.1f} dBTP, out {limiter['output_true_peak_db']:.1f} dBTP, reduction {limiter['gain_reduction_db']:.1f} dB on {limiter['limited_samples']} samples; ref {ref_info['seconds']:.1f}s", flush=True)
        headers = {
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": e.name, "x-model": e.model, "x-ms": str(ms),
            "x-engine-version": ENGINE_VERSION, "x-seed": str(params["seed"]), "x-params": json.dumps(params),
            "x-true-peak": f"{limiter['output_true_peak_db']:.2f}", "x-gain-reduction": f"{limiter['gain_reduction_db']:.2f}", "x-input-true-peak": f"{limiter['input_true_peak_db']:.2f}",
        }
        return Response(content=buf.getvalue(), media_type="audio/wav", headers=headers)
    finally:
        try:
            os.unlink(ref_path)
        except OSError:
            pass

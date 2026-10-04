"""Voice design and speaker embeddings — the studio's third voice service, in the contract style of docker/tts/app.py.

VoxCPM2 (OpenBMB, 2 B, Apache-2.0) designs a voice from a text description alone: VoxCPM2's zero-shot mode reads a
leading "(description)" as the voice instruction. No audio goes in, so the result belongs to nobody (Rule V-DESIGN,
docs/research/VOICE-IDENTITY-V2.md §2.3). ECAPA-TDNN (SpeechBrain spkrec-ecapa-voxceleb, Apache-2.0) turns a recording
into a 192-d speaker vector for similarity, seed-to-seed consistency and cast distinctness (§3.3, §5.1).

POST /design      multipart: description, text, language (en|ar), seed? (int; one is drawn and reported when absent),
                  n? (1–3 candidates; candidate k uses seed+k), cfg_value? (0.5–5, default 2.0),
                  inference_timesteps? (4–50, default 10), design_id? ([A-Za-z0-9_-]{1,64}; one is drawn when absent),
                  loudness_target? (LUFS −30…−12: a static gain before the limiter; default none)
                  -> application/json {design_id, engine, model, engine_version, language, description, text, seed,
                     seeds, params, ms, candidates: [{index, seed, generation_ms, native, reference, embedding}],
                     similarity: {model, matrix}} where native (48 kHz) and reference (24 kHz, what IndexTTS/Habibi
                     clone from) are {sample_rate, channels, subtype, bytes, sha256, duration, true_peak_dbtp,
                     input_true_peak_dbtp, gain_reduction_db, limited_samples, lufs, ebur128_true_peak_dbtp,
                     clipped_samples, wav_base64}
                  headers x-engine, x-model, x-engine-version, x-seed, x-seeds, x-design-id, x-params (json), x-ms
POST /embed       multipart: audio (file) -> {model, version, dim, embedding (L2-normalised), duration, ms}
POST /similarity  multipart: a, b (files) -> {model, version, cosine, a: {duration}, b: {duration}, ms}
POST /unload      drop VoxCPM2 and ECAPA from memory
GET  /health      engine, version, loaded, weights present, GPU memory (device and this process)

Every WAV carries the studio's provenance tag (WAV INFO: ISFT "vewbox-tts voxcpm2", ICMT "synthetic speech; …;
not a voice reference") plus the design id, so a designed seed can never pass for a recording; it becomes a clone
source only through a VoiceDesignRecord whose sha256 matches the file (the sha256 covers the tag).

Weights come from the models volume (fetcher group `voice-design`); this service never downloads (HF_HUB_OFFLINE=1).
The peak limiter, true-peak meter, seeding and decoding are imported from docker/tts/app.py (one measurement stack).
"""
from __future__ import annotations

import base64
import gc
import hashlib
import io
import json
import os
import random
import re
import secrets
import subprocess
import tempfile
import threading
import time
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

# the line engines' helpers: same limiter, same true-peak definition, same seeding, same ffmpeg fallback decoder
from vewbox_tts_shared import PEAK_CEILING_DBTP, _decode_with_ffmpeg, _parse_number, _pkg_version, gpu_mem, limit_peaks, seed_everything, true_peak  # noqa: E402

MODEL_ROOT = os.environ.get("MODEL_ROOT", "/models")
VOXCPM_DIR = os.environ.get("VOXCPM_DIR", os.path.join(MODEL_ROOT, "tts", "voxcpm2"))
ECAPA_DIR = os.environ.get("ECAPA_DIR", os.path.join(MODEL_ROOT, "eval", "spkrec-ecapa-voxceleb"))
ECAPA_DEVICE = os.environ.get("ECAPA_DEVICE", "cpu")
# torch.compile needs a C compiler for Triton's launcher, which the runtime image does not carry; eager mode is the default
VOXCPM_OPTIMIZE = os.environ.get("VOXCPM_OPTIMIZE", "0") == "1"
REFERENCE_SAMPLE_RATE = 24000  # what IndexTTS 2.5 and Habibi (F5) take as a reference
MAX_CANDIDATES = 3
MAX_DESCRIPTION_CHARS = 300
MAX_TEXT_CHARS = 1000
EMBED_MIN_SECONDS = 0.5
EMBED_MAX_SECONDS = 600.0

app = FastAPI(title="vewbox-tts-design")
_lock = threading.Lock()  # VoxCPM2 (one model, one KV cache: one request at a time)
_ecapa_lock = threading.Lock()
_design: Any = None
_ecapa: Any = None


# ------------------------------------------------------------------------------------------------ provenance / version
def _manifest_state() -> dict[str, Any]:
    try:
        with open(os.path.join(MODEL_ROOT, ".manifest-state.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _weights_tag(key: str, repo: str) -> str:
    rec = _manifest_state().get(key) or {}
    rev = str(rec.get("revision") or "")[:7]
    sha = str(rec.get("sha256") or "")[:12]
    out = repo + (f"@{rev}" if rev else "")
    return out + (f" sha256:{sha}" if sha else "")


def engine_version() -> str:
    """What produced the audio: package, model file (repo revision and sha256 from the fetcher's record), torch. The
    environment may override it (VEWBOX_ENGINE_VERSION)."""
    forced = os.environ.get("VEWBOX_ENGINE_VERSION")
    if forced:
        return forced
    return "; ".join([f"voxcpm {_pkg_version('voxcpm') or '?'}", f"model {_weights_tag('tts/voxcpm2/model.safetensors', 'openbmb/VoxCPM2')}", f"torch {_pkg_version('torch') or '?'}"])


def ecapa_version() -> str:
    return "; ".join([f"speechbrain {_pkg_version('speechbrain') or '?'}", f"model {_weights_tag('eval/spkrec-ecapa-voxceleb/embedding_model.ckpt', 'speechbrain/spkrec-ecapa-voxceleb')}"])


def design_weights_present() -> bool:
    return all(os.path.exists(os.path.join(VOXCPM_DIR, f)) for f in ("config.json", "tokenizer.json", "model.safetensors", "audiovae.pth"))


def ecapa_weights_present() -> bool:
    return all(os.path.exists(os.path.join(ECAPA_DIR, f)) for f in ("hyperparams.yaml", "embedding_model.ckpt", "mean_var_norm_emb.ckpt", "classifier.ckpt", "label_encoder.txt"))


def torch_mem() -> dict[str, int] | None:
    """This process's own CUDA memory (the device figure in gpu_mem() includes every other service on the card)."""
    try:
        import torch  # type: ignore

        if not torch.cuda.is_available() or not torch.cuda.is_initialized():
            return {"allocated_mb": 0, "reserved_mb": 0, "peak_reserved_mb": 0}
        mb = lambda v: int(v / 1048576)  # noqa: E731
        return {"allocated_mb": mb(torch.cuda.memory_allocated()), "reserved_mb": mb(torch.cuda.memory_reserved()), "peak_reserved_mb": mb(torch.cuda.max_memory_reserved())}
    except Exception:  # noqa: BLE001
        return None


# ------------------------------------------------------------------------------------------------ engines
class DesignEngine:
    name = "voxcpm2"
    model = "openbmb/VoxCPM2"

    def __init__(self) -> None:
        from voxcpm import VoxCPM  # type: ignore

        # the local folder directly (no snapshot_download), no denoiser (it is for reference audio, which design has none
        # of, and it would pull ModelScope), no text normaliser (wetext; the worker owns normalisation)
        self.vox = VoxCPM(voxcpm_model_path=VOXCPM_DIR, zipenhancer_model_path=None, enable_denoiser=False, optimize=VOXCPM_OPTIMIZE, device="cuda")
        self.sample_rate = int(self.vox.tts_model.sample_rate)

    def design(self, description: str, text: str, seed: int, cfg_value: float, steps: int) -> np.ndarray:
        seed_everything(seed)
        wav = self.vox.generate(text=f"({description}){text}", cfg_value=cfg_value, inference_timesteps=steps, normalize=False, denoise=False, retry_badcase=True)
        wav = np.asarray(wav, dtype=np.float32).reshape(-1)
        return wav


class SpeakerEncoder:
    model = "speechbrain/spkrec-ecapa-voxceleb"
    sample_rate = 16000
    dim = 192

    def __init__(self) -> None:
        try:
            from speechbrain.inference.speaker import EncoderClassifier  # type: ignore
        except ImportError:  # older layout
            from speechbrain.pretrained import EncoderClassifier  # type: ignore
        # savedir holds symlinks to the volume's files (SpeechBrain's local strategy). hyperparams.yaml names its files
        # as `<pretrained_path>/…` with pretrained_path = the Hub repo id: point it at the local folder, or SpeechBrain
        # asks the Hub for them (refused here: HF_HUB_OFFLINE=1)
        self.enc = EncoderClassifier.from_hparams(source=ECAPA_DIR, savedir="/tmp/ecapa-voxceleb", run_opts={"device": ECAPA_DEVICE}, overrides={"pretrained_path": ECAPA_DIR})
        self.enc.eval()

    def embed(self, wav16k: np.ndarray) -> np.ndarray:
        import torch  # type: ignore

        with torch.inference_mode():
            x = torch.from_numpy(np.ascontiguousarray(wav16k, dtype=np.float32)).unsqueeze(0).to(ECAPA_DEVICE)
            e = self.enc.encode_batch(x)  # [1, 1, 192]; normalize=False, as SpeechBrain's own verification does
        v = e.reshape(-1).float().cpu().numpy().astype(np.float64)
        n = float(np.linalg.norm(v))
        if not np.isfinite(n) or n < 1e-9:
            raise HTTPException(status_code=422, detail="the speaker encoder returned an empty vector for this audio")
        return v / n


def design_engine() -> DesignEngine:
    global _design
    with _lock:
        if _design is None:
            t0 = time.time()
            _design = DesignEngine()
            print(f"[tts-design] loaded VoxCPM2 in {time.time() - t0:.1f}s; torch {torch_mem()}", flush=True)
        return _design


def speaker_encoder() -> SpeakerEncoder:
    global _ecapa
    with _ecapa_lock:
        if _ecapa is None:
            t0 = time.time()
            _ecapa = SpeakerEncoder()
            print(f"[tts-design] loaded ECAPA on {ECAPA_DEVICE} in {time.time() - t0:.1f}s", flush=True)
        return _ecapa


# ------------------------------------------------------------------------------------------------ audio helpers
def _finite(v: float, digits: int = 2) -> float | None:
    """JSON has no -inf (silence measures -inf dB): report it as null."""
    return round(float(v), digits) if v is not None and np.isfinite(v) else None


def _resample(wav: np.ndarray, sr: int, target: int) -> np.ndarray:
    if sr == target:
        return wav.astype(np.float32)
    import librosa  # type: ignore

    return librosa.resample(wav.astype(np.float32), orig_sr=sr, target_sr=target, res_type="soxr_hq").astype(np.float32)


def load_audio(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    """Decode an upload to mono float32 (libsndfile first, ffmpeg for everything else)."""
    if len(data) < 64:
        raise HTTPException(status_code=400, detail="audio file is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename or "a.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        try:
            x, sr = sf.read(path, dtype="float32", always_2d=True)
        except Exception:  # noqa: BLE001
            try:
                x, sr = _decode_with_ffmpeg(path)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"audio could not be decoded ({e}); send WAV, FLAC, MP3 or M4A") from e
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    mono = x.mean(axis=1) if x.ndim == 2 else x
    return np.nan_to_num(mono.astype(np.float32)), int(sr)


def ebur128(path: str) -> dict[str, float | None]:
    """Integrated loudness (LUFS) and true peak (dBTP) by ffmpeg's EBU R128 filter — the figures the worker's QA uses."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, timeout=120)
    err = r.stderr or ""
    summary = err[err.rfind("Summary:"):] if "Summary:" in err else ""
    lufs = re.search(r"I:\s*(-?[\d.]+|-inf)\s*LUFS", summary)
    tp = re.search(r"True peak:\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS", summary, re.S)
    val = lambda m: (None if m is None or m.group(1) == "-inf" else float(m.group(1)))  # noqa: E731
    return {"lufs": val(lufs), "true_peak_dbtp": val(tp)}


def _write_pcm16(x: np.ndarray, sr: int, comment: str, software: str) -> bytes:
    buf = io.BytesIO()
    with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="PCM_16", format="WAV") as out:
        out.software = software
        out.comment = comment
        out.write(x)
    return buf.getvalue()


def _ebur128_bytes(data: bytes) -> dict[str, float | None]:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(data)
        tmp = f.name
    try:
        return ebur128(tmp)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def encode_wav(wav: np.ndarray, sr: int, comment: str, software: str) -> tuple[bytes, dict[str, Any], np.ndarray]:
    """Peak-limit (≤ ceiling dBTP), write PCM-16 mono WAV with the provenance tag, and measure the written file.
    The ceiling must hold on ffmpeg's EBU R128 meter too (the worker's QA reads that one): the limiter's FFT meter and
    ffmpeg's interpolator can disagree by ~0.1 dB after resampling and 16-bit rounding (seen at 24 kHz: −1.00 vs −0.9),
    so when ffmpeg reads above the ceiling a static trim of the difference + 0.1 dB is applied and the file rewritten.
    Returns the file, its measurements and the limited float signal (after any trim)."""
    limited, lim = limit_peaks(wav, sr)
    trim_db = 0.0
    for _ in range(3):
        data = _write_pcm16(limited, sr, comment, software)
        loud = _ebur128_bytes(data)
        tp = loud["true_peak_dbtp"]
        if tp is None or tp <= PEAK_CEILING_DBTP:
            break
        step = (tp - PEAK_CEILING_DBTP) + 0.1
        trim_db -= step
        limited = (limited * (10 ** (-step / 20))).astype(np.float32)
    pcm, _ = sf.read(io.BytesIO(data), dtype="int16")
    clipped = int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767))
    meta = {
        "sample_rate": sr, "channels": 1, "subtype": "PCM_16", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "duration": round(limited.shape[0] / sr, 3), "true_peak_dbtp": _finite(20 * np.log10(max(true_peak(limited), 1e-12))) if limited.size else None,
        "input_true_peak_dbtp": _finite(lim["input_true_peak_db"]), "gain_reduction_db": _finite(lim["gain_reduction_db"] + trim_db), "limited_samples": int(lim["limited_samples"]),
        "trim_db": round(trim_db, 2), "lufs": loud["lufs"], "ebur128_true_peak_dbtp": loud["true_peak_dbtp"], "clipped_samples": clipped,
    }
    return data, meta, limited


def static_gain_to(wav: np.ndarray, sr: int, target_lufs: float) -> tuple[np.ndarray, float | None]:
    """Static gain so the integrated loudness lands on target (measured by ffmpeg on a float copy); the limiter runs after."""
    buf = io.BytesIO()
    sf.write(buf, wav, sr, subtype="FLOAT", format="WAV")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(buf.getvalue())
        tmp = f.name
    try:
        measured = ebur128(tmp)["lufs"]
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    if measured is None or measured < -70:
        return wav, None
    gain_db = target_lufs - measured
    return (wav * (10 ** (gain_db / 20))).astype(np.float32), round(gain_db, 2)


# ------------------------------------------------------------------------------------------------ request checks
ARABIC_LETTER = re.compile(r"[\u0620-\u064A\u0660-\u0669\u066E-\u06D3\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
DESIGN_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# Rule V-DESIGN §4: a description says what a voice is like, never whose voice it is. This deny-list is defence in
# depth; the VOICE_DESIGN job also runs the LLM classifier (names, real role holders) before any GPU work.
IMPERSONATION = [
    re.compile(r"\bsound(?:s|ing)?\s+(?:just\s+|exactly\s+)?like\b", re.I),
    re.compile(r"\b(?:the\s+)?voice\s+of\b", re.I),
    re.compile(r"\bimitat\w*|\bimpersonat\w*|\bmimic\w*|\bclon(?:e|ed|ing)\b|\bdeepfake\w*", re.I),
    re.compile(r"\bin\s+the\s+style\s+of\b", re.I),
    # Arabic: "resembles the voice of", "like the voice of", "imitate/imitation" (whole words, so تقليدي "traditional" passes)
    re.compile(r"يشبه\s+صوت|مثل\s+صوت|صوت\s+مثل|\b[وب]?تقليد\b|\b[يت]?قلّ?د\b"),
]


def check_description(raw: str) -> str:
    d = re.sub(r"\s+", " ", (raw or "").strip())
    if not d:
        raise HTTPException(status_code=400, detail="empty description; describe the voice: sex, age, pitch, pace, timbre, accent, mood, recording quality")
    if len(d) > MAX_DESCRIPTION_CHARS:
        raise HTTPException(status_code=400, detail=f"description longer than {MAX_DESCRIPTION_CHARS} characters")
    for rx in IMPERSONATION:
        m = rx.search(d)
        if m:
            raise HTTPException(status_code=400, detail=f"description refused (Rule V-DESIGN): \"{m.group(0)}\" asks for a resemblance to someone; describe attributes only (sex, age, pitch, pace, timbre, accent, mood)")
    # VoxCPM2 reads "(…)" as the instruction: brackets inside the description would end it early
    return re.sub(r"\s*[()（）\[\]]\s*", ", ", d).strip(" ,")


def check_text(raw: str, language: str) -> str:
    t = re.sub(r"\s+", " ", (raw or "").strip())
    if not t:
        raise HTTPException(status_code=400, detail="empty text")
    if len(t) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=400, detail=f"text longer than {MAX_TEXT_CHARS} characters; a design sample is one paragraph (10–15 s)")
    if t[0] in "(（":
        raise HTTPException(status_code=400, detail="text must not start with a parenthesis: VoxCPM2 reads a leading (…) as a voice instruction")
    has_arabic = bool(ARABIC_LETTER.search(t))
    if language == "ar" and not has_arabic:
        raise HTTPException(status_code=400, detail="language is ar but the text has no Arabic letters")
    if language == "en" and has_arabic:
        raise HTTPException(status_code=400, detail="language is en but the text contains Arabic letters")
    return t


# ------------------------------------------------------------------------------------------------ endpoints
@app.get("/health")
def health():
    return {
        "ok": True, "engine": DesignEngine.name, "engines": [DesignEngine.name, "ecapa"], "engine_version": engine_version(), "ecapa_version": ecapa_version(),
        "loaded": _design is not None, "ecapa_loaded": _ecapa is not None, "weights_present": design_weights_present(), "ecapa_weights_present": ecapa_weights_present(),
        "gpu": gpu_mem(), "torch": torch_mem(), "peak_ceiling_dbtp": PEAK_CEILING_DBTP, "sample_rates": {"native": 48000, "reference": REFERENCE_SAMPLE_RATE},
        "max_candidates": MAX_CANDIDATES, "ecapa_device": ECAPA_DEVICE, "optimize": VOXCPM_OPTIMIZE,
    }


def release_host_memory() -> dict[str, Any]:
    """Hand the heap the dropped models lived in back to the system: freed memory stays in glibc's arenas after gc
    (docs/research/MODEL-STACK-2026-10.md §1.2); malloc_trim(0) returns it. Reports resident memory after."""
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
    global _design, _ecapa
    with _lock:
        _design = None
    with _ecapa_lock:
        _ecapa = None
    gc.collect()
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "gpu": gpu_mem(), "torch": torch_mem(), "host": release_host_memory()}


@app.post("/design")
def design(
    description: str = Form(...), text: str = Form(...), language: str = Form("en"), seed: str = Form(""), n: str = Form(""),
    cfg_value: str = Form(""), inference_timesteps: str = Form(""), design_id: str = Form(""), loudness_target: str = Form(""),
):
    # the request is checked first (a refused description is refused whatever the engine's state), then the engine
    language = (language or "en").strip().lower()
    if language not in ("en", "ar"):
        raise HTTPException(status_code=400, detail="language must be en or ar (Iraqi has no designed path; Rule V-DESIGN / §3.2)")
    desc = check_description(description)
    body = check_text(text, language)
    did = (design_id or "").strip() or f"vd-{secrets.token_hex(6)}"
    if not DESIGN_ID.match(did):
        raise HTTPException(status_code=400, detail="design_id may hold only letters, digits, _ and - (at most 64)")
    if not design_weights_present():
        raise HTTPException(status_code=503, detail="VoxCPM2 weights are not in the models volume yet (fetcher group voice-design); automatic voice creation needs the voice-design engine")
    params: dict[str, Any] = {
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1 - MAX_CANDIDATES, random.randint(0, 2**31 - 1 - MAX_CANDIDATES), integer=True)),
        "n": int(_parse_number(n, "n", 1, MAX_CANDIDATES, MAX_CANDIDATES, integer=True)),
        "cfg_value": _parse_number(cfg_value, "cfg_value", 0.5, 5.0, 2.0),
        "inference_timesteps": int(_parse_number(inference_timesteps, "inference_timesteps", 4, 50, 10, integer=True)),
    }
    target = None if not str(loudness_target).strip() else _parse_number(loudness_target, "loudness_target", -30.0, -12.0, -20.0)
    if target is not None:
        params["loudness_target"] = target
    seeds = [params["seed"] + k for k in range(params["n"])]

    t0 = time.time()
    try:
        e = design_engine()
    except Exception as ex:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"VoxCPM2 could not be loaded: {str(ex)[:300]}") from ex
    raw: list[tuple[int, np.ndarray, int]] = []
    with _lock:
        for s in seeds:
            g0 = time.time()
            try:
                wav = e.design(desc, body, s, float(params["cfg_value"]), int(params["inference_timesteps"]))
            except Exception as ex:  # noqa: BLE001 — CUDA out of memory and the like: say what, do not hang
                raise HTTPException(status_code=500, detail=f"VoxCPM2 failed on seed {s}: {type(ex).__name__}: {str(ex)[:300]}") from ex
            if wav.size == 0:
                raise HTTPException(status_code=500, detail=f"VoxCPM2 returned no audio for seed {s}")
            raw.append((s, wav, int((time.time() - g0) * 1000)))
    sr = e.sample_rate

    software = f"vewbox-tts {DesignEngine.name}"
    candidates: list[dict[str, Any]] = []
    for k, (s, wav, gen_ms) in enumerate(raw):
        gain = None
        if target is not None:
            wav, gain = static_gain_to(wav, sr, float(target))
        comment = f"synthetic speech; engine={DesignEngine.name}; designId={did}; candidate={k + 1}; seed={s}; designed voice, not a recording; not a voice reference"
        native_bytes, native, native_limited = encode_wav(wav, sr, comment, software)
        # the reference the line engines clone from: the limited 48 kHz take, resampled (soxr HQ), limited again
        ref_bytes, reference, _ = encode_wav(_resample(native_limited, sr, REFERENCE_SAMPLE_RATE), REFERENCE_SAMPLE_RATE, comment, software)
        native["wav_base64"] = base64.b64encode(native_bytes).decode("ascii")
        reference["wav_base64"] = base64.b64encode(ref_bytes).decode("ascii")
        cand: dict[str, Any] = {"index": k + 1, "seed": s, "generation_ms": gen_ms, "native": native, "reference": reference}
        if gain is not None:
            cand["static_gain_db"] = gain
        candidates.append(cand)
        print(f"[tts-design] {did} cand {k + 1} seed {s}: {native['duration']:.2f}s in {gen_ms} ms; {native['lufs']} LUFS, TP {native['true_peak_dbtp']} dBTP (in {native['input_true_peak_dbtp']}), clipped {native['clipped_samples']}", flush=True)

    # seed-to-seed speaker similarity on the 24 kHz references (CPU ECAPA; skipped, not faked, without its weights)
    similarity: dict[str, Any] | None = None
    if ecapa_weights_present():
        try:
            enc = speaker_encoder()
            vecs = []
            for c in candidates:
                x, xsr = load_audio(base64.b64decode(c["reference"]["wav_base64"]), "ref.wav")
                with _ecapa_lock:
                    v = enc.embed(_resample(x, xsr, SpeakerEncoder.sample_rate))
                c["embedding"] = [round(float(a), 6) for a in v]
                vecs.append(v)
            m = np.array([[float(np.dot(a, b)) for b in vecs] for a in vecs])
            similarity = {"model": SpeakerEncoder.model, "version": ecapa_version(), "matrix": [[round(float(c), 4) for c in row] for row in m]}
        except HTTPException:
            raise
        except Exception as ex:  # noqa: BLE001
            similarity = {"model": SpeakerEncoder.model, "error": str(ex)[:300]}

    ms = int((time.time() - t0) * 1000)
    version = engine_version()
    print(f"[tts-design] {did} {language} desc {len(desc)} chars text {len(body)} chars, {len(candidates)} candidates in {ms} ms; torch {torch_mem()}", flush=True)
    payload = {
        "ok": True, "design_id": did, "engine": DesignEngine.name, "model": DesignEngine.model, "engine_version": version, "language": language,
        "description": desc, "text": body, "seed": params["seed"], "seeds": seeds, "params": params, "ms": ms, "candidates": candidates, "similarity": similarity,
        "label": "Studio-designed synthetic voice — not a real person",
    }
    headers = {
        "x-engine": DesignEngine.name, "x-model": DesignEngine.model, "x-engine-version": version, "x-seed": str(params["seed"]), "x-seeds": ",".join(str(s) for s in seeds),
        "x-design-id": did, "x-params": json.dumps(params), "x-ms": str(ms), "x-candidates": str(len(candidates)),
    }
    return JSONResponse(content=payload, headers=headers)


def _read_upload(f: UploadFile) -> tuple[np.ndarray, float]:
    data = f.file.read()
    x, sr = load_audio(data, f.filename or "a.wav")
    seconds = x.shape[0] / sr if sr else 0.0
    if seconds < EMBED_MIN_SECONDS:
        raise HTTPException(status_code=400, detail=f"audio is {seconds:.2f} s; at least {EMBED_MIN_SECONDS} s of speech is needed (3 s or more is reliable)")
    if seconds > EMBED_MAX_SECONDS:
        raise HTTPException(status_code=400, detail=f"audio is {seconds:.0f} s; send at most {EMBED_MAX_SECONDS:.0f} s")
    if float(np.max(np.abs(x))) < 1e-4:
        raise HTTPException(status_code=400, detail="audio is silent")
    return _resample(x, sr, SpeakerEncoder.sample_rate), seconds


# plain `def` endpoints: FastAPI runs them in its thread pool, so a CPU embedding never blocks /health
@app.post("/embed")
def embed(audio: UploadFile = File(...)):
    if not ecapa_weights_present():
        raise HTTPException(status_code=503, detail="ECAPA weights are not in the models volume yet (fetcher group voice-design)")
    t0 = time.time()
    x, seconds = _read_upload(audio)
    enc = speaker_encoder()
    with _ecapa_lock:
        v = enc.embed(x)
    return {"ok": True, "model": SpeakerEncoder.model, "version": ecapa_version(), "dim": int(v.shape[0]), "embedding": [round(float(a), 6) for a in v], "duration": round(seconds, 3), "ms": int((time.time() - t0) * 1000)}


@app.post("/similarity")
def similarity(a: UploadFile = File(...), b: UploadFile = File(...)):
    if not ecapa_weights_present():
        raise HTTPException(status_code=503, detail="ECAPA weights are not in the models volume yet (fetcher group voice-design)")
    t0 = time.time()
    xa, sa = _read_upload(a)
    xb, sb = _read_upload(b)
    enc = speaker_encoder()
    with _ecapa_lock:
        va = enc.embed(xa)
        vb = enc.embed(xb)
    cos = float(np.clip(np.dot(va, vb), -1.0, 1.0))
    return {"ok": True, "model": SpeakerEncoder.model, "version": ecapa_version(), "cosine": round(cos, 4), "a": {"duration": round(sa, 3)}, "b": {"duration": round(sb, 3)}, "ms": int((time.time() - t0) * 1000)}


# true_peak is re-exported for scripts that import this module to measure a file the same way
__all__ = ["app", "true_peak"]

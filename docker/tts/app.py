"""Voice service — one HTTP contract over two engines.

VEWBOX_ENGINE=indextts : IndexTTS 2.5 (indextts.infer_v2_5.IndexTTS2), languages EN/AR/ZH/JA/ES, emotion vectors.
VEWBOX_ENGINE=habibi   : Habibi-TTS Iraqi specialised model (F5-TTS DiT + vocos), Arabic (IRQ).

POST /synthesize  multipart: text, language (en|ar), dialect?, reference (audio file), reference_text?, emotion?,
                  emotion_alpha?, speed?, seed?  -> audio/wav; headers x-sample-rate, x-duration, x-engine, x-model
POST /unload      drop the model from the GPU
GET  /health      engine, loaded, weights present, GPU memory
"""
from __future__ import annotations

import io
import os
import re
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


def gpu_mem() -> dict[str, int] | None:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        m = pynvml.nvmlDeviceGetMemoryInfo(pynvml.nvmlDeviceGetHandleByIndex(0))
        return {"used_mb": int(m.used / 1048576), "total_mb": int(m.total / 1048576)}
    except Exception:  # noqa: BLE001
        return None


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

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, alpha: float, speed: float, seed: int | None) -> tuple[np.ndarray, int]:
        import torch  # type: ignore

        if seed is not None:
            torch.manual_seed(seed)
        lang = "AR" if language == "ar" else "EN"
        vec = emotion_vector(emotion)
        kwargs: dict[str, Any] = {"spk_audio_prompt": ref, "text": text, "lang": lang, "output_path": None, "use_random": False, "interval_silence": 200, "max_text_tokens_per_segment": 120, "duration_factor": max(0.5, min(2.0, 1.0 / speed)) if speed else 1.0}
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
        self.model = load_model(model_cls, cfg.model.arch, os.path.join(hb, "model_100000.safetensors"), mel_spec_type="vocos", vocab_file=os.path.join(hb, "vocab.txt"), device="cuda")

    def synthesize(self, text: str, language: str, ref: str, ref_text: str | None, emotion: str | None, alpha: float, speed: float, seed: int | None) -> tuple[np.ndarray, int]:
        import torch  # type: ignore
        from f5_tts.infer.utils_infer import preprocess_ref_audio_text  # type: ignore
        from habibi_tts.infer.utils_infer import infer_process  # type: ignore

        ref_audio, ref_txt = preprocess_ref_audio_text(ref, ref_text or "")
        if seed is not None:
            torch.manual_seed(seed)
        wav, sr, _ = infer_process(ref_audio, ref_txt, text, self.model, self.vocoder, mel_spec_type="vocos", nfe_step=32, cfg_strength=2.0, sway_sampling_coef=-1.0, speed=speed or 1.0, cross_fade_duration=0.15, target_rms=0.1, device="cuda", dialect_id=None)
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
    return {"ok": True, "engine": ENGINE, "engines": [ENGINE], "loaded": _engine is not None, "weights_present": weights_present(), "gpu": gpu_mem()}


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
    return {"ok": True, "gpu": gpu_mem()}


@app.post("/synthesize")
async def synthesize(text: str = Form(...), language: str = Form("en"), dialect: str = Form(""), engine_name: str = Form("", alias="engine"), reference: UploadFile = File(...), reference_text: str = Form(""), emotion: str = Form(""), emotion_alpha: float = Form(0.7), speed: float = Form(1.0), seed: str = Form("")):
    if not weights_present():
        raise HTTPException(status_code=503, detail=f"{ENGINE} weights are still downloading; try again in a few minutes")
    if engine_name and engine_name != ENGINE:
        raise HTTPException(status_code=400, detail=f"this service runs {ENGINE}, not {engine_name}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text longer than 2000 characters; split it")
    data = await reference.read()
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="reference recording is empty")
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(reference.filename or "ref.wav")[1] or ".wav", delete=False) as f:
        f.write(data)
        ref_path = f.name
    try:
        t0 = time.time()
        e = engine()
        with _lock:
            wav, sr = e.synthesize(text, language, ref_path, reference_text or None, emotion or None, float(emotion_alpha), float(speed), int(seed) if seed else None)
        if wav.size == 0:
            raise HTTPException(status_code=500, detail="the engine returned no audio")
        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
        dur = wav.shape[0] / sr
        print(f"[tts] {ENGINE} {language} {len(text)} chars -> {dur:.2f}s in {time.time() - t0:.1f}s", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers={"x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-engine": e.name, "x-model": e.model, "x-ms": str(int((time.time() - t0) * 1000))})
    finally:
        try:
            os.unlink(ref_path)
        except OSError:
            pass

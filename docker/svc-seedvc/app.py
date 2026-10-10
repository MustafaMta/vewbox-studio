"""VEWBOX SVC — singing voice conversion with Seed-VC v1 `seed-uvit-whisper-base` (Plachtaa/seed-vc, GPL-3.0): the studio's
singer identity (docs/research/SINGING-IDENTITY-2026-10.md §3). A lead vocal (ACE-Step, separated by htdemucs_ft) is
converted to a character's timbre from the character's own reference clip — the speech seed, or the identity's bootstrapped
SINGING_REFERENCE — F0-conditioned so melismas, glides and quarter-tones follow the source exactly.

This file is a port of the repository's inference.py `load_models` / `main` (GPL-3.0; this file is therefore GPL-3.0 too and
lives in the isolated worker, never in the studio's source) with three changes: weights come from the models volume by
path (no Hugging Face download; HF_HUB_OFFLINE=1), pitch is extracted with torchcrepe (MIT) instead of RMVPE (the mirror's
package notice: research use only), and the result is returned over HTTP.

POST /convert   multipart: source (the vocal to convert), reference (the identity's clip, ≤ 25 s used), diffusion_steps?
                (1-100, 40), length_adjust? (0.5-2, 1.0), inference_cfg_rate? (0-1, 0.7), f0_condition? (1), auto_f0_adjust?
                (0 — never snap the melody), semi_tone_shift? (-12..12, 0), fp16? (1), raw? (1 = float, no limiter)
                -> audio/wav 44.1 kHz; headers x-sample-rate, x-duration, x-ms, x-engine, x-model, x-engine-version,
                   x-settings, x-f0 (source/reference F0 medians and ranges), x-true-peak, x-gain-reduction, x-peak-vram-mb,
                   x-license
POST /unload    drop every model from the card (the GPU lease calls it)
GET  /health    weights present, loaded, revisions, licence, GPU memory
One call = one conversion, deterministic for a given seed (seed? 0-2^31, default 7)."""
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
from vewbox_tts_shared import _parse_number, _pkg_version, gpu_mem, limit_peaks  # noqa: E402

ENGINE = "seed-vc"
COMMIT = os.environ.get("SEEDVC_COMMIT", "51383efd921027683c89e5348211d93ff12ac2a8")
MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", "/models"))
DIT = MODEL_ROOT / "svc" / "seed-vc" / "DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema.pth"
DIT_CONFIG = MODEL_ROOT / "svc" / "seed-vc" / "config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"
BIGVGAN_DIR = MODEL_ROOT / "svc" / "bigvgan_v2_44khz_128band_512x"
CAMPPLUS = MODEL_ROOT / "svc" / "campplus" / "campplus_cn_common.bin"
WHISPER_DIR = MODEL_ROOT / "asr" / "whisper-small"
LICENSE = "GPL-3.0 (Seed-VC code + weights; isolated worker) · whisper-small Apache-2.0 · BigVGAN v2 MIT · CAM++ Apache-2.0 · torchcrepe MIT"
ENGINE_VERSION = f"seed-vc@{COMMIT[:7]} seed-uvit-whisper-base f0 44k; torch {_pkg_version('torch')}; transformers {_pkg_version('transformers')}; torchcrepe {_pkg_version('torchcrepe')}"

app = FastAPI(title="vewbox-svc-seedvc")
_lock = threading.Lock()
_models: dict[str, Any] | None = None


def missing_weights() -> list[str]:
    need = [DIT, DIT_CONFIG, BIGVGAN_DIR / "bigvgan_generator.pt", BIGVGAN_DIR / "config.json", CAMPPLUS, WHISPER_DIR / "model.safetensors", WHISPER_DIR / "config.json", WHISPER_DIR / "preprocessor_config.json"]
    return [str(p.relative_to(MODEL_ROOT)) for p in need if not p.is_file()]


def torch_peak_mb() -> int | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return int(torch.cuda.max_memory_reserved() / 1048576)
    except Exception:  # noqa: BLE001
        pass
    return None


def load_models() -> dict[str, Any]:
    """inference.py load_models, by path. Returns the DiT model, the semantic (whisper) function, the F0 function, the
    vocoder, CAM++, the mel function and the sample rate / hop."""
    import torch  # type: ignore
    import yaml  # type: ignore
    import torchcrepe  # type: ignore
    from modules.commons import build_model, load_checkpoint, recursive_munch  # type: ignore
    from modules.campplus.DTDNN import CAMPPlus  # type: ignore
    from modules.bigvgan import bigvgan  # type: ignore
    from modules.audio import mel_spectrogram  # type: ignore
    from transformers import AutoFeatureExtractor, WhisperModel  # type: ignore

    device = torch.device("cuda")
    config = yaml.safe_load(open(DIT_CONFIG, "r", encoding="utf-8"))
    model_params = recursive_munch(config["model_params"])
    model_params.dit_type = "DiT"
    model = build_model(model_params, stage="DiT")
    sr = int(config["preprocess_params"]["sr"])
    hop = int(config["preprocess_params"]["spect_params"]["hop_length"])
    model, _, _, _ = load_checkpoint(model, None, str(DIT), load_only_params=True, ignore_modules=[], is_distributed=False)
    for key in model:
        model[key].eval()
        model[key].to(device)
    model.cfm.estimator.setup_caches(max_batch_size=1, max_seq_length=8192)

    campplus_model = CAMPPlus(feat_dim=80, embedding_size=192)
    campplus_model.load_state_dict(torch.load(str(CAMPPLUS), map_location="cpu"))
    campplus_model.eval().to(device)

    assert model_params.vocoder.type == "bigvgan", model_params.vocoder.type
    vocoder = bigvgan.BigVGAN.from_pretrained(str(BIGVGAN_DIR), use_cuda_kernel=False)
    vocoder.remove_weight_norm()
    vocoder = vocoder.eval().to(device)

    assert model_params.speech_tokenizer.type == "whisper", model_params.speech_tokenizer.type
    whisper_model = WhisperModel.from_pretrained(str(WHISPER_DIR), torch_dtype=torch.float16).to(device)
    del whisper_model.decoder
    whisper_fe = AutoFeatureExtractor.from_pretrained(str(WHISPER_DIR))

    def semantic_fn(waves_16k: torch.Tensor) -> torch.Tensor:
        inputs = whisper_fe([waves_16k.squeeze(0).cpu().numpy()], return_tensors="pt", return_attention_mask=True)
        feats = whisper_model._mask_input_features(inputs.input_features, attention_mask=inputs.attention_mask).to(device)
        with torch.no_grad():
            out = whisper_model.encoder(feats.to(whisper_model.encoder.dtype), head_mask=None, output_attentions=False, output_hidden_states=False, return_dict=True)
        s = out.last_hidden_state.to(torch.float32)
        return s[:, : waves_16k.size(-1) // 320 + 1]

    def f0_fn(wave_16k: torch.Tensor, thred: float = 0.03) -> np.ndarray:
        """torchcrepe in RMVPE's shape: 16 kHz in, one F0 (Hz) per 10 ms, 0 where unvoiced."""
        audio = wave_16k.detach().float().reshape(1, -1).to(device)
        f0, pd = torchcrepe.predict(audio, 16000, hop_length=160, fmin=50.0, fmax=1100.0, model="full", batch_size=512, device=device, return_periodicity=True, decoder=torchcrepe.decode.viterbi)
        pd = torchcrepe.filter.median(pd, 3)
        f0 = torchcrepe.filter.mean(f0, 3)
        f0[pd < max(thred, 0.1)] = 0.0
        return f0[0].detach().cpu().numpy().astype(np.float32)

    sp = config["preprocess_params"]["spect_params"]
    mel_fn_args = {"n_fft": sp["n_fft"], "win_size": sp["win_length"], "hop_size": sp["hop_length"], "num_mels": sp["n_mels"], "sampling_rate": sr, "fmin": sp.get("fmin", 0), "fmax": None if sp.get("fmax", "None") == "None" else 8000, "center": False}
    to_mel = lambda x: mel_spectrogram(x, **mel_fn_args)  # noqa: E731
    return {"model": model, "semantic_fn": semantic_fn, "f0_fn": f0_fn, "vocoder": vocoder, "campplus": campplus_model, "to_mel": to_mel, "sr": sr, "hop": hop, "device": device}


def models() -> dict[str, Any]:
    global _models
    with _lock:
        if _models is None:
            t0 = time.time()
            _models = load_models()
            print(f"[svc] loaded seed-vc seed-uvit-whisper-base f0 44k in {time.time() - t0:.1f}s; peak {torch_peak_mb()} MB", flush=True)
        return _models


def _f0_stats(f0: np.ndarray) -> dict[str, float | None]:
    v = f0[f0 > 1]
    if v.size == 0:
        return {"median_hz": None, "p5_hz": None, "p95_hz": None, "semitones": None}
    p5, p95 = float(np.percentile(v, 5)), float(np.percentile(v, 95))
    return {"median_hz": round(float(np.median(v)), 1), "p5_hz": round(p5, 1), "p95_hz": round(p95, 1), "semitones": round(12 * float(np.log2(p95 / max(p5, 1e-3))), 1)}


def crossfade(chunk1: np.ndarray, chunk2: np.ndarray, overlap: int) -> np.ndarray:
    fade_out = np.cos(np.linspace(0, np.pi / 2, overlap)) ** 2
    fade_in = np.cos(np.linspace(np.pi / 2, 0, overlap)) ** 2
    if len(chunk2) < overlap:
        chunk2[:overlap] = chunk2[:overlap] * fade_in[: len(chunk2)] + (chunk1[-overlap:] * fade_out)[: len(chunk2)]
    else:
        chunk2[:overlap] = chunk2[:overlap] * fade_in + chunk1[-overlap:] * fade_out
    return chunk2


def convert(source_path: str, ref_path: str, *, diffusion_steps: int, length_adjust: float, cfg_rate: float, f0_condition: bool, auto_f0_adjust: bool, semitone_shift: int, fp16: bool, seed: int) -> tuple[np.ndarray, int, dict[str, Any]]:
    """inference.py main(), as a function: returns (wave, sr, f0 report)."""
    import librosa  # type: ignore
    import torch  # type: ignore
    import torchaudio  # type: ignore

    m = models()
    model, device, sr, hop = m["model"], m["device"], m["sr"], m["hop"]
    random.seed(seed)
    np.random.seed(seed % (2**32))
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    source_audio = librosa.load(source_path, sr=sr)[0]
    ref_audio = librosa.load(ref_path, sr=sr)[0]
    max_context_window = sr // hop * 30
    overlap_frame_len = 16
    overlap_wave_len = overlap_frame_len * hop
    source_audio = torch.tensor(source_audio).unsqueeze(0).float().to(device)
    ref_audio = torch.tensor(ref_audio[: sr * 25]).unsqueeze(0).float().to(device)

    converted_waves_16k = torchaudio.functional.resample(source_audio, sr, 16000)
    if converted_waves_16k.size(-1) <= 16000 * 30:
        S_alt = m["semantic_fn"](converted_waves_16k)
    else:
        overlapping_time = 5
        parts = []
        buffer = None
        traversed = 0
        while traversed < converted_waves_16k.size(-1):
            if buffer is None:
                chunk = converted_waves_16k[:, traversed : traversed + 16000 * 30]
            else:
                chunk = torch.cat([buffer, converted_waves_16k[:, traversed : traversed + 16000 * (30 - overlapping_time)]], dim=-1)
            s = m["semantic_fn"](chunk)
            parts.append(s if traversed == 0 else s[:, 50 * overlapping_time :])
            buffer = chunk[:, -16000 * overlapping_time :]
            traversed += 30 * 16000 if traversed == 0 else chunk.size(-1) - 16000 * overlapping_time
        S_alt = torch.cat(parts, dim=1)
    ori_waves_16k = torchaudio.functional.resample(ref_audio, sr, 16000)
    S_ori = m["semantic_fn"](ori_waves_16k)

    mel = m["to_mel"](source_audio.float())
    mel2 = m["to_mel"](ref_audio.float())
    target_lengths = torch.LongTensor([int(mel.size(2) * length_adjust)]).to(mel.device)
    target2_lengths = torch.LongTensor([mel2.size(2)]).to(mel2.device)
    feat2 = torchaudio.compliance.kaldi.fbank(ori_waves_16k, num_mel_bins=80, dither=0, sample_frequency=16000)
    feat2 = feat2 - feat2.mean(dim=0, keepdim=True)
    style2 = m["campplus"](feat2.unsqueeze(0))

    report: dict[str, Any] = {}
    if f0_condition:
        F0_ori_np = m["f0_fn"](ori_waves_16k[0], thred=0.03)
        F0_alt_np = m["f0_fn"](converted_waves_16k[0], thred=0.03)
        report = {"reference": _f0_stats(F0_ori_np), "source": _f0_stats(F0_alt_np)}
        F0_ori = torch.from_numpy(F0_ori_np).to(device)[None]
        F0_alt = torch.from_numpy(F0_alt_np).to(device)[None]
        voiced_F0_ori = F0_ori[F0_ori > 1]
        voiced_F0_alt = F0_alt[F0_alt > 1]
        log_f0_alt = torch.log(F0_alt + 1e-5)
        shifted_log_f0_alt = log_f0_alt.clone()
        if auto_f0_adjust and voiced_F0_ori.numel() and voiced_F0_alt.numel():
            median_ori = torch.median(torch.log(voiced_F0_ori + 1e-5))
            median_alt = torch.median(torch.log(voiced_F0_alt + 1e-5))
            shifted_log_f0_alt[F0_alt > 1] = log_f0_alt[F0_alt > 1] - median_alt + median_ori
        shifted_f0_alt = torch.exp(shifted_log_f0_alt)
        if semitone_shift != 0:
            shifted_f0_alt[F0_alt > 1] = shifted_f0_alt[F0_alt > 1] * (2 ** (semitone_shift / 12))
        report["applied"] = _f0_stats(shifted_f0_alt[0].detach().cpu().numpy())
    else:
        F0_ori = None
        shifted_f0_alt = None

    cond, _, _, _, _ = model.length_regulator(S_alt, ylens=target_lengths, n_quantizers=3, f0=shifted_f0_alt)
    prompt_condition, _, _, _, _ = model.length_regulator(S_ori, ylens=target2_lengths, n_quantizers=3, f0=F0_ori)
    max_source_window = max_context_window - mel2.size(2)
    processed = 0
    chunks: list[np.ndarray] = []
    previous_chunk = None
    while processed < cond.size(1):
        chunk_cond = cond[:, processed : processed + max_source_window]
        is_last = processed + max_source_window >= cond.size(1)
        cat_condition = torch.cat([prompt_condition, chunk_cond], dim=1)
        with torch.autocast(device_type="cuda", dtype=torch.float16 if fp16 else torch.float32):
            vc_target = model.cfm.inference(cat_condition, torch.LongTensor([cat_condition.size(1)]).to(mel2.device), mel2, style2, None, diffusion_steps, inference_cfg_rate=cfg_rate)
            vc_target = vc_target[:, :, mel2.size(-1) :]
        vc_wave = m["vocoder"](vc_target.float()).squeeze()[None, :]
        if processed == 0:
            if is_last:
                chunks.append(vc_wave[0].cpu().numpy())
                break
            chunks.append(vc_wave[0, :-overlap_wave_len].cpu().numpy())
            previous_chunk = vc_wave[0, -overlap_wave_len:]
            processed += vc_target.size(2) - overlap_frame_len
        elif is_last:
            chunks.append(crossfade(previous_chunk.cpu().numpy(), vc_wave[0].cpu().numpy(), overlap_wave_len))
            break
        else:
            chunks.append(crossfade(previous_chunk.cpu().numpy(), vc_wave[0, :-overlap_wave_len].cpu().numpy(), overlap_wave_len))
            previous_chunk = vc_wave[0, -overlap_wave_len:]
            processed += vc_target.size(2) - overlap_frame_len
    wave = np.concatenate(chunks).astype(np.float32)
    return wave, sr, report


@app.get("/health")
def health():
    missing = missing_weights()
    return {"ok": True, "engine": ENGINE, "model": "Seed-VC v1 seed-uvit-whisper-base f0 44k (DiT 200M + BigVGAN v2 44 kHz)", "engine_version": ENGINE_VERSION, "code": f"Plachtaa/seed-vc@{COMMIT}", "weights": {"dit": str(DIT), "bigvgan": str(BIGVGAN_DIR), "campplus": str(CAMPPLUS), "whisper": str(WHISPER_DIR)}, "license": LICENSE, "commercial_use": True, "copyleft": "GPL-3.0 — isolated worker; modifications in docker/svc-seedvc", "pitch": "torchcrepe full (MIT), not RMVPE", "loaded": _models is not None, "weights_present": not missing, "missing": missing, "sample_rate": 44100, "gpu": gpu_mem(), "peak_vram_mb": torch_peak_mb()}


@app.post("/unload")
def unload():
    global _models
    with _lock:
        _models = None
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
    return {"ok": True, "gpu": gpu_mem()}


@app.post("/convert")
async def convert_endpoint(
    source: UploadFile = File(...), reference: UploadFile = File(...),
    diffusion_steps: str = Form(""), length_adjust: str = Form(""), inference_cfg_rate: str = Form(""), f0_condition: str = Form("1"), auto_f0_adjust: str = Form("0"), semi_tone_shift: str = Form(""), fp16: str = Form("1"), seed: str = Form(""), raw: str = Form(""),
):
    missing = missing_weights()
    if missing:
        raise HTTPException(status_code=503, detail=f"Seed-VC weights are not in the store (manifest group svc-seed-vc): {', '.join(missing)}")
    settings = {
        "diffusion_steps": int(_parse_number(diffusion_steps, "diffusion_steps", 1, 100, 40, integer=True)),
        "length_adjust": _parse_number(length_adjust, "length_adjust", 0.5, 2.0, 1.0),
        "inference_cfg_rate": _parse_number(inference_cfg_rate, "inference_cfg_rate", 0.0, 1.0, 0.7),
        "f0_condition": f0_condition.strip().lower() not in ("0", "false", "no", ""),
        "auto_f0_adjust": auto_f0_adjust.strip().lower() in ("1", "true", "yes"),
        "semi_tone_shift": int(_parse_number(semi_tone_shift, "semi_tone_shift", -12, 12, 0, integer=True)),
        "fp16": fp16.strip().lower() not in ("0", "false", "no"),
        "seed": int(_parse_number(seed, "seed", 0, 2**31 - 1, 7, integer=True)),
    }
    paths: list[str] = []
    for up, name in ((source, "source"), (reference, "reference")):
        data = await up.read()
        if len(data) < 1000:
            raise HTTPException(status_code=400, detail=f"{name} audio is empty")
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(up.filename or f"{name}.wav")[1] or ".wav", delete=False) as f:
            f.write(data)
            paths.append(f.name)
    try:
        t0 = time.time()
        with _lock:
            try:
                import torch  # type: ignore

                if torch.cuda.is_available() and torch.cuda.is_initialized():
                    torch.cuda.reset_peak_memory_stats()
                wave, sr, f0_report = convert(paths[0], paths[1], diffusion_steps=settings["diffusion_steps"], length_adjust=settings["length_adjust"], cfg_rate=settings["inference_cfg_rate"], f0_condition=settings["f0_condition"], auto_f0_adjust=settings["auto_f0_adjust"], semitone_shift=settings["semi_tone_shift"], fp16=settings["fp16"], seed=settings["seed"])
            except HTTPException:
                raise
            except (AssertionError, ValueError) as ex:
                raise HTTPException(status_code=400, detail=f"seed-vc refused the input: {str(ex)[:300]}") from ex
            except Exception as ex:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"seed-vc failed: {type(ex).__name__}: {str(ex)[:300]}") from ex
        ms = int((time.time() - t0) * 1000)
        if wave.size == 0 or not np.isfinite(wave).all():
            raise HTTPException(status_code=500, detail="the converter returned no usable audio")
        is_raw = raw.strip().lower() in ("1", "true", "yes")
        lim = {"input_true_peak_db": float("nan"), "output_true_peak_db": float("nan"), "gain_reduction_db": 0.0} if is_raw else None
        if not is_raw:
            wave, lim = limit_peaks(wave, sr)
        buf = io.BytesIO()
        with sf.SoundFile(buf, mode="w", samplerate=sr, channels=1, subtype="FLOAT" if is_raw else "PCM_16", format="WAV") as out:
            out.software = f"vewbox-svc {ENGINE}"
            out.comment = f"synthetic singing; engine={ENGINE}; seed-vc@{COMMIT[:7]}; seed={settings['seed']}; converted vocal of a synthetic identity; {LICENSE}"
            out.write(wave)
        dur = wave.shape[0] / sr
        print(f"[svc] {dur:.2f}s in {ms} ms (RTF {ms / 1000 / max(dur, 1e-3):.2f}); steps {settings['diffusion_steps']} cfg {settings['inference_cfg_rate']} f0 {settings['f0_condition']} shift {settings['semi_tone_shift']}; f0 {json.dumps(f0_report)}; vram peak {torch_peak_mb()} MB", flush=True)
        return Response(content=buf.getvalue(), media_type="audio/wav", headers={
            "x-sample-rate": str(sr), "x-duration": f"{dur:.3f}", "x-ms": str(ms), "x-engine": ENGINE, "x-model": "seed-uvit-whisper-base-f0-44k", "x-engine-version": ENGINE_VERSION,
            "x-settings": json.dumps(settings), "x-f0": json.dumps(f0_report), "x-true-peak": f"{lim['output_true_peak_db']:.2f}", "x-gain-reduction": f"{lim['gain_reduction_db']:.2f}",
            "x-peak-vram-mb": str(torch_peak_mb() or ""), "x-license": "gpl-3.0-seed-vc-isolated", "x-raw": "1" if is_raw else "0",
        })
    finally:
        for p in paths:
            try:
                os.unlink(p)
            except OSError:
                pass

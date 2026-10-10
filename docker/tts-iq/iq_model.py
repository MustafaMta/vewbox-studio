"""VEWBOX-IQ MODEL LOADER — Chatterbox Multilingual V3 (ResembleAI/chatterbox @ BASE_REVISION, MIT) from the store, plus the
optional Vewbox-IQ adaptation (docs/VEWBOX-IQ.md, docs/research/iraqi-voice-production.md). Shared by the inference service
(docker/tts-iq/app.py) and the trainer package (docker/train-iq/train/*): ONE place decides which files are loaded.

- The T3 checkpoint is ALWAYS `t3_mtl23ls_v3.safetensors` (the library's `from_local(..., t3_model="v3")`; never the v2
  default, never `t3_cfg`). After loading, one row of `t3.text_emb` is compared with the file so a wrong file is refused.
- S3Gen: `s3gen.pt` (what the official code pairs with the v3 T3) or `s3gen_v3.safetensors` (shipped, undocumented pairing;
  A/B by ear) — env IQ_S3GEN, default s3gen.pt. The library loads s3gen.pt itself; the v3 file is swapped in afterwards.
- Adaptation (IQ_ADAPTER_DIR): a PEFT LoRA directory (adapter_config.json; written by train_lora.py together with the
  trained copy of `t3.text_emb`), merged into T3 at load, OR a merged T3 state dict `t3_merged.safetensors`. Either form
  carries `provenance.json` (base revision, adapter config, dataset manifest hashes, seed, commit) which /health reports.
- Nothing is downloaded: HF_HUB_OFFLINE=1; the tokenizer's Chinese Cangjie table (Cangjie5_TC.json, zh only) is fetched by
  the library through hf_hub_download and its failure is caught and logged by the library — Arabic/English are unaffected.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import os
from pathlib import Path
from typing import Any

BASE_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"  # ResembleAI/chatterbox, 2026-06-10 "Add S3Gen v3 weights"
CODE_COMMIT = os.environ.get("CHATTERBOX_COMMIT", "65b18437192794391a0308a8f705b1e33e633948")  # v3 release commit
T3_FILE = "t3_mtl23ls_v3.safetensors"
S3GEN_CHOICES = ("s3gen.pt", "s3gen_v3.safetensors")
VOCAB_FILE = "grapheme_mtl_merged_expanded_v1.json"
BASE_FILES = (T3_FILE, "s3gen.pt", "ve.pt", VOCAB_FILE)  # conds.pt is optional (a built-in voice; never used here)
MERGED_FILE = "t3_merged.safetensors"
PROVENANCE_FILE = "provenance.json"
LICENSE = "MIT (Chatterbox Multilingual V3) + Vewbox-IQ adaptation"
WATERMARK = "Perth implicit watermark, applied by the library to every generate() output (resemble-perth; detector available)"

S3GEN_IGNORED_MISSING = ("tokenizer._mel_filters", "tokenizer.window")  # S3Token2Wav.ignore_state_dict_missing: non-persistent buffers


def default_base_dir() -> Path:
    return Path(os.environ.get("MODEL_ROOT", "/models")) / "voice" / "chatterbox-mtl-v3"


def s3gen_choice() -> str:
    v = (os.environ.get("IQ_S3GEN") or "s3gen.pt").strip()
    if v not in S3GEN_CHOICES:
        raise ValueError(f"IQ_S3GEN must be one of {S3GEN_CHOICES}, got {v!r}")
    return v


def missing_base_files(base_dir: Path, s3gen_file: str = "s3gen.pt") -> list[str]:
    need = list(BASE_FILES) + ([s3gen_file] if s3gen_file not in BASE_FILES else [])
    return [f for f in need if not (base_dir / f).is_file()]


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()


def _verify_t3_is_v3(t3: Any, t3_path: Path) -> bool:
    """The library picked the file by name; compare one real tensor row so a mislabelled or swapped file is caught."""
    import torch  # type: ignore
    from safetensors import safe_open  # type: ignore

    with safe_open(str(t3_path), framework="pt", device="cpu") as f:
        key = "text_emb.weight" if "text_emb.weight" in f.keys() else None
        if key is None:
            return False
        row = f.get_slice(key)[1:2]  # row 1 (row 0 is the stop token)
    live = t3.text_emb.weight.detach()[1:2].float().cpu()
    return bool(torch.allclose(live, row.float(), atol=1e-6))


def load_base(base_dir: Path | None = None, device: str = "cuda", s3gen_file: str | None = None) -> tuple[Any, dict[str, Any]]:
    """The library's own `from_local` with t3_model="v3" (the pinned commit's signature is checked, not assumed), then the
    S3Gen swap when asked. Returns (model, info) with info the provenance /health reports."""
    base_dir = Path(base_dir or default_base_dir())
    s3gen_file = s3gen_file or s3gen_choice()
    missing = missing_base_files(base_dir, s3gen_file)
    if missing:
        raise FileNotFoundError(f"Chatterbox Multilingual V3 files missing in {base_dir} (manifest group voice-chatterbox-mtl-v3): {', '.join(missing)}")
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # type: ignore

    sig = inspect.signature(ChatterboxMultilingualTTS.from_local)
    if "t3_model" not in sig.parameters:
        raise RuntimeError(f"chatterbox at this commit has no from_local(t3_model=...) ({sig}): the v3 T3 file cannot be selected safely — pin the reviewed commit {CODE_COMMIT}")
    model = ChatterboxMultilingualTTS.from_local(str(base_dir), device, t3_model="v3")
    t3_verified = _verify_t3_is_v3(model.t3, base_dir / T3_FILE)
    if not t3_verified:
        raise RuntimeError(f"the loaded T3 does not match {T3_FILE}: refusing to serve (the v2 default or another file was loaded)")
    s3gen_swap: dict[str, Any] | None = None
    if s3gen_file != "s3gen.pt":
        from safetensors.torch import load_file  # type: ignore

        sd = load_file(str(base_dir / s3gen_file), device="cpu")
        res = model.s3gen.load_state_dict(sd, strict=False)
        missing_keys = [k for k in res.missing_keys if k not in S3GEN_IGNORED_MISSING]
        if missing_keys:
            raise RuntimeError(f"{s3gen_file} leaves S3Gen keys unloaded ({len(missing_keys)}): {missing_keys[:5]}")
        s3gen_swap = {"missing": len(res.missing_keys), "unexpected": len(res.unexpected_keys)}
        model.s3gen.to(device).eval()
    info = {
        "base_dir": str(base_dir), "base_repo": "ResembleAI/chatterbox", "base_revision": BASE_REVISION, "code": f"resemble-ai/chatterbox@{CODE_COMMIT}",
        "t3_file": T3_FILE, "t3_verified": t3_verified, "s3gen_file": s3gen_file, "s3gen_swap": s3gen_swap,
        "load_path": "ChatterboxMultilingualTTS.from_local(t3_model='v3')", "sample_rate": int(model.sr), "license": LICENSE, "watermark": WATERMARK,
    }
    return model, info


def detect_adapter(adapter_dir: Path) -> tuple[str, Path]:
    """What kind of Vewbox-IQ checkpoint a directory (or file) holds: ('peft', dir with adapter_config.json) or ('merged', the
    safetensors file). A checkpoint directory written by train_lora.py holds both; the merged form wins (exact, no PEFT at
    run time) unless IQ_ADAPTER_FORM=peft asks for the adapter."""
    p = Path(adapter_dir)
    prefer = (os.environ.get("IQ_ADAPTER_FORM") or "merged").strip().lower()
    if p.is_file() and p.suffix == ".safetensors":
        return "merged", p
    merged = p / MERGED_FILE
    peft_dir = p if (p / "adapter_config.json").is_file() else (p / "adapter" if (p / "adapter" / "adapter_config.json").is_file() else None)
    if prefer == "peft" and peft_dir is not None:
        return "peft", peft_dir
    if merged.is_file():
        return "merged", merged
    if peft_dir is not None:
        return "peft", peft_dir
    raise FileNotFoundError(f"{p}: neither {MERGED_FILE} nor a PEFT adapter_config.json (directly or under adapter/)")


def apply_adapter(model: Any, adapter_dir: Path, device: str = "cuda") -> dict[str, Any]:
    """Load a Vewbox-IQ checkpoint into model.t3 (in place). Returns what was loaded, for /health and the WAV comment."""
    form, target = detect_adapter(Path(adapter_dir))
    import torch  # type: ignore

    if form == "merged":
        from safetensors.torch import load_file  # type: ignore

        sd = load_file(str(target), device="cpu")
        res = model.t3.load_state_dict(sd, strict=True)
        digest = sha256_file(target)
        loaded = {"form": "merged-t3", "file": str(target), "sha256": digest, "missing": len(res.missing_keys), "unexpected": len(res.unexpected_keys)}
    else:
        from peft import PeftModel  # type: ignore

        peft_model = PeftModel.from_pretrained(model.t3, str(target), is_trainable=False)
        merged = peft_model.merge_and_unload()
        model.t3 = merged
        weights = target / "adapter_model.safetensors"
        loaded = {"form": "peft-lora-merged-at-load", "dir": str(target), "sha256": sha256_file(weights) if weights.is_file() else None}
    model.t3.to(device).eval()
    for p in model.t3.parameters():
        p.requires_grad_(False)
    prov_path = Path(adapter_dir) / PROVENANCE_FILE if Path(adapter_dir).is_dir() else Path(adapter_dir).parent / PROVENANCE_FILE
    provenance: dict[str, Any] | None = None
    if prov_path.is_file():
        try:
            provenance = json.loads(prov_path.read_text(encoding="utf-8"))
        except Exception as ex:  # noqa: BLE001
            provenance = {"error": f"unreadable provenance.json: {ex}"}
    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    return {"adapter_dir": str(adapter_dir), **loaded, "provenance": provenance}


def model_label(base: dict[str, Any], adapter: dict[str, Any] | None) -> str:
    s3 = "s3gen_v3" if base.get("s3gen_file") == "s3gen_v3.safetensors" else "s3gen"
    if adapter is None:
        return f"Chatterbox Multilingual V3 (t3 v3 + {s3})"
    name = (adapter.get("provenance") or {}).get("name") or Path(adapter["adapter_dir"]).name
    return f"Vewbox-IQ {name} on Chatterbox MTL V3 (t3 v3 + {s3})"


def prepare_dual_conditionals(model: Any, identity_wav: str, prompt_wav: str, exaggeration: float = 0.5) -> dict[str, Any]:
    """TWO REFERENCES, ONE VOICE (the pack rule, 2026-10-10): the library's prepare_conditionals takes everything from one
    file — the voice-encoder speaker embedding, S3Gen's acoustic reference AND the T3 speech-prompt tokens. A character's
    Iraqi lines need Arabic prompt tokens (a cross-language prompt masks the dialect) but the speaker must stay the
    identity's own: so the speaker embedding and the S3Gen reference come from `identity_wav` (the primary reference, the
    design seed) and only the T3 prompt tokens from `prompt_wav` (the pack's Iraqi clip of the same identity). The result
    is left in model.conds for generate(text, audio_prompt_path=None). Mirrors ChatterboxMultilingualTTS.prepare_conditionals
    at the pinned commit, which is why this module checks that function's shape first."""
    import librosa  # type: ignore
    import torch  # type: ignore
    from chatterbox.mtl_tts import Conditionals, S3GEN_SR, S3_SR  # type: ignore
    from chatterbox.models.t3.modules.cond_enc import T3Cond  # type: ignore

    src = inspect.getsource(type(model).prepare_conditionals)
    for needle in ("embed_ref(", "cond_prompt_speech_tokens", "embeds_from_wavs("):
        if needle not in src:
            raise RuntimeError(f"prepare_conditionals at this chatterbox commit no longer has {needle!r}: the dual reference cannot be built safely")
    ident_24k, _ = librosa.load(identity_wav, sr=S3GEN_SR)
    ident_16k = librosa.resample(ident_24k, orig_sr=S3GEN_SR, target_sr=S3_SR)
    prompt_24k, _ = librosa.load(prompt_wav, sr=S3GEN_SR)
    prompt_16k = librosa.resample(prompt_24k, orig_sr=S3GEN_SR, target_sr=S3_SR)
    s3gen_ref_dict = model.s3gen.embed_ref(ident_24k[: model.DEC_COND_LEN], S3GEN_SR, device=model.device)
    t3_cond_prompt_tokens = None
    if plen := model.t3.hp.speech_cond_prompt_len:
        t3_cond_prompt_tokens, _ = model.s3gen.tokenizer.forward([prompt_16k[: model.ENC_COND_LEN]], max_len=plen)
        t3_cond_prompt_tokens = torch.atleast_2d(t3_cond_prompt_tokens).to(model.device)
    ve_embed = torch.from_numpy(model.ve.embeds_from_wavs([ident_16k], sample_rate=S3_SR)).mean(axis=0, keepdim=True).to(model.device)
    t3_cond = T3Cond(speaker_emb=ve_embed, cond_prompt_speech_tokens=t3_cond_prompt_tokens, emotion_adv=exaggeration * torch.ones(1, 1, 1)).to(device=model.device)
    model.conds = Conditionals(t3_cond, s3gen_ref_dict)
    return {"identity_seconds": round(len(ident_24k) / S3GEN_SR, 2), "prompt_seconds": round(len(prompt_24k) / S3GEN_SR, 2), "prompt_tokens": int(t3_cond_prompt_tokens.shape[-1]) if t3_cond_prompt_tokens is not None else 0}


def seed_everything(seed: int) -> None:
    """T3 samples tokens and S3Gen's flow starts from noise: seed every generator before a generation."""
    import random

    import numpy as np

    random.seed(seed)
    np.random.seed(seed % (2**32))
    import torch  # type: ignore

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

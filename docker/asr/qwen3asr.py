"""Qwen3-ASR-1.7B — the studio's primary speech recogniser (producer model stack 2026-10-07; Whisper large-v3 stays as
the reference). Runs on transformers' native implementation (transformers >= 5, `models/qwen3_asr`) from the ORIGINAL
Qwen/Qwen3-ASR-1.7B release in the store (manifest group asr-qwen3-asr-1.7b), which differs from transformers'
converted `-hf` checkpoint in three ways, each handled here and checked at load (no missing or unexpected tensor):

- the real settings sit under `thinker_config`, which `Qwen3ASRConfig` does not read (it would build its defaults, a
  3584-wide projector instead of this model's 2048): the config is built from the release's own values;
- the tensors are named `thinker.*`: renamed to the converted layout (`model.language_model.*`, `model.audio_tower.*`,
  `model.multi_modal_projector.linear_1/2` for the release's `proj1/proj2`, `lm_head`);
- the release ships a plain Whisper feature extractor and a chat template without the language prefill: the prompt is
  the one the official `qwen-asr` package renders, and the features are padded to whole encoder windows.

LANGUAGE. By default the model detects the language itself and says which (`language <NAME><asr_text>…`). A forced
language is available, but it is NOT a transcription check: forced to Arabic on English speech the model TRANSLATED
the line into fluent Arabic (measured 2026-10-07). A dialect gate must read the auto-detected answer.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

PATH = os.environ.get("QWEN3_ASR_DIR", "/models/asr/qwen3-asr-1.7b")
NAME = "Qwen3-ASR-1.7B"
_lock = threading.Lock()
_model: Any = None
_proc: Any = None

RULES = [
    ("thinker.lm_head.", "lm_head."),
    ("thinker.model.", "model.language_model."),
    ("thinker.audio_tower.proj1.", "model.multi_modal_projector.linear_1."),
    ("thinker.audio_tower.proj2.", "model.multi_modal_projector.linear_2."),
    ("thinker.audio_tower.", "model.audio_tower."),
    ("thinker.", "model."),
]
PROMPT = "<|im_start|>system\n<|im_end|>\n<|im_start|>user\n<|audio_start|><|audio_pad|><|audio_end|><|im_end|>\n<|im_start|>assistant\n"
# the language names the model was trained with (the forced-language suffix), by the studio's codes
NAMES = {"ar": "Arabic", "en": "English"}


def rename(key: str) -> str:
    for a, b in RULES:
        if key.startswith(a):
            return b + key[len(a):]
    return key


def weights_present() -> bool:
    return os.path.exists(os.path.join(PATH, "model.safetensors.index.json"))


def status() -> dict[str, Any]:
    return {"available": weights_present(), "reason": None if weights_present() else f"weights not found in {PATH} (manifest group asr-qwen3-asr-1.7b)", "model": NAME, "loaded": _model is not None}


def _config():
    from transformers import Qwen3ASRConfig  # type: ignore

    t = json.load(open(os.path.join(PATH, "config.json"), encoding="utf-8"))["thinker_config"]
    audio = {**t["audio_config"], "model_type": "qwen3_asr_encoder"}
    return Qwen3ASRConfig(audio_config=audio, text_config=t["text_config"], audio_token_id=t["audio_token_id"], tie_word_embeddings=t["text_config"].get("tie_word_embeddings", True))


def load():
    global _model, _proc
    with _lock:
        if _model is not None:
            return _model, _proc
        import torch  # type: ignore
        from safetensors.torch import load_file  # type: ignore
        from transformers import AutoProcessor, Qwen3ASRForConditionalGeneration  # type: ignore

        t0 = time.time()
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if dev == "cuda" else torch.float32
        prev = torch.get_default_dtype()
        torch.set_default_dtype(dtype)  # built for real, not on meta: rotary and positional tables are computed buffers
        try:
            m = Qwen3ASRForConditionalGeneration(_config())
        finally:
            torch.set_default_dtype(prev)
        shards = sorted(set(json.load(open(os.path.join(PATH, "model.safetensors.index.json"), encoding="utf-8"))["weight_map"].values()))
        sd: dict[str, Any] = {}
        for s in shards:
            sd.update({rename(k): v for k, v in load_file(os.path.join(PATH, s)).items()})
        missing, unexpected = m.load_state_dict(sd, strict=False)
        if missing or unexpected:
            raise RuntimeError(f"Qwen3-ASR weights do not match the model: missing {missing[:5]}, unexpected {unexpected[:5]}")
        _model = m.to(dev).eval()
        _proc = AutoProcessor.from_pretrained(PATH)
        print(f"[asr] loaded {NAME} on {dev} in {time.time() - t0:.1f}s", flush=True)
        return _model, _proc


def unload() -> None:
    global _model, _proc
    with _lock:
        _model = None
        _proc = None


def parse(raw: str) -> dict[str, Any]:
    """`language <NAME><asr_text>text` → {language, text}; a forced run has no prefix in its new tokens."""
    if "<asr_text>" in raw:
        head, _, text = raw.partition("<asr_text>")
        lang = head.strip()
        lang = lang[len("language "):].strip() if lang.lower().startswith("language ") else lang
        return {"language": None if lang.lower() in ("", "none") else lang, "text": text.strip()}
    return {"language": None, "text": raw.strip()}


def transcribe(audio, language: str | None = None, max_new_tokens: int = 448) -> dict[str, Any]:
    """`audio`: 16 kHz mono float32. `language`: None = the model detects it (the check); 'ar'/'en' = forced."""
    import torch  # type: ignore

    m, proc = load()
    forced = NAMES.get(language or "", None)
    text = PROMPT + (f"language {forced}<asr_text>" if forced else "")
    t0 = time.time()
    with _lock:
        inputs = proc(text=[text], audio=[audio], return_tensors="pt", padding="longest", pad_to_multiple_of=16000)
        inputs = {k: (v.to(m.device) if hasattr(v, "to") else v) for k, v in inputs.items()}
        inputs["input_features"] = inputs["input_features"].to(m.dtype)
        with torch.inference_mode():
            out = m.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
        raw = proc.decode(out[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0]
    got = parse(raw)
    # a forced run reports no language of its own: detected_language stays None, never the forced one
    return {"model": NAME, "detected_language": None if forced else got["language"], "forced_language": forced, "text": got["text"], "ms": int((time.time() - t0) * 1000)}

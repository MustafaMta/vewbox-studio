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
    global _model, _proc, _aligner, _aligner_proc
    with _lock:
        _model = None
        _proc = None
        _aligner = None
        _aligner_proc = None


# ------------------------------------------------------------------------------------------------ forced alignment
# Qwen3-ForcedAligner-0.6B (manifest group align-qwen3-forced-aligner-0.6b): word times of KNOWN text, for the 11
# languages it supports (English among them; NOT Arabic — Arabic keeps the WhisperX-style CTC aligner, align.py). Same
# original-release format as the ASR model, so: the config from thinker_config (with the classifier size), the tensors
# renamed (`thinker.lm_head` is the timestamp classifier: `score`), and the input built in the converted model's own
# format (Qwen/Qwen3-ForcedAligner-0.6B-hf @ c07281df, chat_template.jinja: the audio tokens, then the words joined by
# "<timestamp><timestamp>" and a final pair — the release's template drops the words). Proven 2026-10-07: an English
# line aligned word by word, the pause after "again," where it is.
ALIGNER_PATH = os.environ.get("QWEN3_ALIGNER_DIR", "/models/asr/qwen3-forced-aligner-0.6b")
ALIGNER_NAME = "Qwen3-ForcedAligner-0.6B"
ALIGNER_LANGS = {"en": "English", "zh": "Chinese", "yue": "Cantonese", "fr": "French", "de": "German", "it": "Italian", "ja": "Japanese", "ko": "Korean", "pt": "Portuguese", "ru": "Russian", "es": "Spanish"}
_aligner: Any = None
_aligner_proc: Any = None
_aligner_cfg: dict[str, Any] = {}


def aligner_present() -> bool:
    return os.path.exists(os.path.join(ALIGNER_PATH, "model.safetensors")) and os.path.exists(os.path.join(ALIGNER_PATH, "config.json"))


def aligner_status() -> dict[str, Any]:
    ok = aligner_present()
    return {"available": ok, "reason": None if ok else f"weights not found in {ALIGNER_PATH} (manifest group align-qwen3-forced-aligner-0.6b)", "model": ALIGNER_NAME, "languages": sorted(ALIGNER_LANGS), "loaded": _aligner is not None}


def load_aligner():
    global _aligner, _aligner_proc, _aligner_cfg
    with _lock:
        if _aligner is not None:
            return _aligner, _aligner_proc
        import torch  # type: ignore
        from safetensors.torch import load_file  # type: ignore
        from transformers import AutoProcessor, Qwen3ASRConfig, Qwen3ASRForTokenClassification  # type: ignore

        t0 = time.time()
        raw = json.load(open(os.path.join(ALIGNER_PATH, "config.json"), encoding="utf-8"))
        t = raw["thinker_config"]
        cfg = Qwen3ASRConfig(audio_config={**t["audio_config"], "model_type": "qwen3_asr_encoder"}, text_config=t["text_config"], audio_token_id=t["audio_token_id"], tie_word_embeddings=t["text_config"].get("tie_word_embeddings", True), num_labels=t["classify_num"])
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if dev == "cuda" else torch.float32
        prev = torch.get_default_dtype()
        torch.set_default_dtype(dtype)
        try:
            m = Qwen3ASRForTokenClassification(cfg)
        finally:
            torch.set_default_dtype(prev)
        rules = [("thinker.lm_head.", "score.")] + RULES[1:]
        sd = {}
        for k, v in load_file(os.path.join(ALIGNER_PATH, "model.safetensors")).items():
            for a, b in rules:
                if k.startswith(a):
                    k = b + k[len(a):]
                    break
            sd[k] = v
        missing, unexpected = m.load_state_dict(sd, strict=False)
        if missing or unexpected:
            raise RuntimeError(f"Qwen3-ForcedAligner weights do not match the model: missing {missing[:5]}, unexpected {unexpected[:5]}")
        _aligner = m.to(dev).eval()
        _aligner_proc = AutoProcessor.from_pretrained(ALIGNER_PATH)
        _aligner_cfg = {"timestamp_token_id": raw["timestamp_token_id"], "timestamp_segment_time": raw["timestamp_segment_time"]}
        print(f"[asr] loaded {ALIGNER_NAME} on {dev} in {time.time() - t0:.1f}s", flush=True)
        return _aligner, _aligner_proc


def unload_aligner() -> None:
    global _aligner, _aligner_proc
    with _lock:
        _aligner = None
        _aligner_proc = None


def align(audio, text: str, language: str, offset: float = 0.0) -> dict[str, Any]:
    """Word times of `text` in a 16 kHz mono clip (≤ 5 minutes, the model's limit). Times are seconds from the clip's
    start plus `offset`. The answer has the shape of align.py's (`words` with text/start/end/aligned, `coverage`)."""
    import torch  # type: ignore

    name = ALIGNER_LANGS.get(language)
    if not name:
        raise ValueError(f"{ALIGNER_NAME} does not support language {language!r} (supported: {', '.join(sorted(ALIGNER_LANGS))})")
    if len(audio) / 16000 > 300:
        raise ValueError("the clip is longer than 5 minutes; align per line or section")
    m, proc = load_aligner()
    t0 = time.time()
    with _lock:
        words = proc.split_words_for_alignment(text, name)
        if not words:
            raise ValueError("the text has no words")
        prompt = "<|audio_start|><|audio_pad|><|audio_end|>" + "<timestamp><timestamp>".join(words) + "<timestamp><timestamp>"
        inputs = proc(text=[prompt], audio=[audio], return_tensors="pt", padding="longest", pad_to_multiple_of=16000)
        inputs = {k: (v.to(m.device) if hasattr(v, "to") else v) for k, v in inputs.items() if k in ("input_ids", "attention_mask", "input_features", "input_features_mask")}
        inputs["input_features"] = inputs["input_features"].to(m.dtype)
        with torch.inference_mode():
            logits = m(**inputs).logits
        out = proc.decode_forced_alignment(logits, inputs["input_ids"], [words], timestamp_token_id=_aligner_cfg["timestamp_token_id"], timestamp_segment_time=_aligner_cfg["timestamp_segment_time"])[0]
    dur = len(audio) / 16000
    placed = [{"text": w["text"], "start": round(offset + float(w["start_time"]), 3), "end": round(offset + float(w["end_time"]), 3), "aligned": float(w["end_time"]) > float(w["start_time"]) and float(w["start_time"]) < dur} for w in out]
    n = sum(1 for w in placed if w["aligned"])
    return {"words": placed, "coverage": round(n / len(placed), 4) if placed else 0.0, "unaligned_words": [w["text"] for w in placed if not w["aligned"]], "language": language, "model": ALIGNER_NAME, "duration": round(dur, 3), "ms": int((time.time() - t0) * 1000)}


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

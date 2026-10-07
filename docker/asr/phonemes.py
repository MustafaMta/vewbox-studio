"""WHICH CONSONANT WAS SPOKEN — the Iraqi phonology gate's ear (Phase 3, 2026-10-07).

Spelling-based recognisers cannot confirm an Iraqi چ (/tʃ/) or گ (/ɡ/): standard Arabic spelling has neither, so
Qwen3-ASR and Whisper write ج/ك/ق or substitute a word (Whisper returned چ in 0 of 36 Iraqi lines; «باچر» came back as
«باسر»). This module listens to the SOUND instead: the known line is force-aligned (align.py, the Arabic CTC model) to
find each dialect word's span, and a multilingual phoneme recogniser (facebook/wav2vec2-xlsr-53-espeak-cv-ft, IPA,
Apache-2.0; manifest group qa-phoneme-espeak) transcribes that span into phonemes. The judgement (tʃ present for چ,
ɡ for گ) is the studio's (src/server/media/iraqi-phonology.ts), pure and tested; this module only reports what it
heard. It never generates anything.

Decoding is a greedy CTC read of the model's own vocabulary (vocab.json): no phonemizer package is needed, because
nothing is turned from text into phonemes here.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

import numpy as np

PATH = os.environ.get("PHONEME_MODEL_DIR", "/models/qa/wav2vec2-xlsr-53-espeak-cv-ft")
NAME = "wav2vec2-xlsr-53-espeak-cv-ft"
SAMPLE_RATE = 16000
FRAME_SECONDS = 0.02  # wav2vec2: one frame per 320 samples at 16 kHz
PAD_SECONDS = 0.06    # a little audio either side of the aligned word, so its first and last consonants are whole
_lock = threading.Lock()
_bundle: dict[str, Any] | None = None


def weights_present() -> bool:
    return all(os.path.isfile(os.path.join(PATH, f)) for f in ("config.json", "vocab.json", "preprocessor_config.json")) and (
        os.path.isfile(os.path.join(PATH, "pytorch_model.bin")) or os.path.isfile(os.path.join(PATH, "model.safetensors")))


def status() -> dict[str, Any]:
    ok = weights_present()
    return {"available": ok, "reason": None if ok else f"weights not found in {PATH} (manifest group qa-phoneme-espeak)", "model": NAME, "loaded": _bundle is not None}


def load() -> dict[str, Any]:
    global _bundle
    with _lock:
        if _bundle is None:
            import torch  # type: ignore
            from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC  # type: ignore

            t0 = time.time()
            dev = "cuda" if torch.cuda.is_available() else "cpu"
            fe = Wav2Vec2FeatureExtractor.from_pretrained(PATH)
            model = Wav2Vec2ForCTC.from_pretrained(PATH).to(dev).eval()
            vocab = json.load(open(os.path.join(PATH, "vocab.json"), encoding="utf-8"))
            ids = {int(v): k for k, v in vocab.items()}
            special = {t for t in ("<pad>", "<s>", "</s>", "<unk>", "|") if t in vocab}
            blank = int(vocab.get("<pad>", 0))
            _bundle = {"torch": torch, "fe": fe, "model": model, "ids": ids, "special": special, "blank": blank, "device": dev}
            print(f"[phonemes] loaded {NAME} on {dev} in {time.time() - t0:.1f}s (vocab {len(vocab)})", flush=True)
        return _bundle


def unload() -> None:
    global _bundle
    with _lock:
        _bundle = None


def phonemes(audio: np.ndarray, offset: float = 0.0) -> list[dict[str, Any]]:
    """Greedy CTC phonemes of a 16 kHz mono clip: [{phoneme, start, end, p}] (times from the clip start + offset)."""
    b = load()
    torch = b["torch"]
    with _lock:
        x = b["fe"](audio.astype(np.float32), sampling_rate=SAMPLE_RATE, return_tensors="pt").input_values.to(b["device"])
        with torch.inference_mode():
            lp = torch.log_softmax(b["model"](x).logits[0].float(), dim=-1).cpu().numpy()
    best = lp.argmax(axis=-1)
    out: list[dict[str, Any]] = []
    prev = -1
    for t, i in enumerate(best.tolist()):
        if i == prev:
            if out and i != b["blank"]:
                out[-1]["end"] = round(offset + (t + 1) * FRAME_SECONDS, 3)
            continue
        prev = i
        if i == b["blank"]:
            continue
        tok = b["ids"].get(i, "")
        if not tok or tok in b["special"]:
            continue
        out.append({"phoneme": tok, "start": round(offset + t * FRAME_SECONDS, 3), "end": round(offset + (t + 1) * FRAME_SECONDS, 3), "p": round(float(np.exp(lp[t, i])), 3)})
    return out


def word_phonemes(audio: np.ndarray, words: list[dict[str, Any]], want: list[int] | None = None) -> list[dict[str, Any]]:
    """For each aligned word (align.py's `words`, optionally only the indexes in `want`): the phonemes heard in its span."""
    res: list[dict[str, Any]] = []
    dur = len(audio) / SAMPLE_RATE
    for k, w in enumerate(words):
        if want is not None and k not in want:
            continue
        if not w.get("aligned") or w.get("start") is None or w.get("end") is None:
            res.append({"index": k, "text": w.get("text"), "aligned": False, "phonemes": [], "ipa": ""})
            continue
        a = max(0.0, float(w["start"]) - PAD_SECONDS)
        z = min(dur, float(w["end"]) + PAD_SECONDS)
        clip = audio[int(a * SAMPLE_RATE):int(z * SAMPLE_RATE)]
        ph = phonemes(clip, a) if clip.size >= 400 else []
        res.append({"index": k, "text": w.get("text"), "aligned": True, "start": round(a, 3), "end": round(z, 3), "phonemes": ph, "ipa": " ".join(p["phoneme"] for p in ph)})
    return res

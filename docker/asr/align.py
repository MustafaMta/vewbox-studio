"""Forced alignment of KNOWN script text to speech (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §B.2).

The algorithm is WhisperX's (`whisperx/alignment.py`, BSD-2-Clause, Copyright (c) 2022 Max Bain; itself after the
torchaudio forced-alignment tutorial, BSD-2-Clause), re-implemented here in numpy. The whisperx package is NOT a
dependency; torch and transformers are used only for the wav2vec2 forward pass.

    emission (T × V log-probs, one row per 20 ms frame)
      → trellis (T+1 × N+1): the best log-probability of having emitted the first j tokens after t frames, where a
        frame either stays on token j (emitting the CTC blank) or advances to token j+1 (emitting it)
      → backtrack from the best end frame of the last token
      → merge repeats (consecutive path points on the same token = one character segment)
      → character segments → word segments (start, end, mean score)

Models (lazy, from the shared models volume; never downloaded at run time):
  en: facebook/wav2vec2-base-960h                    (Apache-2.0 ◐)  ALIGN_MODEL_DIR_EN
  ar: jonatasgrosman/wav2vec2-large-xlsr-53-arabic   (Apache-2.0 ◐)  ALIGN_MODEL_DIR_AR
MMS / ctc-forced-aligner weights are NOT usable (CC-BY-NC) and are not referenced.

Text normalisation (kept deliberately simple; what is aligned is reported per word as `norm`):
  * English: NFKC; typographic apostrophes → '; whole numbers below a million are spelled out ("32" → "thirty two",
    "1,000" → "one thousand"); "&" → "and"; hyphens, dashes and slashes split a word into parts (still one word in the
    output); every other character that is not a letter or an apostrophe is dropped. The case follows the model's
    vocabulary (the 960h model is upper-case).
  * Arabic: NFKC (presentation forms → base letters); diacritics (harakat, shadda, sukun, dagger alef, Quranic marks)
    and tatweel stripped; punctuation dropped. Letters the vocabulary lacks fall back through a short table
    (أ إ آ ٱ → ا, ة → ه, ى/ی → ي, گ → ك, چ → ج, پ → ب, ڤ → ف, ؤ → و, ئ → ي …). If the model's vocabulary is
    Buckwalter-transliterated (one model card says so; checked at load), the text is transliterated instead.
    Digits in Arabic lines are NOT spelled: those words stay unaligned and get interpolated times (`aligned: false`).
  * Characters the vocabulary does not contain are left out of the alignment (as WhisperX does); a word with none of
    its characters aligned takes its times from its neighbours ("nearest" interpolation) and is reported unaligned.

Long audio: emissions are computed in 30 s windows with 1 s of context on each side (the context frames are thrown
away), so the model's memory stays bounded. The trellis itself is one pass over the whole clip; clips longer than
ALIGN_MAX_AUDIO_S (default 180 s) or whose trellis would exceed MAX_TRELLIS_CELLS are refused: align per line or per
section (the endpoint takes `start`/`end` for that).
"""
from __future__ import annotations

import importlib.util
import math
import os
import re
import threading
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np

SAMPLE_RATE = 16000
FRAME_HOP = 320  # samples per wav2vec2 output frame (conv stack stride): 20 ms at 16 kHz
RECEPTIVE = 400  # samples one output frame sees (conv stack receptive field)
FRAME_SECONDS = FRAME_HOP / SAMPLE_RATE
WINDOW_SECONDS = 30.0  # emission window
CONTEXT_SECONDS = 1.0  # context on each side of a window; its frames are discarded
MAX_AUDIO_SECONDS = float(os.environ.get("ALIGN_MAX_AUDIO_S", "180"))
MAX_TRELLIS_CELLS = int(os.environ.get("ALIGN_MAX_TRELLIS_CELLS", "25000000"))  # float64: 200 MB
# START (calibrate on the workstation, research G5): a line whose mean character score is below this is REVIEW.
SCORE_FLOOR_START = 0.30

MODELS: dict[str, dict[str, str]] = {
    "en": {"dir": os.environ.get("ALIGN_MODEL_DIR_EN", "/models/align/wav2vec2-base-960h"), "name": "facebook/wav2vec2-base-960h", "license": "Apache-2.0"},
    "ar": {"dir": os.environ.get("ALIGN_MODEL_DIR_AR", "/models/align/wav2vec2-large-xlsr-53-arabic"), "name": "jonatasgrosman/wav2vec2-large-xlsr-53-arabic", "license": "Apache-2.0"},
}
DEVICE_PREF = os.environ.get("ALIGN_DEVICE", "auto")  # auto | cpu | cuda


class AlignmentError(ValueError):
    """The text cannot be aligned to this audio (too short for the text, nothing alignable, refused size)."""


class AlignmentUnavailable(RuntimeError):
    """A dependency or the weights are missing."""


# ------------------------------------------------------------------------------------------------ normalisation

APOSTROPHES = "‘’ʼ`´′"
DASHES = "-‐‑‒–—―/\\"
AR_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]")
TATWEEL = "ـ"
AR_DIGITS = {ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")} | {ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")}
# tried in order when the vocabulary lacks the letter itself
AR_FALLBACK: dict[str, tuple[str, ...]] = {
    "أ": ("ا",), "إ": ("ا",), "آ": ("ا",), "ٱ": ("ا",), "ة": ("ه", "ت"), "ى": ("ي", "ا"), "ی": ("ي", "ى"), "ے": ("ي",),
    "ک": ("ك",), "گ": ("ك", "ق"), "ڨ": ("ق",), "چ": ("ج",), "پ": ("ب",), "ڤ": ("ف",), "ژ": ("ز",), "ؤ": ("و", "ء"), "ئ": ("ي", "ء"),
    "ي": ("ى",), "ه": ("ة",), "ك": ("ک",),
}
# Tim Buckwalter's transliteration (the base letters and hamza forms; diacritics are stripped before this is used)
BUCKWALTER: dict[str, str] = {
    "ء": "'", "آ": "|", "أ": ">", "ؤ": "&", "إ": "<", "ئ": "}", "ا": "A", "ب": "b", "ة": "p", "ت": "t", "ث": "v", "ج": "j", "ح": "H",
    "خ": "x", "د": "d", "ذ": "*", "ر": "r", "ز": "z", "س": "s", "ش": "$", "ص": "S", "ض": "D", "ط": "T", "ظ": "Z", "ع": "E", "غ": "g",
    "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ى": "Y", "ي": "y", "ٱ": "{",
}
AR_BASE_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"

EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
EN_TENS = {2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy", 8: "eighty", 9: "ninety"}


def _below_thousand(n: int) -> list[str]:
    out: list[str] = []
    if n >= 100:
        out += [EN_UNITS[n // 100], "hundred"]
        n %= 100
    if n >= 20:
        out.append(EN_TENS[n // 10])
        n %= 10
        if n:
            out.append(EN_UNITS[n])
    elif n > 0 or not out:
        out.append(EN_UNITS[n])
    return out


def spell_number(digits: str) -> str:
    """A whole number in English words, the same rule as the worker's `foldEnglishNumbers`: below a million only, no
    leading zeros (a "007" stays digits and is therefore unalignable)."""
    if not digits.isdigit() or (len(digits) > 1 and digits.startswith("0")):
        return digits
    n = int(digits)
    if n >= 1_000_000:
        return digits
    if n < 1000:
        return " ".join(_below_thousand(n))
    return " ".join(_below_thousand(n // 1000) + ["thousand"] + (_below_thousand(n % 1000) if n % 1000 else []))


def normalize_en_word(word: str) -> str:
    """One script word as the English model can hear it (may contain spaces: "32" → "thirty two")."""
    w = unicodedata.normalize("NFKC", word)
    for a in APOSTROPHES:
        w = w.replace(a, "'")
    for d in DASHES:
        w = w.replace(d, " ")
    w = w.replace("&", " and ")
    w = re.sub(r"(\d),(?=\d{3}(?!\d))", r"\1", w)
    w = re.sub(r"\d+", lambda m: f" {spell_number(m.group(0))} ", w)
    w = "".join(c if (c.isalpha() or c == "'" or c == " " or c.isdigit()) else " " for c in w)
    w = re.sub(r"\s+", " ", w).strip().strip("'").strip()
    return w.lower()


def normalize_ar_word(word: str) -> str:
    """One script word as the Arabic model can hear it: diacritics and tatweel gone, punctuation dropped, Arabic-Indic
    digits as ASCII digits (left unaligned)."""
    w = unicodedata.normalize("NFKC", word)
    w = AR_DIACRITICS.sub("", w).replace(TATWEEL, "").translate(AR_DIGITS)
    for d in DASHES:
        w = w.replace(d, " ")
    w = "".join(c if (c.isalpha() or c.isdigit() or c == " ") else " " for c in w)
    return re.sub(r"\s+", " ", w).strip()


def normalize_word(word: str, lang: str) -> str:
    return normalize_ar_word(word) if lang == "ar" else normalize_en_word(word)


def split_script(text: str) -> list[str]:
    """The script's words: whitespace-separated tokens that contain at least one letter or digit (a lone "—" or "…"
    is not a word). The worker's `judgeAlignment` counts words the same way."""
    return [t for t in text.split() if any(c.isalnum() for c in t)]


def arabic_vocab_mode(vocab: dict[str, int]) -> str:
    """'arabic' when the vocabulary holds Arabic letters, 'buckwalter' when it holds their Buckwalter letters instead,
    'none' when it holds neither (the model cannot align Arabic)."""
    arabic = sum(1 for c in AR_BASE_LETTERS if c in vocab)
    bw = sum(1 for c in AR_BASE_LETTERS if BUCKWALTER[c] in vocab)
    if arabic >= 20 and arabic >= bw:
        return "arabic"
    if bw >= 20:
        return "buckwalter"
    return "none"


def latin_case(vocab: dict[str, int]) -> str:
    upper = sum(1 for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if c in vocab)
    lower = sum(1 for c in "abcdefghijklmnopqrstuvwxyz" if c in vocab)
    return "upper" if upper > lower else "lower"


def word_delimiter(vocab: dict[str, int]) -> int | None:
    """The token wav2vec2 CTC vocabularies use between words ("|"), or a literal space; None when there is neither."""
    if "|" in vocab:
        return vocab["|"]
    if " " in vocab:
        return vocab[" "]
    return None


def map_char(c: str, vocab: dict[str, int], lang: str, mode: str = "arabic", case: str = "upper") -> int | None:
    """The vocabulary id one normalised character aligns as, or None (left out and interpolated)."""
    if lang == "ar":
        if mode == "buckwalter":
            bw = BUCKWALTER.get(c)
            if bw is None:
                for alt in AR_FALLBACK.get(c, ()):  # e.g. گ → ك → k
                    if alt in BUCKWALTER and BUCKWALTER[alt] in vocab:
                        return vocab[BUCKWALTER[alt]]
                return None
            if bw in vocab:
                return vocab[bw]
            for alt in AR_FALLBACK.get(c, ()):
                if alt in BUCKWALTER and BUCKWALTER[alt] in vocab:
                    return vocab[BUCKWALTER[alt]]
            return None
        if c in vocab:
            return vocab[c]
        for alt in AR_FALLBACK.get(c, ()):
            if alt in vocab:
                return vocab[alt]
        return vocab.get(c.lower())  # a Latin loanword letter in an Arabic line, if the vocabulary has it
    cc = c.upper() if case == "upper" else c.lower()
    return vocab.get(cc, vocab.get(c))


@dataclass
class WordPlan:
    text: str  # as written in the script
    norm: str  # what is aligned
    chars: list[tuple[str, int | None]] = field(default_factory=list)  # (normalised char, vocab id or None); ' ' = internal delimiter


@dataclass
class TokenPlan:
    words: list[WordPlan]
    tokens: list[int]  # the vocab ids the trellis aligns, in order
    owners: list[tuple[int, int]]  # per token: (word index, char index), or (-1, -1) for a word delimiter


def plan_tokens(text: str, lang: str, vocab: dict[str, int]) -> TokenPlan:
    """Script text → the token sequence to align, remembering which word and character each token came from."""
    if lang not in ("en", "ar"):
        raise AlignmentError(f"unsupported language {lang!r} (en|ar)")
    mode = arabic_vocab_mode(vocab) if lang == "ar" else "latin"
    if lang == "ar" and mode == "none":
        raise AlignmentUnavailable("the Arabic model's vocabulary holds neither Arabic nor Buckwalter letters")
    case = latin_case(vocab)
    delim = word_delimiter(vocab)
    words: list[WordPlan] = []
    tokens: list[int] = []
    owners: list[tuple[int, int]] = []
    for raw in split_script(text):
        norm = normalize_word(raw, lang)
        wp = WordPlan(text=raw, norm=norm)
        for c in norm:
            wp.chars.append((c, delim if c == " " else map_char(c, vocab, lang, mode, case)))
        words.append(wp)
    for wi, wp in enumerate(words):
        if tokens and delim is not None and owners[-1] != (-1, -1):
            tokens.append(delim)
            owners.append((-1, -1))
        for ci, (c, tid) in enumerate(wp.chars):
            if tid is None:
                continue
            if c == " ":
                if owners and owners[-1] != (-1, -1):
                    tokens.append(tid)
                    owners.append((-1, -1))
                continue
            tokens.append(tid)
            owners.append((wi, ci))
    while owners and owners[-1] == (-1, -1):  # no trailing delimiter
        tokens.pop()
        owners.pop()
    return TokenPlan(words=words, tokens=tokens, owners=owners)


# ------------------------------------------------------------------------------------------------ CTC alignment


@dataclass
class Point:
    token_index: int
    time_index: int
    score: float


@dataclass
class Segment:
    token_index: int
    start: int  # first frame
    end: int  # one past the last frame
    score: float


def get_trellis(emission: np.ndarray, tokens: Sequence[int], blank_id: int = 0) -> np.ndarray:
    """trellis[t, j] = best log-probability of having emitted tokens[:j] in the first t frames. A frame either stays
    (emits blank) or advances to the next token (emits it). Shape (T+1, N+1)."""
    emission = np.asarray(emission, dtype=np.float64)
    T, N = emission.shape[0], len(tokens)
    trellis = np.full((T + 1, N + 1), -np.inf, dtype=np.float64)
    trellis[0, 0] = 0.0
    blank = emission[:, blank_id]
    trellis[1:, 0] = np.cumsum(blank)
    if N == 0:
        return trellis
    tok = np.asarray(tokens, dtype=np.int64)
    for t in range(T):
        stay = trellis[t, 1:] + blank[t]
        advance = trellis[t, :-1] + emission[t, tok]
        np.maximum(stay, advance, out=trellis[t + 1, 1:])
    return trellis


def backtrack(trellis: np.ndarray, emission: np.ndarray, tokens: Sequence[int], blank_id: int = 0) -> list[Point]:
    """The most likely path, from the frame where the last token's score peaks back to the first token. Each point is
    one frame: the token it belongs to and the probability of what that frame emitted (the token or blank)."""
    N = len(tokens)
    if N == 0:
        return []
    col = trellis[:, N]
    if not np.isfinite(col).any():
        raise AlignmentError("failed to align: the audio has fewer frames than the text has characters")
    t = int(np.argmax(col))
    j = N
    path: list[Point] = []
    while j > 0:
        if t <= 0:
            raise AlignmentError("failed to align (backtrack ran out of frames)")
        stayed = trellis[t - 1, j] + emission[t - 1, blank_id]
        changed = trellis[t - 1, j - 1] + emission[t - 1, tokens[j - 1]]
        if changed > stayed:
            path.append(Point(j - 1, t - 1, float(math.exp(emission[t - 1, tokens[j - 1]]))))
            j -= 1
        else:
            path.append(Point(j - 1, t - 1, float(math.exp(emission[t - 1, blank_id]))))
        t -= 1
    return path[::-1]


def merge_repeats(path: Sequence[Point]) -> list[Segment]:
    """Consecutive points on one token → one segment [start, end) with the mean frame probability."""
    segs: list[Segment] = []
    i = 0
    while i < len(path):
        j = i
        while j < len(path) and path[j].token_index == path[i].token_index:
            j += 1
        segs.append(Segment(path[i].token_index, path[i].time_index, path[j - 1].time_index + 1, float(np.mean([p.score for p in path[i:j]]))))
        i = j
    return segs


def _interpolate(values: list[float | None]) -> list[float | None]:
    """Fill gaps with the nearest known value on either side (WhisperX's 'nearest' interpolation)."""
    known = [i for i, v in enumerate(values) if v is not None]
    if not known:
        return values
    out = list(values)
    for i, v in enumerate(values):
        if v is None:
            out[i] = values[min(known, key=lambda k: (abs(k - i), k))]
    return out


def words_from_segments(plan: TokenPlan, segments: Sequence[Segment], frame_seconds: float = FRAME_SECONDS, offset: float = 0.0) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Character segments → per-character and per-word times. A word's start is its first aligned character's start,
    its end the last one's end (the delimiter that follows absorbs the pause); its score the mean of its characters'.
    Words with nothing aligned take the previous word's end and the next word's start."""
    char_times: dict[tuple[int, int], Segment] = {}
    for s in segments:
        owner = plan.owners[s.token_index]
        if owner != (-1, -1):
            char_times[owner] = s
    chars: list[dict[str, Any]] = []
    words: list[dict[str, Any]] = []
    for wi, wp in enumerate(plan.words):
        segs = [char_times[(wi, ci)] for ci in range(len(wp.chars)) if (wi, ci) in char_times]
        for ci, (c, _tid) in enumerate(wp.chars):
            if c == " ":
                continue
            s = char_times.get((wi, ci))
            chars.append({"char": c, "word": wi, "start": round(offset + s.start * frame_seconds, 3) if s else None, "end": round(offset + s.end * frame_seconds, 3) if s else None, "score": round(s.score, 3) if s else None})
        if segs:
            words.append({"text": wp.text, "norm": wp.norm, "start": round(offset + min(s.start for s in segs) * frame_seconds, 3), "end": round(offset + max(s.end for s in segs) * frame_seconds, 3), "score": round(float(np.mean([s.score for s in segs])), 3), "aligned": True})
        else:
            words.append({"text": wp.text, "norm": wp.norm, "start": None, "end": None, "score": None, "aligned": False})
    # unaligned words: start at the previous aligned word's end, end at the next aligned word's start
    ends = _interpolate([w["end"] if w["aligned"] else None for w in words])
    starts = _interpolate([w["start"] if w["aligned"] else None for w in words])
    for i, w in enumerate(words):
        if w["aligned"]:
            continue
        prev_end = next((words[k]["end"] for k in range(i - 1, -1, -1) if words[k]["aligned"]), None)
        next_start = next((words[k]["start"] for k in range(i + 1, len(words)) if words[k]["aligned"]), None)
        w["start"] = prev_end if prev_end is not None else starts[i]
        w["end"] = next_start if next_start is not None else ends[i]
        if w["start"] is not None and w["end"] is not None and w["end"] < w["start"]:
            w["end"] = w["start"]
    return words, chars


def align_emission(emission: np.ndarray, text: str, lang: str, vocab: dict[str, int], blank_id: int, frame_seconds: float = FRAME_SECONDS, offset: float = 0.0) -> dict[str, Any]:
    """The whole pure pipeline on a log-probability matrix (T × V). Everything after the model forward pass."""
    plan = plan_tokens(text, lang, vocab)
    if not plan.words:
        raise AlignmentError("the text has no words")
    if not plan.tokens:
        raise AlignmentError("no character of the text is in the model's vocabulary")
    T = int(emission.shape[0])
    if T < len(plan.tokens):
        raise AlignmentError(f"the audio is too short for the text: {T} frames for {len(plan.tokens)} characters")
    if (T + 1) * (len(plan.tokens) + 1) > MAX_TRELLIS_CELLS:
        raise AlignmentError(f"too large to align in one pass ({T} frames × {len(plan.tokens)} characters); align per line or section")
    trellis = get_trellis(emission, plan.tokens, blank_id)
    path = backtrack(trellis, emission, plan.tokens, blank_id)
    segments = merge_repeats(path)
    words, chars = words_from_segments(plan, segments, frame_seconds, offset)
    aligned = [w for w in words if w["aligned"]]
    total_chars = sum(1 for wp in plan.words for c, _ in wp.chars if c != " ")
    in_vocab = sum(1 for wp in plan.words for c, t in wp.chars if c != " " and t is not None)
    char_scores = [c["score"] for c in chars if c["score"] is not None]
    return {
        "words": words,
        "chars": chars,
        "coverage": round(len(aligned) / len(words), 4),
        "char_coverage": round(in_vocab / total_chars, 4) if total_chars else 0.0,
        "mean_score": round(float(np.mean(char_scores)), 4) if char_scores else None,
        "unaligned_words": [w["text"] for w in words if not w["aligned"]],
        "score_floor": SCORE_FLOOR_START,
        "frame_seconds": frame_seconds,
        "frames": T,
        "tokens": len(plan.tokens),
    }


def emission_windows(n_samples: int, window_s: float = WINDOW_SECONDS, context_s: float = CONTEXT_SECONDS, sr: int = SAMPLE_RATE, hop: int = FRAME_HOP, receptive: int = RECEPTIVE) -> list[dict[str, int]]:
    """How to cut a long clip for the model: each window reads [read_start, read_end) samples (its frames plus the
    context on both sides), and its frames [keep_from, keep_from + keep) of the model's output are the clip's global
    frames [frame_start, frame_start + keep). read_start is a multiple of the hop, so output frame f of a window is
    global frame read_start/hop + f. Every global frame is covered exactly once."""
    if n_samples < receptive:
        return []
    total = (n_samples - receptive) // hop + 1
    per = max(1, int(round(window_s * sr / hop)))
    ctx = int(round(context_s * sr / hop))
    out = []
    f0 = 0
    while f0 < total:
        f1 = min(total, f0 + per)
        r0f = max(0, f0 - ctx)
        r1f = min(total, f1 + ctx)
        read_start = r0f * hop
        read_end = min(n_samples, (r1f - 1) * hop + receptive)
        out.append({"read_start": read_start, "read_end": read_end, "keep_from": f0 - r0f, "keep": f1 - f0, "frame_start": f0})
        f0 = f1
    return out


# ------------------------------------------------------------------------------------------------ models (torch)

_lock = threading.Lock()
_bundles: dict[str, dict[str, Any]] = {}


def weights_present(lang: str) -> bool:
    d = MODELS[lang]["dir"]
    return os.path.isfile(os.path.join(d, "config.json")) and os.path.isfile(os.path.join(d, "vocab.json")) and (os.path.isfile(os.path.join(d, "pytorch_model.bin")) or os.path.isfile(os.path.join(d, "model.safetensors")))


def status() -> dict[str, dict[str, Any]]:
    """Per language: whether /align can run, and why not. Cheap: no import of torch or transformers."""
    missing = [m for m in ("torch", "transformers") if importlib.util.find_spec(m) is None]
    out: dict[str, dict[str, Any]] = {}
    for lang, spec in MODELS.items():
        reason = None
        if missing:
            reason = f"python packages missing: {', '.join(missing)} (rebuild the asr image)"
        elif not weights_present(lang):
            reason = f"weights not on the models volume at {spec['dir']} (manifest group qa-align)"
        out[lang] = {"available": reason is None, "reason": reason, "model": spec["name"], "dir": spec["dir"], "license": spec["license"], "loaded": lang in _bundles}
    return out


def _device() -> str:
    import torch  # type: ignore

    if DEVICE_PREF == "cpu":
        return "cpu"
    if DEVICE_PREF == "cuda" or torch.cuda.is_available():
        return "cuda" if torch.cuda.is_available() else "cpu"
    return "cpu"


def load(lang: str) -> dict[str, Any]:
    st = status()[lang]
    if not st["available"]:
        raise AlignmentUnavailable(st["reason"])
    with _lock:
        if lang not in _bundles:
            import torch  # type: ignore
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor  # type: ignore

            t0 = time.time()
            d = MODELS[lang]["dir"]
            processor = Wav2Vec2Processor.from_pretrained(d)
            device = _device()
            model = Wav2Vec2ForCTC.from_pretrained(d).to(device).eval()
            vocab = {k: int(v) for k, v in processor.tokenizer.get_vocab().items()}
            blank = processor.tokenizer.pad_token_id
            blank_id = int(blank if blank is not None else 0)
            if lang == "ar" and arabic_vocab_mode(vocab) == "none":
                raise AlignmentUnavailable("the Arabic model's vocabulary holds neither Arabic nor Buckwalter letters")
            _bundles[lang] = {"model": model, "processor": processor, "vocab": vocab, "blank_id": blank_id, "device": device, "torch": torch, "mode": arabic_vocab_mode(vocab) if lang == "ar" else latin_case(vocab)}
            print(f"[align] loaded {MODELS[lang]['name']} on {device} in {time.time() - t0:.1f}s (vocab {len(vocab)}, blank {blank_id}, {_bundles[lang]['mode']})", flush=True)
        return _bundles[lang]


def unload() -> None:
    with _lock:
        _bundles.clear()


def compute_emission(audio: np.ndarray, bundle: dict[str, Any]) -> np.ndarray:
    """Log-probabilities (T × V) of a 16 kHz mono clip, window by window."""
    torch = bundle["torch"]
    model, processor, device = bundle["model"], bundle["processor"], bundle["device"]
    parts: list[np.ndarray] = []
    for w in emission_windows(len(audio)):
        chunk = audio[w["read_start"]:w["read_end"]]
        inputs = processor(chunk, sampling_rate=SAMPLE_RATE, return_tensors="pt")
        with torch.inference_mode():
            logits = model(inputs.input_values.to(device)).logits[0]
            lp = torch.log_softmax(logits.float(), dim=-1).cpu().numpy()
        parts.append(lp[w["keep_from"]:w["keep_from"] + w["keep"]])
    if not parts:
        raise AlignmentError("the clip is shorter than one model frame")
    return np.concatenate(parts, axis=0)


def align_audio(audio: np.ndarray, text: str, lang: str, offset: float = 0.0) -> dict[str, Any]:
    """Align `text` to a 16 kHz mono float32 clip. Times are seconds from the clip's start plus `offset`."""
    if lang not in MODELS:
        raise AlignmentError(f"unsupported language {lang!r} (en|ar)")
    duration = len(audio) / SAMPLE_RATE
    if duration > MAX_AUDIO_SECONDS:
        raise AlignmentError(f"the clip is {duration:.1f} s; the limit is {MAX_AUDIO_SECONDS:.0f} s per call (align per line or section with start/end)")
    bundle = load(lang)
    t0 = time.time()
    with _lock:
        emission = compute_emission(audio.astype(np.float32), bundle)
    out = align_emission(emission, text, lang, bundle["vocab"], bundle["blank_id"], FRAME_SECONDS, offset)
    out.update({"language": lang, "model": MODELS[lang]["name"], "device": bundle["device"], "vocab_mode": bundle["mode"], "duration": round(duration, 3), "ms": int((time.time() - t0) * 1000)})
    return out

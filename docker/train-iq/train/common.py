"""Shared pieces of the Vewbox-IQ trainer package (docs/VEWBOX-IQ.md): the dataset tree, manifest reading, the token
cache format written by prepare_tokens.py and read by train_lora.py, the Arabic-block row mask over the V3 vocabulary,
hashing, and the fixed listening lines (the producer's Character A pack — keep in step with scripts/character-a-pack.ts).

The token cache (one folder per manifest): index.jsonl + <id>.npz
  index record: { id, file, speaker, language, n_text, n_speech, durationSeconds, unk_chars, manifest, manifest_sha256 }
  npz: text (int32, the MTLTokenizer ids WITHOUT start/stop — the trainer adds hp.start_text_token/stop_text_token),
       speech (int32, the S3 tokens, 25/s, vocab 6561 — the trainer adds start/stop speech tokens), ve (float32 256)
Pickle-free (npz, jsonl, safetensors); nothing here needs the GPU."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

TRAINING_ROOT = Path(os.environ.get("VEWBOX_TRAINING_ROOT", "/training"))

# the Character A pack (scripts/character-a-pack.ts PACK); the long line is written once by Qwen3.8 and read from its file
PACK_LINES: list[dict[str, str]] = [
    {"id": "1-iraqi-natural", "language": "ar", "text": "شلونك؟ صارلي هواية ما شايفك."},
    {"id": "2-iraqi-hard", "language": "ar", "text": "گلتلك باچر نكعد نحچي ونشرب چاي."},
    {"id": "3-iraqi-emotional", "language": "ar", "text": "يمعود لا تشيل هم، آني يمك وكلشي راح يصير زين."},
    {"id": "4-iraqi-long", "language": "ar", "text": ""},  # filled from --long-line / --long-line-file
    {"id": "5-english-identity", "language": "en", "text": "I told you we'd make it. Sit down and let me explain."},
]

ARABIC_BLOCKS = ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))


def is_arabic_char(ch: str) -> bool:
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in ARABIC_BLOCKS)


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    tmp = path.with_suffix(path.suffix + ".partial")
    with open(tmp, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def read_manifest(path: Path, language: str) -> list[dict[str, Any]]:
    """The pipeline's prepared/train/validation manifest records (scripts/iraqi-dataset.ts PreparedUtterance): only the
    accepted ones with a file; `language` is taken from the record when it carries one (a replay manifest), else the given
    tag. A Windows path in `file` (the pipeline runs on the host) is remapped onto the container's /training mount when
    VEWBOX_TRAINING_ROOT_HOST names the host root (default D:\\vewbox-data\\training\\iraqi)."""
    host_root = os.environ.get("VEWBOX_TRAINING_ROOT_HOST", "D:\\vewbox-data\\training\\iraqi")
    rows = []
    for r in read_jsonl(path):
        if r.get("accepted") is False or not r.get("file"):
            continue
        file = str(r["file"])
        if host_root and file.lower().startswith(host_root.lower()):
            file = str(TRAINING_ROOT / file[len(host_root):].lstrip("\\/").replace("\\", "/"))
        rows.append({**r, "file": file, "language": (r.get("language") or language).lower(), "text": r.get("normalised") or r.get("transcript") or ""})
    return rows


def vocab_tokens(vocab_file: Path) -> dict[str, int]:
    """token → id of the grapheme vocabulary (a HF `tokenizers` JSON: model.vocab, plus added_tokens)."""
    j = json.loads(vocab_file.read_text(encoding="utf-8"))
    vocab: dict[str, int] = dict((j.get("model") or {}).get("vocab") or {})
    for t in j.get("added_tokens") or []:
        if isinstance(t, dict) and "content" in t and "id" in t:
            vocab.setdefault(t["content"], int(t["id"]))
    if not vocab:
        raise ValueError(f"{vocab_file}: no model.vocab found")
    return vocab


def arabic_row_mask(vocab: dict[str, int], n_rows: int, include_lang_token: bool = False) -> list[bool]:
    """Which rows of t3.text_emb may move in Stage A: tokens made of Arabic-block characters (249 single characters in
    V3 plus any multi-character Arabic merges); optionally the `[ar]` tag. Special tokens, Latin and every other script
    stay frozen (the gradient mask + a post-step restore in train_lora.py make this exact)."""
    mask = [False] * n_rows
    for tok, idx in vocab.items():
        if idx >= n_rows:
            continue
        if tok.startswith("[") and tok.endswith("]"):
            if include_lang_token and tok == "[ar]":
                mask[idx] = True
            continue
        letters = [c for c in tok if c.isalpha() or (0x064B <= ord(c) <= 0x0652) or ord(c) in (0x0654, 0x0655, 0x0670)]
        if letters and all(is_arabic_char(c) for c in letters):
            mask[idx] = True
    return mask


def log(msg: str) -> None:
    print(msg, flush=True)


def die(msg: str, code: int = 2) -> None:
    print(f"ERROR: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def git_commit_hint() -> str:
    return os.environ.get("VEWBOX_COMMIT") or "unknown (pass --commit or VEWBOX_COMMIT)"


def load_long_line(text: str | None, file: str | None) -> str:
    if text:
        return text.strip()
    if file:
        j = json.loads(Path(file).read_text(encoding="utf-8"))
        return str(j.get("text") or "").strip()
    return ""

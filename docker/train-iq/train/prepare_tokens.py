"""PREPARE TOKENS — cache, per utterance of a pipeline manifest (train/validation/manifest.jsonl, or a prepared/<source>/
manifest.jsonl), everything T3 trains on (docs/VEWBOX-IQ.md step 2):
  - the S3 speech tokens: the 24 kHz training wav resampled to 16 kHz through `s3gen.tokenizer` (25 tokens/s, vocab 6561)
  - the voice-encoder embedding: `ve.embeds_from_wavs([wav16], 16000)` (256-d) — the speaker path T3 is conditioned on
  - the text tokens: `MTLTokenizer.text_to_tokens(text, language_id)` with the `[ar]` / `[en]` tag (lowercase + NFKD,
    `[SPACE]`), after the library's own `punc_norm` (what generate() applies) unless --no-punc-norm
and validate the vocabulary: every id must be a row of `t3.text_emb` (2454 in V3), and every character of the normalised
transcript must have a token (a character the tokenizer maps to [UNK] is reported per utterance and in the summary —
the V3 vocab holds the whole Arabic block incl. چ گ پ ڤ, so an UNK means a stray symbol in the transcript).

  python prepare_tokens.py --manifest /training/train/manifest.jsonl --out /training/tokens/train --language ar
  python prepare_tokens.py --manifest /training/prepared/<english-source>/manifest.jsonl --out /training/tokens/replay-en --language en

Output: <out>/index.jsonl + <out>/<id>.npz (format: common.py). Idempotent: an utterance whose npz exists is skipped unless
--force. Needs the base model files in the store (read-only) and a GPU for speed (CPU works, slowly)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/opt/iq")
from common import TRAINING_ROOT, arabic_row_mask, log, read_manifest, sha256_file, vocab_tokens, write_jsonl  # noqa: E402

import iq_model  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="cache S3 speech tokens, VE embeddings and text tokens for a manifest")
    ap.add_argument("--manifest", required=True, help="a pipeline manifest.jsonl (train/validation/test or prepared/<source>)")
    ap.add_argument("--out", required=True, help="the token cache folder (index.jsonl + <id>.npz)")
    ap.add_argument("--language", default="ar", choices=["ar", "en"], help="the tag for records that carry no `language` field")
    ap.add_argument("--base-dir", default=None, help="the Chatterbox MTL V3 folder (default MODEL_ROOT/voice/chatterbox-mtl-v3)")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-seconds", type=float, default=40.0, help="skip longer utterances (the pipeline caps at 40 s = Chatterbox's 1000 speech tokens; a 20 s default skipped 1,503 of 2,117 on 2026-10-10)")
    ap.add_argument("--no-punc-norm", action="store_true", help="do not apply the library's punc_norm before tokenising")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    manifest = Path(args.manifest)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = read_manifest(manifest, args.language)
    if args.limit:
        rows = rows[: args.limit]
    man_sha = sha256_file(manifest)
    log(f"[tokens] {len(rows)} accepted utterances in {manifest} (sha256 {man_sha[:12]}); language tag [{args.language}] where unset")

    import librosa  # type: ignore
    import soundfile as sf  # type: ignore
    import torch  # type: ignore

    model, info = iq_model.load_base(Path(args.base_dir) if args.base_dir else None, args.device)
    tok = model.tokenizer
    hf_tok = tok.tokenizer  # the `tokenizers.Tokenizer`
    unk_id = hf_tok.token_to_id("[UNK]")
    n_rows = int(model.t3.text_emb.num_embeddings)
    vocab = vocab_tokens(Path(info["base_dir"]) / iq_model.VOCAB_FILE)
    ar_rows = sum(arabic_row_mask(vocab, n_rows))
    log(f"[tokens] t3.text_emb rows {n_rows}; vocab entries {len(vocab)}; Arabic-block rows {ar_rows}; [UNK] id {unk_id}; start/stop text {model.t3.hp.start_text_token}/{model.t3.hp.stop_text_token}")
    punc_norm = None
    if not args.no_punc_norm:
        try:
            from chatterbox.mtl_tts import punc_norm as _pn  # type: ignore

            punc_norm = _pn
        except ImportError:
            log("[tokens] WARNING: chatterbox.mtl_tts.punc_norm not importable at this commit; texts tokenised as written")

    index: list[dict] = []
    unk_summary: dict[str, int] = {}
    skipped: dict[str, int] = {}
    t0 = time.time()
    seconds_total = 0.0
    for i, r in enumerate(rows):
        uid = str(r["id"])
        npz = out / f"{uid}.npz"
        text = r["text"].strip()
        if not text:
            skipped["no text"] = skipped.get("no text", 0) + 1
            continue
        if float(r.get("durationSeconds") or 0) > args.max_seconds:
            skipped["too long"] = skipped.get("too long", 0) + 1
            continue
        if punc_norm is not None:
            text = punc_norm(text)
        lang = r["language"]
        # text tokens (+ the characters the tokenizer cannot name)
        ids = tok.text_to_tokens(text, language_id=lang).reshape(-1).tolist()
        unk_chars: list[str] = []
        if unk_id is not None and unk_id in ids:
            for ch in sorted(set(text)):
                if ch.isspace():
                    continue
                try:
                    if unk_id in tok.encode(ch, language_id=None):
                        unk_chars.append(ch)
                except Exception:  # noqa: BLE001
                    unk_chars.append(ch)
            for ch in unk_chars:
                unk_summary[ch] = unk_summary.get(ch, 0) + 1
        bad = [t for t in ids if t < 0 or t >= n_rows]
        if bad:
            raise RuntimeError(f"{uid}: token ids outside t3.text_emb ({bad[:5]}): the vocabulary and the checkpoint disagree")
        if npz.is_file() and not args.force:
            z = np.load(npz)
            n_speech = int(z["speech"].shape[0])
        else:
            wav, sr = sf.read(r["file"], dtype="float32", always_2d=True)
            wav = wav.mean(axis=1)
            wav16 = librosa.resample(wav, orig_sr=sr, target_sr=16000) if sr != 16000 else wav
            with torch.inference_mode():
                speech, lens = model.s3gen.tokenizer.forward([wav16])
                speech = speech[0, : int(lens[0])].cpu().numpy().astype(np.int32)
                ve = np.asarray(model.ve.embeds_from_wavs([wav16], sample_rate=16000), dtype=np.float32).reshape(-1)
            if ve.shape[0] != 256:
                raise RuntimeError(f"{uid}: voice-encoder embedding has {ve.shape[0]} dims, expected 256")
            np.savez(npz, text=np.asarray(ids, dtype=np.int32), speech=speech, ve=ve)
            n_speech = int(speech.shape[0])
        dur = float(r.get("durationSeconds") or 0)
        seconds_total += dur
        index.append({"id": uid, "file": r["file"], "speaker": r.get("speaker") or "unknown", "language": lang, "text": text, "n_text": len(ids), "n_speech": n_speech,
                      "durationSeconds": dur, "unk_chars": unk_chars, "source": r.get("source"), "manifest": str(manifest), "manifest_sha256": man_sha})
        if (i + 1) % 100 == 0:
            log(f"[tokens] {i + 1}/{len(rows)} ({time.time() - t0:.0f} s)")
    write_jsonl(out / "index.jsonl", index)
    summary = {"manifest": str(manifest), "manifest_sha256": man_sha, "utterances": len(index), "hours": round(seconds_total / 3600, 3), "skipped": skipped,
               "unk_characters": {k: v for k, v in sorted(unk_summary.items(), key=lambda kv: -kv[1])}, "utterances_with_unk": sum(1 for r in index if r["unk_chars"]),
               "text_emb_rows": n_rows, "arabic_rows": ar_rows, "base": {k: info[k] for k in ("base_revision", "t3_file", "s3gen_file", "code")}, "punc_norm": punc_norm is not None,
               "training_root": str(TRAINING_ROOT), "seconds": round(time.time() - t0, 1)}
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

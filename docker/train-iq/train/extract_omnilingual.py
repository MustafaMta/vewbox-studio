"""EXTRACT OMNILINGUAL — the Iraqi rows of facebook/omnilingual-asr-corpus (CC BY 4.0; licence record
licensed/omnilingual-asr-corpus-iraqi.json) from the parquet files scripts/fetch-iraqi-data.ps1 verified, into the folder
format src/server/training/iraqi-sources.ts reads (raw/<source>/metadata.jsonl { file, transcript, speaker } with the
audio files under raw/<source>/wavs/...). The audio is written exactly as stored (original sample rate, original
PCM subtype when the container holds PCM; no resampling, no level change): the pipeline measures and converts later.

  python extract_omnilingual.py [--root /training/raw/omnilingual-asr-corpus-iraqi] [--limit N] [--dry-run]

Files: wavs/<lang>/<split>-<idx>.wav (lang = acm_Arab | ayp_Arab, split = train | dev | test from the parquet file name,
idx = the row's position within that split across its parquet parts, zero-padded). Both language folders have a `train`
split, so the language folder keeps them apart. speaker = the row's speaker/client id column when the schema has one,
else "<lang>-<split>". The parquet schema is printed first; the column choice is overridable (--audio-column,
--text-column, --speaker-column). Idempotent: an existing wav is kept unless --force; metadata.jsonl is rewritten whole."""
from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TRAINING_ROOT, log, write_jsonl  # noqa: E402

LANGS = ("acm_Arab", "ayp_Arab")
TEXT_CANDIDATES = ("transcription", "raw_transcription", "text", "sentence", "transcript", "normalized_text")
SPEAKER_CANDIDATES = ("speaker_id", "client_id", "speaker", "spk_id", "user_id")


def pick(fields: list[str], candidates: tuple[str, ...], override: str | None) -> str | None:
    if override:
        if override not in fields:
            raise SystemExit(f"column {override!r} not in schema {fields}")
        return override
    for c in candidates:
        if c in fields:
            return c
    return None


def decode_audio(cell) -> tuple[bytes | None, "object", int, str]:
    """An HF Audio cell is a struct {bytes, path} (or {array, sampling_rate}); returns (raw bytes, samples, sr, subtype)."""
    import numpy as np
    import soundfile as sf  # type: ignore

    if isinstance(cell, dict) and cell.get("bytes"):
        raw = cell["bytes"]
        try:
            with sf.SoundFile(io.BytesIO(raw)) as f:
                subtype = f.subtype
                sr = f.samplerate
                data = f.read(dtype="int16" if subtype.startswith("PCM_") and subtype != "PCM_24" and subtype != "PCM_32" else "float32", always_2d=True)
            return raw, data, int(sr), subtype
        except Exception:  # noqa: BLE001 — a container libsndfile cannot read (an mp3 variant): let ffmpeg decode it
            with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as t:
                t.write(raw)
                src = t.name
            out = src + ".wav"
            r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-v", "error", "-i", src, "-vn", "-c:a", "pcm_s16le", out], capture_output=True, text=True, timeout=120)
            if r.returncode != 0:
                raise ValueError(r.stderr.strip()[-200:] or "ffmpeg could not decode the audio")
            data, sr = sf.read(out, dtype="int16", always_2d=True)
            Path(src).unlink(missing_ok=True)
            Path(out).unlink(missing_ok=True)
            return raw, data, int(sr), "PCM_16"
    if isinstance(cell, dict) and cell.get("array") is not None:
        arr = np.asarray(cell["array"], dtype="float32")
        return None, arr.reshape(-1, 1) if arr.ndim == 1 else arr, int(cell.get("sampling_rate") or 16000), "FLOAT"
    raise ValueError(f"unrecognised audio cell type {type(cell).__name__}")


def main() -> None:
    ap = argparse.ArgumentParser(description="write the Omnilingual Iraqi parquet rows as wav + metadata.jsonl")
    ap.add_argument("--root", default=str(TRAINING_ROOT / "raw" / "omnilingual-asr-corpus-iraqi"))
    ap.add_argument("--langs", nargs="*", default=list(LANGS))
    ap.add_argument("--audio-column", default=None)
    ap.add_argument("--text-column", default=None)
    ap.add_argument("--speaker-column", default=None)
    ap.add_argument("--limit", type=int, default=0, help="rows per language (0 = all)")
    ap.add_argument("--batch-rows", type=int, default=64)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="print the schema and the column choice, write nothing")
    args = ap.parse_args()

    import pyarrow.parquet as pq  # type: ignore
    import soundfile as sf  # type: ignore

    root = Path(args.root)
    rows_out: list[dict] = []
    stats: dict[str, dict] = {}
    for lang in args.langs:
        files = sorted((root / "data" / lang).glob("*.parquet"))
        if not files:
            log(f"[omni] {lang}: no parquet files under {root / 'data' / lang} (run scripts/fetch-iraqi-data.ps1 first)")
            continue
        counters: dict[str, int] = {}
        n_lang = 0
        for pf in files:
            m = re.match(r"^(train|dev|validation|test)-\d+-of-\d+\.parquet$", pf.name)
            split = m.group(1) if m else pf.stem.split("-")[0]
            reader = pq.ParquetFile(pf)
            fields = [f.name for f in reader.schema_arrow]
            log(f"[omni] {pf.relative_to(root)}: {reader.metadata.num_rows} rows, {reader.metadata.num_row_groups} row groups\n  schema: {reader.schema_arrow}")
            audio_col = args.audio_column or next((f.name for f in reader.schema_arrow if "audio" in f.name.lower()), None)
            text_col = pick(fields, TEXT_CANDIDATES, args.text_column)
            spk_col = pick(fields, SPEAKER_CANDIDATES, args.speaker_column)
            log(f"  columns: audio={audio_col} text={text_col} speaker={spk_col or f'(none: speaker = {lang}-{split})'}")
            if audio_col is None or text_col is None:
                raise SystemExit(f"{pf}: cannot find the audio/text columns in {fields}; pass --audio-column/--text-column")
            if args.dry_run:
                continue
            out_dir = root / "wavs" / lang
            out_dir.mkdir(parents=True, exist_ok=True)
            cols = [c for c in (audio_col, text_col, spk_col, "id") if c and c in fields]
            for batch in reader.iter_batches(batch_size=args.batch_rows, columns=cols):
                recs = batch.to_pylist()
                for rec in recs:
                    if args.limit and n_lang >= args.limit:
                        break
                    idx = counters.get(split, 0)
                    counters[split] = idx + 1
                    n_lang += 1
                    transcript = str(rec.get(text_col) or "").strip()
                    if not transcript:
                        stats.setdefault(lang, {}).setdefault("no transcript", 0)
                        stats[lang]["no transcript"] += 1
                        continue
                    rel = f"wavs/{lang}/{split}-{idx:06d}.wav"
                    dest = root / rel
                    if dest.is_file() and not args.force:
                        pass
                    else:
                        try:
                            _raw, data, sr, subtype = decode_audio(rec.get(audio_col))
                        except Exception as ex:  # noqa: BLE001
                            stats.setdefault(lang, {}).setdefault("undecodable", 0)
                            stats[lang]["undecodable"] += 1
                            log(f"  skip {rel}: {ex}")
                            continue
                        sf.write(dest, data, sr, subtype=subtype if subtype in ("PCM_16", "PCM_24", "PCM_32", "FLOAT", "DOUBLE", "PCM_S8", "PCM_U8") else "PCM_16")
                    speaker = str(rec.get(spk_col) or "").strip() if spk_col else ""
                    rows_out.append({"file": rel, "transcript": transcript, "speaker": speaker or f"{lang}-{split}", "sourceId": rec.get("id"), "language": lang, "split": split})
                if args.limit and n_lang >= args.limit:
                    break
        stats.setdefault(lang, {})["rows"] = n_lang
    if args.dry_run:
        return
    write_jsonl(root / "metadata.jsonl", rows_out)
    summary = {"root": str(root), "utterances": len(rows_out), "per_language": stats, "speakers": len({r["speaker"] for r in rows_out})}
    (root / "extract-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

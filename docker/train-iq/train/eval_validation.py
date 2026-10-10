"""EVAL VALIDATION — speak HELD-OUT Iraqi utterances (the pipeline's validation manifest) through a checkpoint or the
base, each from a reference clip of the SAME speaker taken from the training manifest, so the dialect learning is
measured on its own terms (the speaker's own Arabic reference, Arabic text, the [ar] tag) and apart from any character's
cross-language seed. Balanced across speakers (--per-speaker), fixed seed, one generation per utterance. Writes the wavs
and metrics.json in the eval_checkpoint shape (a `lines` list with id/language/text/file) plus each line's
`reference_host` path, so scripts/iq-eval-score.ts can score CER, the phoneme gate and ECAPA to that reference.

  python eval_validation.py --checkpoint none --out /training/eval/validation-base --per-speaker 2
  python eval_validation.py --checkpoint /training/checkpoints/<name>/step-001500 --out /training/eval/validation-<name>-1500 --per-speaker 2
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/opt/iq")
from common import git_commit_hint, log  # noqa: E402

import iq_model  # noqa: E402


def read_manifest(p: Path) -> list[dict]:
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            if r.get("accepted", True):
                out.append(r)
    return out


def to_container(path: str, host_root: str) -> str:
    """A pipeline record names the HOST path (D:\\vewbox-data\\training\\iraqi\\...); the container sees /training."""
    p = path.replace("\\", "/")
    hr = host_root.replace("\\", "/").rstrip("/")
    if hr and p.lower().startswith(hr.lower()):
        return "/training" + p[len(hr):]
    return p


def to_host(path: str, host_root: str) -> str:
    return host_root.rstrip("\\/") + path[len("/training"):].replace("/", "\\") if path.startswith("/training") else path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--validation", default="/training/validation/manifest.jsonl")
    ap.add_argument("--train", default="/training/train/manifest.jsonl")
    ap.add_argument("--per-speaker", type=int, default=2)
    ap.add_argument("--max-seconds", type=float, default=16.0, help="validation utterances longer than this are skipped (generation time)")
    ap.add_argument("--ref-max-seconds", type=float, default=10.0)
    ap.add_argument("--ref-min-seconds", type=float, default=4.0)
    ap.add_argument("--base-dir", default=None)
    ap.add_argument("--s3gen", default=None, choices=list(iq_model.S3GEN_CHOICES))
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg-weight", type=float, default=0.5)
    ap.add_argument("--temperature", type=float, default=0.8)
    args = ap.parse_args()

    import soundfile as sf  # type: ignore
    import torch  # type: ignore

    host_root = os.environ.get("VEWBOX_TRAINING_ROOT_HOST", "D:\\vewbox-data\\training\\iraqi")
    val = read_manifest(Path(args.validation))
    train = read_manifest(Path(args.train))
    # the reference per speaker: the training utterance of that speaker closest to 8 s within the window (never the
    # validation utterance itself; a speaker without one is skipped)
    refs: dict[str, dict] = {}
    for r in train:
        d = float(r.get("durationSeconds") or 0)
        if not (args.ref_min_seconds <= d <= args.ref_max_seconds):
            continue
        cur = refs.get(r["speaker"])
        if cur is None or abs(d - 8.0) < abs(float(cur["durationSeconds"]) - 8.0):
            refs[r["speaker"]] = r
    chosen: list[dict] = []
    per: dict[str, int] = {}
    for r in sorted(val, key=lambda x: x["id"]):
        if r["speaker"] not in refs or float(r.get("durationSeconds") or 0) > args.max_seconds:
            continue
        if per.get(r["speaker"], 0) >= args.per_speaker:
            continue
        per[r["speaker"]] = per.get(r["speaker"], 0) + 1
        chosen.append(r)
    log(f"[eval-val] {len(chosen)} validation utterances from {len(per)} speakers (per speaker ≤ {args.per_speaker}); references from the training manifest")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model, base = iq_model.load_base(Path(args.base_dir) if args.base_dir else None, args.device, args.s3gen)
    adapter = None if args.checkpoint.lower() == "none" else iq_model.apply_adapter(model, Path(args.checkpoint), args.device)
    label = iq_model.model_label(base, adapter)
    log(f"[eval-val] {label}")
    results = []
    for i, r in enumerate(chosen):
        ref = refs[r["speaker"]]
        ref_path = to_container(ref["file"], host_root)
        text = r["normalised"]
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
        iq_model.seed_everything(args.seed)
        t0 = time.time()
        wav = model.generate(text, language_id="ar", audio_prompt_path=ref_path, exaggeration=args.exaggeration, cfg_weight=args.cfg_weight, temperature=args.temperature, repetition_penalty=1.2, min_p=0.05, top_p=1.0)
        ms = int((time.time() - t0) * 1000)
        samples = np.asarray(wav.detach().float().cpu().numpy(), dtype=np.float32).reshape(-1)
        sr = int(model.sr)
        f = out / f"{i:03d}-{r['speaker']}.wav"
        with sf.SoundFile(f, mode="w", samplerate=sr, channels=1, subtype="FLOAT", format="WAV") as o:
            o.comment = f"synthetic speech; model={label}; seed={args.seed}; validation {r['id']}; perth watermark"
            o.write(samples)
        dur = samples.shape[0] / sr
        results.append({"id": f"{i:03d}-{r['speaker']}", "language": "ar", "text": text, "file": f.name, "validation_id": r["id"], "speaker": r["speaker"], "reference": ref_path, "reference_host": ref["file"], "reference_text": ref.get("normalised"), "original_seconds": r.get("durationSeconds"), "seconds": round(dur, 3), "ms": ms, "rtf": round(ms / 1000 / max(dur, 1e-3), 3)})
        log(f"[eval-val] {i:03d} {r['speaker']}: {dur:.2f} s in {ms} ms")
    metrics = {"model": label, "base": base, "checkpoint": adapter, "lines": results, "per_speaker": args.per_speaker, "note": "held-out validation utterances, each from its own speaker's training reference; CER/phoneme gate/ECAPA by the studio afterwards", "vewbox_commit": git_commit_hint(), "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"[eval-val] wrote {len(results)} lines + metrics.json to {out}")


if __name__ == "__main__":
    main()

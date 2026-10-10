"""EVAL CHECKPOINT — speak the fixed listening lines (the producer's Character A pack: three Iraqi lines, the long line
written once by Qwen3.8, the English identity line) from ONE reference wav through a given Vewbox-IQ checkpoint (or the
base alone), and write the wavs + metrics.json (duration, generation ms, RTF, seed, parameters, provenance). ONE
generation per line, fixed seed, raw 32-bit float at 24 kHz, no limiter — the same output the tts-iq service gives.
The ECAPA similarity and CER are measured afterwards by the studio's existing services (tts-design /embed, asr) on these
files — nothing is re-implemented here.

  python eval_checkpoint.py --checkpoint /training/checkpoints/stage-a/step-000500 --reference /training/eval/ref-ar.wav \
      --out /training/eval/stage-a-500 --long-line-file /training/eval/long-line.json [--english-reference ref-en.wav]
  python eval_checkpoint.py --checkpoint none --reference ... --out /training/eval/base      (the baseline, before training)

`--english-reference`: the same actor's English clip for the [en] line (research §5: the reference should match the
language tag); without it the Arabic reference speaks the English line too (reported in metrics.json)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/opt/iq")
from common import PACK_LINES, git_commit_hint, load_long_line, log  # noqa: E402

import iq_model  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="generate the fixed listening lines for a checkpoint")
    ap.add_argument("--checkpoint", required=True, help="a Vewbox-IQ checkpoint folder (adapter/ + t3_merged.safetensors) or `none` for the base")
    ap.add_argument("--reference", required=True, help="the reference wav (Arabic line of the actor; ≤ 10 s used by S3Gen, 6 s by T3)")
    ap.add_argument("--english-reference", default=None)
    ap.add_argument("--prompt-reference", default=None, help="the pack rule's dual reference for the Arabic lines: --reference stays the identity (speaker embedding + S3Gen), this clip supplies the T3 prompt tokens alone (iq_model.prepare_dual_conditionals)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--long-line", default=None)
    ap.add_argument("--long-line-file", default=None, help="docs/evidence/character-a-voice/long-line.json copied beside the data")
    ap.add_argument("--base-dir", default=None)
    ap.add_argument("--s3gen", default=None, choices=list(iq_model.S3GEN_CHOICES), help="default: IQ_S3GEN or s3gen.pt")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg-weight", type=float, default=0.5)
    ap.add_argument("--temperature", type=float, default=0.8)
    ap.add_argument("--lines", nargs="*", default=None, help="subset of line ids (default: all five)")
    args = ap.parse_args()

    import soundfile as sf  # type: ignore
    import torch  # type: ignore

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    long_line = load_long_line(args.long_line, args.long_line_file)
    lines = [dict(l, text=long_line if l["id"] == "4-iraqi-long" else l["text"]) for l in PACK_LINES]
    if args.lines:
        lines = [l for l in lines if l["id"] in set(args.lines)]
    missing = [l["id"] for l in lines if not l["text"]]
    if missing:
        log(f"[eval] WARNING: no text for {missing} (pass --long-line or --long-line-file); skipped")
        lines = [l for l in lines if l["text"]]

    model, base = iq_model.load_base(Path(args.base_dir) if args.base_dir else None, args.device, args.s3gen)
    adapter = None if args.checkpoint.lower() == "none" else iq_model.apply_adapter(model, Path(args.checkpoint), args.device)
    label = iq_model.model_label(base, adapter)
    log(f"[eval] {label}")
    params = {"seed": args.seed, "exaggeration": args.exaggeration, "cfg_weight": args.cfg_weight, "temperature": args.temperature, "repetition_penalty": 1.2, "min_p": 0.05, "top_p": 1.0}
    results = []
    for l in lines:
        ref = args.english_reference if (l["language"] == "en" and args.english_reference) else args.reference
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
        iq_model.seed_everything(args.seed)
        t0 = time.time()
        dual = l["language"] == "ar" and bool(args.prompt_reference)
        if dual:
            iq_model.prepare_dual_conditionals(model, ref, args.prompt_reference, args.exaggeration)
        wav = model.generate(l["text"], language_id=l["language"], audio_prompt_path=None if dual else ref, exaggeration=args.exaggeration, cfg_weight=args.cfg_weight,
                             temperature=args.temperature, repetition_penalty=1.2, min_p=0.05, top_p=1.0)
        ms = int((time.time() - t0) * 1000)
        samples = np.asarray(wav.detach().float().cpu().numpy(), dtype=np.float32).reshape(-1)
        sr = int(model.sr)
        f = out / f"{l['id']}.wav"
        with sf.SoundFile(f, mode="w", samplerate=sr, channels=1, subtype="FLOAT", format="WAV") as o:
            o.software = "vewbox-iq eval_checkpoint"
            o.comment = f"synthetic speech; model={label}; seed={args.seed}; not a voice reference; perth watermark"
            o.write(samples)
        dur = samples.shape[0] / sr
        peak = int(torch.cuda.max_memory_reserved() / 1048576) if torch.cuda.is_available() else None
        rec = {"id": l["id"], "language": l["language"], "text": l["text"], "file": f.name, "reference": ref, **({"prompt_reference": args.prompt_reference} if dual else {}), "seconds": round(dur, 3), "ms": ms, "rtf": round(ms / 1000 / max(dur, 1e-3), 3),
               "peak_abs": float(np.max(np.abs(samples))) if samples.size else 0.0, "peak_vram_mb": peak}
        results.append(rec)
        log(f"[eval] {l['id']}: {dur:.2f} s in {ms} ms (RTF {rec['rtf']}) peak {rec['peak_abs']:.3f}")
    metrics = {"model": label, "base": base, "checkpoint": adapter, "params": params, "lines": results, "english_reference": args.english_reference,
               "note": "ECAPA similarity (tts-design /embed) and CER (asr) are measured by the studio afterwards; the ear decides", "vewbox_commit": git_commit_hint(), "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"[eval] wrote {len(results)} lines + metrics.json to {out}")


if __name__ == "__main__":
    main()

"""SoulX-Singer SVC evaluation runner (docker/svc-eval). One conversion: the source singing (`--source`) re-voiced by the
reference voice (`--reference`), written to `--out/converted.wav` with a JSON record of what ran. An ENGINEERING
evaluation, never production audio: outputs from a reference without the speaker's permission are LAB TEST only.

Upstream naming is inverted: its "prompt" is the target voice (our reference), its "target" the singing to convert
(our source). F0 for both comes from its own RMVPE preprocessing; the content encoder is openai/whisper-base, served
offline from the models volume through a local Hugging Face cache layout built here.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

MODEL_ROOT = Path(os.environ.get("MODEL_ROOT", "/models"))
STORE = MODEL_ROOT / "eval" / "soulx-singer"
WHISPER_REV = "e37978b90ca9030d5170a5c07aadb050351a65bb"


def stage_models() -> None:
    """The paths upstream hard-codes, linked to the store: pretrained_models/SoulX-Singer-Preprocess/rmvpe/rmvpe.pt, and
    openai/whisper-base as a Hugging Face cache snapshot (offline)."""
    rm = Path("/opt/soulx/pretrained_models/SoulX-Singer-Preprocess/rmvpe")
    rm.mkdir(parents=True, exist_ok=True)
    link = rm / "rmvpe.pt"
    if not link.exists():
        link.symlink_to(STORE / "rmvpe" / "rmvpe.pt")
    hub = Path(os.environ.get("HF_HOME", "/opt/hf")) / "hub" / "models--openai--whisper-base"
    snap = hub / "snapshots" / WHISPER_REV
    snap.mkdir(parents=True, exist_ok=True)
    (hub / "refs").mkdir(parents=True, exist_ok=True)
    (hub / "refs" / "main").write_text(WHISPER_REV)
    for f in ("config.json", "preprocessor_config.json", "generation_config.json", "model.safetensors"):
        t = snap / f
        if not t.exists():
            t.symlink_to(STORE / "whisper-base" / f)


def run(cmd: list[str]) -> float:
    t0 = time.time()
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, cwd="/opt/soulx")
    return round(time.time() - t0, 1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="the singing to re-voice (a clean vocal stem)")
    ap.add_argument("--reference", required=True, help="the voice to give it (upstream: the prompt)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=32)
    ap.add_argument("--cfg", type=float, default=3.0)
    ap.add_argument("--auto-shift", action="store_true", help="shift the source pitch to the reference's range")
    ap.add_argument("--label", default="LAB TEST — NOT PRODUCTION")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    stage_models()
    times: dict[str, float] = {}
    pre = {}
    for name, src in (("reference", a.reference), ("source", a.source)):
        d = out / f"pre-{name}"
        times[f"f0-{name}"] = run([sys.executable, "-m", "preprocess.pipeline", "--audio_path", src, "--save_dir", str(d), "--vocal_sep", "False", "--midi_transcribe", "False"])
        pre[name] = d
    conv = out / "svc"
    cmd = [sys.executable, "-m", "cli.inference_svc", "--device", "cuda", "--model_path", str(STORE / "model-svc.pt"), "--config", str(STORE / "config.yaml"),
           "--prompt_wav_path", str(pre["reference"] / "vocal.wav"), "--target_wav_path", str(pre["source"] / "vocal.wav"),
           "--prompt_f0_path", str(pre["reference"] / "vocal_f0.npy"), "--target_f0_path", str(pre["source"] / "vocal_f0.npy"),
           "--save_dir", str(conv), "--n_steps", str(a.steps), "--cfg", str(a.cfg)] + (["--auto_shift"] if a.auto_shift else [])
    times["convert"] = run(cmd)
    shutil.copy(conv / "generated.wav", out / "converted.wav")
    rec = {"label": a.label, "engine": "SoulX-Singer SVC (evaluation only)", "commit": os.environ.get("SOULX_COMMIT", "81aeb3a"), "source": a.source, "reference": a.reference,
           "steps": a.steps, "cfg": a.cfg, "auto_shift": a.auto_shift, "seconds": times, "output": str(out / "converted.wav")}
    (out / "record.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False))
    print(json.dumps(rec, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

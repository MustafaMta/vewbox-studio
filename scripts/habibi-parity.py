"""HABIBI RAW AUDIO PARITY (Phase 3 root cause, 2026-10-08) — runs INSIDE the tts-habibi container.

A: upstream's own CLI (habibi_tts.infer.infer_cli, Specialized IRQ, dialect_id None as upstream does), imported so it
   loads its model, then seeded exactly the way the Vewbox service seeds (random, numpy, torch, cuda) right before its
   own main() runs. Nothing of Vewbox's code is used.
B: is produced outside (the Vewbox service /synthesize with the same seed, reference, texts).

  python habibi-parity.py <ref.wav> <ref_text> <gen_text> <seed> <out_dir>

LAB TEST — NOT PRODUCTION / NO SPEAKER PERMISSION (the upstream Habibi IRQ demo clip).
"""
import os
import random
import sys

ref, ref_text, gen_text, seed, out = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
os.makedirs(out, exist_ok=True)
sys.argv = ["infer_cli", "--model", "Specialized", "--dialect", "IRQ",
            "-p", "/models/tts/habibi/Specialized/IRQ/model_100000.safetensors", "-v", "/models/tts/habibi/Specialized/IRQ/vocab.txt",
            "-r", ref, "-s", ref_text, "-t", gen_text, "-o", out, "-w", "A_upstream_cli.wav"]

import numpy as np  # noqa: E402
import torch  # noqa: E402

import habibi_tts.infer.infer_cli as cli  # noqa: E402  (loads the model and the vocoder at import, as upstream does)

random.seed(seed)
np.random.seed(seed % (2**32))
torch.manual_seed(seed)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(seed)
print(f"upstream cli: model={cli.model} dialect={cli.dialect} dialect_id={cli.dialect_id} nfe={cli.nfe_step} cfg={cli.cfg_strength} sway={cli.sway_sampling_coef} speed={cli.speed} target_rms={cli.target_rms} cross_fade={cli.cross_fade_duration}", flush=True)
cli.main()

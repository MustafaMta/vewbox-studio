"""Evaluation batch inside the lipsync image: one model load, several corrections (docs/MODELS.md, lip-sync corrector).

    python eval_batch.py <set.json> <out_dir> [--only name1,name2] [--variant default] [--steps 20] [--guidance 1.5]

set.json (container paths): {"items": [{"name", "video", "audio", "audioOffset", "reference", "others": [...]}]}
Writes <out_dir>/<variant>/<name>.mp4, <name>.json (the corrector's report) and <name>/ (frame sheets). Run it under the
GPU lease (scripts/gpu-hold.ts LIPSYNC …) with H3 unloaded; it prints the card's memory before loading.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

import corrector as cr


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("set")
    ap.add_argument("out")
    ap.add_argument("--only", default="")
    ap.add_argument("--variant", default="default")
    ap.add_argument("--steps", type=int, default=cr.DEFAULTS["steps"])
    ap.add_argument("--guidance", type=float, default=cr.DEFAULTS["guidance"])
    ap.add_argument("--seed", type=int, default=cr.DEFAULTS["seed"])
    ap.add_argument("--feather", type=float, default=cr.DEFAULTS["feather"])
    ap.add_argument("--erode", type=float, default=cr.DEFAULTS["erode"])
    a = ap.parse_args()
    items = json.load(open(a.set))["items"]
    only = {x for x in a.only.split(",") if x}
    out = os.path.join(a.out, a.variant)
    os.makedirs(out, exist_ok=True)
    print(subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip(), "before load", flush=True)
    # where the weights come from (the model store's load proof): the /models mount and each weight file
    proof = {"mounts": [ln.strip() for ln in open("/proc/mounts") if " /models " in ln], "weights": {}}
    for k, p in {"unet": cr.UNET_CKPT, "whisper": cr.WHISPER_CKPT, "vae": os.path.join(cr.VAE_DIR, "diffusion_pytorch_model.safetensors"), "yunet": cr.YUNET_PATH, "sface": cr.SFACE_PATH, "face_landmarker": cr.LANDMARKER_PATH, "hand_landmarker": cr.HAND_LANDMARKER_PATH}.items():
        proof["weights"][k] = {"path": p, "bytes": os.path.getsize(p) if os.path.isfile(p) else None}
    with open(os.path.join(out, "_load-proof.json"), "w") as f:
        json.dump(proof, f, indent=1)
    print("load proof", json.dumps(proof), flush=True)
    c = cr.Corrector()
    rc = 0
    for it in items:
        if only and it["name"] not in only:
            continue
        t0 = time.time()
        with tempfile.TemporaryDirectory() as d:
            try:
                rep = c.correct(it["video"], it["audio"], os.path.join(out, it["name"] + ".mp4"), audio_offset=float(it.get("audioOffset", 0)), reference=it.get("reference"), others=it.get("others", []), steps=a.steps, guidance=a.guidance, seed=a.seed, feather=a.feather, erode=a.erode, workdir=d, debug_dir=os.path.join(out, it["name"]))
                rep["ok"] = True
            except Exception as e:  # noqa: BLE001
                rep = {"ok": False, "error": f"{type(e).__name__}: {e}"}
                rc = 1
        rep["wall_s"] = round(time.time() - t0, 1)
        rep["nvidia_smi_after"] = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
        with open(os.path.join(out, it["name"] + ".json"), "w") as f:
            json.dump(rep, f, indent=1)
        print(it["name"], json.dumps({k: rep.get(k) for k in ("ok", "error", "frames", "out_frames", "track", "timing_s", "vram_peak_allocated_mb", "vram_peak_reserved_mb", "mouth_change_mad")}), flush=True)
    c.unload()
    return rc


if __name__ == "__main__":
    sys.exit(main())

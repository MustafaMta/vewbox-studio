"""Run one correction from the command line inside the lipsync image (evaluation; the studio uses the HTTP service):

    python cli.py --video take.mp4 --audio line.wav [--audio-offset 0.92] [--reference canonical.png]
                  [--hint-box x0,y0,x1,y1] [--steps 20] [--guidance 1.5] [--seed 1247] --out corrected.mp4
                  [--report report.json] [--debug-dir crops/]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

import corrector as cr


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--audio-offset", type=float, default=0.0)
    ap.add_argument("--reference")
    ap.add_argument("--hint-box")
    ap.add_argument("--steps", type=int, default=cr.DEFAULTS["steps"])
    ap.add_argument("--guidance", type=float, default=cr.DEFAULTS["guidance"])
    ap.add_argument("--seed", type=int, default=cr.DEFAULTS["seed"])
    ap.add_argument("--feather", type=float, default=cr.DEFAULTS["feather"])
    ap.add_argument("--erode", type=float, default=cr.DEFAULTS["erode"])
    ap.add_argument("--report")
    ap.add_argument("--debug-dir")
    a = ap.parse_args()
    hint = tuple(float(x) for x in a.hint_box.split(",")) if a.hint_box else None
    c = cr.Corrector()
    with tempfile.TemporaryDirectory() as d:
        try:
            rep = c.correct(a.video, a.audio, a.out, audio_offset=a.audio_offset, reference=a.reference, hint=hint, steps=a.steps, guidance=a.guidance, seed=a.seed, feather=a.feather, erode=a.erode, workdir=d, debug_dir=a.debug_dir)  # type: ignore[arg-type]
        except (cr.InputError, cr.Unavailable) as e:
            print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
            return 2
    rep["ok"] = True
    txt = json.dumps(rep, indent=1)
    if a.report:
        os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
        with open(a.report, "w") as f:
            f.write(txt)
    print(txt)
    return 0


if __name__ == "__main__":
    sys.exit(main())

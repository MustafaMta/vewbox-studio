"""PITCH STATISTICS FOR LISTENING PACKS (supporting evidence only): librosa's pYIN F0 over each file, 65–600 Hz.

  python pitch-stats.py <file> [<file> ...]   ->   JSON {file: {median_hz, p10_hz, p90_hz, range_semitones, voiced_ratio,
                                                         breaks}} on stdout

`range_semitones` is p10→p90 (robust to octave errors at the edges); `breaks` counts frame-to-frame jumps over 7
semitones inside voiced runs (possible octave errors or cracks — for a listener to check, never a verdict).
Runs inside a container that has librosa (the tts-habibi image)."""
import json
import sys

import librosa
import numpy as np

out = {}
for f in sys.argv[1:]:
    y, sr = librosa.load(f, sr=16000, mono=True)
    f0, voiced, _ = librosa.pyin(y, fmin=65, fmax=600, sr=sr, frame_length=1024)
    v = f0[voiced & np.isfinite(f0)]
    if v.size < 5:
        out[f] = {"voiced_ratio": float(np.mean(voiced)) if voiced.size else 0.0, "median_hz": None}
        continue
    st = 12 * np.log2(f0 / 100.0)
    jumps = 0
    for a, b, va, vb in zip(st[:-1], st[1:], voiced[:-1], voiced[1:]):
        if va and vb and np.isfinite(a) and np.isfinite(b) and abs(b - a) > 7:
            jumps += 1
    p10, p50, p90 = np.percentile(v, [10, 50, 90])
    out[f] = {"median_hz": round(float(p50), 1), "p10_hz": round(float(p10), 1), "p90_hz": round(float(p90), 1),
              "range_semitones": round(float(12 * np.log2(p90 / p10)), 2), "voiced_ratio": round(float(np.mean(voiced)), 3), "breaks": int(jumps)}
print(json.dumps(out))

"""HABIBI RAW AUDIO PARITY — compare A (upstream CLI) with B (Vewbox service), then B raw with B as the film mix
receives it (joinSpeech: resampled to 48 kHz). LAB TEST. Writes parity.json beside the files.

  python scripts/habibi-parity-compare.py var/eval/LAB-TEST-iraqi-raw-parity-20261008
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

d = Path(sys.argv[1])
a, sra = sf.read(d / "A_upstream_cli.wav", dtype="float64")
b, srb = sf.read(d / "B_vewbox_service.wav", dtype="float64")
ia = sf.info(d / "A_upstream_cli.wav")
ib = sf.info(d / "B_vewbox_service.wav")


def db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-12)))


def stats(x: np.ndarray, sr: int) -> dict:
    return {"samples": int(x.shape[0]), "seconds": round(x.shape[0] / sr, 4), "rms_dbfs": round(db(float(np.sqrt(np.mean(x**2)))), 2), "peak_dbfs": round(db(float(np.max(np.abs(x)))), 2)}


out: dict = {"A_upstream_cli": {**stats(a, sra), "sr": sra, "subtype": ia.subtype}, "B_vewbox_service": {**stats(b, srb), "sr": srb, "subtype": ib.subtype}}
n = min(a.shape[0], b.shape[0])
diff = a[:n] - b[:n]
lsb = 1 / 32768
out["A_vs_B"] = {
    "same_rate": sra == srb, "length_difference_samples": int(a.shape[0] - b.shape[0]),
    "identical_samples": bool(a.shape[0] == b.shape[0] and np.array_equal(a, b)),
    "max_abs_diff_lsb": round(float(np.max(np.abs(diff))) / lsb, 2),
    "samples_differing": int(np.count_nonzero(np.abs(diff) > 0)),
    "residual_dbfs": round(db(float(np.sqrt(np.mean(diff**2)))), 2),
    "residual_vs_signal_db": round(db(float(np.sqrt(np.mean(diff**2)))) - db(float(np.sqrt(np.mean(a[:n] ** 2)))), 2),
    "correlation": round(float(np.corrcoef(a[:n], b[:n])[0, 1]), 6),
}
# B as the mix receives it: joinSpeech resamples to 48 kHz (ffmpeg aresample, soxr); a polyphase stand-in here, compared
# back at 24 kHz so the comparison measures what the resampling changes, not the rate
try:
    from scipy.signal import resample_poly

    up = resample_poly(b, 2, 1)
    back = resample_poly(up, 1, 2)[: b.shape[0]]
    r = b - back
    out["B_raw_vs_B_48k_roundtrip"] = {"residual_vs_signal_db": round(db(float(np.sqrt(np.mean(r**2)))) - db(float(np.sqrt(np.mean(b**2)))), 2), "peak_48k_dbfs": round(db(float(np.max(np.abs(up)))), 2)}
except Exception as ex:  # noqa: BLE001
    out["B_raw_vs_B_48k_roundtrip"] = {"skipped": f"{type(ex).__name__}: {ex}"}
(d / "parity.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(json.dumps(out, indent=2))

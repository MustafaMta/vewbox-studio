"""ASR A/B on the Iraqi eval run (docs/research/MODEL-EVAL-2026-10.md §4): transcribe every Habibi WAV of a voice-eval
run with a given faster-whisper model (language=ar, beam 5, as the asr service), so the dialect fine-tune the service
now uses for `language=ar` can be compared with large-v3 on the same audio. Runs inside the asr image:

  docker run --rm --gpus all -v vewbox_models:/models -v <repo>:/repo --entrypoint python vewbox/asr:dev \
      /repo/scripts/asr-ab-iraqi.py /models/asr/faster-whisper-large-v3 /repo/docs/evidence/iraqi-eval/2026-10-run1 large-v3

Writes <run>/asr-ab/<label>.json: {wav file: text}. Synthetic speech only: this compares the two models on the
studio's own engine output, not on real Iraqi speakers (MODEL-STACK §5.9 asks for 40 real clips; none are authorised)."""
import json, os, sys, time
from faster_whisper import WhisperModel

model_dir, run_dir, label = sys.argv[1], sys.argv[2], sys.argv[3]
wavs = sorted(f for f in os.listdir(os.path.join(run_dir, "wavs")) if f.endswith(".wav") and "-habibi-" in f)
t0 = time.time()
m = WhisperModel(model_dir, device="cuda", compute_type="float16")
print(f"{label}: loaded in {time.time() - t0:.1f}s; {len(wavs)} files", flush=True)
out = {}
t1 = time.time()
for f in wavs:
    segs, _ = m.transcribe(os.path.join(run_dir, "wavs", f), language="ar", beam_size=5)
    out[f] = " ".join(s.text.strip() for s in segs).strip()
os.makedirs(os.path.join(run_dir, "asr-ab"), exist_ok=True)
with open(os.path.join(run_dir, "asr-ab", f"{label}.json"), "w", encoding="utf-8") as fh:
    json.dump({"model": model_dir, "seconds": round(time.time() - t1, 1), "texts": out}, fh, ensure_ascii=False, indent=1)
print(f"{label}: {len(out)} transcribed in {time.time() - t1:.1f}s", flush=True)

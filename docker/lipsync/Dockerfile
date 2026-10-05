# syntax=docker/dockerfile:1.7
# Lip-sync corrector: LatentSync 1.6 (ByteDance; code Apache-2.0 @ a229c39, weights CreativeML Open RAIL++-M) with a
# YuNet + MediaPipe face tracker in place of InsightFace (non-commercial packs: not installed, no weights). Edits the
# mouth region of an existing take on request; never generates video. CUDA 12.8 / torch 2.8 cu128 (Blackwell sm_120).
# Weights come from the models volume (manifest group lipsync-latentsync-1.6, plus qa-identity and the Face Landmarker
# the asr service already keeps); the service never downloads.
#
# THE FIRST LINES ARE docker/asr/Dockerfile's, VERBATIM (base image, apt, the extra CA, the venv, the pip lines up to
# torch): BuildKit then reuses the asr image's layers — one copy of torch cu128 on disk and no second 3 GB download on
# a slow link. Keep them identical to docker/asr/Dockerfile (a difference only costs that download, never correctness).
# The faster-whisper / demucs packages those layers carry are unused here.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PIP_BREAK_SYSTEM_PACKAGES=1 CUDA_CACHE_PATH=/cache/nv-jit HF_HUB_DISABLE_TELEMETRY=1 TORCH_HOME=/models/demucs
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg curl ca-certificates libegl1 libgles2 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt PIP_CERT=/etc/ssl/certs/ca-certificates.crt
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --upgrade pip && pip install "ctranslate2==4.8.2" "faster-whisper==1.2.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0"
RUN pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 && pip install "demucs==4.0.1" "soundfile==0.13.1"
# ---- end of the lines shared with docker/asr/Dockerfile
ENV TORCH_HOME=/cache/torch HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 DIFFUSERS_OFFLINE=1
# torchvision matching torch 2.8.0 (cu128). LatentSync's own pins (requirements.txt @ a229c39) are torch 2.5.1 cu121
# (no sm_120 kernels), diffusers 0.32.2, transformers 4.48.0, kornia 0.8.0, einops 0.7.0, omegaconf 2.3.0: the library
# pins are kept; insightface, onnxruntime-gpu, face-alignment, decord (no Python 3.12 wheel; a stand-in is installed),
# DeepCache, gradio, lpips, scenedetect, mediapipe 0.10.11 (the tasks API of mediapipe 1.0.1 is used, as in docker/asr)
# are not installed: the inference path in corrector.py does not import them.
RUN pip install torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
RUN pip install "numpy==2.5.3" "diffusers==0.32.2" "transformers==4.48.0" "huggingface-hub==0.30.2" "kornia==0.8.0" "einops==0.7.0" "omegaconf==2.3.0" \
      "imageio==2.37.0" "ffmpeg-python==0.2.0" "tqdm==4.67.1" "opencv-python-headless==4.14.0.94" "absl-py==2.5.0" "flatbuffers==25.12.19" "matplotlib==3.11.2" \
 && pip install --no-deps "mediapipe==1.0.1"
# LatentSync source at the pinned commit (Apache-2.0), verified by the archive's sha256; the demo assets are dropped.
ARG LATENTSYNC_COMMIT=a229c3948406bc2cf6eaf4873e662e70c6a04746
ARG LATENTSYNC_SHA256=
RUN python - <<'EOF'
import hashlib, io, os, shutil, tarfile, urllib.request
commit = os.environ.get("LATENTSYNC_COMMIT") or "a229c3948406bc2cf6eaf4873e662e70c6a04746"
want = os.environ.get("LATENTSYNC_SHA256", "")
url = f"https://codeload.github.com/bytedance/LatentSync/tar.gz/{commit}"
for attempt in range(8):
    try:
        data = urllib.request.urlopen(url, timeout=600).read()
        break
    except Exception as e:  # noqa: BLE001
        print("retry", attempt, e, flush=True)
else:
    raise SystemExit("could not download LatentSync")
got = hashlib.sha256(data).hexdigest()
print("LatentSync archive sha256", got, len(data), flush=True)
if want and got != want:
    raise SystemExit(f"sha256 mismatch: {got} != {want}")
with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
    t.extractall("/opt", filter="data")
src = f"/opt/LatentSync-{commit}"
shutil.rmtree(os.path.join(src, "assets"), ignore_errors=True)
os.rename(src, "/opt/latentsync")
EOF
COPY docker/lipsync/patches/face_detector.py /opt/latentsync/latentsync/utils/face_detector.py
COPY docker/lipsync/patches/decord /opt/vewbox-stubs/decord
ENV PYTHONPATH=/opt/vewbox-stubs:/opt/latentsync LATENTSYNC_DIR=/opt/latentsync
RUN cd /opt/latentsync && python -c "import cv2, torch, torchvision, diffusers, transformers, kornia; cv2.FaceDetectorYN; from mediapipe.tasks.python import vision; vision.FaceLandmarker; from latentsync.models.unet import UNet3DConditionModel; from latentsync.pipelines.lipsync_pipeline import LipsyncPipeline; from latentsync.whisper.audio2feature import Audio2Feature; print('imports ok', torch.__version__, torch.version.cuda, diffusers.__version__, transformers.__version__)"
WORKDIR /app
COPY docker/lipsync/face_track.py docker/lipsync/corrector.py docker/lipsync/app.py docker/lipsync/cli.py ./
RUN mkdir -p /models /cache/nv-jit /cache/torch
EXPOSE 8040
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=10 CMD curl -fsS http://127.0.0.1:8040/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8040", "--workers", "1"]

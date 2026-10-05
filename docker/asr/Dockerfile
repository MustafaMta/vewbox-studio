# syntax=docker/dockerfile:1.7
# Audio analysis service: transcription with faster-whisper (CTranslate2) and stem separation with Demucs (htdemucs,
# MIT), on CUDA 12.8 / cuDNN 9 — the wheel line that works on Blackwell. Whisper weights come from the shared models
# volume (asr/faster-whisper-large-v3, fetched by docker/models); Demucs fetches htdemucs (~80 MB) into /models/demucs
# on first use.
# Script alignment (align.py: wav2vec2 CTC via transformers) and picture QA (qa.py: MediaPipe Face Landmarker, OpenCV
# YuNet + SFace; CPU) run in the same service. Their weights come from the models volume (manifest groups qa-align and
# qa-identity); the Face Landmarker bundle is fetched once by the service (pinned sha256) unless QA_AUTOFETCH=0.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PIP_BREAK_SYSTEM_PACKAGES=1 CUDA_CACHE_PATH=/cache/nv-jit HF_HUB_DISABLE_TELEMETRY=1 TORCH_HOME=/models/demucs
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg curl ca-certificates libegl1 libgles2 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --upgrade pip && pip install "ctranslate2==4.8.2" "faster-whisper==1.2.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0"
# Demucs needs torch; the cu128 wheels run on the RTX 5090 (sm_120)
RUN pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 && pip install "demucs==4.0.1" "soundfile==0.13.1"
# faster-whisper 1.2.1 calls PyAV with `metadata_errors=`, which newer PyAV removed: pin the pairing that works.
# (The service decodes with ffmpeg itself and hands samples over, so PyAV is only a fallback.)
RUN pip install "av==13.1.0"
# Alignment and QA (versions checked on PyPI 2026-10-05). opencv-python-headless 4.14 has cv2.FaceDetectorYN and
# cv2.FaceRecognizerSF; 5.0 is not used until its API is checked. MediaPipe 1.0.1 declares opencv-contrib-python (the
# GUI build, which would replace the headless cv2 and need libGL) plus matplotlib/sounddevice for drawing and audio
# tasks: it is installed with --no-deps and given only what `mediapipe.tasks.python.vision` imports. Its native library
# loads libEGL.so.1 / libGLESv2.so.2 even on CPU (libegl1, libgles2 above).
RUN pip install "numpy==2.5.3" "transformers==5.18.0" "opencv-python-headless==4.14.0.94" "absl-py==2.5.0" "flatbuffers==25.12.19" "matplotlib==3.11.2" "certifi==2026.7.22" \
 && pip install --no-deps "mediapipe==1.0.1" \
 && python -c "import cv2, transformers; cv2.FaceDetectorYN; cv2.FaceRecognizerSF; from mediapipe.tasks.python import vision; vision.FaceLandmarker"
WORKDIR /app
COPY docker/asr/app.py ./app.py
COPY docker/asr/align.py ./align.py
COPY docker/asr/qa.py ./qa.py
RUN mkdir -p /models /cache/nv-jit
EXPOSE 8030
HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=10 CMD curl -fsS http://127.0.0.1:8030/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8030", "--workers", "1"]

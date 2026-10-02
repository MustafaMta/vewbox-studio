# syntax=docker/dockerfile:1.7
# Audio analysis service: transcription with faster-whisper (CTranslate2) and stem separation with Demucs (htdemucs,
# MIT), on CUDA 12.8 / cuDNN 9 — the wheel line that works on Blackwell. Whisper weights come from the shared models
# volume (asr/faster-whisper-large-v3, fetched by docker/models); Demucs fetches htdemucs (~80 MB) into /models/demucs
# on first use.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PIP_BREAK_SYSTEM_PACKAGES=1 CUDA_CACHE_PATH=/cache/nv-jit HF_HUB_DISABLE_TELEMETRY=1 TORCH_HOME=/models/demucs
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --upgrade pip && pip install "ctranslate2==4.8.2" "faster-whisper==1.2.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0"
# Demucs needs torch; the cu128 wheels run on the RTX 5090 (sm_120)
RUN pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 && pip install "demucs==4.0.1" "soundfile==0.13.1"
WORKDIR /app
COPY docker/asr/app.py ./app.py
RUN mkdir -p /models /cache/nv-jit
EXPOSE 8030
HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=10 CMD curl -fsS http://127.0.0.1:8030/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8030", "--workers", "1"]

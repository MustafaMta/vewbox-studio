# syntax=docker/dockerfile:1.7
# Transcription service: faster-whisper (CTranslate2) on CUDA 12.8 / cuDNN 9 — the wheel line that works on Blackwell.
# Weights come from the shared models volume (asr/faster-whisper-large-v3, fetched by docker/models).
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PIP_BREAK_SYSTEM_PACKAGES=1 CUDA_CACHE_PATH=/cache/nv-jit HF_HUB_DISABLE_TELEMETRY=1
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "90";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --upgrade pip && pip install "ctranslate2==4.8.2" "faster-whisper==1.2.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0"
WORKDIR /app
COPY docker/asr/app.py ./app.py
RUN mkdir -p /models /cache/nv-jit
EXPOSE 8030
HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=10 CMD curl -fsS http://127.0.0.1:8030/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8030", "--workers", "1"]

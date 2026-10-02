# syntax=docker/dockerfile:1.7
# Voice services. One shared base (CUDA 12.8 runtime, Python 3.11 via uv, torch 2.8 cu128 — the line IndexTTS pins and
# the one with Blackwell kernels), two targets:
#   indextts : IndexTTS 2.5 (English, Arabic, Chinese, Japanese, Spanish; zero-shot cloning; emotion vectors)
#   habibi   : Habibi-TTS, Iraqi (IRQ) specialised model (F5-TTS architecture, Apache-2.0)
# Weights are fetched on first start into the shared models volume (resumable), never baked into the image.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 AS base
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 HF_HUB_DISABLE_XET=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "90";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | sh
ENV PATH=/root/.local/bin:$PATH
RUN uv python install 3.11
RUN mkdir -p /models /app

# ---------------------------------------------------------------------------------------------------- IndexTTS 2.5
FROM base AS indextts
ARG INDEXTTS_REF=v2.5.0
RUN git clone --depth 1 --branch ${INDEXTTS_REF} https://github.com/index-tts/index-tts.git /opt/index-tts
WORKDIR /opt/index-tts
# the project's own lock: torch 2.8.* from the cu128 index, python 3.11; no webui/deepspeed/accel extras
RUN uv sync --python 3.11 --no-dev \
 && uv pip install "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "huggingface_hub[cli]>=0.34" "pynvml==12.0.0" "soundfile>=0.12"
COPY docker/tts/app.py /opt/index-tts/vewbox_app.py
COPY docker/tts/entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh
ENV VEWBOX_ENGINE=indextts PORT=8020 MODEL_ROOT=/models/tts
EXPOSE 8020
HEALTHCHECK --interval=30s --timeout=10s --start-period=600s --retries=20 CMD curl -fsS http://127.0.0.1:8020/health || exit 1
ENTRYPOINT ["/opt/entrypoint.sh"]

# -------------------------------------------------------------------------------------------------------- Habibi IRQ
FROM base AS habibi
WORKDIR /opt/habibi
RUN uv venv --python 3.11 /opt/habibi/.venv \
 && uv pip install --python /opt/habibi/.venv/bin/python torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 \
 && uv pip install --python /opt/habibi/.venv/bin/python "habibi-tts==0.1.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "huggingface_hub[cli]>=0.34" "pynvml==12.0.0" "soundfile>=0.12"
COPY docker/tts/app.py /opt/habibi/vewbox_app.py
COPY docker/tts/entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh
ENV VEWBOX_ENGINE=habibi PORT=8021 MODEL_ROOT=/models/tts VIRTUAL_ENV=/opt/habibi/.venv PATH=/opt/habibi/.venv/bin:$PATH
EXPOSE 8021
HEALTHCHECK --interval=30s --timeout=10s --start-period=600s --retries=20 CMD curl -fsS http://127.0.0.1:8021/health || exit 1
ENTRYPOINT ["/opt/entrypoint.sh"]

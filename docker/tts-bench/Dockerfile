# syntax=docker/dockerfile:1.7
# Voice BENCH images (docs/research/VOICE-BENCH-2026-10.md): candidate cloning engines behind the studio's /synthesize
# contract, run beside — never instead of — the live tts / tts-habibi / tts-design services (compose profile `bench`).
#   voxcpm2 : no build — the existing vewbox/tts-design image already has voxcpm 2.0.3 (compose service tts-bench-voxcpm2)
#   dots    : dots.tts 0.3.1 (Apache-2.0) on the tts-design image (same torch 2.8.0+cu128 the project's constraints name)
#   moss    : MOSS-TTS v1.5 (Apache-2.0): python 3.12, torch 2.9.1+cu128, transformers 5.0.0 (the project's pins)
# Weights come from the models volume (manifest groups eval-voice-dots / eval-voice-moss); nothing is downloaded at run
# time (HF_HUB_OFFLINE=1). Builds trust the optional extra root certificate (compose secret extra_ca, see docker/asr).

# ------------------------------------------------------------------------------------------------------------- dots
ARG DESIGN_IMAGE=vewbox/tts-design:dev
FROM ${DESIGN_IMAGE} AS dots
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_NO_CACHE=1
# dots.tts without its demo extras (gradio): the runtime imports librosa, torch, huggingface_hub, loguru, langcodes,
# lingua, torchdiffeq and WeTextProcessing (`tn`, imported at module level even with normalize_text=False). transformers
# stays at the venv's 4.57.6 (dots asks >= 4.57.0). The last line fails the build if torch moved off cu128.
RUN uv pip install --python /opt/habibi/.venv/bin/python --no-deps "dots.tts==0.3.1" \
 && uv pip install --python /opt/habibi/.venv/bin/python "loguru==0.7.3" "langcodes[data]==3.5.0" "torchdiffeq==0.2.5" "lingua-language-detector==2.1.1" "WeTextProcessing==1.0.4.1" \
 && /opt/habibi/.venv/bin/python -c "import torch, transformers, dots_tts.runtime; assert torch.__version__ == '2.8.0+cu128', torch.__version__; print('torch', torch.__version__, 'transformers', transformers.__version__)"
WORKDIR /opt/bench
COPY docker/tts/app.py /opt/bench/vewbox_tts_shared.py
COPY docker/tts-bench/app.py /opt/bench/vewbox_bench_app.py
ENV BENCH_ENGINE=dots MODEL_ROOT=/models HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1 PYTHONUNBUFFERED=1
EXPOSE 8041
ENTRYPOINT []
CMD ["/opt/habibi/.venv/bin/python", "-m", "uvicorn", "vewbox_bench_app:app", "--host", "0.0.0.0", "--port", "8041", "--workers", "1"]

# ------------------------------------------------------------------------------------------------------------- moss
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 AS moss
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_NO_CACHE=1
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | sh
ENV PATH=/root/.local/bin:$PATH
RUN uv python install 3.12 && uv venv --python 3.12 /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:/root/.local/bin:$PATH
# MOSS-TTS's own torch-runtime pins (pyproject @934d682, 2026-09-06) + the modelling code's imports; no gradio, no flash-attn
RUN uv pip install --python /opt/venv/bin/python "torch==2.9.1" "torchaudio==2.9.1" --index-url https://download.pytorch.org/whl/cu128 \
 && uv pip install --python /opt/venv/bin/python "torchcodec==0.8.1" "transformers==5.0.0" "accelerate==1.10.1" "safetensors==0.6.2" "numpy==2.1.0" "orjson==3.11.4" "tqdm==4.67.1" "PyYAML==6.0.3" "einops==0.8.1" "scipy==1.16.2" "librosa==0.11.0" "tiktoken==0.12.0" "soundfile==0.13.1" \
    "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0" \
 && python -c "import torch, transformers; assert torch.__version__.startswith('2.9.1'), torch.__version__; print('torch', torch.__version__, 'transformers', transformers.__version__)"
WORKDIR /opt/bench
COPY docker/tts/app.py /opt/bench/vewbox_tts_shared.py
COPY docker/tts-bench/app.py /opt/bench/vewbox_bench_app.py
ENV BENCH_ENGINE=moss MODEL_ROOT=/models HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONUNBUFFERED=1
EXPOSE 8042
CMD ["python", "-m", "uvicorn", "vewbox_bench_app:app", "--host", "0.0.0.0", "--port", "8042", "--workers", "1"]

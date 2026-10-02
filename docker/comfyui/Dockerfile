# syntax=docker/dockerfile:1.7
# ComfyUI as the local generation engine: images (Qwen-Image / Qwen-Image-Edit), local MiniMax H3 video, ACE-Step and
# MiniMax Music 3. Pinned ComfyUI tag, PyTorch cu130 wheels for Blackwell (sm_120), no custom video nodes.
# Weights are NOT baked in: they live in the shared models volume (see docker/models).
FROM nvidia/cuda:13.0.1-cudnn-runtime-ubuntu24.04
ARG COMFYUI_REF=v0.38.1
ARG TORCH_VERSION=2.13.0
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PIP_BREAK_SYSTEM_PACKAGES=1 \
    HF_HUB_DISABLE_TELEMETRY=1 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# apt over a slow/shared link: retry and wait rather than fail
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "90";\nAcquire::https::Timeout "90";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git ffmpeg libgl1 libglib2.0-0 curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --upgrade pip wheel setuptools \
 && pip install torch==${TORCH_VERSION} torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
WORKDIR /opt
RUN git clone --depth 1 --branch ${COMFYUI_REF} https://github.com/Comfy-Org/ComfyUI.git comfyui \
 && cd comfyui && pip install -r requirements.txt && pip install pynvml==12.0.0
# the extra_model_paths file points ComfyUI at /models (the shared volume) in addition to its own models/ tree
COPY docker/comfyui/extra_model_paths.yaml /opt/comfyui/extra_model_paths.yaml
COPY docker/comfyui/entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh && mkdir -p /models /opt/comfyui/output /opt/comfyui/input /opt/comfyui/temp
EXPOSE 8188
HEALTHCHECK --interval=20s --timeout=10s --start-period=120s --retries=10 CMD curl -fsS http://127.0.0.1:8188/system_stats || exit 1
ENTRYPOINT ["/opt/entrypoint.sh"]

# syntax=docker/dockerfile:1.7
# Voice design + speaker embeddings (compose service tts-design, :8022):
#   VoxCPM2 (OpenBMB, 2 B, Apache-2.0)          a synthetic voice from a text description, 48 kHz (GPU, ~8 GB)
#   ECAPA-TDNN (speechbrain/spkrec-ecapa-voxceleb, Apache-2.0)   192-d speaker embeddings, cosine similarity (CPU)
#
# Built FROM the Habibi voice image, which already holds the CUDA 12.8 runtime, ffmpeg, Python 3.11 (uv) and a venv with
# torch 2.8.0+cu128 / torchaudio / librosa / einops / safetensors / pydantic / FastAPI. So this build downloads only the
# small packages below (~60 MB) instead of a second 3.5 GB torch stack. On a fresh machine build tts-habibi first
# (`docker compose build tts-habibi`). The running tts-habibi container is not touched: this is a new image whose extra
# layer changes its own copy of the venv only.
# Weights are not fetched here nor at start: the models fetcher puts them in the shared volume (group voice-design).
ARG BASE_IMAGE=vewbox/tts-habibi:dev
FROM ${BASE_IMAGE}
ENV VIRTUAL_ENV=/opt/habibi/.venv PATH=/opt/habibi/.venv/bin:$PATH
# voxcpm 2.0.3 without its demo/training extras (gradio, funasr, modelscope, datasets, matplotlib, spaces, argbind,
# wetext, torchcodec): inference imports only torch/torchaudio, transformers, einops, pydantic, safetensors, librosa,
# tqdm and huggingface_hub, all in the venv. transformers is pinned to 4.57 (the venv carries 5.x for f5-tts): VoxCPM2
# loads its tokenizer with LlamaTokenizerFast from tokenizer.json, the 4.x behaviour it was released against.
# The last line fails the build if anything moved torch off the cu128 wheel.
RUN uv pip install --python /opt/habibi/.venv/bin/python --no-deps "voxcpm==2.0.3" \
 && uv pip install --python /opt/habibi/.venv/bin/python "transformers==4.57.6" "speechbrain==1.1.1" \
 && /opt/habibi/.venv/bin/python -c "import torch, transformers, speechbrain, voxcpm; assert torch.__version__ == '2.8.0+cu128', torch.__version__; print('torch', torch.__version__, '| transformers', transformers.__version__, '| speechbrain', speechbrain.__version__)"
WORKDIR /opt/voxcpm
# the shared limiter/meter/seeding (the line engines' app) and this service; compose bind-mounts both from the repo
COPY docker/tts/app.py /opt/voxcpm/vewbox_tts_shared.py
COPY docker/tts-design/app.py /opt/voxcpm/vewbox_design_app.py
# HF_HUB_OFFLINE: nothing is ever downloaded at run time; TQDM_DISABLE: VoxCPM2 draws a progress bar per decoding step
ENV VEWBOX_ENGINE=voxcpm2 PORT=8022 MODEL_ROOT=/models HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1 PYTHONUNBUFFERED=1
EXPOSE 8022
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=10 CMD curl -fsS http://127.0.0.1:8022/health || exit 1
ENTRYPOINT []
CMD ["/opt/habibi/.venv/bin/python", "-m", "uvicorn", "vewbox_design_app:app", "--host", "0.0.0.0", "--port", "8022", "--workers", "1"]

# syntax=docker/dockerfile:1.7
# VEWBOX-IQ — Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT; docs/research/iraqi-voice-production.md) behind the
# studio's /synthesize contract, with the Vewbox-IQ adaptation when IQ_ADAPTER_DIR names a checkpoint (docs/VEWBOX-IQ.md).
# Built from the pinned official repository (resemble-ai/chatterbox @ CHATTERBOX_COMMIT = 65b18437, the commit tagged
# "v3 multilingual and single language pack release", 2026-06-10 — the same day as the weights revision 5bb1f6ee the
# manifest pins; the later master commits were not reviewed) with upstream's own pyproject pins (transformers 5.2.0,
# diffusers 0.29.0, librosa 0.11.0, safetensors 0.5.3, conformer 0.3.2 …) read from the checkout at build time — with
# three documented deviations: torch/torchaudio 2.8.0 cu128 instead of the pyproject's torch 2.6.0 (no sm_120 kernels;
# the CUDA line of the FireRed service), resemble-perth pinned to the PyPI release 1.0.1 instead of a moving git master
# (the official V3 Space pins the same), and gradio dropped (the demo UI, not the library). s3tokenizer is unpinned
# upstream: pinned here to 0.3.0. Weights are never baked in: they come read-only from the models volume (manifest group
# voice-chatterbox-mtl-v3). Builds trust the optional extra root certificate (compose secret extra_ca, see docker/asr).
# Runs as a non-root user. Nothing is downloaded at run time (HF_HUB_OFFLINE=1).
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 \
 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_CACHE_DIR=/root/.cache/uv
# this link stalls mid-file: wait a stall out, retry a dropped wheel, two at a time (docker/sfx)
ENV UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=10 UV_CONCURRENT_DOWNLOADS=2
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN uv python install 3.12 && uv venv --python 3.12 /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH
ARG CHATTERBOX_COMMIT=65b18437192794391a0308a8f705b1e33e633948
RUN git init -q /opt/chatterbox && cd /opt/chatterbox \
 && git remote add origin https://github.com/resemble-ai/chatterbox.git \
 && git fetch -q --depth 1 origin ${CHATTERBOX_COMMIT} && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${CHATTERBOX_COMMIT}"
WORKDIR /opt/iq
# 1. torch cu128 first (sm_120). 2. upstream's dependency list from the checkout's pyproject (its own pins, markers kept)
# minus torch/torchaudio (installed), resemble-perth (git master → PyPI 1.0.1) and gradio (demo only). 3. the library
# itself without dependency resolution (so the torch pin is never "corrected" back to 2.6.0). 4. the service's own small
# stack. The import check fails the build if a module needs something that is not installed or torch moved. The wheel
# cache is a BuildKit cache mount: a build stopped mid-way on this ~1 MB/s link resumes with every wheel already fetched.
COPY docker/tts-iq/requirements-from-pyproject.py /opt/iq/requirements-from-pyproject.py
RUN --mount=type=cache,id=uv-tts-iq,target=/root/.cache/uv \
    uv pip install --python /opt/venv/bin/python "torch==2.8.0" "torchaudio==2.8.0" --index-url https://download.pytorch.org/whl/cu128 \
 && python /opt/iq/requirements-from-pyproject.py /opt/chatterbox/pyproject.toml > /tmp/chatterbox-requirements.txt \
 && cat /tmp/chatterbox-requirements.txt \
 && uv pip install --python /opt/venv/bin/python -r /tmp/chatterbox-requirements.txt "resemble-perth==1.0.1" "s3tokenizer==0.3.0" \
 && uv pip install --python /opt/venv/bin/python --no-deps /opt/chatterbox \
 && uv pip install --python /opt/venv/bin/python "numpy<3" "soundfile==0.13.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0" \
 && python -c "import torch, torchaudio, transformers, perth, s3tokenizer, chatterbox.mtl_tts as m, inspect; assert torch.__version__.startswith('2.8.0'), torch.__version__; assert 't3_model' in inspect.signature(m.ChatterboxMultilingualTTS.from_local).parameters, 'from_local has no t3_model'; print('torch', torch.__version__, 'cuda', torch.version.cuda, 'transformers', transformers.__version__, 's3tokenizer', getattr(s3tokenizer, '__version__', '?'))"
COPY docker/tts/app.py /opt/iq/vewbox_tts_shared.py
COPY docker/tts-iq/iq_model.py /opt/iq/iq_model.py
COPY docker/tts-iq/app.py /opt/iq/vewbox_iq_app.py
RUN useradd -m -u 1000 -s /usr/sbin/nologin iq 2>/dev/null || useradd -m -u 1001 -s /usr/sbin/nologin iq; chown -R iq /opt/iq
USER iq
ENV MODEL_ROOT=/models CHATTERBOX_COMMIT=${CHATTERBOX_COMMIT} IQ_S3GEN=s3gen.pt IQ_ADAPTER_DIR= HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1
EXPOSE 8027
CMD ["python", "-m", "uvicorn", "vewbox_iq_app:app", "--host", "0.0.0.0", "--port", "8027", "--workers", "1"]

# syntax=docker/dockerfile:1.7
# FIREREDTTS3-BASE — EVALUATION ONLY (Apache-2.0 LICENSE; the README's "cloning intended for academic research" disclaimer
# noted; docs/research/FIREREDTTS3-INTEGRATION-2026-10.md). Built from the pinned official repository
# (FireRedTeam/FireRedTTS3 @ FIRERED_COMMIT; no setup.py upstream, so it is put on the path as a source tree) with
# upstream's requirements pins — torch 2.8.0 / torchaudio 2.8.0 / torchcodec 0.7.0 on cu128 (the CUDA line of the other
# services; sm_120), transformers 5.6.2, einops 0.8.2 — minus flash-attn (no sm_120 wheel; the app switches the Qwen3
# modules to PyTorch SDPA) and minus the optional text front-ends (wetext, fasttext, faster-whisper: they fetch models
# or need a compiler, and the studio prepares its own text). Weights are never baked in: they come read-only from the
# models volume (manifest group eval-tts-fireredtts3-base). Builds trust the optional extra root certificate (compose
# secret extra_ca, see docker/asr). Runs as a non-root user. Nothing is downloaded at run time (HF_HUB_OFFLINE=1).
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
ARG FIRERED_COMMIT=7a1f3a7282ff184cc1c7f070556baaf5f08b5216
RUN git init -q /opt/fireredtts3 && cd /opt/fireredtts3 \
 && git remote add origin https://github.com/FireRedTeam/FireRedTTS3.git \
 && git fetch -q --depth 1 origin ${FIRERED_COMMIT} && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${FIRERED_COMMIT}" \
 && rm -f /opt/fireredtts3/.env.example
WORKDIR /opt/fireredtts3
# upstream's pins (requirements.txt @ FIRERED_COMMIT) without flash-attn and the optional front-ends; then the service's
# own small stack; the import check fails the build if a module needs something that is not installed or torch moved.
# The wheel cache is a BuildKit cache mount: on this ~1 MB/s link a build stopped or dropped mid-way (2026-10-09, the
# producer's strictly serial network queue) resumes with every wheel already fetched instead of the 3 GB again
RUN --mount=type=cache,id=uv-tts-firered,target=/root/.cache/uv \
    uv pip install --python /opt/venv/bin/python "torch==2.8.0" "torchaudio==2.8.0" "torchcodec==0.7.0" --index-url https://download.pytorch.org/whl/cu128 \
 && uv pip install --python /opt/venv/bin/python "transformers==5.6.2" "einops==0.8.2" "regex==2026.4.4" "python-dotenv==1.1.1" "numpy<3" "soundfile==0.13.1" \
    "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0" \
 && python -c "import sys; sys.path.insert(0, '/opt/fireredtts3'); import torch, torchaudio, transformers, einops, fireredtts3.core; assert torch.__version__.startswith('2.8.0'), torch.__version__; print('torch', torch.__version__, 'cuda', torch.version.cuda, 'transformers', transformers.__version__)"
COPY docker/tts/app.py /opt/fireredtts3/vewbox_tts_shared.py
COPY docker/tts-firered/app.py /opt/fireredtts3/vewbox_firered_app.py
RUN useradd -m -u 1000 -s /usr/sbin/nologin firered 2>/dev/null || useradd -m -u 1001 -s /usr/sbin/nologin firered; chown -R firered /opt/fireredtts3
USER firered
ENV MODEL_ROOT=/models FIRERED_ROOT=/opt/fireredtts3 FIRERED_COMMIT=${FIRERED_COMMIT} FIRERED_ATTN=sdpa HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1
EXPOSE 8026
CMD ["python", "-m", "uvicorn", "vewbox_firered_app:app", "--host", "0.0.0.0", "--port", "8026", "--workers", "1"]

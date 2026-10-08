# syntax=docker/dockerfile:1.7
# FISH AUDIO S2 PRO — EVALUATION ONLY, NOT COMMERCIAL-SAFE (Fish Audio Research License). Built from the pinned official
# repository (fishaudio/fish-speech @ FISH_COMMIT) the way its own docker/Dockerfile builds the server: its system
# packages, Python 3.12, `uv sync --frozen` on its lock with the CUDA extra (cu128: the CUDA line the other services
# use; the lock pins torch 2.8.0 for every extra). Weights are never baked in: they come read-only from the models
# volume (manifest group eval-tts-fish-s2-pro). Builds trust the optional extra root certificate (compose secret
# extra_ca, see docker/asr). Runs as a non-root user.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 libsox-dev build-essential cmake libasound-dev portaudio19-dev libportaudio2 libportaudiocpp0 \
 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_NO_CACHE=1
# this link stalls mid-file: wait a stall out, retry a dropped wheel, two at a time (docker/sfx)
ENV UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=10 UV_CONCURRENT_DOWNLOADS=2
RUN curl -LsSf https://astral.sh/uv/0.8.15/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
ARG FISH_COMMIT=214da3cd841bda85da2496b96cd3c4d7edb1337e
ARG UV_EXTRA=cu128
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN git init -q /opt/fish-speech && cd /opt/fish-speech \
 && git remote add origin https://github.com/fishaudio/fish-speech.git \
 && git fetch -q --depth 1 origin ${FISH_COMMIT} && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${FISH_COMMIT}"
WORKDIR /opt/fish-speech
# upstream's lock, upstream's extra; then the service's own small stack into the same venv; the last line fails the
# build if the lock's torch moved
RUN uv python install 3.12 && uv python pin 3.12 \
 && uv sync --extra ${UV_EXTRA} --frozen \
 && uv pip install --python /opt/fish-speech/.venv/bin/python "fastapi==0.118.0" "python-multipart==0.0.20" "pynvml==12.0.0" "soundfile>=0.12" \
 && /opt/fish-speech/.venv/bin/python -c "import torch, fish_speech; assert torch.__version__.startswith('2.8.0'), torch.__version__; print('torch', torch.__version__, 'cuda', torch.version.cuda)"
COPY docker/tts/app.py /opt/fish-speech/vewbox_tts_shared.py
COPY docker/tts-fish/app.py /opt/fish-speech/vewbox_fish_app.py
RUN useradd -m -u 1000 -s /usr/sbin/nologin fish 2>/dev/null || useradd -m -u 1001 -s /usr/sbin/nologin fish; chown -R fish /opt/fish-speech
USER fish
ENV VIRTUAL_ENV=/opt/fish-speech/.venv PATH=/opt/fish-speech/.venv/bin:$PATH MODEL_ROOT=/models FISH_COMMIT=${FISH_COMMIT} HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1
EXPOSE 8025
CMD ["python", "-m", "uvicorn", "vewbox_fish_app:app", "--host", "0.0.0.0", "--port", "8025", "--workers", "1"]

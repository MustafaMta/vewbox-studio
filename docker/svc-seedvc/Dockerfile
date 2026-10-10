# syntax=docker/dockerfile:1.7
# SINGING VOICE CONVERSION — Seed-VC v1 (Plachtaa/seed-vc, GPL-3.0; docs/research/SINGING-IDENTITY-2026-10.md) behind the
# studio's /convert contract (docker/svc-seedvc/app.py). An ISOLATED worker: this image holds GPL code and talks HTTP to the
# studio; nothing of the studio's own source is linked into it (licence hygiene — modifications live in this folder and
# would be published if the image were ever distributed). Built from the pinned repository head (SEEDVC_COMMIT = 51383efd,
# 2025-04-20, the last commit before the repository was archived) with these deviations from its requirements.txt:
# torch/torchaudio 2.8.0 cu128 (sm_120; the pin is a 2024 torch 2.4 nightly), gradio / FreeSimpleGUI / sounddevice /
# modelscope / funasr / resemblyzer / jiwer dropped (demo UI, realtime GUI and evaluation only), and torchcrepe (MIT, weights
# in the wheel) for pitch instead of the RMVPE weights the code fetches from lj1995/VoiceConversionWebUI, whose package
# notice says research use only. Weights are never baked in: the models volume (manifest group svc-seed-vc), read-only.
# Nothing is downloaded at run time (HF_HUB_OFFLINE=1). Runs as a non-root user.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 \
 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_CACHE_DIR=/root/.cache/uv
ENV UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=10 UV_CONCURRENT_DOWNLOADS=2
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN uv python install 3.12 && uv venv --python 3.12 /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH
ARG SEEDVC_COMMIT=51383efd921027683c89e5348211d93ff12ac2a8
RUN git init -q /opt/seed-vc && cd /opt/seed-vc \
 && git remote add origin https://github.com/Plachtaa/seed-vc.git \
 && git fetch -q --depth 1 origin ${SEEDVC_COMMIT} && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${SEEDVC_COMMIT}" \
 && test -f LICENSE && grep -q "GNU GENERAL PUBLIC LICENSE" LICENSE
WORKDIR /opt/seed-vc
# torch cu128 first (sm_120), then the repository's inference stack at its own pins (the demo/GUI/eval packages left out),
# torchcrepe for pitch, and the service's small stack. The import check fails the build if the model code needs something
# that is not installed. The wheel cache is the SAME BuildKit cache mount as docker/tts-iq (id uv-tts-iq, Python 3.12): the
# torch 2.8.0 cu128 wheels (≈ 2.5 GB) are already there, so this build fetches only the small packages over the slow link.
RUN --mount=type=cache,id=uv-tts-iq,target=/root/.cache/uv \
    uv pip install --python /opt/venv/bin/python "torch==2.8.0" "torchaudio==2.8.0" --index-url https://download.pytorch.org/whl/cu128 \
 && uv pip install --python /opt/venv/bin/python "transformers==4.46.3" "huggingface-hub>=0.28.1,<1" "librosa==0.10.2" "scipy==1.13.1" "numpy==1.26.4" "munch==4.0.0" "einops==0.8.0" "descript-audio-codec==1.0.0" "pydub==0.25.1" "hydra-core==1.3.2" "pyyaml" "python-dotenv" "accelerate" \
 && uv pip install --python /opt/venv/bin/python "torchcrepe==0.0.24" "soundfile==0.13.1" "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0" \
 && python -c "import torch, torchaudio, transformers, torchcrepe, librosa; assert torch.__version__.startswith('2.8.0'), torch.__version__; from modules.commons import build_model, load_checkpoint, recursive_munch; from modules.campplus.DTDNN import CAMPPlus; from modules.bigvgan import bigvgan; from modules.audio import mel_spectrogram; print('torch', torch.__version__, 'cuda', torch.version.cuda, 'transformers', transformers.__version__, 'torchcrepe ok')"
COPY docker/tts/app.py /opt/seed-vc/vewbox_tts_shared.py
COPY docker/svc-seedvc/app.py /opt/seed-vc/vewbox_svc_app.py
RUN useradd -m -u 1000 -s /usr/sbin/nologin svc 2>/dev/null || useradd -m -u 1001 -s /usr/sbin/nologin svc; chown -R svc /opt/seed-vc
USER svc
ENV MODEL_ROOT=/models SEEDVC_COMMIT=${SEEDVC_COMMIT} HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1
EXPOSE 8028
CMD ["python", "-m", "uvicorn", "vewbox_svc_app:app", "--host", "0.0.0.0", "--port", "8028", "--workers", "1"]

# syntax=docker/dockerfile:1.7
# MOSS-SoundEffect v2.0 (docker/sfx/app.py): its own image, because upstream asks for an isolated Python 3.12
# environment with its own pins (moss_soundeffect_v2/pyproject.toml @4cf2dab: torch 2.9.0+cu128, transformers 4.57.1,
# diffusers 0.37.1, descript-audiotools 0.7.2), which differ from MOSS-TTS v1.5's (transformers 5.0.0). The package is
# installed from the pinned upstream commit without its demo (gradio) and fine-tuning extras. Weights come from the
# models volume; nothing is downloaded at run time (HF_HUB_OFFLINE=1). Builds trust the optional extra root
# certificate (compose secret extra_ca, see docker/asr).
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries \
 && for i in 1 2 3 4 5 6; do apt-get update && apt-cache policy curl | grep -q Candidate && break; echo "apt index incomplete, retry $i"; sleep 20; done \
 && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_NO_CACHE=1
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | sh
ENV PATH=/root/.local/bin:$PATH
RUN uv python install 3.12 && uv venv --python 3.12 /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:/root/.local/bin:$PATH
ARG MOSS_COMMIT=4cf2dab88fc8711aef93089b3b75c0ae07373e47
# upstream's runtime pins (no gradio, no fine-tuning extras) + the service; the last line fails the build if torch moved
RUN uv pip install --python /opt/venv/bin/python "torch==2.9.0" "torchaudio==2.9.0" --index-url https://download.pytorch.org/whl/cu128 \
 && uv pip install --python /opt/venv/bin/python "numpy==1.26.4" "einops==0.8.2" "pillow==12.2.0" "tqdm==4.67.3" "safetensors==0.7.0" "transformers==4.57.1" "diffusers==0.37.1" \
    "ftfy==6.3.1" "regex==2026.4.4" "soundfile==0.13.1" "imageio==2.37.3" "typing-extensions>=4.10" "descript-audiotools==0.7.2" \
    "fastapi==0.118.0" "uvicorn[standard]==0.37.0" "python-multipart==0.0.20" "pynvml==12.0.0" \
 && uv pip install --python /opt/venv/bin/python --no-deps "moss-soundeffect-v2 @ git+https://github.com/OpenMOSS/MOSS-TTS.git@${MOSS_COMMIT}#subdirectory=moss_soundeffect_v2" \
 && python -c "import torch, transformers, diffusers, moss_soundeffect_v2; assert torch.__version__.startswith('2.9.0'), torch.__version__; print('torch', torch.__version__, 'transformers', transformers.__version__, 'diffusers', diffusers.__version__)"
WORKDIR /opt/sfx
COPY docker/tts/app.py /opt/sfx/vewbox_tts_shared.py
COPY docker/sfx/app.py /opt/sfx/vewbox_sfx_app.py
# eager by default: the lease unloads the model whenever another family takes the card, and torch.compile's
# minutes-long first call would repeat after every reload (TORCHDYNAMO_DISABLE=0 in compose turns it on)
ENV MODEL_ROOT=/models HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TQDM_DISABLE=1 TORCHDYNAMO_DISABLE=1
EXPOSE 8024
CMD ["python", "-m", "uvicorn", "vewbox_sfx_app:app", "--host", "0.0.0.0", "--port", "8024", "--workers", "1"]

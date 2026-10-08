# syntax=docker/dockerfile:1.7
# SoulX-Singer SVC — an ISOLATED EVALUATION container (Phase 3 singer identity; NOT production-approved). Zero-shot
# singing voice conversion: a sung vocal re-voiced by a reference voice. Upstream: Soul-AILab/SoulX-Singer at a pinned
# commit (Apache-2.0 code and weights; training-data provenance open for the producer's legal review). Its weights are
# .pt pickles, loaded only here. Upstream pins torch 2.2 (no RTX 5090 kernels): this image uses torch 2.7.1+cu128 and
# keeps transformers 4.41.2 (its Llama decoder layer breaks on newer transformers). Without the demo UI and the
# separation/transcription stacks (SVC does not use them). Weights from the models volume; offline at run time.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 UV_LINK_MODE=copy
RUN printf 'Acquire::Retries "10";\nAcquire::http::Timeout "300";\nAcquire::https::Timeout "300";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1 build-essential && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt UV_NATIVE_TLS=1 UV_NO_CACHE=1
# the slow link (see docker/sfx): wait a stall out, retry a dropped wheel
ENV UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=10 UV_CONCURRENT_DOWNLOADS=2
RUN curl -LsSf https://astral.sh/uv/0.9.5/install.sh | sh
ENV PATH=/root/.local/bin:$PATH
RUN uv python install 3.11 && uv venv --python 3.11 /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:/root/.local/bin:$PATH
ARG SOULX_COMMIT=81aeb3ae772c70093c3de74dc23c92d983801ae4
RUN git clone https://github.com/Soul-AILab/SoulX-Singer.git /opt/soulx && cd /opt/soulx && git checkout ${SOULX_COMMIT}
RUN uv pip install --python /opt/venv/bin/python "torch==2.7.1" "torchaudio==2.7.1" --index-url https://download.pytorch.org/whl/cu128 \
 && grep -v -E '^(torch|torchaudio|torchcodec|funasr|nemo_toolkit|sageattention|gradio|webrtcvad)([=<>~ ]|$)' /opt/soulx/requirements.txt > /tmp/req.txt \
 && uv pip install --python /opt/venv/bin/python -r /tmp/req.txt \
 && uv pip install --python /opt/venv/bin/python "transformers==4.41.2" "numpy<2" soundfile \
 && python -c "import torch, transformers; assert torch.__version__.startswith('2.7.1'), torch.__version__; assert transformers.__version__ == '4.41.2'; print('torch', torch.__version__, 'transformers', transformers.__version__)"
WORKDIR /opt/soulx
COPY docker/svc-eval/run_svc.py /opt/soulx/vewbox_run_svc.py
ENV PYTHONPATH=/opt/soulx HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HOME=/models/cache/hf MODEL_ROOT=/models
ENTRYPOINT ["python", "/opt/soulx/vewbox_run_svc.py"]

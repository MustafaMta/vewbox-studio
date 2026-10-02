# syntax=docker/dockerfile:1.7
# The model fetcher: downloads pinned weights into the shared models volume with resume, sha256 verification,
# free-space checks and a manifest record. Runs to completion and exits; rerunning is idempotent.
FROM python:3.12.8-slim-bookworm
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 HF_HUB_ENABLE_HF_TRANSFER=0
RUN pip install "huggingface_hub[hf_xet]==1.1.4" "requests==2.32.4"
WORKDIR /app
COPY docker/models/manifest.json docker/models/fetch.py ./
VOLUME ["/models"]
ENTRYPOINT ["python", "fetch.py"]
CMD ["--manifest", "manifest.json", "--root", "/models"]

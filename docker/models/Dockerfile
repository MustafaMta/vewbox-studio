# syntax=docker/dockerfile:1.7
# The model fetcher: downloads pinned weights into the shared models volume with resume, sha256 verification,
# free-space checks and a manifest record. Runs to completion and exits; rerunning is idempotent.
FROM python:3.12.8-slim-bookworm
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 HF_HUB_DISABLE_TELEMETRY=1 HF_HUB_ENABLE_HF_TRANSFER=0
# An extra root certificate for a network that inspects TLS (EXTRA_CA_FILE in .env; compose secret `extra_ca`, empty by
# default; see docker/asr/Dockerfile): joins the system store, which pip, requests and huggingface_hub then read.
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; fi
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt PIP_CERT=/etc/ssl/certs/ca-certificates.crt
RUN pip install "huggingface_hub[hf_xet]==1.1.4" "requests==2.32.4"
WORKDIR /app
COPY docker/models/manifest.json docker/models/fetch.py docker/models/layout.json ./
VOLUME ["/models"]
ENTRYPOINT ["python", "fetch.py"]
CMD ["--manifest", "manifest.json", "--root", "/models"]

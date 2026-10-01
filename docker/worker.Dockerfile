# syntax=docker/dockerfile:1.7
# The production worker: claims jobs from Postgres, talks to MiniMax, ComfyUI, the voice and transcription services,
# runs ffmpeg for assembly and export. Same source tree as the web server, started with tsx.
FROM node:22.20.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates fonts-noto-core fonts-noto-ui-core fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production SERVICE_NAME=worker LIBRARY_ROOT=/data/library PUBLIC_ROOT=/app/public
RUN groupadd -g 1001 studio && useradd -u 1001 -g studio -m studio && mkdir -p /data/library /data/tmp && chown -R studio:studio /data
COPY --from=deps --chown=studio:studio /app/node_modules ./node_modules
COPY --chown=studio:studio . .
ARG CODE_VERSION=dev
ENV CODE_VERSION=$CODE_VERSION
USER studio
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD test -f /tmp/worker.alive && find /tmp/worker.alive -mmin -2 | grep -q . || exit 1
CMD ["node_modules/.bin/tsx", "src/worker/index.ts"]

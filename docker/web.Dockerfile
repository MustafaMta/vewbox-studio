# syntax=docker/dockerfile:1.7
# The studio's web server: Next.js (pages, JSON API, media streaming, event stream). ffmpeg/ffprobe are needed
# for upload validation. Built as a standalone bundle; migrations run on boot.
FROM node:22.20.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
ARG CODE_VERSION=dev
ENV CODE_VERSION=$CODE_VERSION
# the build needs no database; the API routes are dynamic
RUN DATABASE_URL=postgres://build:build@localhost:5432/build pnpm build

FROM node:22.20.0-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4200 HOSTNAME=0.0.0.0 LIBRARY_ROOT=/data/library PUBLIC_ROOT=/app/public
RUN groupadd -g 1001 studio && useradd -u 1001 -g studio -m studio && mkdir -p /data/library && chown -R studio:studio /data
COPY --from=build --chown=studio:studio /app/.next/standalone ./
COPY --from=build --chown=studio:studio /app/.next/static ./.next/static
COPY --from=build --chown=studio:studio /app/public ./public
COPY --from=build --chown=studio:studio /app/drizzle ./drizzle
USER studio
EXPOSE 4200
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD curl -fsS http://127.0.0.1:4200/api/health || exit 1
CMD ["node", "server.js"]

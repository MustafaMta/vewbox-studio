# Model evaluation, October 2026: running log

AI Research Director, 2026-10-05. The controlled tests of `MODEL-STACK-2026-10.md` §5, run on the RTX 5090 (32 GB)
with the studio's own graph builders, straight against the services (ComfyUI :8188, Ollama :11434, TTS :8020/:8021,
ASR :8030). Job intake stayed paused the whole time (`studio_meta.paused_at` 2026-10-03 11:39, "Redesign phase");
the worker never ran; nothing was written to the `vewbox` database or the media library. Evidence files:
`docs/evidence/model-eval-2026-10/`; originals under `var/model-eval/` (gitignored).

Conventions: numbers are measured here unless marked [E]. "First attempt" = the first picture/clip for an input and
seed, judged by eye at full size; a failed attempt is recorded with its cause and never regenerated.

## 1. Services, one at a time

Host RAM seen by Docker: `MemTotal 49,059,472 kB` (46.8 GiB); no `%UserProfile%\.wslconfig` (unchanged, open item).

| Service | Started | Idle VRAM (nvidia-smi) | Container RAM (docker stats) | Health |
|---|---|---|---|---|
| comfyui | 01:35 | 496 MiB | 1.13 GiB | `/system_stats`: ComfyUI 0.38.1, torch 2.13.0+cu130, templates 0.11.73; vram_free 32.4 GB |

- `docker run --rm --entrypoint sh vewbox/comfyui:dev -c "command -v gcc"` → `/usr/bin/gcc`, Triton 3.7.1 (the image
  is the rebuilt one; no recreate needed, `docker compose up -d comfyui` only started the existing container).
- `node scripts/check-comfy-nodes.mjs` with `TEMPLATES_JSON` exported from the registry under tsx (15 templates,
  including `minimax-h3.ref2va-continuation`): **every class and input present, every pinned model visible**,
  every literal value of every template inside its range/option list.
- ComfyUI 0.38.1 also exposes `TextEncodeQwenImage21` (up to 16 reference images) and `QwenImage21Cache`: the
  licence-gated Qwen-Image-2.1 evaluation arm is technically runnable on this install (weights not on the volume).

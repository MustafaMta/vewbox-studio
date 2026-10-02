# Final report — Vewbox Studio on the RTX 5090 machine

Status as of 2026-10-02, early morning. This report is kept current with `IMPLEMENTATION-CHECKLIST.md`, which holds the
evidence row by row; nothing below is marked done unless it was exercised on this machine.

## 1. Completed

- **Backend from zero**: Postgres 17 as the authoritative studio; a command engine whose pure reducers run in the
  browser (optimistic) and on the server (authoritative) with deterministic ids and a state hash; LISTEN/NOTIFY →
  SSE change feed; a media library with sniffing, ffprobe and full-decode validation, Range streaming; durable jobs
  (leases, heartbeats, bounded retries with backoff, cancellation, stale-lease recovery, idempotency keys).
- **Story engine** on three providers (MiniMax M3, Anthropic, any OpenAI-compatible server; the bundled Ollama
  qwen3:14b runs on the GPU with no key): Auto Idea proposals, Manual Brief development (characters with full designs,
  places, scene breakdown), script writing in Iraqi dialect with an English gloss, shot planning with versioned
  continuity state, a performance plan for music videos. Strict schemas with tolerant parsing and a repair loop.
- **MiniMax video stack**: one request shape, two backends — the hosted MiniMax H3 API (`/v2/video_generation`,
  first/last frame or reference images + reference audio, task id persisted for restart-safe polling, cancellation
  forwarded to MiniMax) and the open-weights MiniMax H3 in ComfyUI on the 5090 (FL2VA and Ref2VA workflows, every
  node and input verified against the running ComfyUI v0.38.1). No other video model exists in the tree.
- **Images**: Qwen-Image-2512 and Qwen-Image-Edit-2511 workflows (character sheets, location plates, storyboard
  frames) in ComfyUI, node-verified.
- **Audio**: audio service with faster-whisper large-v3 (weights present) and Demucs stem separation (verified on the
  GPU); IndexTTS 2.5 and Habibi-TTS IRQ services (images building at the time of writing); voice identity per
  character; transcript check with word error rate; song generation (MiniMax Music API, ACE-Step 1.5, MiniMax Music 3)
  with stems as derived assets; music-video shots that know their song window, their performers and the lines they
  sing, with the real song segment passed as reference audio.
- **Assembly and export** with ffmpeg: conform, concat, dialogue/song mix, EBU R128 normalisation, H.264/H.265/ProRes,
  720/1080/2160, Arabic + English subtitles burned in (libass, verified visually) and as SRT/VTT sidecars; take QA
  (ten named checks) on every generated clip.
- **Interface**: the Screening Room design kept and extended — Activity page, live job buttons with cancel/retry,
  provenance on takes, upload-a-clip takes, Settings → Engines / Models / Reliability, honest copy everywhere, fonts
  self-hosted, RTL and phone layouts tested.
- **Operations**: Docker Compose with pinned images, GPU reservations, healthchecks, rotated JSON logs, loopback-only
  ports, `init`, migrations on boot, model registry and workflow versions in the database, HTTP Basic access gate,
  a resumable sha256-verified model fetcher, a ComfyUI node-check script.
- **Tests**: unit 42, API 22 (dev server and production container), worker 13 (queue, MiniMax client against the
  real endpoint, media toolchain), Playwright 54 through the real interface — all green at the time of writing.

## 2. Architecture

See `ARCHITECTURE.md`. In short: Next.js 16 web (pages + `/api`), a Node worker, Postgres, ComfyUI, two voice
services, an audio service, Ollama; the browser never talks to an engine directly; the database is the truth; every
generated file carries its provenance.

## 3. MiniMax video stack

| Aspect | Hosted API | Local open weights |
|---|---|---|
| Model | `MiniMax-H3` (768P default) | `minimax_h3_fl2va_pruned_int8_convrot` / `…ref2va…`, nvfp4 text encoder, int8 video VAE, fp32 audio VAE, turbo LoRAs |
| Conditioning | first/last frame, or ≤9 reference images + ≤3 reference audio | same (ComfyUI nodes `MiniMaxH3ImageToVideo`, `MiniMaxH3ReferenceToVideo`) |
| Audio | native, with `<d>[Arabic] …</d>` dialogue tags | native (VAEDecodeAudio) |
| Lifecycle | create → poll → download; task id stored at creation; cancel forwarded | ComfyUI queue; interrupt on cancel |
| Status | **blocked**: no API key on this machine (client verified against the real endpoint with a wrong key) | weights downloading (text encoder, VAEs, LoRA present; DiT in flight) |

## 4. Local RTX 5090 stack

ComfyUI v0.38.1 / torch 2.13.0+cu130 sees the card (32 607 MB). Audio service on CUDA 12.8 (Whisper fp16, Demucs
htdemucs, 2.3 GB). Ollama qwen3:14b (~10 GB, unloads after 2 min). Voice services on torch 2.8 cu128 (building).
The worker holds one model family on the card at a time and records waits/holds as metrics.

## 5. Hosted dependencies

MiniMax (video, optionally text/speech/music) — requires `MINIMAX_API_KEY`. Anthropic (optional story engine).
Nothing else; the studio makes no other outbound call (fonts and all engines are local).

## 6. Docker services

db, web, worker, comfyui, tts, tts-habibi, asr, llm, models (profile). Six were running healthy together at the time
of writing (db, llm, comfyui, asr, web, worker); tts/tts-habibi images were still building on the ~5 MB/s link.

## 7. UI test results

Playwright: 54/54 (desktop + phone + RTL), including two proposals written by the real story engine. Manual browser
checks of Settings (engines, models, reliability) and Final Cut (cut player, export list, measured loudness).
See `TEST-RESULTS.md`.

## 8. Acceptance productions

| Stage | Status | Evidence |
|---|---|---|
| Story: one-line brief → developed story → script → shots | done | "The Last Bus to Karrada" (AR Iraqi, cartoon): new character + place, 2 scenes, 7 shots with continuity |
| Auto Idea → project | done | "The Forgotten Observatory" (local model, 5 scenes, 11 shots); E2E creates two more per run |
| Assembly/export on real clips | done (CPU path) | S1E1 with uploaded clips: 10.5 s cut, 1080p export with burned-in AR+EN subtitles, sidecars, −23 LUFS |
| Stage 1 — a MiniMax H3 take generated locally | **done** | S1E1 shot 1.3 from the shot editor: 1344×768, 3.75 s, native audio; ComfyUI 87.7 s (8 steps × 7.0 s), 94.6 s end to end; QA 8/8; the spoken Iraqi line transcribed back as «البيت ما بيه تشاي.» (scripted «البيت ما بي چاي») |
| Stage 4 (prompt-only continuity) — a whole episode's shots generated and cut | **done** | "Produce every shot" on S1E1: 7/7 takes, 0 failures, QA 7/7, 10.4 min for the batch; assembled 31.25 s 1080p cut (−22.7 LUFS); exported with burned AR+EN subtitles; contact sheet in `docs/evidence/` |
| Stage 5 (without drawn frames) — a short from a one-line brief, entirely through the UI | **done** | "The Last Bus to Karrada": brief → story (18 s) → script (14 s) → 11 shots (78 s) → 11/11 takes (25 min) → auto-assembled 64 s cut → export; prompt-only conditioning lets a character's look drift between shots (recorded with a contact sheet), which is what Stage 2's character sheets and frames address |
| Stage 2 — character sheets + location plates, then frame-conditioned takes | **done** | "The Kite Mender of Adhamiya" (AR Iraqi, cartoon): Samir and Amina portraits + 5-view sheets, 4 rooftop plates (redrawn unoccupied), script 22 s, 10 shots, 10/10 opening frames from plate + portraits (9–15 s each), 10/10 H3 takes starting on their frames (engine p50 132 s), auto-assembled 53 s cut, 1080p export with AR+EN cues; the same two characters and the same rooftop hold across every shot (`docs/evidence/kite-*.png`), unlike the prompt-only Karrada run |
| Stage 3 — voices: build, preview, dialogue with transcript checks (EN, AR, Iraqi) | **done** | IndexTTS 2.5 and Habibi-TTS IRQ services; Hana (EN) voice built and previewed from the Voice tab, both lines read back by Whisper with WER 0; MSA line identical; Kite Mender dialogue: 8 Iraqi lines in 131 s, 6 within tolerance, 2 short exclamations flagged → job awaits review |
| Stages 6–8 | in progress | music video with ACE-Step (weights present), an episode with a locked cast, a 5–10 min episode — see checklist 11.x |

## 9. Reliability

From `/api/metrics` (7 days): DEVELOP_STORY p50 19 s, WRITE_SCRIPT 16 s, PLAN_SHOTS 2.5 min (mean 1.5 attempts: the
14B model needs a repair round roughly every other scene), `llm.ms` p50 17 s / p95 40 s. Restart drill: a killed
worker's job was reclaimed after the 90 s lease and completed. Reset with a running job: the worker survives (fixed).

## 10. Performance

Measured on the RTX 5090 (from `/api/metrics` and job results):

| Step | Engine | Measured |
|---|---|---|
| Structured story answer | qwen3:14b (Ollama) | ~17 s median; PLAN_SHOTS 1.5 attempts on average |
| Portrait / reference view / plate / opening frame | Qwen-Image-2512, Qwen-Image-Edit-2511 (Lightning) | `image.generation_ms` p50 8.5 s, p95 23 s (n=33); a 5-view sheet ≈ 60 s; 4 plates ≈ 50–75 s |
| 5 s video take, 1344×768, first-frame conditioned | MiniMax H3 local (int8, 8-step turbo) | engine p50 132 s, p95 215 s (n=10); 10-shot short produced and assembled in 24 min |
| 5 s video take, prompt only | same | 60–95 s warm (S1E1, Karrada) |
| Speech line | IndexTTS 2.5 / Habibi-TTS IRQ | ~1–3 s of audio in 3–6 s warm; 35–63 s on the first call (model load); 8 dialogue lines with transcription checks in 131 s |
| 90 s song with vocals | ACE-Step 1.5 XL turbo | 34 s engine time; 66 s including Demucs stems |
| Transcription | faster-whisper large-v3 | 5.4 s for a 90 s vocal stem |
| Assemble / export 1080p | ffmpeg | 24 s cut, 24 s export for a 53 s short |

## 11. Bugs fixed (selection)

Stale "browser storage" copy; external font dependency; reset aborted by navigation (keepalive writes); jobs and
settings leaking between tests; worker crash on reset (FK on job events); NOT_CONFIGURED masked as retryable; SVG
uploads accepted; worker container healthcheck without a liveness file; stale page after fast navigation (own-origin
change events); freezedetect missing an unfinished freeze; a parallel fetcher run deleting the other run's partial and
overwriting its state; PyAV pairing in faster-whisper; ACE-Step node name; Music 3 CLIP type; Final Cut hardcoded
loudness and 0 MB sizes.

## 12. Remaining limitations

- Hosted MiniMax path unexercised (no key). The local H3 path is built and node-verified but waits on the 21 GB model.
- Qwen-Image, ACE-Step, Music 3 weights not yet downloaded; voice images not yet built → image/voice/music stages
  unexercised.
- The local 14B story model is terse (2–3 beats per scene) and needs repair rounds; a hosted model (MiniMax M3 or
  Anthropic) is a configuration change.
- No post-hoc lipsync model is shipped (MiniMax H3 speaks natively; MuseTalk/KeySync noted as candidates; LatentSync
  excluded by policy).

## 13. External blockers

| Blocker | Evidence | Smallest action |
|---|---|---|
| No MiniMax API key on this machine | no `MINIMAX_API_KEY` in any env/file; client returns NOT_CONFIGURED; wrong key → real 401-class refusal | put `MINIMAX_API_KEY=…` in `.env` and restart web + worker |
| Internet ~5 MB/s | 15.7 GB text encoder took 3 resumes; 21 GB DiT ≈ 1–2 h; Qwen stack ≈ 45 GB | none required; the fetcher resumes; a faster link shortens the wait |

## 14. Startup

```bash
cp .env.example .env
docker compose --profile models run --rm models
docker compose up -d --build
# http://localhost:4200  → Settings → Engines
```

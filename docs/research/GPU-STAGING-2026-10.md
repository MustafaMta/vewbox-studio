# GPU staging on the RTX 5090 (32 GB), October 2026: the plan made concrete for compose.yaml

DevOps, 2026-10-04. This turns `MODEL-STACK-2026-10.md` §4 into the services, variables and calls of this repository.
Nothing here was run: generation is paused during the website redesign, the inference containers stay stopped, and
the model phase measures what is marked **[E]**. Labels as in the model-stack document: **[R]** measured on this card
and recorded in the repo, **[V]** verified from a primary source, **[E]** an estimate.

## 0. The mechanism that exists

- **One cross-process GPU lease** (`src/server/gpu/lease.ts`, `resource_leases` in the database, FIFO). A job asks for
  a family with an estimate in MB (`ctx.gpu(family, mb, fn)`); the estimate is compared with `GPU_VRAM_BUDGET_MB`
  (default 30000, `.env.example`) and a warning is logged when it exceeds the budget ("the service must offload").
- **The unloaders** (`src/server/gpu/unloaders.ts`): when the card passes from family `from` to family `to`, every
  engine that does not serve `to` lets go first, and so does one that serves both when the family changes:
  - `comfyui` (serves IMAGE, VIDEO, MUSIC): `POST /free {unload_models: true, free_memory: true}` (`providers/comfy.ts`).
  - `tts` (`tts` and `tts-habibi`, TTS): `POST /unload` on :8020 and :8021 (`providers/speech.ts`).
  - `tts-design` (TTS): `POST /unload` on :8022 (`providers/voice-design.ts`).
  - `asr` (ASR): `POST /unload` on :8030; it drops both Whisper models and Demucs (`docker/asr/app.py`).
  - `ollama` (LLM): `POST /api/generate {model, keep_alive: 0}` on :11434 (`unloadOllama`).
  - Every unload is best effort and bounded (20 s); the speech services also `malloc_trim` the host heap after dropping
    weights (`MODEL-STACK-2026-10.md` §1.2).
- **The read-only view**: `GET /api/studio/gpu` (`src/app/api/studio/gpu/route.ts`, the engine room): who holds the
  card, who waits with positions, what was loaded last, the last unloads with their `gpu.unload_ms` metric.

## 1. Services and what each puts on the card

| compose service | Family served | Models (compose / manifest) | VRAM on the card | Lease estimate in code |
|---|---|---|---|---|
| `comfyui` | IMAGE | Qwen-Image-2512 fp8 DiT 20.4 GB + Qwen2.5-VL-7B fp8 TE 9.4 GB + VAE (`images-qwen`); or Qwen-Image-Edit-2511 fp8mixed 20.5 GB + the same TE; or FLUX.2 klein 4B 7.75 + Qwen3-4B TE 8.0 + VAE (`images-flux2-klein`) + MediaPipe + Qwen3.5-4B 9.3 GB (`images-vlm`) | Qwen: 29.6–31.7 GB card total with both Qwen DiTs and the TE resident; Edit quality mode ≤ 31.9 GB; klein ≈ 22 GB **[R]** `docs/MODELS.md` | `IMAGE_VRAM_MB = 30400` (`gpu/estimates.ts`, measured peak §6; was 24000); 9000 for the people graph (`handlers/people.ts`) |
| `comfyui` | VIDEO | MiniMax H3: FL2VA *or* Ref2VA pruned int8 DiT 21.0 GB, Qwen3-VL-32B nvfp4 TE 15.7 GB (staged: encodes, then to RAM), video VAE int8 2.8, audio VAE 0.6, turbo LoRA 2.0 (`video-minimax-h3`, `video-minimax-h3-reference`) | 22–32 GB while generating **[R]** `docs/evidence/minimax-p1` | `VIDEO_H3_VRAM_MB = 31900` (`gpu/estimates.ts`, measured peak §6; was 28000) |
| `comfyui` | MUSIC | ACE-Step 1.5 XL turbo 10.0 + LMs 3.7 + 1.2 + VAE 0.3 (`music-ace-step`); or MiniMax Music 3 int8 2.5 + TE 9.2 + VAE 0.2 (`music-minimax-3`); Demucs stems through `asr` | not recorded; ≤ 20 GB **[E]** | 20000 (`handlers/music.ts`) |
| `tts` | TTS | IndexTTS 2.5 (fetched by its entrypoint into `hf-home`) | ≈ 6 GB (card 3.5 → 9.5 GB loaded) **[R]** | `TTS_VRAM = 8000` (`handlers/voice-measure.ts`) |
| `tts-habibi` | TTS | Habibi-TTS IRQ (F5-TTS DiT + Vocos) | ≈ 1 GB above baseline after one line **[R]** | within `TTS_VRAM` |
| `tts-design` | TTS | VoxCPM2 2B bf16 (`voice-design`); ECAPA on the CPU | ≈ 7 GB; ≈ 0.6 GB of CUDA context stays after `/unload` until a restart **[R]** | `DESIGN_VRAM = 7000` |
| `asr` | ASR | faster-whisper large-v3 CT2 fp16 (`asr-whisper`, 3.1 GB on disk); **new:** whisper-large-v3-arabic-dialectal-v2 CT2 fp16 (`stack-2026-10` → `asr-convert`, ≈ 3.1 GB on disk **[E]**), `language=ar` only; Demucs htdemucs | large-v3 ≈ 3.7 GB; Demucs ≈ 2.3 GB **[R]**; the dialect model ≈ 3.7 GB **[E]** (same architecture); **one Whisper at a time** (the service drops one before loading the other) | `ASR_VRAM = 4000` |
| `llm` | LLM | **`gemma4:31b-it-qat`** Q4_0 (default since 2026-10-05) or `qwen3:14b` Q4_K_M, in the `ollama` volume | **measured 2026-10-05 (§6):** Gemma 19.1 GB loaded at 16K q8_0, 100 % GPU, card peak 21.4 GB; qwen3:14b 10.6 GB, card 11.5 GB | **`llmLeaseMb(model)`** (`providers/llm.ts`): 21500 for Gemma, 12000 for qwen3:14b and any unmeasured model |

`GPU_VRAM_BUDGET_MB=30000` leaves ≈ 2 GB for the display, the CUDA contexts of idle services (≈ 0.6 GB each after an
unload) and `COMFY_RESERVE_VRAM=1.0`.

## 2. Who co-resides, who must unload

The families are exclusive on the card; inside a family the services below share it.

| Taking the card for | Co-resident (stays or loads) | Must be unloaded first (by the lease, automatically) |
|---|---|---|
| **LLM** (planning, VLM QA) | `llm` only. qwen3:14b beside a staged H3 was measured at 100 % GPU **[R]**, but Gemma at 22–23 GB cannot share with anything | ComfyUI `/free`; `tts`, `tts-habibi`, `tts-design`, `asr` `/unload` |
| **IMAGE** | ComfyUI with one image checkpoint set. ComfyUI itself stages: the 2512 ↔ Edit-2511 switch keeps the TE and swaps the 20 GB DiT (≈ 19 s **[R]**); klein's graph holds klein + Qwen3-4B + Qwen3.5-4B + MediaPipe (≈ 22 GB) | Ollama `keep_alive: 0`; the four speech services `/unload`. Between two image checkpoint sets ComfyUI is told `/free` as well (`enginesToUnload`: an engine serving both `from` and `to` unloads when the family changes; inside IMAGE ComfyUI's own model manager swaps) |
| **TTS** | `tts` (6 GB) + `tts-habibi` (1–2 GB) + `tts-design` (7 GB) + ECAPA on the CPU: ≈ 14–15 GB **[R sum]**. `asr` may stay loaded beside them for the line check (≈ 3.7 GB): the lease treats ASR as its own family, so a TTS → ASR → TTS sequence unloads the voices each time; batching the checks after the lines avoids that (rule 3 below) | ComfyUI `/free`; Ollama `keep_alive: 0` |
| **ASR** | `asr` with one Whisper (EN or AR) + Demucs: ≈ 6 GB | ComfyUI `/free`; `tts*` `/unload`; Ollama `keep_alive: 0` |
| **VIDEO** | ComfyUI alone with one H3 checkpoint; the TE moves to host RAM after encoding | everything else, plus `/free` before every FL2VA ↔ Ref2VA switch (already in `generateVideo`) |
| **MUSIC** | ComfyUI with ACE-Step or Music 3; `asr` loads Demucs for the stems after the song (a separate ASR lease, which frees ComfyUI first) | everything else |

**What co-residence costs on the host.** After `/unload`, `tts`, `tts-habibi` and `tts-design` give their heap back
(`malloc_trim`, `docker/*/app.py`), but a loaded service still holds its weights in RAM, and ComfyUI's staged H3 TE
(≈ 16 GB) plus the page cache of a 21 GB DiT live there too (see §4).

## 3. Order of operations for one shot (a 5 s MiniMax H3 clip with one spoken line)

Each step names the lease family the worker asks for, what unloads, and the measured or estimated cost. A whole
production batches these per family (MODEL-STACK §4 rule 1: A → B → C → D → E); the single-shot order is the
same sequence without batching.

| # | Step | Lease | Unloads first | Loads | Time |
|---|---|---|---|---|---|
| 1 | Plan the shot (beats, `<d>` line, references) | LLM (21500 with Gemma, 12000 with qwen3:14b) | ComfyUI `/free`, `tts*`/`asr` `/unload` (no-ops when nothing is loaded) | Ollama: Gemma 19.1 GB (card 21.4) or qwen3:14b 10.6 GB (card 11.5) **[R]** | one scene's shot plan: Gemma 102–125 s, qwen3:14b 37–76 s; Gemma cold develop 134 s vs 32 s warm **[R]** (§6) |
| 2 | The shot's frame (first frame from the canonical character + location plate) | IMAGE (30400) | Ollama `keep_alive: 0` (≈ immediate; `OLLAMA_KEEP_ALIVE=2m` would otherwise keep it) | ComfyUI: Edit-2511 fp8mixed + TE + VAE ≈ 30 GB | ≈ 19 s load when the TE is resident, 75 s cold; Lightning edit 12–22 s, quality 60–80 s **[R]** |
| 3 | The line, Iraqi (Habibi) or English (IndexTTS) | TTS (8000) | ComfyUI `/free` (the whole image set leaves the card) | `tts` or `tts-habibi` (≈ 6 GB or ≈ 1–2 GB), 15–33 s first use **[R]** | ≈ 1–5 s per line warm **[E]** |
| 4 | The line check (transcribe back, WER against the script) | ASR (4000) | `tts*` `/unload` (host RAM trimmed) | `asr`: Whisper large-v3 for `en`; the dialect model for `ar` (the other Whisper is dropped first) | load ≈ 8 s cold; 6 s of speech in 1.2 s warm **[R]** |
| 5 | The clip (Ref2VA with the frame, the canonical image, the plate and the line's audio as references) | VIDEO (31900) | `asr` `/unload`; ComfyUI `/free` if an image checkpoint is still resident | ComfyUI: Ref2VA int8 DiT 21 GB resident, the nvfp4 TE 15.7 GB encodes then moves to RAM, VAEs, LoRA: card 22–32 GB | cold 50–80 s above warm; 69–76 s for a 5 s clip at 4 steps warm; 124–186 s with a load or 12 steps **[R]** |
| 6 | Take gate: transcribe the clip's own audio, compare with the line | ASR (4000) | ComfyUI `/free` (**this evicts the 21 GB DiT**: the next clip pays the 50–80 s cold load again) | `asr` Whisper | 1–2 s warm |
| 7 | Vision QA of the frame or the clip's frames (Gemma, image input) | LLM (21500) | ComfyUI `/free`; `asr` `/unload` | Ollama: Gemma | per image **[E]**, to measure (§5.6 L3 of MODEL-STACK) |

**Where the plan changes the order.** Steps 6 and 7 are why MODEL-STACK §4 rules 2 and 3 exist: inside a video batch,
the take gate should run on the **CPU** (`asr` with a CPU int8 Whisper, to be added and measured: target ≤ 0.5× real
time) so the DiT stays resident, and the vision QA runs as **one Gemma load after the image batch**, not per shot. Until
those two exist, the single-shot order above is exactly what the lease does today, with two extra ComfyUI cold loads
per shot (≈ 2–3 min of a ≈ 5–6 min shot).

## 4. Preconditions

1. **Host RAM: Docker (WSL2) sees ≈ 47 GB of the 95 GB** until the producer sets `%UserProfile%\.wslconfig`:

   ```ini
   [wsl2]
   memory=80GB
   swap=32GB
   ```

   then `wsl --shutdown` and restart Docker Desktop. Checked on 2026-10-04 from inside a container: `MemTotal`
   49,059,464 kB (≈ 46.8 GiB) and no `.wslconfig` on the user profile. Without it, the H3 TE staged to RAM (≈ 16 GB)
   plus the page cache of the DiT (≈ 21 GB) plus any idle speech service (the three hold ≈ 21 GB after an unload until
   `malloc_trim`, and their weights while loaded) exceed the VM, which is how the FL2VA → Ref2VA switch was OOM-killed
   (`docs/evidence/minimax-p1/README.md`). With 80 GB the staged TE and the DiT page cache fit beside **one** idle
   family; "free everything before VIDEO" stays the rule anyway (MODEL-STACK §4 rule 5).
2. **The card is not shared with the desktop's own work** during a batch: `GPU_VRAM_BUDGET_MB=30000` assumes ≤ 2 GB
   of foreign use. The engine room's `GET /api/studio/gpu` shows the holders; `nvidia-smi` shows the foreign part.
3. **The lease estimate for the LLM family follows the model** (`providers/llm.ts`, 12000 today): 23000 with Gemma,
   otherwise the budget warning fires on every planning call and, worse, the estimate under-reports the card.
4. **Weights present before the phase**: `stack-2026-10` fetched and converted (`asr-convert`), Gemma pulled
   (`llm-pull`), both outside production hours on this 5 MB/s link (6.2 GB ≈ 21 min; 19 GB ≈ 65 min).
5. **Ollama 0.35.1 loads `gemma4`** (the pinned 0.12.3 predates it): verified by `ollama list` + one `/api/generate`
   with `keep_alive: 0` in the model phase; the context length is then confirmed from the loaded model's KV size
   (`ollama ps` reports the total; 22–23 GB at 16K is the estimate to beat).

## 5. What the model phase measures (feeds MODEL-STACK §5 and `docs/MODELS.md` "VRAM plan")

- Gemma 4 31B QAT: card total at 16K and at 32K q8_0 with flash attention; time to load from the page cache; a
  structured answer's latency against qwen3:14b's 17 s median.
- The dialect Whisper: card total; the EN ↔ AR swap time inside `asr` (drop + load); Iraqi folded CER against
  large-v3 on the §5.9 clips.
- Music: the card total for ACE-Step and Music 3 (never recorded).
- The two extra ComfyUI cold loads per shot (§3 steps 6–7) before and after the CPU take gate exists.

## 6. Measured on 2026-10-05 (docs/research/MODEL-EVAL-2026-10.md; nvidia-smi peaks at 250–500 ms, card total)

Idle: ComfyUI alone 0.50 GB of the card (CUDA context), 0.77 GB with the other idle services; ComfyUI 0.9–2.8 GB of
host RAM idle. Every speech service and Ollama load lazily: up and idle they hold no VRAM.

| Family / engine | Card peak (measured) | Host RAM (container) | Lease estimate in code | Fits the estimate? |
|---|---|---|---|---|
| IMAGE — Qwen-Image-2512 quality / Lightning | **29.8 GB** | ≤ 2.8 GB | `IMAGE_VRAM_MB` **30400** (was 24000) | yes |
| IMAGE — Qwen-Image-Edit-2511 (edit, Image Reference rollback) | **30.0–30.4 GB** | — | 30400 | yes (the family's estimate is this peak) |
| IMAGE — FLUX.2 klein 4B (+ Qwen3-4B TE) | **20.1 GB** | — | 30400 | yes (over-estimates by ≈ 10 GB) |
| IMAGE — Qwen-Image-2.1 int8 (evaluation only) | 17.0–22.4 GB | — | — | — |
| VIDEO — MiniMax H3 Ref2VA int8, 4-step turbo, 5 s at 1344×768 | **28.4–31.9 GB** | **40.2–40.8 GiB of 46.8** | `VIDEO_H3_VRAM_MB` **31900** (was 28000); host RAM `VIDEO_H3_HOST_RAM_MB` 40.8 GiB recorded | yes |
| VIDEO — MiniMax H3 Ref2VA int8, final tier (base, 20 steps) and draft (turbo), 5 s at 1344×768, 2026-10-06 (MODEL-EVAL §8.4) | **27.0–31.9 GB** | **46.0–46.5 GiB of 78.5** (VM raised by `.wslconfig`) | 31900; host RAM 46.5 GiB recorded; engine final ≈ 350 s vs draft 85–123 s | yes |
| LLM — qwen3.6:27b-q8_0, 16K q8_0 (production since 2026-10-06, MODEL-EVAL §9) | **31.7 GB** (28.4 GB model, 66/66 layers) | ≤ 13.8 GB | 31500 | alone only — the whole card; one stall at 32.0 GB (fails fast as RESOURCE_EXHAUSTION) |
| LLM — gemma4:31b-it-qat, 16K q8_0 (fallback) | **21.4 GB** (19.1 GB model) | ≤ 11.9 GB | 21500 (new) | yes |
| LLM — qwen3:14b, 16K q8_0 | **11.5 GB** (10.6 GB model) | ≤ 5.9 GB | 12000 | yes |
| TTS + ASR — IndexTTS + Habibi IRQ + Whisper (dialect or large-v3), all loaded | **13.5 GB** together | tts 2.5, habibi 2.5, asr 1.0 GB | 8000 / 4000 | — |

**Which engines can co-reside (card ≤ 32.6 GB, measured sums):**

- **Voice + ASR: yes** (13.5 GB together, measured) — the TTS → ASR → TTS lease switch can stay one family.
- **qwen3:14b + voice/ASR: would fit** (11.5 + ≈ 12.7 = ≈ 24 GB) — not used: the default is now Gemma.
- **Gemma + voice/ASR: no** (21.4 + 12.7 ≈ 34 GB). **Gemma + any image engine: no.** **klein + voice: no** (≈ 32.8 GB).
- **H3: alone** — 31.9 GB of the card and 40.8 GiB of the VM's 46.8 GiB host RAM: with the speech services merely idle
  (≈ 6 GB RAM loaded) the VM is at its limit; `.wslconfig` (`memory=80GB`) is still the producer action.

**2026-10-06:** the Docker VM now has 78.5 GiB (`docker info` MemTotal 84,336,570,368 B); H3 measured 46.0–46.5 GiB of it in
both tiers (the page cache of the DiT and the encoder grow into the room), so `VIDEO_H3_HOST_RAM_MB` is 46.5 GiB and
`DOCKER_VM_RAM_MB` the new VM size. The final tier's card peak is the turbo tier's (same model and activations).

**The code follows the measured peaks (2026-10-05, `src/server/gpu/estimates.ts`, test `tests/unit/gpu-estimates.test.ts`,
which reads this table):** `IMAGE_VRAM_MB` 30400 (was 24000) and `VIDEO_H3_VRAM_MB` 31900 (was 28000); H3's host RAM
(40.8 GiB of the VM's 46.8, ≈ 6 GiB headroom) is recorded beside them as `VIDEO_H3_HOST_RAM_MB`. With
`GPU_VRAM_BUDGET_MB=30000` the budget warning now fires on every Qwen and H3 job, which is what those jobs really put on
the card — the budget itself still needs a decision.

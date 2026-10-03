# Model stack, October 2026: inventory, research, one recommendation

AI Research Lead, 2026-10-04. Read-only inventory of the repo plus web research. No container was started or
stopped, no weights were downloaded, and no generation was run. The quality tests in §5 belong to a later phase.

**Evidence labels**, used on every number below:

- **[V]** verified today from a primary source (model card, vendor repo or docs, licence file, Hugging Face listing).
- **[R]** measured on this RTX 5090 and recorded in the repo (the file is cited).
- **[C]** a claim from a secondary source (blog, community quant card, press) or unaudited vendor marketing.
- **[E]** my estimate, not measured.

**Policy applied:**

- MiniMax is the only video engine.
- "Commercial" means running the model inside a paid product (`FLUX-VS-QWEN.md` §1). Licences that forbid that are
  marked **NC**: such a model may be *evaluated* where its licence allows evaluation, but cannot ship without a
  purchased licence.

## 0. Decision in one page

| Capability | Choice | vs today | Licence | New download |
|---|---|---|---|---|
| Image generation (T2I, canonical from text) | **Qwen-Image-2512** fp8 (+ Lightning draft) | keep | Apache-2.0 | 0 |
| Image editing, shot frames, location views | **Qwen-Image-Edit-2511** fp8mixed | keep | Apache-2.0 | 0 |
| Reference-based identity (canonical from an upload) | **FLUX.2 [klein] 4B distilled** + MediaPipe face + Qwen3.5-4B read | keep (A/B-proven) | Apache-2.0 | 0 |
| Location plates | **Qwen-Image-2512** master plate, then **Edit-2511** views | keep | Apache-2.0 | 0 |
| Posters | **Qwen-Image-2512** key art without text, then titles typeset in post | new workflow, no new model | Apache-2.0 | 0 |
| VLM / vision checks | **Gemma 4 31B-it** (QAT Q4, Ollama) for QA; Qwen3.5-4B stays in the upload-read graph | new | Apache-2.0 | 19 GB |
| LLM, story planning (local) | **Gemma 4 31B-it** replaces `qwen3:14b` | change | Apache-2.0 | (same 19 GB) |
| LLM (hosted) | configured Anthropic model, then MiniMax-M3 | keep | API terms | 0 |
| Video | **MiniMax H3 local** (pruned int8 FL2VA + Ref2VA, nvfp4 TE, turbo LoRAs) for drafts and dailies; **hosted MiniMax-H3** for finals (2K regeneration, H3-Max) when a key exists | keep; optional 4-step FL2V LoRA A/B | H3 Community Licence / API terms | 0 (+2.0 GB optional) |
| ASR (EN) | faster-whisper large-v3 | keep | MIT | 0 |
| ASR (Iraqi Arabic) | **whisper-large-v3-arabic-dialectal-v2**, converted to CTranslate2 | new | Apache-2.0 | 6.2 GB |
| TTS English | **IndexTTS 2.5**; **VoxCPM2** controllable cloning as the A/B challenger (already on disk) | keep + A/B | bilibili Model Use Licence / Apache-2.0 | 0 |
| TTS Iraqi Arabic | **Habibi-TTS IRQ** with emotion-tagged authorised references | keep | Apache-2.0 (IRQ weights) | 0 |
| Voice design | **VoxCPM2** (EN and MSA; Iraqi is never designed) | keep | Apache-2.0 | 0 |
| Music / song | **ACE-Step 1.5 XL turbo** first, **MiniMax Music 3** (open, int8) second | keep | MIT / MiniMax-Music3 Community | 0 |
| *Licence-gated upgrade* | **Qwen-Image-2.1** (best open image model on both arenas): **evaluate only** | evaluation group, not default | **Qwen Research Licence (NC)** | 17.3 GB (eval) |

**Downloads:** ≈ **25.2 GB required** (about 1.4 h at 5 MB/s); ≈ **44.4 GB with the evaluation set** (about 2.5 h).
Everything else is already on the `models` volume (`docs/MODELS.md`, the manifest; the music engines are VERIFIED in
`IMPLEMENTATION-CHECKLIST.md` row 3.4).

**Two infrastructure findings matter more than any model swap:**

1. **The WSL2 VM sees only about 47 GB of the 95 GB RAM.** There is no `%UserProfile%\.wslconfig`, and the WSL2
   default is "50% of total memory on Windows" [V, Microsoft Learn]. The H3 run was OOM-killed on a FL2VA → Ref2VA
   switch while the speech services held about 21 GB of host RAM after their GPU unload [R,
   `docs/evidence/minimax-p1/README.md`]. Staged loading and offload both depend on host RAM, so this caps every
   plan below. **Producer action:** set `memory=80GB` and `swap=32GB` in `.wslconfig`, then `wsl --shutdown`.
2. **The speech services' `/unload` frees VRAM but keeps the weights in host RAM** [R, same file]. They should
   release host RAM too, or the lease should restart them before a video batch.

## 1. Inventory today (read-only)

**Read:** `compose.yaml`, `docker/*/Dockerfile`, `docker/models/manifest.json`, `.env.example` (variable names only;
`.env` and `.env.local` were not opened), `src/server/env.ts`, `src/server/providers/*`, `src/server/workflows/*`,
`docs/MODELS.md`, `docs/research/*`, and `docs/evidence/{flux-vs-qwen,minimax-p1,voice-design}`.

The ComfyUI graphs are TypeScript builders (`src/server/workflows/*.ts`). The only graph JSONs in the repo are the
experiment records `docs/evidence/minimax-p1/*.graph.json`.

| Capability | Current model | Files / size | Quant | Runs in | VRAM (card total), speed | Evidence |
|---|---|---|---|---|---|---|
| Image generation | Qwen-Image-2512 (20B MMDiT) + Lightning 8-step LoRA | DiT 20.43 GB, TE Qwen2.5-VL-7B 9.38 GB, VAE 0.25, LoRA 0.85 | fp8 | `comfyui` v0.38.1, torch 2.13 cu130 | 29.6–31.7 GB with both Qwen DiTs + TE resident; canonical 42 s warm, draft 6–9 s | [R] MODELS.md; manifest `images-qwen` |
| Image editing | Qwen-Image-Edit-2511 + Lightning 4-step | DiT 20.53 GB (+ shared TE/VAE), LoRA 0.85 | fp8mixed | `comfyui` | ≤ 31.9 GB; 60–80 s quality, 12–22 s Lightning | [R] MODELS.md, `evidence/image-v2/d13` |
| Reference identity | FLUX.2 [klein] 4B distilled + Qwen3-4B TE; MediaPipe face crop; Qwen3.5-4B reads the upload | 7.75 + 8.04 + 0.34 GB; 5.4 MB; 9.32 GB | bf16 | `comfyui` | ≈ 22 GB; 3.7 s / 2.5 s warm | [R] FLUX-VS-QWEN §5 (whole figure 24/24 vs Qwen-Edit 17/24) |
| Location plates | 2512 master plate; Edit-2511 views (≤ 3 refs) | as above | fp8 | `comfyui` | as above | [R] MODELS.md, `evidence/location-views` |
| Posters | **none generated**: `makeFramePoster` crops a 2:3 window of the best frame, no text | — | — | worker (ffmpeg) | — | `src/server/media/thumbs.ts:128` |
| VLM / vision checks | Qwen3.5-4B reads uploads only; **no automated QA** of anatomy, style or identity; framing by a CPU flood fill | 9.32 GB | bf16 | `comfyui` | in the image family | `media/figure-check.ts`, `media/image-check.ts` |
| Video, local | MiniMax H3 open weights: FL2VA + Ref2VA pruned int8_convrot DiTs, Qwen3-VL-32B nvfp4_awq TE, video VAE int8, audio VAE fp32, turbo LoRAs (FL2V 8-step, Ref2V 4-step) | 2 × 20.97 + 15.69 + 2.81 + 0.61 + 2 × 1.96 GB | int8 / nvfp4 | `comfyui` | 22–32 GB; 5 s at 1280×736: 69–76 s warm (Ref2VA 4-step), 124–186 s with loads or 12 steps | [R] MODELS.md, `evidence/minimax-p1` |
| Video, hosted | `MiniMax-H3`, `/v2/video_generation`, 768P default | — | — | API | — | `providers/minimax.ts`, `video.ts`; `VIDEO_BACKEND=auto` picks the API when a key is set (key not inspected) |
| LLM (story) | hosted MiniMax-M3 or Anthropic (`ANTHROPIC_MODEL`); local `qwen3:14b` on `ollama/ollama:0.12.3` | 10 GB | Q4 | `llm` | 10 GB; about 17 s median per structured answer | [R] MODELS.md; compose `x-app-env` |
| ASR | faster-whisper large-v3 (+ Demucs htdemucs) | ≈ 3.1 GB | fp16 CT2 | `asr` | ≈ 3.7 GB (+2.3 Demucs); 6 s of speech in 1.2 s | [R] MODELS.md |
| TTS EN (+ MSA, mixed) | IndexTTS 2.5 (about 0.8B GPT + s2mel + BigVGAN + w2v-bert) | fetched by the entrypoint | bf16 | `tts`, torch 2.8 cu128 | ≈ 6 GB | [R] MODELS.md, `docker/tts/entrypoint.sh` |
| TTS Iraqi | Habibi-TTS Specialized/IRQ (F5-TTS DiT + Vocos) | `model_100000.safetensors` + vocab | — | `tts-habibi` | ≈ 1 GB above baseline after one line | [R] MODELS.md; suite WER 0.37 (`evidence/iraqi-suite.md`) |
| Voice design | VoxCPM2 (2B) + ECAPA (CPU) | 4.96 GB + 89 MB | bf16 | `tts-design` | ≈ 7 GB | [R] `evidence/voice-design/report.json` |
| Music / song | ACE-Step 1.5 XL turbo + 0.6B/1.7B LMs; MiniMax Music 3 int8; hosted `music-3.0` | 9.97 + 3.71 + 1.19 + 0.34 GB; 2.50 + 9.20 + 0.22 GB | bf16 / int8 | `comfyui` | VRAM not recorded; 90 s song in 34 s (ACE); 48 s in 103 s (Music 3) | [R] IMPLEMENTATION-CHECKLIST 3.4 |

**What "MiniMax-H3 (open weights)" in this repo actually is** [V]:

- **The release.** MiniMax published **MiniMaxAI/MiniMax-H3** on 2026-08-03. It is a 33B dense single-stream
  transformer, with about 13B of that in the AdaLN branches. It comes as two checkpoints:
  - **FL2VA**: text, plus a first and/or last frame.
  - **Ref2VA**: up to 9 images, 3 videos and 3 audio clips, 12 files in total.
  - Output: 4–15 s, 768p short edge, 24 fps, 32 kHz stereo, 11 languages including Arabic.
- **API-only parts.** H3-Context-IR and Regenerate-2K stay API-only [C, dev.to, NYU-Shanghai RITS].
- **The repo's files are not a small variant.** The repo runs Comfy-Org's ComfyUI repack. Its `pruned` files replace
  the AdaLN network with a precomputed time table:
  - A community quant card reports an AdaLN relative error of about 3–4·10⁻⁷ [C].
  - Pruned bf16 is 40.2 GB against 66.3 GB for full bf16 [V, HF listing].
  - Numerically, the pruned int8 file is the full model.
- **Licence.** The MiniMax H3 Community Licence allows commercial use below US$20M a year, with "MiniMax H3" attribution.
  - The **EU, UK, South Korea and the USA are excluded** [V, card; C, press].
  - Comfy has resold H3 commercial licences since 2026-08-30 [C]. Any release in those territories, or above the cap,
    needs one.

## 2. Research: current options (verified 2026-10-04)

### 2.1 Image: FLUX vs Qwen, and the new entrants

| Model | Size | Licence (model use) | ComfyUI | Fits 32 GB | References | Arena Elo (Artificial Analysis) [V] |
|---|---|---|---|---|---|---|
| **Qwen-Image-2512** | 20B + 7B VL TE | **Apache-2.0** [V] | core | fp8, measured [R] | none (T2I) | T2I 999 |
| **Qwen-Image-Edit-2511** | 20B + 7B | **Apache-2.0** [V] | core, image1..3 | fp8, measured [R] | 1–3 | Edit 1021 |
| **FLUX.2 [klein] 4B** distilled | 4B + Qwen3-4B | **Apache-2.0** [V] | core | ≈ 22 GB [R] | multi | T2I 863, Edit 948 |
| FLUX.2 [klein] 9B / 9B KV | 9B | **NC** [V] | core | yes | multi | T2I 941, Edit 1013 |
| FLUX.2 [dev] | 32B + Mistral-24B TE | **NC**; paid BFL self-hosted licence [V] | core | fp8 DiT about 32 GB alone, so weight streaming [C, NVIDIA, RunPod] | multi | T2I 1000, Edit 1000 |
| FLUX.1 [dev] / Kontext / Krea [dev] | 12B | **NC** [V, FLUX-VS-QWEN §1] | core | yes | Kontext: 1 | T2I 841, Edit 858 |
| FLUX.1 [schnell] | 12B | Apache-2.0 [V] | core | yes | none | T2I 803 |
| **Qwen-Image-2.1** (2026-09-20) | **7B DiT** + Qwen3-VL-8B TE | **Qwen Research Licence**: "research or evaluation purposes only"; a commercial use needs a separate licence [V, LICENSE] | day-0, `Comfy-Org/Qwen-Image-2.1` [V] | int8 DiT 7.26 + TE 9.35 GB | **up to 10**, RGBA, masked regional edits [V] | **T2I 1036 (#18), Edit 1073 (#18): the best open weights on both** |
| Ideogram 4.0 | 9.3B | **NC** weights [C] | day-0 [C] | nf4 / fp8 [C] | — | T2I 1011 |
| HunyuanImage 3.0 Instruct | 80B MoE | community licence, territory exclusions [C] | — | no | yes | Edit 1066 |
| Cosmos3-Super-Text2Image | 64.6B | OpenMDW 1.1 [C] | — | INT4 ≈ 35 GB [C]: no | — | T2I 987–995 |

**Reading:**

- **The shipping pair is still the strongest commercially usable open weights.**
  - Qwen-Image-2512 ties FLUX.2 [dev] on T2I (999 vs 1000). FLUX.2 [dev] is NC and about twice the size.
  - Edit-2511 beats FLUX.2 [dev] and klein 9B on editing.
- **Qwen-Image-2.1 is the only open model clearly above them, and it is NC.**
  - Its licence allows evaluation, so it can be A/B-tested here. Shipping it needs an agreement
    (model-business@notice.qwencloud.com).
  - Its 10-reference editing suits the canonical character + plate + frame workflow better than Edit-2511's 3.
- **Anatomy and identity.**
  - The repo A/B found no major anatomy errors in 12 Qwen T2I pictures.
  - From an upload, klein 4B drew the whole figure 24/24 against Qwen-Edit's 17/24. Realistic SFace was 0.62–0.85.
  - A community report says klein 4B "struggles to preserve the pose" when editing [C]. That is why klein is kept to
    the canonical redraw.
  - No independent anatomy benchmark exists for these models, so anatomy is a test item (§5).
- **Arabic typography.** No open model documents Arabic text rendering, so poster titles stay out of the diffusion
  model.

### 2.2 MiniMax video: hosted vs local

| | Hosted `MiniMax-H3` | Hosted `MiniMax-H3-Max` (+ Max Turbo preview) | Local H3 (ComfyUI) |
|---|---|---|---|
| Status | current [V, platform docs] | current; released 2026-09-02 with fal.ai [V docs; C press] | open weights since 2026-08-03 [V] |
| Duration | 4–15 s | 5–15 s | 4–15 s; trained on about 124–362 frames [R, node tooltip] |
| Resolution | 768P, **2K** | 480P, 768P | 768p short edge (1344×768 at 16:9); **no 2K** (Regenerate-2K is API-only) |
| First / last frame | yes / yes | yes / yes | yes (FL2VA); AddGuide anchors at any frame |
| Subject reference | ≤ 9 images, ≤ 3 videos, ≤ 3 audio; **cannot be mixed with frame roles** | reference generation [V] | Ref2VA images + videos + audio, **combined with guides** in one request [R, MINIMAX-CONTINUITY §1] |
| Continuation / extension | **no extension endpoint**; last frame as first frame, or a `reference_video` (context only); `/v2/video_generation/regeneration` → 2K | same | AddGuide with the previous 22 frames (+ audio): join PSNR 37.6 dB [R, C1]; frames only when the new shot is silent |
| Native audio, dialogue | yes, `<d>` tags, 11 languages incl. Arabic | yes | yes; Arabic listed; **Iraqi dialect not claimed** |
| Price / time | $0.08/s 768P, $0.13/s 2K | $0.05/s 480P, $0.08/s 768P | electricity; 69–186 s per 5 s clip [R] |
| Licence | API terms | API terms | H3 Community Licence (territory and US$20M limits) |

**Verdict.**

- **Local H3 stays the default.** Takes cost nothing extra, and it has the richer continuity toolkit.
- **Hosted H3 is the finishing path** for 2K, and for throughput when a key exists. The ShotPack is lowered per
  backend (MINIMAX-CONTINUITY §3.8).
- **Optional:** A/B the newer `fl2v_turbo_4step_v1.0_768p` LoRA (1.96 GB [V]) against the 8-step one.
- **Not recommended:**
  - The unpruned int8 DiTs (34.0 GB each). There is no quality gain, and they would force weight streaming.
  - The int8 Qwen3-VL-32B TE (27.1 GB) instead of nvfp4_awq (15.7 GB, a third-party AWQ). This is a later
    prompt-adherence A/B, not a download now.

### 2.3 LLMs for planning and scripting (Arabic and Iraqi)

- **Mizan** (arXiv 2609.13980, 2026-09) is a national Iraqi-Arabic benchmark of 27 systems [V, paper HTML].
  - The MSA track saturates; the Iraqi track trails it by 14–18 points per model.
  - Iraqi scores: gemini-2.5-pro and gpt-5 **84.9**; gpt-4o 83.7; **gemma-4-31b-it 82.4**, the best open model that
    fits one card. mistral-large-2512 (83.7) and llama-4-maverick (83.0) are too large.
  - The dedicated Arabic models trail a generalist: ALLaM-7B 64.7 and SILMA-9B 63.2, against ministral-8b at 73.9.
  - **Caveat:** the generative axes still await human judging. These numbers measure comprehension, not dialogue writing.
- **Gemma 4 31B-it** [V, HF card, Google docs, ollama.com]: 30.7B dense, 256K context, text + image input, Apache-2.0,
  2026-07. It needs 17.5 GB at 4-bit; `gemma4:31b-it-qat` and `-nvfp4` are 19 GB.
- **Qwen3.6-27B** (Apache-2.0, 2026-04, multimodal) [V] is the local challenger. Whether Mizan evaluated it was not
  verified.
- **Hosted:** keep the configured Anthropic model and MiniMax-M3. Writing quality is settled by the human test (§5.6).
- **Ollama:** `ollama/ollama:0.12.3` predates Gemma 4; support arrived in v0.20 [C, release notes]. Pin a current tag
  and verify that `gemma4` loads.

### 2.4 Voice: TTS, cloning, emotion, Iraqi

| Engine | Arabic / Iraqi | Cloning, emotion | Licence | Status |
|---|---|---|---|---|
| **IndexTTS 2.5** (2026-01) | Arabic is one of 5 languages; no dialect claim | zero-shot; 8-dim emotion vector; speed 0.5–2 | bilibili Model Use Licence (commercial below 100M MAU) [V card; R VOICE-STACK] | shipping |
| **Habibi-TTS IRQ** (arXiv 2601.13802) | specialised Iraqi model, 70.7 h | zero-shot from reference + transcript; **no emotion input** | IRQ/MSA/EGY/ALG/MAR **Apache-2.0**; Unified/SAU/UAE **NC** [V README] | shipping |
| **VoxCPM2** (OpenBMB, 2B) | 30 languages incl. Arabic (MSA); no Arabic dialects | voice design from text; controllable cloning; 48 kHz; about 8 GB, RTF 0.30 on a 4090 | Apache-2.0 [V] | shipping (design) |
| MiniMax `speech-2.8-hd` / `-turbo` | 40 languages; `language_boost: Arabic`; no dialect values | clone from about 10 s; 7 emotions; sound tags | API [V platform] | wired, opt-in |
| Lahgtna OmniVoice | lists Iraqi | cloning | **NC** (Emilia base) [R VOICE-IDENTITY-V2] | excluded |
| NAMAA Saudi TTS (a Chatterbox fine-tune) | Saudi only | cloning, emotion | MIT [C] | no Iraqi |
| Qwen3-TTS, CosyVoice 3, MOSS-VoiceGenerator, Maya1 | **no Arabic** | — | Apache-2.0 | excluded |
| Fish/OpenAudio S1–S2, Voxtral TTS, XTTS-v2 | Arabic | — | **NC** | excluded |

**Iraqi evidence:**

- Habibi IRQ was rated by paid native speakers: dialect **DMOS 4.06**, SMOS 3.82, NMOS 3.83. ElevenLabs v3 scored
  3.97/3.38/3.94.
- Synthetic Iraqi gets a *lower* ASR WER than real Iraqi (17.7 vs 27.2), so ASR cannot certify dialect
  [R, VOICE-IDENTITY-V2 §2.5 from arXiv 2601.13802].
- Today's searches found **no newer commercially licensed open model for Iraqi**, and no "IndexTTS 3" [C].
- Hosted Iraqi-labelled voices are Azure `ar-IQ-Bassel` and `ar-IQ-Rana`, both fixed.

### 2.5 ASR for Iraqi Arabic

- **oddadmix/whisper-large-v3-arabic-dialectal-v2** [V, card]: a large-v3 fine-tune, Apache-2.0, trained on 52k clips
  in 13 dialects.
  - **Iraqi WER 0.254, CER 0.068** on 200 held-out clips. This is in-domain: the test set comes from the same
    dataset family.
  - Download: `model.safetensors`, 6.17 GB (fp32).
- **Other results:**
  - Qwen3-ASR-1.7B: Iraqi WER 0.478 on the same set; its 0.6B fine-tune 0.378 [C, friendli].
  - Qwen3.5-Omni-Plus: 28.5% on GigaSpeechBench IRQ [C], and it is API-only.
  - Vanilla large-v3 has no score on that set. The repo notes that it is worse (VOICE-STACK D5).

## 3. Recommended stack, per capability (families as in §4)

**3.1 Image generation: Qwen-Image-2512 (keep).**

- **Why:** the best finish in the repo A/B (4.75 vs 4.25), garment fidelity, 0/12 failures, and the highest-ranked
  commercially usable open T2I.
- **VRAM:** fp8 DiT 20.4 GB + fp8 TE 9.4 GB, ComfyUI-managed, with the TE offloaded after encoding; the card measured
  29.6–31.7 GB [R].
- **Download / Docker:** none. **Upgrade path:** Qwen-Image-2.1, after a licence.

**3.2 Image editing and shot frames: Qwen-Image-Edit-2511 (keep).**

- **Why:** the best Apache editing model on the arena (1021).
- **VRAM:** ≤ 31.9 GB [R]. Hold **one** 20 GB DiT at a time. On a 2512 ↔ 2511 switch the lease frees ComfyUI's
  models, and reloading costs about 19 s [R, cold vs warm].

**3.3 Reference-based identity: klein 4B distilled + MediaPipe + Qwen3.5-4B read (keep).**

- **Why:** the measured A/B: whole figure 24/24 vs 17/24, 0 invented attributes, 27× faster. klein 9B is better on
  the arena but NC.
- **VRAM:** ≈ 22 GB [R].
- **Cleanup:** the klein Base file (7.75 GB) can be deleted.

**3.4 Canonical locations: a 2512 master plate, then Edit-2511 views (keep).** One plate per location is the World
Bible anchor, and H3 reuses it as a `<Picture k>` reference.

**3.5 Posters: a new workflow, no new model.**

1. Draw the 2:3 key art with 2512 in quality mode, without text. Use Edit-2511 with the canonical images and the
   plate when the cast must match.
2. Typeset the EN and AR titles and credits in the worker (server-side SVG/canvas or ffmpeg `drawtext`, with a
   licensed Arabic font).

- **Why:** no open model documents Arabic glyphs, and a misspelled title cannot ship.
- **Test:** in-model English titles are tested in §5.4 only as an option.

**3.6 VLM / vision checks: Gemma 4 31B-it (new), with Qwen3.5-4B kept in-graph.**

- **Why:** image input and Apache-2.0. One model does planning (§3.7) and QA: medium classification, anatomy flags,
  garment checklists against the identity line, and poster OCR read-back. That is one download for two capabilities.
  Qwen3.5-4B stays in the upload-read graph because it is wired, tested, and co-resident with klein.
- **VRAM:** QAT Q4 19 GB + KV cache ≈ 22–23 GB [E].
- **Docker (`llm`):**
  - Pin a current Ollama.
  - Set `OPENAI_COMPATIBLE_MODEL=gemma4:31b-it-qat`.
  - Add `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0` and `OLLAMA_CONTEXT_LENGTH=16384`, verified on the
    pinned version.
  - Remove `qwen3:14b` from the volume.
- **Challenger:** Qwen3.6-27B, only if Gemma fails §5.6 L3.

**3.7 LLM for story planning: Gemma 4 31B locally; hosted Anthropic or MiniMax-M3 (keep).**

- **Why:** the best open model on Mizan's Iraqi track that fits one card (82.4), and Apache-2.0.
- **Hosting:** the hosted model stays first when a key exists (`LLM_PROVIDER=auto`).
- **Staging:** Gemma runs in the planning phase and is evicted on the lease switch (`OLLAMA_KEEP_ALIVE` stays 2m).

**3.8 Video: MiniMax H3 local (keep) + hosted H3 for finals.**

- **Why:** the exclusive engine by policy; the pruned int8 is numerically the full 33B model; reference + guide
  combination is verified; measured on this card.
- **Licence:** attribution in the UI, a US$20M cap, excluded territories. A Comfy-resold commercial licence is needed
  for any EU, UK, South Korea or USA release.
- **Staging:**
  1. The nvfp4 TE (15.7 GB) encodes, then moves to RAM.
  2. The DiT (21 GB), VAEs and LoRA stay resident: 22–32 GB on the card [R].
  3. This needs about 40 GB of free host RAM [E], hence the `.wslconfig` fix.
  4. FL2VA ↔ Ref2VA switches free ComfyUI first; this is already in `generateVideo`.
- **Docker:** none. Keep `--disable-comfy-compiler` and cu130.

**3.9 ASR: large-v3 for English + dialectal-v2 for Arabic (new).**

- **Why:** an Iraqi CER of 0.068 is claimed, and the vanilla model charges dialect spelling as errors. Apache-2.0.
- **Install:**
  - Download 6.17 GB.
  - Convert once in a one-off container with `ct2-transformers-converter --quantization float16`; about 3.1 GB on
    disk and about 3.7 GB VRAM [E].
- **Docker:**
  - A new manifest group, `asr-whisper-ar-dialect`.
  - `asr` gets `ASR_MODEL_DIR_AR` and routes `language=ar` to it.
  - A CPU int8 path for take gates during video batches (§4).

**3.10 Voices (keep): IndexTTS 2.5 for English, Habibi IRQ for Iraqi, VoxCPM2 for design.**

- **English:** A/B IndexTTS 2.5 against VoxCPM2's controllable cloning (48 kHz, already on disk; §5.7). The winner
  becomes the English line engine, with no download either way.
- **Iraqi:**
  - Emotion comes from emotion-tagged authorised references per voice (neutral, angry, sad, happy), since Habibi has
    no emotion input.
  - Apply the VOICE-STACK D1/D7/D8 fixes: peak limiting, a VAD-chosen reference window, a pinned seed.
  - No designed Iraqi voices.
- **VRAM:** the audio family co-resides at ≈ 18–20 GB (6 + 1–2 + 7 + 3.7) [R sum].

**3.11 Qwen-Image-2.1, evaluation only (licence-gated).**

- **Files:** manifest group `eval-qwen-image-2.1`, outside the default `MODEL_GROUPS`. `qwen_image_2.1_int8_convrot`
  7.26 GB + `qwen3vl_8b_int8_convrot` 9.35 GB + VAE 0.68 GB = **17.28 GB** [V].
- **Rule:** if it beats 2512 or Edit-2511 by the margins in §5, the producer requests a commercial licence before any
  production use.

## 4. GPU scheduling plan for the RTX 5090 (32 GB)

| Family (one GPU lease) | Co-resident members | Card total | Cold load | Warm latency |
|---|---|---|---|---|
| **A. Planning** | Gemma 4 31B QAT (LLM + VLM) | ≈ 22–23 GB [E] | ≈ 10–20 s from page cache [E] | a structured plan in tens of seconds [E]; qwen3:14b measured 17 s median [R] |
| **B. Images** | one Qwen DiT (2512 *or* Edit-2511) + TE + VAE; or klein 4B + Qwen3-4B + Qwen3.5-4B + MediaPipe | 22–31.9 GB [R] | Qwen about 19 s, klein about 8 s [R] | canonical 42 s; draft 6–9 s; edit 60–80 s / 12–22 s Lightning; klein 2.5–3.7 s [R] |
| **C. Voice** | IndexTTS + Habibi + VoxCPM2 + Whisper (EN or AR); ECAPA on the CPU | ≈ 18–20 GB [R sum] | 15–33 s each, first use [R] | about 1–5 s per line warm [E]; ASR 6 s of speech in 1.2 s [R] |
| **D. Video** | an H3 FL2VA *or* Ref2VA DiT (+ staged TE, VAEs, LoRA), alone | 22–32 GB [R] | 50–80 s (cold minus warm, E4a/E4b vs E4c) [R] | 5 s clip 69–76 s (Ref2VA 4-step); 124–186 s with a load or 12 steps [R] |
| **E. Music** | ACE-Step XL + LMs + Demucs (or Music 3) | ≤ 20 GB [E] | about 30 s [E] | 90 s song in 34 s + about 30 s of stems [R] |

**Rules:**

1. **Phase batching.** A production runs A → B → C → D → E, with jobs batched inside each family: one swap per phase,
   not per job.
2. **No co-residence across families, except CPU work.** ECAPA, the framing check, ffmpeg and the take-gate ASR (CPU
   int8, 24 threads; target ≤ 0.5× real time, verify in §5.9) run during D, so video never waits for an audio swap.
3. **VLM checks are batched.** An image batch's vision QA runs as one Gemma load after B. In-loop guards stay on the CPU
   or in the graph (the framing check, Qwen3.5-4B in klein's graph).
4. **Video is exclusive.**
   - Before D, the lease unloads B and C and makes the speech services release host RAM (or restarts them).
   - Every FL2VA ↔ Ref2VA switch calls `/free` first.
   - Shots are ordered by checkpoint: all Ref2VA shots, then the reference-free FL2VA ones.
5. **Host RAM.** With `memory=80GB`, the staged H3 TE (≈ 16 GB) and the DiT page cache (≈ 21 GB) fit beside one idle
   service family. Without it, keep "free everything before D".
6. **Expected GPU time** for a 10-shot, 60 s short [E from R]: about 45–55 min.

   | Phase | Work | Time |
   |---|---|---|
   | A | planning | about 5 min |
   | B | 6 characters + 3 plates + 10 frames | 15–20 min |
   | C | voices | about 5 min |
   | D | 10 clips + 2 switches | 15–20 min |
   | E | music | about 2 min |

## 5. Test plan (a later phase; generation stays paused)

**Common rules for every test:**

- Seeds 970007 and 970008; one cold run, then warm runs.
- Record the engine time and the card peak (nvidia-smi every 200 ms), using the studio's own builders.
- Store results in `docs/evidence/model-stack-2026-10/`.
- Arms are blind-labelled. One reviewer for everything, plus **two native Baghdadi listeners** for Arabic.

**5.1 Characters: cartoon, anime, realistic (T2I canonical).** Arms: 2512 (shipping) vs Qwen-Image-2.1 (eval).

| ID | Style | Prompt (shipping order: medium, framing, identity) |
|---|---|---|
| C1 | Cartoon | "A stylized 3D animated feature-film character (CG render). Front view, full body from head to feet, neutral standing pose, plain light-grey background. A Baghdadi kite-maker, a man of about 70, thin, white stubble, kind deep-set eyes, patchwork waistcoat of large coloured squares over a grey dishdasha, brown leather sandals, red kite string wound on his right wrist." |
| C2 | Anime | "A 2D anime character, cel-shaded, clean line art, flat colours. Front view, full body, neutral pose, plain background. A 17-year-old courier girl, short black bob, amber eyes, yellow rain jacket, navy shorts over black leggings, red sneakers, messenger bag strap across her left shoulder." |
| C3 | Realistic | "A photograph, 85 mm, soft studio light. Front view, full body, neutral pose, seamless grey backdrop. A 34-year-old Iraqi pharmacist woman, petite, olive skin, greying hair in a low bun, thin gold glasses, white coat over a burgundy blouse, name badge on the left chest, steel watch on the left wrist." |

- **Pass, every arm:**
  - framing check 12/12
  - medium right 12/12 (Gemma 3-way classification, confirmed by eye)
  - identity tokens ≥ 95 %
  - one-sided details ≥ 17/26 (the repo baseline)
  - 0 major anatomy errors
  - finish ≥ 4.5/5
- **Replacement rule:** 2.1 replaces 2512 only with finish +0.25, no gate worse, and a signed licence.

**5.2 Reference-based creation and identity fidelity.**

- **Uploads (≥ 10):** a head shot, a bust and a waist-up photo, a full-length photo, two drawings, an anime still, and
  one consenting real person.
- **Arms:** klein 4B (shipping) vs Qwen-Image-2.1 multi-reference.
- **Pass:**
  - whole figure ≥ 95 %
  - 0 invented attributes
  - realistic SFace ≥ 0.60 on every redraw
  - anime CCIP no worse than 0.028
  - eye likeness ≥ 3.50

**5.3 Editing and canonical locations.**

- **L1** (master plate): "Al-Mutanabbi Street book market, Baghdad, early morning, empty of people, wide establishing
  shot, eye level, stalls of books under arcades, warm low sun."
- **L2** (Edit-2511, plate as image1): "reverse angle from the far end" · "close view of one book stall" · "same street
  at dusk with lamps lit".
- **E1:** "Place the kite-maker (image2) at the second stall of the market (image1), three-quarter view, holding a red
  kite, morning light". Repeat for C2 and C3.
- **Pass:**
  - landmarks kept in 3/3 views (arcade rhythm, signage)
  - SFace vs canonical ≥ 0.50 (realistic)
  - garments 100 % by checklist
  - no duplicate person
  - ≤ 1 minor anatomy error per 12 frames

**5.4 Posters.**

- **P1** (2512): "Vertical film poster key art, the kite-maker on a Baghdad rooftop at dusk releasing a red kite, the
  courier girl looking up beside him, space for a title at the top, cinematic lighting". Then typeset "THE KITE MAKER"
  and «صانع الطائرات الورقية».
- **P2:** P1 + "title text 'THE KITE MAKER' in large serif capitals".
- **Pass:**
  - P1 cast matches canon (eye; SFace ≥ 0.5 for realistic)
  - a free title area ≥ 20 % of the height
  - P2: OCR exact match in ≥ 3/4 seeds, which decides whether in-model English titles are allowed. Arabic is always
    typeset.

**5.5 Anatomy and style stress.** 6 poses × 3 styles × 2 seeds:

- hands holding a tea glass
- crossed arms
- sitting cross-legged
- a handshake
- running mid-stride
- a child on a parent's shoulders

**Pass:** fingers and limbs right in ≥ 34/36 (by eye, with Gemma flags as a pre-filter); style right in ≥ 35/36.

**5.6 LLM and VLM.**

- **L1:** 50 structured calls (scene plan, shot list, `<d>` dialogue). **Pass:** schema-valid without repair ≥ 96 %,
  with repair 100 %; log the median latency.
- **L2:** 30 Baghdadi dialogue lines from Gemma 4 and from the hosted model, rated blind 1–5 for dialect by the native
  raters. **Pass:** Gemma's mean ≥ 4.0 and within 0.3 of the hosted model.
- **L3:** 40 images with seeded errors (an extra finger, a wrong garment colour, a wrong medium). **Pass:** recall
  ≥ 0.8 and precision ≥ 0.7. If Gemma fails, run Qwen3.6-27B (about 17 GB [E], downloaded only then).

**5.7 Voices.** The same authorised reference for each arm.

| Set | Arms | Lines |
|---|---|---|
| English | IndexTTS 2.5 vs VoxCPM2 | E1 "I told you we'd make it before the storm." (calm); E2 the same line, angry; E3 "Don't go. Please... not tonight." (sad); E4 a 12 s monologue |
| Iraqi | Habibi IRQ with emotion-tagged references | I1 «شلونك حبيبي، شخبارك؟»; I2 «باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.»; I3 «لا تحچي وياي هيچ!» (angry); I4 «والله ماكو شي، بس تعبان شوية.» (tired); I5 a 10 s line with «اثنعش» and a name |

**Pass:**

- dialect-folded CER ≤ 0.10 EN and ≤ 0.15 IRQ (with the dialectal ASR)
- ECAPA vs reference ≥ 0.70, and between lines ≥ 0.80
- −23…−16 LUFS, ≤ −1 dBTP, 0 clipped samples
- native listeners: authenticity ≥ 4 and same-voice ≥ 4 on ≥ 80 % of lines; emotion recognised in ≥ 3/4

**5.8 Video (MiniMax only).**

- **V1:** Ref2VA with the C3 canonical image, the L1 plate and an opening frame; 5 s; an English line; 4-step (the
  E4b baseline).
- **V2:** V1 with an Iraqi `<d>[Arabic] …</d>` line.
- **V3:** the 4-step-768p FL2V LoRA vs the 8-step one.
- **V4:** a continuation with a 22-frame + audio guide.
- **V5:** hosted H3 at 768P plus a 2K regeneration of V1, if a key exists.
- **Pass:**
  - line CER ≤ 0.10 EN and ≤ 0.20 IRQ
  - SFace(frame 110, canonical) ≥ 0.50
  - join PSNR ≥ the intra-shot 5th percentile
  - no ghosting
  - record the ECAPA of H3's own voice vs the character reference (this feeds MINIMAX-CONTINUITY finding 9)

**5.9 ASR.**

- **Clips:** 40 authorised real Iraqi clips, 40 synthetic lines and 20 English clips.
- **Pass:**
  - dialectal-v2 folded CER ≤ 0.8 × large-v3's on Iraqi
  - no English regression (English stays on large-v3)
  - log the CPU int8 real-time factor for the D-phase take gate

## 6. Not verified, open points

- **Benchmarks:** arena Elo is crowd preference and drifts, and Mizan's generation axis is unpublished. Neither
  replaces §5.
- **Qwen-Image-2.1:**
  - VRAM and speed on this card are unknown.
  - ComfyUI v0.38.1 support is claimed, not checked against `/object_info`.
  - Production use needs an agreement.
- **Gemma 4 31B on this card:** speed, KV size and the Ollama variables are unmeasured.
- **Hosted MiniMax:** H3-Max Turbo is a preview, and hosted continuation and audio-copy behaviour are undocumented.
  The repo's key status was not inspected.
- **Untested hypotheses:** whether H3 speaks Iraqi dialect, and Habibi emotion via references. The Habibi female-voice
  weakness (suite WER 0.46) is still open.
- **Keep dated copies of:**
  - the H3 and Music 3 licences
  - the Habibi README (per-dialect Apache grant vs the repo-wide NC tag)
  - the bilibili licence ("may not improve other models")

## Sources (fetched 2026-10-04 unless marked)

- **MiniMax H3:**
  - [MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)
  - [Comfy-Org file listing](https://huggingface.co/api/models/Comfy-Org/MiniMax-H3/tree/main?recursive=true)
  - [Comfy-Org README](https://huggingface.co/Comfy-Org/MiniMax-H3/raw/main/README.md)
  - [video guide](https://platform.minimax.io/docs/guides/video-generation)
  - [models](https://platform.minimax.io/docs/guides/models-intro)
  - [H3 launch](https://comfyui-wiki.com/en/news/2026-08-03-minimax-h3-open-weights-comfyui)
  - [H3-Max](https://comfyui-wiki.com/en/news/2026-09-05-minimax-h3-max-comfyui)
  - [licence resale](https://comfyui-wiki.com/en/news/2026-08-30-comfy-minimax-license)
  - [RITS on the licence](https://rits.shanghai.nyu.edu/ai/minimax-ships-h3-weights-with-the-us-and-eu-excluded/)
  - [open vs API-only](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k)
  - [pruned/AdaLN quant card](https://huggingface.co/DmitryDB/MiniMax-H3-INT8-Lean-ConvRot)
  - [docs.comfy.org H3](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
- **Image:**
  - [flux2](https://github.com/black-forest-labs/flux2)
  - [flux](https://github.com/black-forest-labs/flux) (licences in FLUX-VS-QWEN.md, 2026-10-03)
  - [FLUX.2-dev](https://huggingface.co/black-forest-labs/FLUX.2-dev)
  - [Qwen-Image](https://github.com/QwenLM/Qwen-Image)
  - [Qwen-Image-2.1](https://github.com/QwenLM/Qwen-Image-2.1) and its [LICENSE](https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE)
  - [Comfy-Org/Qwen-Image-2.1 listing](https://huggingface.co/api/models/Comfy-Org/Qwen-Image-2.1/tree/main?recursive=true)
  - [AA T2I arena](https://artificialanalysis.ai/text-to-image/arena/leaderboard-text)
  - [AA editing arena](https://artificialanalysis.ai/text-to-image/arena/leaderboard-image)
  - [NVIDIA FLUX.2 on RTX](https://blogs.nvidia.com/blog/rtx-ai-garage-flux-2-comfyui)
  - [RunPod FLUX.2](https://www.runpod.io/articles/guides/deploying-flux-2)
  - [Ideogram 4 (secondary)](https://noqta.tn/en/news/ideogram-4-open-weight-image-model-design-2026)
  - [Cosmos3-Super](https://huggingface.co/nvidia/Cosmos3-Super)
- **LLM:**
  - [Mizan](https://arxiv.org/html/2609.13980)
  - [gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it)
  - [Gemma docs](https://ai.google.dev/gemma/docs/core)
  - [Ollama gemma4 tags](https://ollama.com/library/gemma4/tags)
  - [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B)
  - [Ollama 2026 release notes (secondary)](https://fazm.ai/t/ollama-release-notes-2026)
- **Voice and ASR:**
  - [IndexTTS-2.5](https://huggingface.co/IndexTeam/IndexTTS-2.5)
  - [Habibi-TTS](https://github.com/SWivid/Habibi-TTS)
  - [Habibi paper](https://arxiv.org/abs/2601.13802) (via VOICE-IDENTITY-V2, 2026-10-03)
  - [VoxCPM2](https://huggingface.co/openbmb/VoxCPM2)
  - [whisper dialectal v2](https://huggingface.co/oddadmix/whisper-large-v3-arabic-dialectal-v2)
  - [qwen3-asr dialectal](https://friendli.ai/models/oddadmix/qwen3-asr-0.6b-arabic-dialectal-v2)
  - [NAMAA Saudi TTS (secondary)](https://tts.ai/voices/saudi-tts/)
- **Music:**
  - [ACE-Step 1.5 XL](https://blog.comfy.org/p/ace-step-15-xl-commercial-grade-music)
  - [Music 3 licence (RITS)](https://rits.shanghai.nyu.edu/ai/minimax-opens-music-3-0-weights-no-territorial-carve-out-this-time/)
- **Infrastructure:** [.wslconfig defaults](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- **Repo evidence:**
  - `docs/MODELS.md`
  - `docs/research/{FLUX-VS-QWEN,MINIMAX-API,MINIMAX-CONTINUITY,LOCAL-ENGINES,VOICE-STACK,VOICE-IDENTITY-V2}.md`
  - `docs/evidence/{flux-vs-qwen,minimax-p1,voice-design}`
  - `docker/models/manifest.json`, `compose.yaml`

# Model stack, October 2026: inventory, research, one recommendation

AI Research Lead, 2026-10-04. Read-only inventory of the repo plus web research. No container was started or
stopped, no weights were downloaded, and no generation was run. The quality tests in §5 belong to a later phase.

**Evidence labels** (used on every number below):

- **[V]**: verified today (2026-10-04) from a primary source: the model card, the vendor repo or docs, the licence
  file, or a Hugging Face file listing.
- **[R]**: measured on this RTX 5090 and recorded in the repo. The file is cited.
- **[C]**: a claim from a secondary source (a blog, a community quant card, a press article) or an unaudited vendor
  marketing claim.
- **[E]**: my own estimate. Not measured.

**Policy constraints applied:**

- MiniMax is the only video engine. No other video model is considered.
- "Commercial" means running the model inside a paid product (the definition in `FLUX-VS-QWEN.md` §1).
- Licences that forbid that use are marked **NC**. An NC model can be evaluated where its licence allows evaluation.
  It cannot ship without a purchased licence.

## 0. Decision in one page

| Capability | Choice | Change vs today | Licence | New download |
|---|---|---|---|---|
| Image generation (T2I, canonical character from text) | **Qwen-Image-2512** fp8 + Lightning draft | keep | Apache-2.0 | 0 |
| Image editing, shot frames, location views | **Qwen-Image-Edit-2511** fp8mixed | keep | Apache-2.0 | 0 |
| Reference-based identity (canonical from an upload) | **FLUX.2 [klein] 4B distilled** + MediaPipe face + Qwen3.5-4B read | keep (A/B-proven) | Apache-2.0 | 0 |
| Location plates | **Qwen-Image-2512** master plate, then **Edit-2511** views | keep | Apache-2.0 | 0 |
| Posters | **Qwen-Image-2512** key art (no text), then typeset titles in post | new workflow, no new model | Apache-2.0 | 0 |
| VLM / vision checks | **Gemma 4 31B-it** (QAT Q4, Ollama) for QA. Qwen3.5-4B stays inside the upload-read graph | new | Apache-2.0 | 19 GB |
| LLM for story planning (local) | **Gemma 4 31B-it** replaces `qwen3:14b` | change | Apache-2.0 | (same 19 GB) |
| LLM (hosted) | Anthropic (configured `ANTHROPIC_MODEL`), then MiniMax-M3 | keep | API terms | 0 |
| Video | **MiniMax H3 local** (pruned int8 FL2VA + Ref2VA, nvfp4 TE, turbo LoRAs) for drafts and dailies. **Hosted MiniMax-H3** for finals (2K regeneration, H3-Max) when a key exists | keep; optional 4-step FL2V LoRA A/B | H3 Community Licence / API terms | 0 (+2.0 GB optional) |
| ASR (EN) | faster-whisper large-v3 | keep | MIT | 0 |
| ASR (Iraqi Arabic) | **whisper-large-v3-arabic-dialectal-v2** converted to CTranslate2 | new | Apache-2.0 | 6.2 GB |
| TTS English | **IndexTTS 2.5**, with **VoxCPM2** controllable cloning as the A/B challenger (already on disk) | keep + A/B | bilibili Model Use Licence / Apache-2.0 | 0 |
| TTS Iraqi Arabic | **Habibi-TTS IRQ** (specialised), with emotion-tagged authorised references | keep | Apache-2.0 (IRQ weights) | 0 |
| Voice design | **VoxCPM2** (EN, MSA only. Iraqi is never designed) | keep | Apache-2.0 | 0 |
| Music / song | **ACE-Step 1.5 XL turbo** primary, **MiniMax Music 3** (open, int8) second | keep | MIT / MiniMax-Music3 Community | 0 |
| *Licence-gated upgrade* | **Qwen-Image-2.1** (best open image model on both arenas): evaluate only | evaluation group, not default | **Qwen Research Licence (NC)** | 17.3 GB (eval) |

**Downloads:**

- **Required:** ≈ **25.2 GB**. This is about 1.4 h at 5 MB/s.
- **With the evaluation set:** ≈ **44.4 GB**. This is about 2.5 h.

Everything else is already on the `models` volume. The evidence is `docs/MODELS.md` and the manifest. The music engines
are marked VERIFIED in `IMPLEMENTATION-CHECKLIST.md` row 3.4.

**Two infrastructure findings matter more than any model swap:**

1. **The WSL2 VM only sees about 47 GB of the 95 GB RAM.** There is no `%UserProfile%\.wslconfig`, and WSL2's default
   is "50% of total memory on Windows" [V, Microsoft Learn]. The H3 run was OOM-killed when switching from FL2VA to
   Ref2VA while the speech services held about 21 GB of host RAM after their GPU unload [R, `docs/evidence/minimax-p1/README.md`].
   Staged loading and offloading depend on host RAM, so this ceiling caps every plan below.
   - **Producer action:** set `memory=80GB` and `swap=32GB` in `.wslconfig`, then run `wsl --shutdown`.
2. **The speech services' `/unload` frees VRAM but keeps the weights in host RAM** [R, same file]. They should release
   host RAM too, or be restarted by the lease before a video batch.

## 1. Inventory: what is installed and configured today (read-only)

Sources read:

- `compose.yaml`, `docker/*/Dockerfile`, `docker/models/manifest.json`
- `.env.example` (variable names only. `.env` and `.env.local` were not opened)
- `src/server/env.ts` and `src/server/providers/*`, `src/server/workflows/*`
- `docs/MODELS.md` and `docs/research/*`
- `docs/evidence/{flux-vs-qwen,minimax-p1,voice-design}`

ComfyUI graphs are TypeScript builders (`src/server/workflows/*.ts`), not JSON files. The only graph JSONs in the repo
are the `docs/evidence/minimax-p1/*.graph.json` experiment records.

| Capability | Current model | Files / size | Quant | Runs in | VRAM (card total) | Evidence |
|---|---|---|---|---|---|---|
| Image generation | Qwen-Image-2512 (20B MMDiT) + Lightning 8-step LoRA for drafts | DiT 20.43 GB, TE Qwen2.5-VL-7B 9.38 GB, VAE 0.25 GB, LoRA 0.85 GB | fp8 e4m3fn / fp8 scaled | `comfyui` (v0.38.1, torch 2.13 cu130) | 29.6–31.7 GB with both Qwen DiTs + TE resident. Canonical image 42 s warm (30 steps), draft 6–9 s | [R] MODELS.md VRAM table; manifest `images-qwen` |
| Image editing | Qwen-Image-Edit-2511 + Lightning 4-step | DiT 20.53 GB (+ shared TE/VAE), LoRA 0.85 GB | fp8mixed | `comfyui` | ≤ 31.9 GB. 60–80 s quality, 12–22 s Lightning | [R] MODELS.md, `docs/evidence/image-v2/d13` |
| Reference identity | FLUX.2 [klein] 4B distilled + Qwen3-4B TE. Face crop by MediaPipe. Upload read by Qwen3.5-4B (`TextGenerate`) | 7.75 + 8.04 + 0.34 GB. MediaPipe 5.4 MB. Qwen3.5-4B 9.32 GB | bf16 | `comfyui` | ≈ 22 GB. 3.7 s / 2.5 s warm | [R] FLUX-VS-QWEN.md §5 (whole figure 24/24 vs Qwen-Edit 17/24) |
| Location plates | Qwen-Image-2512 master plate. Edit-2511 views (≤ 3 refs) | as above | fp8 | `comfyui` | as above | [R] MODELS.md, `docs/evidence/location-views` |
| Posters | **none generated**: `makeFramePoster` crops a 2:3 window of the best frame, with no text | — | — | worker (ffmpeg) | — | `src/server/media/thumbs.ts:128` |
| VLM / vision checks | Qwen3.5-4B reads uploads only. No automated QA of anatomy, style or identity. Framing is checked by a CPU flood fill | 9.32 GB | bf16 | `comfyui` | shares the image family | `src/server/media/figure-check.ts`, `image-check.ts` (no face model on the CPU) |
| Video (local) | MiniMax H3 open weights: FL2VA + Ref2VA pruned int8_convrot DiTs, Qwen3-VL-32B nvfp4_awq TE, video VAE int8, audio VAE fp32, turbo LoRAs (FL2V 8-step, Ref2V 4-step) | 2 × 20.97 GB + 15.69 + 2.81 + 0.61 + 2 × 1.96 GB | int8 / nvfp4 | `comfyui` | 22–32 GB while generating. 5 s at 1280×736: 69–76 s warm Ref2VA 4-step, 124–186 s with loads or 12 steps | [R] MODELS.md, `docs/evidence/minimax-p1/README.md` |
| Video (hosted) | `MiniMax-H3` via `/v2/video_generation` (`MINIMAX_VIDEO_MODEL`, 768P default) | — | — | API | — | `src/server/providers/minimax.ts`, `video.ts`. `VIDEO_BACKEND=auto` picks the API when a key is set (key status not inspected) |
| LLM (story) | hosted `MiniMax-M3` or Anthropic `claude-sonnet-5-5`. Local `qwen3:14b` on `ollama/ollama:0.12.3` | 10 GB | Q4 | `llm` | 10 GB, about 17 s median per structured answer | [R] MODELS.md. `compose.yaml` x-app-env |
| ASR | faster-whisper large-v3 (+ Demucs htdemucs for stems) | ≈ 3.1 GB | fp16 (CT2) | `asr` | ≈ 3.7 GB (+2.3 GB Demucs) | [R] MODELS.md |
| TTS English (+ MSA, mixed) | IndexTTS 2.5 (about 0.8B GPT backbone + s2mel + BigVGAN + w2v-bert) | fetched by the entrypoint (`IndexTeam/IndexTTS-2.5`) | bf16 | `tts` (torch 2.8 cu128) | ≈ 6 GB loaded | [R] MODELS.md, `docker/tts/entrypoint.sh` |
| TTS Iraqi Arabic | Habibi-TTS Specialized/IRQ (F5-TTS DiT + Vocos) | `model_100000.safetensors` + vocab | fp32/bf16 | `tts-habibi` | ≈ 1 GB above the baseline after one line | [R] MODELS.md. Suite WER 0.37 (`docs/evidence/iraqi-suite.md`) |
| Voice design | VoxCPM2 (2B) + ECAPA (CPU) | 4.96 GB + 89 MB | bf16 | `tts-design` | 5.2 GB allocated / ≈ 7 GB of the card | [R] MODELS.md, `docs/evidence/voice-design/report.json` |
| Music / song | ACE-Step 1.5 XL turbo (4B DiT) + 0.6B/1.7B LMs. MiniMax Music 3 int8. Hosted `music-3.0` | 9.97 + 3.71 + 1.19 + 0.34 GB. 2.50 + 9.20 + 0.22 GB | bf16 / int8 | `comfyui` | not recorded. 90 s song in 34 s (ACE). 48 s in 103 s (Music 3) | [R] IMPLEMENTATION-CHECKLIST 3.4 |

**What "MiniMax-H3 (open weights)" in this repo actually is** [V]:

- MiniMax published **MiniMaxAI/MiniMax-H3** on 2026-08-03. It is a 33B dense single-stream transformer (about 13B in
  AdaLN branches) with two checkpoints:
  - **H3-Base-FL2VA**: text, first frame and/or last frame
  - **H3-Base-Ref2VA**: up to 9 images, 3 videos and 3 audio clips, 12 files in total
  - Output: 4–15 s, 768p short edge, 24 fps, 32 kHz stereo, 11 languages including Arabic.
- H3-Context-IR and H3-Regenerate-2K remain **API-only** [C, dev.to / NYU-Shanghai RITS].
- The repo uses Comfy-Org's ComfyUI repack. The `pruned` files replace the AdaLN modulation network with a
  precomputed time table. A community quant card reports end-to-end AdaLN relative error of about 3–4·10⁻⁷ [C].
  - The pruned bf16 file is 40.2 GB against 66.3 GB for full bf16 [V, HF listing].
  - The pruned int8 file is therefore not a "small variant": it is the full model, numerically.
- **Licence: MiniMax H3 Community Licence.** Commercial use is free below US$20M a year, with "MiniMax H3" attribution.
  The **EU, UK, South Korea and USA are excluded** from the open licence [V, model card. C, press].
  - Comfy has resold MiniMax H3 commercial licences since 2026-08-30 [C].
  - Before any release in an excluded territory, or above the cap, the producer needs that licence.

## 2. Research: current options (verified 2026-10-04)

### 2.1 Image: FLUX vs Qwen, and the new entrants

| Model | Size | Licence (model use) | ComfyUI | Fits 32 GB | Reference / multi-image | Arena (AA, 2026-10-04) [V] |
|---|---|---|---|---|---|---|
| **Qwen-Image-2512** | 20B DiT + 7B VL TE | **Apache-2.0** [V] | core | fp8, measured [R] | none (T2I) | T2I 999 (#43) |
| **Qwen-Image-Edit-2511** | 20B + 7B | **Apache-2.0** [V] | core, image1..3 | fp8, measured [R] | 1–3 pictures in core | Edit 1021 (#34) |
| **FLUX.2 [klein] 4B** distilled | 4B + Qwen3-4B | **Apache-2.0** [V] | core | ≈ 22 GB card [R] | multi-reference | T2I 863, Edit 948 |
| FLUX.2 [klein] 9B / 9B KV | 9B | **NC** (FLUX Non-Commercial) [V] | core | yes | multi-reference | T2I 941, Edit 1013 |
| FLUX.2 [dev] | 32B + Mistral-24B TE | **NC**. Paid BFL self-hosted licence [V] | core | fp8 about 32 GB DiT alone, so it needs weight streaming [C, NVIDIA/RunPod] | multi-reference | T2I 1000, Edit 1000 |
| FLUX.1 [dev] / Kontext [dev] / Krea [dev] | 12B | **NC** [V, repo §1] | core | yes | Kontext: 1 image | T2I 841 / Edit 858 |
| FLUX.1 [schnell] | 12B | Apache-2.0 [V] | core | yes | none | T2I 803 |
| **Qwen-Image-2.1** (2026-09-20) | **7B DiT** + Qwen3-VL-8B TE | **Qwen Research Licence: "research or evaluation purposes only"**. Commercial use needs a separate licence [V, LICENSE] | day-0, `Comfy-Org/Qwen-Image-2.1` [V] | int8 DiT 7.26 GB + TE int8 9.35 GB: easily | **up to 10 references**, RGBA output, masked regional edits [V] | **T2I 1036 (#18), Edit 1073 (#18): the best open-weights model on both** |
| Ideogram 4.0 | 9.3B | **NC** weights [C] | day-0 [C] | nf4 / fp8 [C] | — | T2I 1011 |
| HunyuanImage 3.0 Instruct | 80B MoE | Tencent community (territory exclusions) [C] | — | no (needs heavy offload) | yes | Edit 1066 |
| Cosmos3-Super-Text2Image | 64.6B | OpenMDW 1.1 [C] | — | INT4 ≈ 35 GB [C]: no | — | T2I 987–995 |

**Reading:**

- **Among commercially usable open weights, the shipping Qwen pair is still the strongest.**
  - For text-to-image, Qwen-Image-2512 ties FLUX.2 [dev] on the arena (999 vs 1000). FLUX.2 [dev] is NC and twice the size.
  - Edit-2511 beats FLUX.2 [dev] and klein 9B on editing.
- The only open model clearly above them is **Qwen-Image-2.1**, and it is NC.
  - Its licence explicitly allows evaluation, so it can be A/B-tested here.
  - Shipping it needs a commercial agreement (model-business@notice.qwencloud.com).
  - It is also the only open model with 10-reference editing, which fits the canonical character + plate + frame
    workflow better than Edit-2511's 3 references.
- **Anatomy and identity:**
  - The repo's own A/B (FLUX-VS-QWEN.md) found no major anatomy errors in 12 Qwen T2I pictures.
  - klein 4B drew a whole figure from an upload 24/24, against Qwen-Edit 17/24. Realistic SFace was 0.62–0.85.
  - A community report says "Klein 4B struggles to preserve the pose" in editing [C]. That is why klein is limited
    to the canonical redraw.
  - No independent anatomy benchmark was found for any of these models. Anatomy stays a test item (§5).
- **Arabic typography:**
  - No open model documents Arabic text rendering.
  - Posters therefore keep the title out of the diffusion model: generate key art, then typeset EN and AR titles.

### 2.2 MiniMax video: hosted vs local

| | Hosted `MiniMax-H3` | Hosted `MiniMax-H3-Max` / Max Turbo | Local H3 (open weights, ComfyUI) |
|---|---|---|---|
| Status | current [V platform docs] | current. Released 2026-09-02 with fal.ai. Turbo is a preview [V docs. C press] | released 2026-08-03 [V] |
| Duration | 4–15 s | 5–15 s | 4–15 s. Trained about 124–362 frames (5.2–15 s) [R, node tooltip] |
| Resolution | 768P, **2K** | 480P, 768P | 768p short edge (1344×768 at 16:9). **No 2K**: Regenerate-2K is API-only |
| First / last frame | yes / yes | yes / yes | yes (FL2VA). Also AddGuide anchors at any frame |
| Subject reference | `reference_image` ≤ 9, `reference_video` ≤ 3, `reference_audio` ≤ 3. Cannot be mixed with frame roles | reference generation [V docs] | Ref2VA with images, videos and audio **combined with guides** (official multiframe template) [R, MINIMAX-CONTINUITY §1] |
| Continuation / extension | **no extension endpoint.** Last frame as first frame, or a `reference_video` (context only). `/v2/video_generation/regeneration` → 2K | same | **AddGuide with the previous 22 frames (+ audio)**. Measured join PSNR 37.6 dB [R, C1]. Frames-only when the new shot is silent |
| Native audio / dialogue | yes, `<d>` tags, 11 languages incl. Arabic | yes | yes. Arabic in the language list. **Iraqi dialect not claimed** |
| Price / time | $0.08/s 768P, $0.13/s 2K | $0.05/s 480P, $0.08/s 768P | electricity. 69–186 s per 5 s clip [R] |
| Licence | API terms | API terms | H3 Community Licence (territory and US$20M limits) |

**Verdict:**

- **Local H3 is the default engine.** It is free per take and has the richer continuity toolkit (guides plus references
  in one request).
- **Hosted H3 is the finishing path** for 2K and for throughput when a key exists. The ShotPack is lowered per backend,
  as already designed in MINIMAX-CONTINUITY §3.8.
- No other video weights are considered, by policy.
- **Optional:** A/B the newer `fl2v_turbo_4step_v1.0_768p` LoRA (1.96 GB [V, HF listing]) against the 8-step LoRA.
- The unpruned int8 DiTs (34.0 GB each) are **not** recommended. Pruning is numerically lossless per the quant card,
  and the unpruned files would force weight streaming.
- The int8 Qwen3-VL-32B TE (27.1 GB) against nvfp4_awq (15.7 GB, a third-party AWQ from `cybermotaz`) is a later
  prompt-adherence A/B. It is not a download now.

### 2.3 LLMs for planning and scripting (Arabic and Iraqi)

- **Mizan** (arXiv 2609.13980, 2026-09) is a national Iraqi-Arabic benchmark: 27 systems, an MSA track and an Iraqi
  track. MSA saturates. Iraqi trails MSA by 14–18 points per model [V, paper HTML]. Iraqi-track scores:
  - Closed leaders: gemini-2.5-pro and gpt-5 **84.9**, gpt-4o 83.7.
  - Best open weights: **gemma-4-31b-it 82.4** (MSA 100), mistral-large-2512 83.7 (too large for one card),
    llama-4-maverick 83.0 (too large).
  - Dedicated Arabic models score lower: ALLaM-7B 64.7, SILMA-9B 63.2, below ministral-8b at 73.9.
  - Caveat: the **generative axes are still pending human judging**, so these numbers measure comprehension and
    extraction, not dialogue writing.
- **Gemma 4 31B-it** [V, HF card and Google docs]:
  - 30.7B dense, 256K context, text and image input, Apache-2.0, released 2026-07.
  - Google lists 17.5 GB at 4-bit and 34.9 GB at 8-bit. The Ollama tags `gemma4:31b-it-qat` and `-nvfp4` are 19 GB [V, ollama.com].
- **Qwen3.6-27B** (Apache-2.0, 2026-04, multimodal) [V] is the local challenger. It was not in Mizan's open top three
  (not verified whether it was evaluated).
- **Hosted:** keep the configured Anthropic model and MiniMax-M3. Mizan shows the closed frontier about 2–3 points
  above Gemma 4 on Iraqi comprehension. Writing quality needs the human test (§5.6).
- **Engine:** `ollama/ollama:0.12.3` predates Gemma 4. Release notes put Gemma 4 support at v0.20 (2026-04-02) [C].
  Pin a current tag and verify `gemma4` loads before switching.

### 2.4 Voice: TTS, cloning, emotion, Iraqi

| Engine | Arabic / Iraqi | Cloning, emotion | Licence | Size | Status |
|---|---|---|---|---|---|
| **IndexTTS 2.5** (2026-01-07) | Arabic is 1 of 5 languages. No dialect claim | zero-shot. 8-dim emotion vector. Speed 0.5–2 | bilibili Model Use Licence (commercial below 100M MAU) [V card. R VOICE-STACK] | ≈ 0.8B GPT | shipping |
| **Habibi-TTS IRQ** (arXiv 2601.13802) | specialised Iraqi model, 70.7 h | zero-shot from a reference + transcript. **No emotion input** | IRQ/MSA/EGY/ALG/MAR **Apache-2.0**. Unified/SAU/UAE **NC** [V, repo README] | F5 DiT | shipping |
| **VoxCPM2** (OpenBMB, 2B) | 30 languages incl. Arabic (MSA). No Arabic dialects | voice design from text, controllable cloning (style while keeping timbre), 48 kHz | Apache-2.0 [V] | ≈ 8 GB, RTF 0.30 on a 4090 [V card] | shipping (design) |
| MiniMax `speech-2.8-hd` / `-turbo` | 40 languages, `language_boost: Arabic`, no dialect values | clone from about 10 s, 7 emotions, sound tags | API | — | wired, opt-in [V platform] |
| Lahgtna OmniVoice | lists Iraqi | cloning | **NC** (Emilia base) [R VOICE-IDENTITY-V2] | 0.6B | excluded |
| NAMAA Saudi TTS (Chatterbox fine-tune) | Saudi only | cloning, emotion | MIT [C] | 0.5B | no Iraqi |
| Qwen3-TTS, CosyVoice 3, MOSS-VoiceGenerator, Maya1 | **no Arabic** | — | Apache-2.0 | — | excluded for Arabic |
| Fish/OpenAudio S1–S2, Voxtral TTS, XTTS-v2 | Arabic | — | **NC** | — | excluded |

**Iraqi evidence:**

- The Habibi paper reports paid native-speaker ratings for IRQ: dialect **DMOS 4.06**, SMOS 3.82, NMOS 3.83, against
  ElevenLabs v3 at 3.97/3.38/3.94.
- The same paper shows that synthetic Iraqi gets a *lower* ASR WER than real Iraqi speech (17.7 vs 27.2). ASR therefore
  cannot certify dialect [R, VOICE-IDENTITY-V2 §2.5, from arXiv 2601.13802].
- **No open model released since then, with a commercial licence, beats Habibi IRQ for Iraqi.** Today's searches found
  no new Iraqi-capable Apache/MIT TTS.
- No "IndexTTS 3" exists [C, searches].
- Hosted Iraqi-labelled voices: Azure `ar-IQ-Bassel/Rana`, both fixed voices [R, VOICE-IDENTITY-V2].

### 2.5 ASR for Iraqi Arabic

- **oddadmix/whisper-large-v3-arabic-dialectal-v2** [V, model card]:
  - A large-v3 fine-tune, Apache-2.0, trained on 52k clips in 13 dialects.
  - **Iraqi WER 0.254 / CER 0.068** on 200 held-out clips. Overall 0.320 WER.
  - The test set comes from the same dataset family, so this is an in-domain claim.
  - The file is `model.safetensors`, 6.17 GB (fp32).
- Qwen3-ASR-1.7B scored 0.478 Iraqi WER on the same set, and its 0.6B fine-tune 0.378 [C, friendli model page].
- Qwen3.5-Omni-Plus scored 28.5% WER on GigaSpeechBench IRQ [C, search extract]. It is API-only.
- The vanilla large-v3 Iraqi score is not published on that set. The repo's own note is that vanilla is worse
  (VOICE-STACK D5).

## 3. Recommended stack, per capability

The scheduling families are defined in §4.

### 3.1 Image generation (T2I, canonical character from text): Qwen-Image-2512 (keep)

- **Why:**
  - Best finish in the repo A/B (4.75 vs 4.25), garment fidelity, and no failures in 12.
  - Highest-ranked commercially usable open T2I model.
- **Licence:** Apache-2.0.
- **VRAM:** fp8 DiT (20.4 GB) + fp8 TE (9.4 GB), ComfyUI-managed. The TE is offloaded after encoding.
  - Measured card total: 29.6–31.7 GB.
- **Download:** 0.
- **Docker:** none.
- **Upgrade path:** Qwen-Image-2.1 (§3.10) after a licence.

### 3.2 Image editing, shot frames: Qwen-Image-Edit-2511 (keep)

- **Why:** the best Apache editing model on the arena (1021). Up to 3 references in core.
- **Licence:** Apache-2.0.
- **VRAM:** ≤ 31.9 GB [R]. It shares the TE and VAE with 2512.
  - ComfyUI must hold **one** 20 GB DiT at a time. The lease frees ComfyUI's models on a 2512 ↔ 2511 switch
    (about 19 s reload [R, cold vs warm]).
- **Download:** 0.

### 3.3 Reference-based identity: klein 4B distilled + MediaPipe + Qwen3.5-4B read (keep)

- **Why:** the measured A/B (FLUX-VS-QWEN §5):
  - 24/24 whole figure vs 17/24.
  - 0 invented attributes with the FLUX prompt.
  - 27× faster.
- **Licence:** Apache-2.0. klein 9B is better on the arena (Edit 1013) but NC.
- **VRAM:** ≈ 22 GB card [R].
- **Download:** 0.
- **Cleanup:** the klein Base file (7.75 GB) can be deleted.

### 3.4 Canonical locations: 2512 master plate, then Edit-2511 views (keep)

- **Why:** one master plate per location is the World Bible anchor. Views are edits of it, and H3 reuses the plate as
  a `<Picture k>` reference.
- **VRAM, licence, download:** as §3.1 and §3.2.

### 3.5 Posters: new workflow, no new model

- Generate 2:3 key art with Qwen-Image-2512 quality mode (no text) from the canonical images.
  - Use Edit-2511 with the canonical character and the plate as references when the cast must match.
- Typeset the EN and AR titles and credits deterministically in the worker (server-side SVG/canvas or ffmpeg
  `drawtext` with a licensed Arabic font).
- **Why:**
  - No open model documents Arabic glyph rendering.
  - A misspelled title is unacceptable in a deliverable.
  - English text rendering is a Qwen strength [V, README] and is still tested in §5.4 for English-only art.

### 3.6 VLM and vision checks: Gemma 4 31B-it (new) + Qwen3.5-4B (keep in-graph)

- **Why:**
  - Gemma 4 31B takes image input and is Apache-2.0.
  - One model serves story planning (§3.7) and QA: style classification, anatomy flags, garment checklists against
    the identity line, and poster OCR read-back. That is one download for two capabilities.
  - Qwen3.5-4B stays inside the ComfyUI upload-read graph, because it is wired, tested and co-resident with klein.
- **Licence:** Apache-2.0.
- **VRAM:** QAT Q4 19 GB + KV cache [E] (≈ 2–4 GB at 16k context with q8 KV) ≈ 22–23 GB.
- **Download:** 19 GB (`gemma4:31b-it-qat`).
- **Docker:** `llm` image bumped to a current pinned Ollama. `OPENAI_COMPATIBLE_MODEL=gemma4:31b-it-qat`.
  - Add `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_CONTEXT_LENGTH=16384`. Verify these against
    the pinned version.
  - Remove `qwen3:14b` from the volume (−9.3 GB [E]).
- **Not chosen:** Qwen3.6-27B. It is an equal-size challenger, run in §5.6 only if Gemma fails the vision gates.

### 3.7 LLM for story planning: Gemma 4 31B local; hosted Anthropic / MiniMax-M3 (keep)

- **Why:**
  - Best open model on Mizan's Iraqi track that fits one card (82.4).
  - Apache-2.0.
  - Size is no longer a constraint: the 14B is retired.
- **Hosted:** stays the first choice when a key exists. `LLM_PROVIDER=auto` already does this.
- **Staging:** the LLM runs in the *planning* phase. It shares nothing with video, so it is evicted on the lease switch
  (`OLLAMA_KEEP_ALIVE` stays 2 min).

### 3.8 Video: MiniMax H3 local (keep) + hosted H3 for finals

- **Why:**
  - Exclusive engine (policy).
  - The local pruned int8 is numerically the full 33B model.
  - Verified reference + guide combination.
  - Measured on this card.
- **Licence:** H3 Community Licence (attribution in the UI, US$20M cap, excluded territories).
  - A Comfy-resold commercial licence is needed for any release in the EU, UK, South Korea or USA.
- **VRAM, staging:**
  1. TE nvfp4 (15.7 GB) encodes.
  2. The TE is offloaded to RAM.
  3. The DiT (21 GB), VAEs and LoRA are resident.
  - Card total measured 22–32 GB.
  - Host RAM needs about 40 GB free [E], hence the `.wslconfig` fix.
  - FL2VA ↔ Ref2VA switch: free ComfyUI's models first (already in `generateVideo`).
- **Download:** 0. Optional 4-step FL2V LoRA, 1.96 GB.
- **Docker:** none. Keep `--disable-comfy-compiler` and torch cu130.

### 3.9 ASR: large-v3 (EN) + dialectal-v2 (AR) (new)

- **Why:** Iraqi CER 0.068 claimed, against a vanilla model that charges dialect spelling as errors. Apache-2.0.
- **VRAM:** ≈ 3.7 GB each in CT2 fp16 [E, same architecture as large-v3]. Load one at a time by language.
- **Download:** 6.17 GB. Convert once in a one-off container with `ct2-transformers-converter --quantization float16`
  (≈ 3.1 GB on disk [E]).
- **Docker:**
  - New manifest group `asr-whisper-ar-dialect`.
  - `asr` gets `ASR_MODEL_DIR_AR` and routes `language=ar` to it.
  - Add a CPU int8 path for take gates during video batches (§4).

### 3.10 TTS English, Iraqi, voice design (keep) + Qwen-Image-2.1 evaluation (licence-gated)

- **English: IndexTTS 2.5.** Emotion vector and duration control, measured CER 0.
  - A/B it against VoxCPM2 controllable cloning (48 kHz, already on disk) in §5.7. The winner becomes the English
    line engine. No download either way.
- **Iraqi: Habibi IRQ.**
  - It has no emotion input, so emotion comes from **emotion-tagged authorised references per voice** (neutral,
    angry, sad, happy).
  - Apply the VOICE-STACK D1/D7/D8 fixes: peak limiting, VAD-chosen reference window, pinned seed.
  - No designed Iraqi voices.
- **Voice design: VoxCPM2** (EN/MSA).
- **VRAM:** the audio family co-resides at ≈ 18–20 GB [R sum: 6 + 1–2 + 7 + 3.7].
- **Qwen-Image-2.1 (evaluation only):**
  - Manifest group `eval-qwen-image-2.1`, not in the default `MODEL_GROUPS`:
    - `qwen_image_2.1_int8_convrot` 7.26 GB
    - `qwen3vl_8b_int8_convrot` 9.35 GB
    - VAE 0.68 GB
    - Total **17.28 GB** [V, HF listing]
  - If it beats Qwen 2512 / Edit-2511 in §5 by the stated margin, the producer requests a commercial licence before
    any production use.

## 4. GPU scheduling plan for the RTX 5090 (32 GB)

**Families** (one GPU lease per family; `GPU_VRAM_BUDGET_MB=30000`):

| Family | Members that co-reside | Card total | Load (cold) | Typical latency (warm) |
|---|---|---|---|---|
| **A. Planning** | Gemma 4 31B QAT (LLM + VLM) | ≈ 22–23 GB [E] | ≈ 10–20 s from page cache [E] | structured scene plan: tens of seconds [E]. qwen3:14b measured 17 s median [R] |
| **B. Images** | one Qwen DiT (2512 *or* Edit-2511) + TE + VAE; or klein 4B + Qwen3-4B + Qwen3.5-4B read + MediaPipe | 22–31.9 GB [R] | Qwen about 19 s, klein about 8 s [R] | canonical 42 s; draft 6–9 s; edit 60–80 s quality / 12–22 s Lightning; klein 2.5–3.7 s [R] |
| **C. Voice** | IndexTTS + Habibi + VoxCPM2 + Whisper (EN or AR) on the GPU; ECAPA on the CPU | ≈ 18–20 GB [R sum] | 15–33 s each, first use [R] | one line ≈ 6–16 s incl. load; warm about 1–5 s per line [R/E]; ASR 6 s speech in 1.2 s [R] |
| **D. Video** | H3 FL2VA *or* Ref2VA DiT (+ staged TE, VAEs, LoRA). Nothing else on the GPU | 22–32 GB [R] | 50–80 s (cold − warm, E4a/E4b vs E4c) [R] | 5 s clip 69–76 s warm (Ref2VA 4-step); 124–186 s incl. load or 12 steps [R] |
| **E. Music** | ACE-Step XL + LMs + Demucs (or Music 3) | ≤ 20 GB [E] | about 30 s [E] | 90 s song in 34 s + 30 s stems [R] |

**Rules:**

1. **Phase batching:** a production runs A → B → C → D → E. Within a family, jobs are batched before the lease moves
   on. That gives one swap per phase, not per job.
2. **No co-residence across families** except the CPU workers.
   - ECAPA, figure-check, ffmpeg and the take-gate ASR (CPU int8 large-v3 or dialectal, 24 threads) run during D, so
     video never waits for an audio swap.
   - CPU take-gate throughput is about 0.3–0.5× real time [E]. Verify in §5.9.
3. **VLM checks are batched.** The vision QA of an image batch runs in A *after* B finishes, as one Gemma load per
   batch, never interleaved per image.
   - In-loop guards stay CPU or in-graph: the framing check and Qwen3.5-4B in klein's graph.
4. **Video is exclusive.**
   - Before D, the lease unloads B and C and asks the speech services to release host RAM (or restarts them).
   - FL2VA ↔ Ref2VA always calls ComfyUI `/free` first [R fix].
   - Order shots by checkpoint: all Ref2VA shots, then the FL2VA reference-free shots.
5. **Host RAM:** with `.wslconfig memory=80GB` the staged H3 TE (≈ 16 GB) and DiT page cache (≈ 21 GB) fit beside one
   idle service family. Without it, keep the current "free everything before D" rule.
6. **Expected wall time** for a 10-shot, 60 s short [E from R]:
   - A: about 5 min
   - B: about 15–20 min (6 characters + 3 plates + 10 frames)
   - C: about 5 min
   - D: about 15–20 min (10 × 5–6 s clips warm + 2 switches)
   - E: about 2 min
   - **Total about 45–55 min** of GPU time on one card.

## 5. Test plan (later phase; generation stays paused)

**Rules for every test:**

- Fixed seeds {970007, 970008}.
- Each arm runs warm after one cold run.
- Record the engine time and the card peak (nvidia-smi at 200 ms).
- Run through the studio's own builders.
- Keep the outputs in `docs/evidence/model-stack-2026-10/`.
- Use blind arm labels for human scoring.
- **One** reviewer plus **two native Baghdadi listeners** for Arabic.

### 5.1 Characters: cartoon, anime, realistic (T2I canonical)

| ID | Style | Prompt (identity line, shipping order: medium, framing, identity, style) |
|---|---|---|
| C1 | Cartoon | "A stylized 3D animated feature-film character (CG render). Front view, full body from head to feet, neutral standing pose, plain light-grey studio background. A Baghdadi kite-maker, a man of about 70, thin, white stubble, kind deep-set eyes, patchwork waistcoat of large coloured squares over a grey dishdasha, brown leather sandals, a red kite string wound on his right wrist." |
| C2 | Anime | "A 2D anime character, cel-shaded, clean line art, flat colours. Front view, full body, neutral pose, plain background. A 17-year-old courier girl, short black bob, amber eyes, yellow rain jacket, navy shorts over black leggings, red sneakers, a messenger bag strap across her left shoulder." |
| C3 | Realistic | "A photograph, 85 mm, soft studio light. Front view, full body, neutral pose, seamless grey backdrop. A 34-year-old Iraqi pharmacist woman, petite, olive skin, greying hair in a low bun, thin gold glasses, white coat over a burgundy blouse, name badge on the left chest, steel watch on the left wrist." |

**Arms:** Qwen-2512 (ship) vs Qwen-Image-2.1 (eval).

**Pass criteria:**

- Framing check 12/12.
- Medium correct 12/12 (Gemma VLM 3-way classification, confirmed by eye).
- Identity tokens ≥ 95 %.
- One-sided details ≥ 17/26 (the repo baseline).
- 0 major anatomy errors.
- Finish ≥ 4.5/5.
- **Qwen-Image-2.1 replaces a shipping model only if** it wins finish by ≥ 0.25 *and* is no worse on every gate, and
  a licence is signed.

### 5.2 Reference-based creation and identity fidelity

- **Inputs:** ≥ 10 uploads:
  - head shot, bust and waist-up photos
  - one full-length photo
  - two drawings
  - one anime still
  - one consenting real person (producer-provided)
- **Arms:** klein 4B (ship) vs Qwen-Image-2.1 multi-reference (eval).
- **Pass criteria:**
  - Whole figure ≥ 95 %.
  - 0 invented attributes.
  - Realistic SFace ≥ 0.60 on every redraw.
  - Anime→anime CCIP no worse than the baseline (0.028).
  - Eye likeness ≥ Qwen-Edit's 3.50 mean.

### 5.3 Editing and canonical locations

- **L1 master plate:** "Al-Mutanabbi Street book market, Baghdad, early morning, empty of people, wide establishing
  shot, eye level, stalls of books under arcades, warm low sun."
- **L2 views (Edit-2511, plate as image1):**
  - "reverse angle from the far end"
  - "close view of one book stall"
  - "same street at dusk with lamps lit"
- **E1:** "Place the kite-maker (image2) standing at the second stall of the market (image1), three-quarter view,
  holding a red kite, morning light". Then the same with C2 and C3.
- **Pass criteria:**
  - Architecture landmarks kept in 3/3 views (arcade rhythm, signage positions; by eye + Gemma checklist).
  - The character's SFace vs canonical ≥ 0.50 (realistic) and garments 100 % by checklist.
  - No duplicate person.
  - Anatomy: ≤ 1 minor error per 12 frames.

### 5.4 Posters

- **P1** (key art, Qwen-2512): "Vertical film poster key art, the kite-maker on a Baghdad rooftop at dusk releasing a
  red kite, the courier girl looking up beside him, space for a title at the top, cinematic lighting."
  - Generate with **no text**, then typeset "THE KITE MAKER" / «صانع الطائرات الورقية» in post.
- **P2** (English in-model text control): the same prompt with "title text 'THE KITE MAKER' in large serif capitals".
- **Pass criteria:**
  - P1 cast identity matches the canonical images (eye + SFace ≥ 0.5 for realistic).
  - Free title area ≥ 20 % of the height.
  - P2 OCR exact-match title in ≥ 3/4 seeds. This tells whether in-model English titles are usable. Arabic stays
    typeset in all cases.

### 5.5 Anatomy and style stress

Six prompts × 3 styles × 2 seeds:

- hands holding a tea glass
- crossed arms
- sitting cross-legged
- two people shaking hands
- running mid-stride
- a child on a parent's shoulders

**Pass criteria:**

- ≥ 34/36 with correct finger count and limb count (eye; Gemma flags as a pre-filter).
- Style adherence ≥ 35/36 by the Gemma 3-way classifier, confirmed by eye.

### 5.6 LLM (planning, Iraqi writing) and VLM gates

- **L1:** 50 structured calls (scene plan JSON, shot list, `<d>` dialogue) on 3 premises.
  - Pass: JSON schema valid without repair ≥ 96 %, with repair 100 %; median latency logged.
- **L2:** 30 dialogue lines in Iraqi Baghdadi, from Gemma 4 vs the hosted model.
  - Native raters score dialect authenticity 1–5 (blind).
  - Pass: Gemma mean ≥ 4.0 and within 0.3 of the hosted model.
- **L3:** 40 images (§5.1/5.5) with seeded errors (an extra finger, a wrong garment colour, a wrong medium).
  - Pass for Gemma: recall ≥ 0.8 on seeded errors and precision ≥ 0.7.
  - Otherwise run the same set on Qwen3.6-27B. Download only if needed: about 17 GB [E].

### 5.7 Voices: English and Iraqi Arabic

**English** (IndexTTS 2.5 vs VoxCPM2 cloning, the same authorised reference):

- E1 "I told you we'd make it before the storm." (calm)
- E2 the same line, angry
- E3 "Don't go. Please... not tonight." (sad)
- E4 a 12 s monologue

**Iraqi** (Habibi IRQ with emotion-tagged references):

- I1 «شلونك حبيبي، شخبارك؟»
- I2 «باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.»
- I3 «لا تحچي وياي هيچ!» (angry)
- I4 «والله ماكو شي، بس تعبان شوية.» (tired)
- I5 a 10 s line with numbers («اثنعش») and a name

**Measures:**

- CER after the dialect fold (VOICE-STACK §4.4): ≤ 0.10 EN, ≤ 0.15 IRQ (dialectal ASR).
- ECAPA vs reference ≥ 0.70, and between lines ≥ 0.80.
- −23…−16 LUFS, ≤ −1 dBTP, 0 clipped samples.
- **Native listeners:** authenticity ≥ 4 and same-voice ≥ 4 on ≥ 80 % of lines. Emotion is recognised correctly in ≥ 3/4
  emotion lines.

### 5.8 Video (MiniMax only)

- **V1:** Ref2VA, the C3 canonical image + the L1 plate + an opening frame, 5 s, English line, 4-step turbo (the repo
  E4b baseline).
- **V2:** the same with an Iraqi line `<d>[Arabic] …</d>`.
- **V3:** FL2VA 4-step-768p LoRA vs 8-step.
- **V4:** continuation with a 22-frame + audio guide.
- **V5 (if a key exists):** hosted H3 768P and 2K regeneration of V1.
- **Pass criteria:**
  - Scripted line CER ≤ 0.10 EN, ≤ 0.20 IRQ.
  - Identity: SFace(frame 110, canonical) ≥ 0.50.
  - Join PSNR ≥ the intra-shot 5th percentile.
  - No ghosting.
  - H3's own voice ECAPA vs the character reference recorded. This is the input for the voice-ownership decision in
    MINIMAX-CONTINUITY finding 9.

### 5.9 ASR

- 40 authorised real Iraqi clips + 40 synthetic lines + 20 English clips.
- **Pass:** dialectal-v2 folded CER ≤ 0.8 × large-v3 CER on Iraqi, and no English regression (English stays on large-v3).
- Also log the CPU int8 real-time factor for the take gate during D (target ≤ 0.5).

## 6. Not verified / open points

- **Arena scores and the Mizan pilot:**
  - The arena scores are crowd preference, and they drift.
  - Mizan's dialogue-*generation* axis is unpublished.
  - Neither replaces §5.
- **Qwen-Image-2.1:**
  - VRAM and speed on this card are unknown.
  - ComfyUI v0.38.1 support is claimed day-0 but not checked against `/object_info`.
  - Its licence forbids production use without an agreement.
- **Gemma 4 31B on this card:** speed, KV size, and the Ollama env vars are not measured.
- **Hosted MiniMax:** H3-Max Turbo is a preview. The hosted continuation and audio-copy behaviour is not documented.
  The repo's key status was not inspected (secrets).
- **H3 Iraqi speech:** H3's Arabic speech in Iraqi dialect is unclaimed and untested.
- **Habibi IRQ:** emotion via references is a hypothesis. The female-voice weakness (suite WER 0.46) is open.
- **Licences to keep on file (dated copies):**
  - H3 and Music 3 community licences
  - Habibi README (per-dialect Apache grant vs the repo-wide NC tag)
  - bilibili Model Use Licence ("may not improve other models")

## Sources (fetched 2026-10-04 unless marked)

- MiniMax H3:
  - [MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)
  - [Comfy-Org/MiniMax-H3 file listing](https://huggingface.co/api/models/Comfy-Org/MiniMax-H3/tree/main?recursive=true)
  - [Comfy-Org README](https://huggingface.co/Comfy-Org/MiniMax-H3/raw/main/README.md)
  - [MiniMax video guide](https://platform.minimax.io/docs/guides/video-generation)
  - [MiniMax models](https://platform.minimax.io/docs/guides/models-intro)
  - [ComfyUI-Wiki H3 launch](https://comfyui-wiki.com/en/news/2026-08-03-minimax-h3-open-weights-comfyui)
  - [ComfyUI-Wiki H3-Max](https://comfyui-wiki.com/en/news/2026-09-05-minimax-h3-max-comfyui)
  - [Comfy licence resale](https://comfyui-wiki.com/en/news/2026-08-30-comfy-minimax-license)
  - [NYU-Shanghai RITS on the H3 licence](https://rits.shanghai.nyu.edu/ai/minimax-ships-h3-weights-with-the-us-and-eu-excluded/)
  - [dev.to on what is open vs API-only](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k)
  - [DmitryDB pruned/AdaLN quant card](https://huggingface.co/DmitryDB/MiniMax-H3-INT8-Lean-ConvRot)
  - [docs.comfy.org H3 native](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
- Image:
  - [black-forest-labs/flux2](https://github.com/black-forest-labs/flux2)
  - [black-forest-labs/flux](https://github.com/black-forest-labs/flux) (licences in FLUX-VS-QWEN.md, 2026-10-03)
  - [FLUX.2-dev card](https://huggingface.co/black-forest-labs/FLUX.2-dev)
  - [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image)
  - [QwenLM/Qwen-Image-2.1](https://github.com/QwenLM/Qwen-Image-2.1)
  - [Qwen-Image-2.1 LICENSE](https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE)
  - [Comfy-Org/Qwen-Image-2.1 listing](https://huggingface.co/api/models/Comfy-Org/Qwen-Image-2.1/tree/main?recursive=true)
  - [AA T2I arena](https://artificialanalysis.ai/text-to-image/arena/leaderboard-text)
  - [AA editing arena](https://artificialanalysis.ai/text-to-image/arena/leaderboard-image)
  - [NVIDIA FLUX.2 on RTX](https://blogs.nvidia.com/blog/rtx-ai-garage-flux-2-comfyui)
  - [RunPod FLUX.2](https://www.runpod.io/articles/guides/deploying-flux-2)
  - [Ideogram 4 (secondary)](https://noqta.tn/en/news/ideogram-4-open-weight-image-model-design-2026)
  - [Cosmos3-Super](https://huggingface.co/nvidia/Cosmos3-Super)
- LLM:
  - [Mizan, arXiv 2609.13980](https://arxiv.org/html/2609.13980)
  - [google/gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it)
  - [Gemma docs](https://ai.google.dev/gemma/docs/core)
  - [Ollama gemma4 tags](https://ollama.com/library/gemma4/tags)
  - [Qwen/Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B)
  - [Ollama 2026 release notes (secondary)](https://fazm.ai/t/ollama-release-notes-2026)
- Voice and ASR:
  - [IndexTeam/IndexTTS-2.5](https://huggingface.co/IndexTeam/IndexTTS-2.5)
  - [SWivid/Habibi-TTS](https://github.com/SWivid/Habibi-TTS)
  - [Habibi paper, arXiv 2601.13802](https://arxiv.org/abs/2601.13802) (via VOICE-IDENTITY-V2, 2026-10-03)
  - [openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2)
  - [whisper-large-v3-arabic-dialectal-v2](https://huggingface.co/oddadmix/whisper-large-v3-arabic-dialectal-v2)
  - [qwen3-asr-0.6b-arabic-dialectal-v2](https://friendli.ai/models/oddadmix/qwen3-asr-0.6b-arabic-dialectal-v2)
  - [NAMAA Saudi TTS (secondary)](https://tts.ai/voices/saudi-tts/)
- Music:
  - [ACE-Step 1.5 XL (Comfy blog)](https://blog.comfy.org/p/ace-step-15-xl-commercial-grade-music)
  - [MiniMax Music 3 licence (RITS)](https://rits.shanghai.nyu.edu/ai/minimax-opens-music-3-0-weights-no-territorial-carve-out-this-time/)
- Infrastructure:
  - [WSL .wslconfig defaults](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- Repo evidence:
  - `docs/MODELS.md`
  - `docs/research/{FLUX-VS-QWEN,MINIMAX-API,MINIMAX-CONTINUITY,LOCAL-ENGINES,VOICE-STACK,VOICE-IDENTITY-V2}.md`
  - `docs/evidence/{flux-vs-qwen,minimax-p1,voice-design}`
  - `docker/models/manifest.json`, `compose.yaml`

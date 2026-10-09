# Large image models, second pass (broader), research 2026-10-09

Question (producer, 2026-10-09): after the first pass (`LARGE-IMAGE-MODELS-2026-10.md`: FLUX.2 [dev] NC → rejected,
HunyuanImage-3.0 territory licence → rejected, Emu3.5-Image, GLM-Image, Qwen-Image-2.1), is there ANY genuinely larger
(≈ 27B–30B+) or materially better ≥ 20B open-weight image generation / editing model that is production-legal, strong at
character identity across pictures, good at realistic + anime + cartoon finishes, capable of single- and multi-reference
editing, and runnable on the one RTX 5090 (32 GB) with CPU/RAM offload — one that should replace Qwen-Image-2512 (the
TEMPORARY baseline) for the eight Vewbox tests?

Method: original sources only — Hugging Face model cards, `/api/models/<repo>/tree/<dir>` byte listings, licence files,
vendors' GitHub repos and technical reports (arXiv HTML), the ComfyUI changelog and GitHub release notes, the Artificial
Analysis arenas (both fetched 2026-10-09). Secondary pages were used only to find primary sources. Numbers marked [E]
are estimates and say why. Nothing was downloaded; no other file was changed.

Machine facts (from `MODEL-EVAL-2026-10.md`, `GPU-STAGING-2026-10.md`, STATUS): one RTX 5090 32 GB; host RAM visible to
Docker 46.8 GiB (96 GB physical, no `.wslconfig` yet); link measured ≈ 1 MB/s lately (4.7–5 MB/s earlier); ComfyUI
0.38.1 (torch 2.13 + cu130) is the only image runtime; incumbents measured here: Qwen-Image-2512 fp8 42 s / 29.8 GB
peak, Qwen-Image-Edit-2511 ≈ 100 s / 30.4 GB peak.

## 1. Verdict

**No ≥ 20B open-weight model qualifies. Keep Qwen-Image-2512 (generation) and Qwen-Image-Edit-2511 (editing)
temporarily. Download nothing under the ≥ 20B brief.**

- The only ≥ 20B model found that is both NEW since the first pass and production-legal is NVIDIA **Cosmos3-Super-
  Text2Image** (64B, OpenMDW-1.1, released 2026-05-31). It is text-to-image only (no editing, no references), officially
  needs a single B200 or 4–8 × H100 in bf16 (FP8/FP4 "not officially supported", Linux only), its smallest community
  quantisation (NVFP4 weight-only ≈ 36 GB) does not fit 32 GB, no ComfyUI path exists for it, and on the open-weights
  arena it sits at 994/986 — level with Qwen-Image-2512 (999), not materially better. §3.
- **Wan2.2-T2V-A14B** (27B MoE, Apache-2.0, in ComfyUI core) can be driven as a one-frame still generator and fits as
  two sequential 14.3 GB fp8 experts — but it has no editing or reference conditioning, no neutral image benchmark, and
  the standing rule "No Wan" (`MASTER-PRODUCTION-PLAN.md` line 198) means even an image-only use needs the producer's
  explicit decision. Reported, flagged, not recommended. §4.
- Everything else ≥ 20B is unchanged from the first pass or worse: FLUX.2 [dev] (NC), HunyuanImage-3.0/Instruct
  (territory licence, 168.5 GB), Emu3.5-Image (34B, Apache, no 2026 activity, Transformers-only, minutes per image),
  Ming-flash-omni-2.0 (104B MoE, MIT, multi-GPU, no image figures). FLUX 3 "Dev" open weights, Qwen-Image 3.0,
  Hy Image 3.5 and Z-Image-Edit/Omni-Base are NOT released (API-only or "to be released"). §5.

**One find below the size bar deserves the producer's attention (§6): SenseTime's SenseNova-U1.5-8B-MoT** — 17.5B
total (8.2B understanding + 8.2B generation, Mixture-of-Transformers), Apache-2.0, released 2026-08-19, native in
ComfyUI core since v0.35.0 (2026-09-09, so already inside Vewbox's 0.38.1), one model for text-to-image, single-image
editing and multi-reference editing with up to 10 references, native 4K, and the only new licence-clean model whose
own report claims to beat BOTH incumbents on their own benchmarks (GEdit-EN 8.26 vs Edit-2511 7.56, ImgEdit 4.59 vs
4.51, Qwen-Image-Bench 52.8 vs 2512 51.3, GenEval 0.92 vs 0.87) and — the relevant one for Vewbox — a large claimed
lead on multi-reference subject consistency (OmniRef-Bench 0.68 / 8.15 vs Edit-2511 0.59 / 4.97). It is below the
≥ 20B brief and not yet on the neutral arena, so it is NOT recommended under this order; if the producer permits ONE
evaluation download outside the size brief, this is the one, with the exact files in §6.

## 2. Comparison table (all candidates checked; arena = Artificial Analysis open-weights boards, fetched 2026-10-09)

| Model | Params | Released | Licence → Vewbox verdict | Files + GB | 5090 path (32 GB) | Gen / edit / multi-ref | Arena T2I / Edit | Runtime | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **Qwen-Image-2512** (incumbent) | 20B DiT + 7B VL | 2025-12-31 | Apache-2.0 → yes | installed | 29.8 GB measured | gen | 999 / — | ComfyUI core | Qwen line now NC (2.1) / API (3.0) |
| **Qwen-Image-Edit-2511** (incumbent) | 20B + 7B | 2025-12-17 | Apache-2.0 → yes | installed | 30.4 GB measured | edit, 2+ refs | — / 1021 | core | last Apache Qwen editor |
| **Cosmos3-Super-Text2Image** (NVIDIA) | **64B** MoT (built on a dense 32B transformer; reasoner + generator towers) | 2026-05-31 (4-Step distil 2026-07-20) | **OpenMDW-1.1** (permissive, "ready for commercial and non-commercial use", outputs unrestricted) → **yes legally** | transformer 27 shards **128.00 GB** bf16 + VAE 1.41 + vision enc. 1.19 ≈ **130.6 GB** | official: single B200 or 4–8 × H100/H200, bf16 only, Linux only; community NVFP4 ≈ 36 GB (> 32 GB), int4 convrot 46.8 GB (video Super); **no proven 32 GB path** | gen only | 994 (agentic) / 986 / 971 (4-step); — | diffusers `Cosmos3OmniPipeline`, vLLM-Omni, SGLang; **not in ComfyUI core**; community nodes do video only | active (Edge 2026-07, 4-Step 2026-07) |
| **Wan2.2-T2V-A14B** (as still generator) | **27B** MoE, 14B active | 2025-07-28 | Apache-2.0 → yes, but **"No Wan" rule** | fp8: high 14.29 + low 14.29 GB; fp16 28.58 × 2; umt5-xxl fp8 6.74; VAE 0.25 → **35.6 GB** fp8 set | each expert 14.3 GB fits in turn; proven for video on this class of card | gen (1 frame) only; no edit, no refs | not ranked as image | ComfyUI core | Wan 2.5/3 are API; 2.2 weights static |
| **SenseNova-U1.5-8B-MoT** (SenseTime) | **17.5B** (8.2B und. + 8.2B gen., MoT, pixel-space, no VAE) | 2026-08-19 (preview 07-31) | **Apache-2.0** (GitHub LICENSE verified) → yes | official 8 shards **35.07 GB** bf16; Comfy single file 35.07 GB; INT8 convrot 18.9 GB; W4A8 14.8 GB; 8-step LoRA 0.81 GB | bf16 35 GB streams (dynamic VRAM) or INT8 18.9 GB in VRAM; measured 24 GB laptop-5090: 2048² 50-step T2I and edit within 24 GB | gen + edit + **≤ 10 refs** + bbox/marker control, native 4K | not on the boards | **ComfyUI core v0.35.0** | very active (LoRA V2 2026-09-24, report 2026-09-11) |
| FLUX.2 [dev] | 32B + Mistral-24B | 2025-11-25 | FLUX Non-Commercial v2 → **no** | see pass 1 | NVFP4 21–23 GB | gen + edit ≤ 10 refs | 1000 / 1000 | core | unchanged since launch |
| FLUX.2 [klein] 9B / Base 9B / 9b-kv | 9B + Qwen3-8B | 2026-01-14; kv 2026-03-09 | FLUX Non-Commercial → **no** | gated | ≈ 29 GB (kv card: "RTX 5090 and above") | gen + multi-ref edit (kv: KV-cached refs) | 941 / 1013; Base 903 / 974 | core | active |
| FLUX.2 [klein] 4B | 4B | 2026-01-14 | Apache-2.0 → yes (already the Image-Reference engine) | installed | fits | gen + multi-ref | 863 / 950 | core | active |
| FLUX 3 (Image / Dev) | n/a | announced 2026-07-23 | **no open image weights**; only `flux-3-action-*` (7B robotics, 2026-09-22) | — | — | — | — | ComfyUI partner API node (v0.38.2, 2026-10-02) | Dev "later in 2026" |
| HunyuanImage-3.0 / -Instruct | 80B MoE | 2025-09 / 2026-01 | Tencent Community (EU/UK/KR excluded) → **no** (pass 1) | 168.54 GB | unproven NF4 | gen + edit ≤ 3 | 945–996 / **1068** | partner API node only | no new quant |
| HunyuanImage-2.1 | 17B DiT + refiner | 2025-09-08 | `tencent-hunyuan-community` (same territory text) → **no** | official bf16 + fp8 | "24 GB with CPU offload + FP8" (card) | gen only | 887 / — | core v0.3.58 | static |
| Hy Image 3.5 Preview | n/a | 2026-09-22 | API only → n/a | — | — | gen + edit (refs) | — | partner node v0.37.1 | — |
| Qwen-Image-2.1 | 7B + Qwen3-VL-8B | 2026-09-20 | Qwen Research (NC) → **no** | eval set here | 22.4 GB measured | gen + edit ≤ 10 refs | **1035 / 1074** | core v0.37.0 | active |
| Qwen-Image 3.0 / 3.0 Pro | n/a | 2026-07-21 | API only → n/a | — | — | — | — | partner nodes v0.32.0 | — |
| Z-Image-Edit / Z-Image-Omni-Base | — | **unreleased** | (Turbo/Base 6B Apache) | Tongyi-MAI org still 4 repos (Turbo, Base, MAI-UI ×2) | — | — | Turbo 941 | core | GitHub quiet since 2026-02 |
| Emu3.5-Image (BAAI) | 34B AR | 2025-10-30 | Apache-2.0 → yes | 68.21 GB bf16; community NF4 "24 GB load, up to 32 GB to generate" | NF4 at the edge of 32 GB, Transformers + bitsandbytes only | T2I + X2I | — | no ComfyUI | **no 2026 news**; DiDA weights still unreleased |
| Ming-flash-omni-2.0 (inclusionAI) | 104B MoE (6B active) | 2026-02-11 | MIT → yes | not sized (> 200 GB bf16 [E]) | multi-GPU, "~10 min load", no VRAM figures | gen + edit (segmentation/removal) | — | Transformers trust_remote_code | active |
| Krea 2 Raw / Turbo | 12.9B + Qwen3-VL-4B | 2026-06-22 | Krea 2 Community License: commercial only under **US$1M company revenue**, must "immediately cease" above → **conditional** | fp8 / int8 / NVFP4 (Comfy-Org/Krea-2) | fits | gen + style refs (1–2) | not ranked | core v0.26.0 | active |
| Ideogram 4.0 | 9.3B (nf4 4.8B) | 2026-05-30 | `ideogram-4-non-commercial` → **no** | gated | — | gen | 1004–1012 | core v0.24.0 | — |
| HiDream-O1-Image / -Dev-2604 | 8B pixel-space | 2026-05-08/14 | MIT → yes | — | fits | gen + edit + personalisation | 981 / 952 (Dev 875 / 884) | core | active |
| ERNIE-Image / -Turbo (Baidu) | 8B DiT (+3.8B PE + 3.8B TE) | 2026-04 | Apache-2.0 → yes | — | "24 GB" | gen only | 912 / — | diffusers, SGLang | active |
| GLM-Image (Z.ai) | 16B | 2026-01-14 | MIT → yes | — | "~23 GB" offload | gen + edit, identity claim | 891 / 785 | **still no ComfyUI core** | active |
| Step1X-Edit-v1p2 (StepFun) | 12B | 2025-11-26 | Apache-2.0 → yes | — | — | edit (reasoning) | — / 923 | diffusers fork only | Step Image Edit 2 is API-only |
| NextStep-1.1 (StepFun) | 14B AR + 157M head | 2026 | Apache-2.0 → yes | — | — | gen (+Edit variant) | — | Transformers | active |
| BAGEL-7B-MoT | 14B (two 7B towers) | 2025-05 | Apache-2.0 → yes | — | — | gen + edit | 706 / 774 | no core | quiet |
| OmniGen2 | 7B | 2025-06 | Apache-2.0 → yes | — | — | gen + edit + refs | 727 / 772 | core v0.3.43 | quiet |
| Ovis-Image | 7B + 2B | 2025-11 | Apache-2.0 → yes | — | — | gen | — | core v0.4.0 | — |
| Kandinsky 5.0 Image Lite | 6B (+8.3B TE) | 2025-12 | MIT (third-party listing; verify) | — | — | gen (I2I variant) | — | core v0.4.0 | — |
| Lumina-Image 2.0 | 2B | 2025-03 | Apache-2.0 | — | — | gen | 782 | core | Lumina 3: none |
| PixArt successors | — | — | none since Sigma (2024) | — | — | — | — | — | — |
| Cosmos-Predict2 14B Text2Image | 14B | 2025-06 | NVIDIA Open Model License | — | single GPU | gen | — | core v0.3.41 | superseded by Cosmos 3 |
| NVIDIA PiD 1.5 (PixelDiT decoder) | 1.3B | 2026-07 | **NSCLv1 non-commercial** → **do not use in production** | — | — | decoder/upscaler for FLUX.2 / Qwen-Image | — | core v0.28.0 | — |
| Microsoft Lens | 3.8B + GPT-OSS-20B TE | 2026 | MIT | — | — | gen | — | core v0.23.0 | — |
| Chroma1-Radiance | 8.9B pixel-space | 2025-09 | Apache-2.0 | — | — | gen | — | core v0.3.60 | — |
| LongCat-Image | 6B | 2025-12 | Apache-2.0 | — | — | gen + edit | 861 / 938 | core | — |
| Ming-Image-0.1-Design | 6B | 2026-09 | MIT | — | — | gen (design) | 997 / — | core v0.38.0 | — |
| JoyAI-Image-Edit(-Plus) | 16B + 8B | 2026 | Apache-2.0 | see MODEL-EVAL §7.3 | fits | edit ≤ 6 refs | — | core v0.29.0 | already the queued editing candidate |

## 3. Cosmos3-Super-Text2Image (NVIDIA) — the one new ≥ 20B legal model, and why it fails

**What it is.** Cosmos 3 (released 2026-05-31; technical report arXiv 2606.02800) is a family of "omnimodal world
models for Physical AI": Super 64B, Nano 16B, Edge 4B. Super is "a 64B-parameter model built upon a dense 32B-parameter
transformer" — a Mixture-of-Transformers with a reasoner tower (autoregressive, discrete tokens) and a generator tower
(diffusion, continuous), both initialised from a pre-trained VLM; the report gives no per-tower split. `Cosmos3-Super-
Text2Image` is a specialised post-trained checkpoint "to generate high-fidelity images consistent with the provided
description"; `-4Step` (2026-07-20) is its DMD2 distillation (4 steps, guidance 1.0).
Sources: https://huggingface.co/nvidia/Cosmos3-Super-Text2Image ; https://huggingface.co/nvidia/Cosmos3-Super-Text2Image-4Step ;
https://huggingface.co/nvidia/Cosmos3-Super ; https://github.com/nvidia/cosmos ; https://arxiv.org/abs/2606.02800

**Exact files (HF API trees, decimal GB).** `transformer/diffusion_pytorch_model-0000{1..27}-of-00027.safetensors`
127,997,348,864 B (**128.00 GB**, bf16); `vae/diffusion_pytorch_model.safetensors` 1,409,400,600 B (1.41 GB);
`vision_encoder/model.safetensors` 1,190,568,352 B (1.19 GB); tokenizers/configs ≈ 12 MB. ≈ **130.6 GB** per
checkpoint (≈ 7.7 h at 4.7 MB/s, ≈ 36 h at the 1 MB/s measured lately). The 4-Step repo is the same shape.

**Licence (OpenMDW-1.1, Linux Foundation, 2026-05-28; NVIDIA adopted it for all Cosmos 3 code and weights).**
https://github.com/OpenMDW/openmdw (1.1/LICENSE.OpenMDW-1.1): "permission is hereby granted, free of charge, to deal in
the Model Materials without restriction"; the only conditions are keeping "a copy of this agreement" and the notices
when redistributing; "does not impose any restrictions or obligations with respect to any use, modification, or sharing
of any outputs"; no territory, no field-of-use, no MAU threshold; rights terminate only if the licensee sues over the
Model Materials. Model card: "This model is ready for commercial and non-commercial use." → **production-legal for
Vewbox** (the card's "Built on NVIDIA Cosmos" attribution line is the only extra). Note: submitted to the OSI in
August 2026, not yet approved — irrelevant to the grant.

**Hardware (official).** Model card: "Only BF16 precision is tested. Other precisions like FP4, FP8, and FP16 are not
officially supported"; Linux only; test hardware GB200 and H100; recommended vLLM-Omni node 8 × H100 (or 4 × H200 /
4 × GB200); `--enable-layerwise-offload` "for GPUs with less memory" with "a significant performance penalty" for
text-to-image. 4-Step card: "needs a multi-GPU H100/H200 node (4–8 GPUs) or a single B200. It does not fit on a single
smaller GPU." GitHub README lists Super on H200 / B200 / GB200 only; no GeForce card anywhere.

**Community paths (none proven on 32 GB).**
- NVFP4 weight-only via torchao (HF Space `aozihaoz/cosmos3-super-text2image`): comment says the bf16 model is "about
  131 GB" and the NVFP4 transformer "about 36 GB" — **larger than the 5090's 32 GB** — running on a 96 GB ZeroGPU slice
  at "~14 s per step at 1024x1024 NVFP4 dequant" (35 steps ≈ 8 min); the Space itself warns NVFP4 is unofficial.
- `RyukoMatoiFan/ComfyUI-Cosmos3` (MIT nodes): supports Nano/Super/Edge/Super-Image2Video for **video only** — the
  README has no Text2Image or single-frame mode. Its weight streaming needs the whole checkpoint staged in host RAM
  ("Super int8 67 GB, int4 63 GB RAM"; "bf16 host RAM peaks near twice the weight size … the Super family is impractical
  in bf16"); Docker sees 46.8 GiB here. Quantised video weights `AkaneTendo25/Cosmos3-ConvRot`: Super int8 65.7 GB,
  int4 46.8 GB; all H100-measured (Super t2v 168 s).
- No GGUF, no fp8 single file, no ComfyUI core entry (changelog Jun 2025 → v0.39.1 of 2026-10-07 checked).

**Capabilities vs the eight tests.** Text-to-image only: no image input, no editing, no reference images, no identity
conditioning → cannot run rows 4–8 at all, and would only ever replace 2512 for rows 1–3. Prompts are JSON-structured
and the model expects an "agentic" prompt upsampler (report: Claude-Opus-4.7 rewrote all benchmark prompts).

**Quality evidence.** Report Table (§6.2.1): UniGenBench 91.36 vs FLUX.2-dev 87.60, Qwen-Image-2512 84.25, Hunyuan 3.0
84.02 (NVIDIA's own evaluation, prompts rewritten by an LLM); on text rendering (CVTG-102ch) it is the WORST of the
table (GNED 32.0 vs Qwen 46.3). Neutral arena today: 994 (agentic) / 986 / 971 (4-Step) — Qwen-Image-2512 999,
FLUX.2 [dev] 1000. Nothing about anime/cartoon finishes or people; the model is tuned for photoreal physical scenes.

**Verdict:** legal, large, maintained — but T2I-only, officially multi-GPU bf16, no 32 GB or ComfyUI path, and at best
arena parity with the incumbent. Fails "proven on this card" and "materially better". Do not download.

## 4. Wan2.2-T2V-A14B as a still generator — reported and flagged

- Card https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B : Apache-2.0; "a total of 27B parameters but only 14B active
  parameters per step" (high-noise expert → low-noise expert, switch by SNR); "at least 80GB VRAM" single-GPU official,
  with `--offload_model`/`--t5_cpu`; no mention of single-frame image use — that is a community practice (one-frame
  videos), not a vendor-documented mode.
- ComfyUI core files (`Comfy-Org/Wan_2.2_ComfyUI_Repackaged`, `Wan_2.1_ComfyUI_repackaged` trees):
  `wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors` 14,293,923,632 B (14.29 GB), `..._low_noise_14B_fp8_scaled`
  14,293,923,632 B, (fp16 28,577,095,592 B each), `umt5_xxl_fp8_e4m3fn_scaled.safetensors` 6,735,906,897 B (6.74 GB),
  `wan_2.1_vae.safetensors` 253,815,318 B (already present as JoyAI's latent codec). fp8 set **≈ 35.6 GB**; each expert
  fits the card in turn, so it is runnable. [E] 1 frame at 1280 × 720, 20–30 steps: 30–60 s on a 5090.
- Capabilities: generation only; no editing, no reference image, no identity conditioning (Wan's reference features —
  VACE, Animate, Phantom — are video models). Not ranked as an image model anywhere; the "competent image model"
  claims are single-author tutorials.
- **Policy flag:** `MASTER-PRODUCTION-PLAN.md` line 198 "No Wan." is written for the video engine; running Wan weights as
  a still generator would still install a Wan video model in the stack. That is the producer's decision, not research's.
  Even if allowed, it answers none of the editing rows and has no quality evidence against 2512 → not recommended.

## 5. Everything else checked (changes since the first pass)

- **FLUX family.** HF org listing (2026-10-09): newest repos are `flux-3-action-{base,so101,droid}` (robotics, 7B,
  2026-09-22), `FLUX.2-small-decoder` (2026-04-06), `FLUX.2-klein-9b-kv[-fp8]` (2026-03-09: klein 9B with KV-cached
  multi-reference editing, "about 29GB … RTX 5090 and above", FLUX Non-Commercial). FLUX 3 (blog 2026-07-23) ships
  Video/Action via API; FLUX 3 Image appears only as a ComfyUI partner node (v0.38.2, 2026-10-02); the open-weight
  "Dev" is promised "later in 2026" with no licence, size or date. klein 9B / Base 9B remain NC (BFL help centre:
  "commercial use of the local weights requires a license"). Nothing new is legal above 4B.
- **Hunyuan.** No new quant or ComfyUI core path for 3.0; Hy Image 3.5 Preview (2026-09-22) is API-only (partner node
  v0.37.1); HunyuanImage-2.1 (17B, T2I only, core since v0.3.58) carries the same `tencent-hunyuan-community` licence
  with the EU/UK/South-Korea territory clause → same rejection as 3.0. Tencent "Hy3" (295B, Apache) is an LLM.
- **Qwen.** HF org: Qwen-Image-2.1 (+PE-T2I/I2I rewriters) tagged `other` = Qwen Research Licence (NC); Qwen-Image 3.0
  / 3.0 Pro are API-only (partner nodes v0.32.0); Qwen-Image-Bench (2026-05-21, Apache) is a judge model. No Apache
  successor to 2512 / Edit-2511.
- **Z-Image.** Tongyi-MAI org still has exactly Z-Image-Turbo, Z-Image (6B, Apache), MAI-UI-2B/8B; Edit and Omni-Base
  "to be released"; GitHub idle since 2026-02-09.
- **Emu3.5.** GitHub news stops 2025-11-28; DiDA weights still unchecked; "each image may take several minutes";
  community NF4 (`wikeeyang/Emu35-Image-NF4`): "about 24 GB" to load, "up to 32 GB" to generate, bitsandbytes on the
  official code. Legal but unrunnable in the Vewbox stack.
- **GLM-Image** (16B, MIT): still no ComfyUI core entry; arena 891 / 785 — below the incumbents.
- **Kandinsky 5.0 Image Lite** 6B; **Lumina-Image 2.0** 2B (no 3.0; Lumina-DiMOO discrete, no sized release);
  **PixArt**: nothing since Sigma; **Cosmos-Predict2 14B T2I**: in core since v0.3.41 under the NVIDIA Open Model
  License but superseded by Cosmos 3 and never ranked; **Ovis-Image** 7B; **BAGEL** 14B (706 / 774); **OmniGen2** 7B
  (727 / 772); **Step1X-Edit-v1p2** 12B Apache (edit 923, diffusers fork only; "Step Image Edit 2" is API); **NextStep-1.1**
  14B AR Apache (no ComfyUI); **HiDream-O1-Image(-Dev-2604)** 8B MIT (981 / 952 — the ≈ 1190 figures circulating are
  an older board scale; today's board says 981); **HiDream-I1** 17B MIT is T2I-only, 2025-04, arena 874 and its
  editor E1.1 scores 808.
- **New 2026 names surfaced and dismissed:** Ideogram 4.0 (9.3B, `ideogram-4-non-commercial`); Krea 2 (12.9B, T2I,
  licence allows commercial use only below US$1M company revenue — conditional, and the Comfy repack carries no size
  edge); Microsoft Lens (3.8B, MIT); ERNIE-Image (8B DiT, Apache, T2I only, arena 912); Ming-Image-0.1-Design (6B,
  design model); LongCat-Image (6B); NVIDIA PiD 1.5 decoder (NSCLv1 **non-commercial** — must not enter the production
  graph even as a decoder); Princeton "i1" (3B, fully open recipe); Meta Muse Image, Microsoft MAI-Image-2.6, Grok
  Imagine 2.0, Nano Banana 2.1, GPT Image 2.5, Seedream 5 — all closed.
- **Arena today (2026-10-09), open weights only:** T2I — Qwen-Image-2.1 1035 (NC), FLUX.2 [dev] 1000 (NC),
  Qwen-Image-2512 999, Ming-Image 997, HunyuanImage 3.0 Instruct 996, Cosmos3-Super 994/986, HiDream-O1 981, klein 9B
  941. Edit — Qwen-Image-2.1 1074 (NC), HunyuanImage 3.0 Instruct 1068 (territory), Qwen-Image-Edit-2511 **1021**
  (best commercial), klein 9B 1013 (NC), FLUX.2 [dev] 1000 (NC), HiDream-O1 952, klein 4B 950, Step1X-v1p2 923. The
  two incumbents are still the top production-legal entries on both boards; SenseNova-U1.5, Krea 2 and Wan are not
  listed.

## 6. SenseNova-U1.5-8B-MoT — the one find worth the producer's decision (below the 20B bar)

**What it is.** SenseTime's natively unified multimodal model (NEO-unify architecture, "Mixture-of-Transformers": 8.2B
understanding + 8.2B generation parameters, 42 layers, hidden 4096; pixel-space flow matching with a learned spatial
decoder — no visual encoder, no VAE). The HF safetensors total 35.07 GB bf16 = **≈ 17.5B parameters**. One model does
text-to-image (native 2048², up to 4096²), single-image editing, multi-reference editing (ComfyUI core: "up to 10
reference images"), insertion/replacement, bounding-box and visual-marker region control, interleaved image-text and
VQA. Preview 2026-07-31, full release 2026-08-19 (+SFT variant, 8-step LoRA; LoRA V2 2026-09-24), technical report
2026-09-11 (arXiv 2609.11929).
Sources: https://huggingface.co/sensenova/SenseNova-U1.5-8B-MoT ; https://github.com/OpenSenseNova/SenseNova-U1 ;
https://arxiv.org/abs/2609.11929

**Licence.** Apache License 2.0 — HF card tag `apache-2.0` and the GitHub `LICENSE` (branch `feat/u1.5`) is the
verbatim Apache-2.0 text; no territory, MAU, output or field-of-use clauses. → **production-legal**.

**ComfyUI.** Core support landed in **v0.35.0 (2026-09-09)**: release note "Support SenseNova U1.5 (CORE-411)" by
@T8mars (#15922); changelog bullet "SenseNova U1.5: Native pixel-space generation and multi-reference editing with up
to 10 reference images". Vewbox's ComfyUI 0.38.1 therefore already contains the nodes. (SenseTime's own node pack
`ComfyUI-SenseNova-U1` v0.3.0 is a separate, earlier route.) There is **no Comfy-Org repack**; the single-file weights
used by the core PR author are `t8star/SenseNova-U1.5-Comfy` (Apache-2.0, "repackages weights only").

**Exact files.**
- Official: `sensenova/SenseNova-U1.5-8B-MoT/model-0000{1..8}-of-00008.safetensors` 35,065,858,136 B (**35.07 GB**, bf16,
  Transformers layout).
- ComfyUI single file: `t8star/SenseNova-U1.5-Comfy/SenseNova-U1.5-8B-MoT-BF16-T8.safetensors` 35,065,860,328 B
  (**35.07 GB**, "currently recommended"); `SenseNova-U1.5-8B-MoT-SFT-T8.safetensors` 35,065,860,320 B (SFT stage,
  50-step only); legacy `SenseNova-U1.5-8B-MoT-T8.safetensors` 50,222,155,152 B (bf16/f32 mix, superseded);
  `SenseNova-U1.5-8B-MoT-LoRA-8step-ComfyUI.safetensors` 814,881,652 B (fast T2I only; editing should stay at 50 steps).
- Community quantisation `Milor123/ComfyUI-ConvRot-SenseNova-U1.5-8B-MoT-T8`: INT8 17.58 GiB (18.9 GB; "0.43 % pixel
  difference from bf16, per-layer error < 2 %"), hybrid W4A8 13.80 GiB (layers 0–17 kept INT8 because 4-bit there
  "damaged prompt coherence"). GGUF Q8 ≈ 19.9–21.2 GB (several authors). No NVFP4, no fp8 single file from the vendor.

**5090 path.** bf16 35 GB exceeds 32 GB → ComfyUI dynamic-VRAM streaming from host RAM (the repack author ran 2048²
50-step T2I and edits "within 24 GB VRAM" on a 24 GB laptop 5090 with 64 GB RAM and "recommends 64 GB RAM" — Docker
here sees 46.8 GiB, tight; raising `.wslconfig` first is prudent), or the INT8 ConvRot 18.9 GB fully in VRAM (the
author's measured deviation from bf16 is small, but Vewbox's rule is bf16/fp8 first). Official pack figures: T2I peak
17.34 GiB, editing ≈ 20 GiB with offload modes; CUDA 12.8 / torch 2.8 upstream. Speed: U1 (previous generation) on a
5090 at 2048²: 23.0 s (Gigazine, 2026-04-30); H100/H200 TP2: 0.15 s/step, ≈ 9 s for 2048². [E] U1.5 on this 5090:
≈ 15–30 s per 1024² image at 50 steps in VRAM; slower when the bf16 file streams. Settings: 50 steps, CFG 4, img_cfg 1,
shift 3, Euler/normal.

**Quality evidence (SenseTime's own report, Tables vs the Vewbox incumbents).** GEdit-Bench-EN overall 8.26 vs
Qwen-Image-Edit-2511 7.56 (GPT-Image-2 8.73); ImgEdit 4.59 vs Edit-2511 4.51 / FLUX.2 [dev] 4.35; Qwen-Image-Bench
52.82 (60.22 with prompt enhancer) vs Qwen-Image-2512 51.32; GenEval 0.92 vs Qwen-Image 0.87; DPG 88.11 vs 88.32
(tie); OneIG-EN 0.552 vs 0.539; **OmniRef-Bench (multi-reference subject consistency) objective 0.68 / MLLM 8.15 vs
Edit-2511 0.59 / 4.97, FLUX.2 [klein] 0.63 / 6.49, Nano-Banana-Pro 0.70 / 8.50**. The report claims "strong subject
and pose consistency" and "preserving subject identity and unedited content"; no anime/cartoon-finish test exists.
Caveats: self-reported; the report's Edit-2511 GEdit figure (7.56) is lower than the 7.88 Vewbox recorded in
MODEL-EVAL §7.1 (different harness), so the margin is the report's, not ours; the model is absent from the neutral
arena; it is a brand-new 2026 architecture (pixel-space, no VAE) with two months of field use.

**Why it is not recommended under THIS order, and why it is still the only download worth considering.** It is 17.5B,
below the ≥ 20B / ≈ 27–30B brief, so it is not "genuinely larger". But it is the only model found this pass that is
simultaneously production-legal, already in Vewbox's runtime, a single unified gen + edit + ≤ 10-reference model, and
claims to beat BOTH incumbents on their own benchmarks with the largest gap exactly on identity-across-references —
the Vewbox rows 4–8 weakness (E1 8/12, location views 0/6). If the producer allows ONE evaluation download outside the
size brief, fetch `t8star/SenseNova-U1.5-Comfy/SenseNova-U1.5-8B-MoT-BF16-T8.safetensors` (35.07 GB; ≈ 2.1 h at
4.7 MB/s, ≈ 10 h at 1 MB/s) into an eval-only manifest group (like `eval-qwen-image-2.1`), verify ComfyUI 0.38.1 loads
it natively, and run the eight tests of pass 1 §8 at bf16 first (INT8 ConvRot only as a fallback if streaming fails).
Otherwise the queued JoyAI-Image-Edit test (MODEL-EVAL §7.3) remains the next editing experiment.

## 7. Recommendation

1. **Under the ≥ 20B order: none qualifies — keep Qwen-Image-2512 (generation) and Qwen-Image-Edit-2511 (editing)
   temporarily; download nothing.** Cosmos3-Super-Text2Image is the only new large legal model and it is T2I-only,
   multi-GPU bf16 by NVIDIA's own card, unquantised below 36 GB, outside ComfyUI, and at arena parity. Wan2.2-A14B as a
   still generator is legal and runnable but editing-less, unbenchmarked as an image model and blocked by "No Wan"
   unless the producer rules otherwise.
2. **Single candidate flagged for a producer decision (below the size bar):** SenseNova-U1.5-8B-MoT, exact file in §6.
3. **Reopen when any of these happens:** (a) NVIDIA or ComfyUI publishes an fp8/NVFP4 Cosmos3-Super-Text2Image that
   fits 32 GB with a core node (and an editing variant appears); (b) BFL releases FLUX 3 Dev weights under a commercial
   licence; (c) Tencent moves HunyuanImage-3.0-Instruct or Hy Image 3.5 to an Apache/MIT, ≤ 32 GB, core-node path;
   (d) Qwen ships an Apache successor to 2512 / Edit-2511; (e) Tongyi-MAI releases Z-Image-Edit / Omni-Base;
   (f) SenseNova-U1.5 appears on the neutral arena above Edit-2511 (1021) — then §6 becomes a straightforward test.

## 8. Source list

- Cosmos 3: https://huggingface.co/nvidia/Cosmos3-Super-Text2Image ; https://huggingface.co/nvidia/Cosmos3-Super-Text2Image-4Step ;
  https://huggingface.co/nvidia/Cosmos3-Super ; trees `/api/models/nvidia/Cosmos3-Super-Text2Image/tree/main/{transformer,vae,vision_encoder}` ;
  https://github.com/nvidia/cosmos ; https://arxiv.org/html/2606.02800 ; OpenMDW-1.1 https://github.com/OpenMDW/openmdw ;
  community nodes https://github.com/RyukoMatoiFan/ComfyUI-Cosmos3 ; NVFP4 Space https://aozihaoz-cosmos3-super-text2image.static.hf.space/app.py
- Wan2.2: https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B ; trees `/api/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models`,
  `/api/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/{text_encoders,vae}` ; rule `docs/MASTER-PRODUCTION-PLAN.md` l.198
- SenseNova-U1.5: https://huggingface.co/sensenova/SenseNova-U1.5-8B-MoT (+ `/tree/main`) ; https://github.com/OpenSenseNova/SenseNova-U1 ;
  LICENSE https://raw.githubusercontent.com/OpenSenseNova/SenseNova-U1/feat/u1.5/LICENSE ; report https://arxiv.org/html/2609.11929 ;
  Comfy repack https://huggingface.co/t8star/SenseNova-U1.5-Comfy (+ `/tree/main`) ; ConvRot https://huggingface.co/Milor123/ComfyUI-ConvRot-SenseNova-U1.5-8B-MoT-T8 ;
  ComfyUI release https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.35.0 ; changelog https://docs.comfy.org/changelog
- FLUX: `/api/models?author=black-forest-labs` ; https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv ; https://bfl.ai/blog ;
  https://help.bfl.ai/articles/7108141705-can-i-run-or-fine-tune-flux-2-klein-locally
- Hunyuan: https://huggingface.co/tencent/HunyuanImage-2.1 ; Qwen: `/api/models?author=Qwen&search=Image` ; Tongyi-MAI: `/api/models?author=Tongyi-MAI`
- Emu3.5: https://github.com/baaivision/Emu3.5 ; https://huggingface.co/wikeeyang/Emu35-Image-NF4 ; Ming: https://huggingface.co/inclusionAI/Ming-flash-omni-2.0
- Others: https://huggingface.co/stepfun-ai/Step1X-Edit-v1p2 ; https://huggingface.co/baidu/ERNIE-Image ; https://huggingface.co/api/models/ideogram-ai/ideogram-4-nf4 ;
  https://www.krea.ai/krea-2-licensing ; https://docs.comfy.org/tutorials/image/krea/krea-2 ; https://huggingface.co/HiDream-ai/HiDream-O1-Image-Dev-2604
- Arenas (fetched 2026-10-09): https://artificialanalysis.ai/text-to-image/arena/leaderboard-text ; https://artificialanalysis.ai/text-to-image/arena/leaderboard-image
- Vewbox: `docs/research/LARGE-IMAGE-MODELS-2026-10.md` (pass 1, incl. the eight tests §8), `docs/research/MODEL-EVAL-2026-10.md` §7.

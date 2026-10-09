# MiniMax H3 at full quality on one RTX 5090 — what we have, what the official highest-quality path needs (2026-10-09)

Research only: nothing was downloaded and no other file was changed. Sources are the MiniMax model card, README and
LICENSE (MiniMaxAI/MiniMax-H3), the Comfy-Org repack and its Hugging Face file listings (sizes and LFS sha256 read from
the API), the ComfyUI day-0 blog and docs.comfy.org tutorial, the diffusers MiniMax-H3 page, MiniMax's `design.minimax.io/h3`
deployment page, plus this workstation's own measurements (`docs/research/MODEL-EVAL-2026-10.md` §8 and §10.3,
`docs/research/GPU-STAGING-2026-10.md`). Community benchmarks are quoted only where no official figure exists and are
marked as such. Policy: MiniMax H3 is the only video family; no Wan or LTX anywhere in this document.

## 0. Verdict in six lines

1. **"Official MiniMax-H3 Base FL2VA BF16 / Ref2VA BF16" exists as exactly two ComfyUI files**:
   `minimax_h3_fl2va_pruned_bf16.safetensors` and `minimax_h3_ref2va_pruned_bf16.safetensors` (40.23 GB each,
   Comfy-Org/MiniMax-H3). They carry the released BF16 weights unquantized; "pruned" is the inference-only form MiniMax
   itself describes (the ≈13B AdaLN parameters "do not need to be loaded for inference-only deployment"), folded by Comfy
   into a timestep curve table. The unpruned 66.28 GB files add fine-tuning weights, not quality (§6).
2. **Pruned BF16 is feasible on this machine**: the card streams the part of the 40 GB that does not fit from pinned host
   RAM (ComfyUI DynamicVRAM is enabled in our container: "DynamicVRAM support detected and enabled", pinned memory
   72 386 MB). The same mechanism already ran the 40.86 GB Qwen-Image-2512 bf16 here at +1 s warm engine time and
   +19 GiB RAM (MODEL-EVAL §10.3). Expected: **≈ 6–11 min per 5 s final clip at 1344×768, 20 steps** (today's int8 final
   tier: 350 s), host RAM ≈ 60–68 GiB of the 78.5 GiB Docker VM. To be measured, not assumed (§7).
3. **Unpruned BF16 (66.28 GB per DiT) is not a realistic target on 32 GB + 95 GB RAM**: with the text encoder and VAEs it
   exceeds the VM (88 GB of weights against 78.5 GiB), and MiniMax's own guidance for full BF16 is an 80 GB card with
   offload or two 80 GB cards. It would also buy nothing: it is the same transformer plus the AdaLN weights the pruned
   form reproduces to within 1/250 of a bf16 rounding step (§6).
4. **Download list, in priority order** (§8): Ref2VA pruned bf16 40.23 GB → FL2VA pruned bf16 40.23 GB → video VAE fp16
   5.21 GB → (step 2, after a RAM check) text encoder int8_convrot 27.14 GB. **Step 1 = 85.66 GB (≈ 4.8 h at 5 MB/s);
   with step 2 = 112.80 GB (≈ 6.3 h).** All sha256 values are published (LFS oids) and listed below. Nothing already
   present has to be re-downloaded; the int8 DiTs stay as the draft/fallback tier.
5. **No distilled variant as the production default**: the final tier stays the base checkpoint, 20 steps,
   `res_multistep`/`simple`, no LoRA — which is also the official templates' default (turbo is an opt-in toggle). The
   turbo LoRAs weaken reference conditioning (ComfyUI docs) and lost identity in our own A/B (§8.4 of MODEL-EVAL).
6. **Licence is unchanged by the precision**: same MiniMax H3 Community License for every Comfy-Org file; the int8
   text encoder is the only file whose provenance is cleaner than today's (the shipped nvfp4 encoder is a third-party
   AWQ conversion). The territory licence application (platform.minimax.io/h3-license) remains the producer's action.

## 1. The machine, measured today

| Item | Value (2026-10-09) |
|---|---|
| GPU | NVIDIA GeForce RTX 5090, 32 607 MiB, driver 591.86 (Blackwell, sm_120) |
| Physical RAM | **95.47 GB** (`Win32_ComputerSystem.TotalPhysicalMemory`), Intel Core Ultra 9 285K (24 CPUs to Docker) |
| Docker/WSL VM | `.wslconfig` `memory=80GB`, `swap=32GB`; `docker info` MemTotal 84 336 566 272 B = **78.5 GiB**; `free -g` inside the container: 78 total, 26 used, 34 buff/cache, 51 available (ACE-Step and others resident) |
| ComfyUI container | ComfyUI **v0.38.1**, PyTorch **2.13.0+cu130**, CUDA 13.0 image, comfy-kitchen 0.2.36, triton 3.7.1, comfy-aimdo **0.5.5**, `comfyui-workflow-templates` 0.11.73; no sageattention; no custom video nodes |
| ComfyUI start-up log | "Total VRAM 32607 MB, total RAM 80430 MB", "Enabled pinned memory 72386.0", "Using pytorch attention", "**DynamicVRAM support detected and enabled**" |
| Launch flags (`docker/comfyui/entrypoint.sh`) | `--reserve-vram 1.0 --disable-comfy-compiler` (Blackwell issue ComfyUI #16342); dynamic VRAM and async offload on by default |
| Model store | ext4 VHDX `D:\models\vewbox-models.vhdx` mounted at `/models`: 1007 GB, **321 GB used, 687 GB free** |
| Link | ≈ 5 MB/s (≈ 18 GB per hour); one large download at a time (memory: machine-network-constraints) |

Note on WSL: the ComfyUI blog (March 2026) said WSL support for Dynamic VRAM was "not planned"; the aimdo 0.5.5 shipped
with v0.38.1 initialises and reports itself enabled inside our Docker Desktop (WSL2) container, and §10.3 of MODEL-EVAL
is a real run of a 40.86 GB bf16 checkpoint through it on this box. This is the load-bearing fact for §7.

## 2. What we have (manifest and disk)

`docker/models/manifest.json`, groups `video-minimax-h3` and `video-minimax-h3-reference` (all `Comfy-Org/MiniMax-H3`,
licence "MiniMax H3 Community License"). Every file is on disk in the store (`/models/comfyui/...`, listed from the
running container on 2026-10-09; dates are the fetch dates) and recorded as sha256-verified against the fetcher record in the
store inventory table of `docs/MODELS-STORAGE.md`.

| Logical path | Bytes | GB | sha256 | On disk | Role today |
|---|---|---|---|---|---|
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20 970 379 616 | 20.97 | `e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a` | yes (Oct 2) | FL2VA DiT, both tiers |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 20 970 379 616 | 20.97 | `9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779` | yes (Oct 2) | Ref2VA DiT, both tiers (every take with references) |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15 687 142 551 | 15.69 | `35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6` | yes (Oct 2) | Qwen3-VL-32B encoder, NVFP4 AWQ (converted by Comfy from the third-party `cybermotaz/Qwen3-VL-32B-Instruct-NVFP4`) |
| `vae/minimax_h3_video_vae_int8_convrot.safetensors` | 2 811 065 184 | 2.81 | `52a2c8c73583c86e4f41cdcce3a6ad0ea562987bc0bf3d60a0cef5f5c8e60c0e` | yes (Oct 2) | video VAE (encode of frames/references, decode of the picture), int8 |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | 605 254 808 | 0.61 | `8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48` | yes (Oct 1) | audio VAE, full precision (the only one published) |
| `loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1 956 193 000 | 1.96 | `2339acdf19bfe123f46b971ea35d367a84adb85de43627e1eceafa5a5b2b111e` | yes (Oct 2) | draft tier only (FL2VA, 8 steps) |
| `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` | 1 956 193 000 | 1.96 | `5b9ab5ade15d0775676d01a907268a69a1468dc6033b3b0d3ded5502f3ebb84c` | yes (Oct 2) | draft tier only (Ref2VA, 4 steps, a v0.1 "preview") |
| **Total H3 on disk** | **64 956 607 775** | **64.96** | | | |

Current configuration (`src/server/workflows/minimax-h3.ts`, `src/server/workflows/index.ts` MODELS,
`src/domain/video-capability.ts` tiers): `UNETLoader` (int8 pruned DiT) → optional `LoraLoaderModelOnly` (draft only) →
`MiniMaxH3SigmaShift` 12.0/3.0 → `MiniMaxH3ImageToVideo` (FL2VA: first/last frame) or `MiniMaxH3ReferenceToVideo` (≤ 9
pictures, ≤ 3 audios, `ref_image_size: match`) → chained `MiniMaxH3AddGuide` → `RandomNoise` + `KSamplerSelect
res_multistep` + `BasicScheduler simple` + `BasicGuider` (the checkpoints are CFG-distilled: no negative, no cfg) →
`SamplerCustomAdvanced` → `VAEDecode` + `VAEDecodeAudio` → `CreateVideo` 24 fps → `SaveVideo` h264. Canvas capped at
768×1344 (multiples of 32); frames on the 17k+5 grid, 124–362. **Final tier (default): no LoRA, 20 steps; draft tier: turbo
LoRA, 8 (FL2VA) / 4 (Ref2VA) steps, only when asked.** Measured (MODEL-EVAL §8.4, Ref2VA, 5 s at 1344×768): final 350 s
engine, card 31.7 GB, comfyui RAM 46.0 GiB; draft 85–123 s, 31.9 GB, 46.1 GiB.

What is **not** the highest-quality official form in this set: the DiT is int8 (ConvRot) rather than bf16; the video VAE is
int8 rather than fp16; the text encoder is a third-party 4-bit AWQ rather than Comfy's int8 of the official weights.

## 3. The official releases

### 3.1 MiniMaxAI/MiniMax-H3 (the primary release; main `42ed227ee7df40d41602854ae760620d6eb651fe`, 2026-08-13)

Model card facts: H3 is three modules — **H3-Context-IR** (hosted prompt/input understanding, **not open**),
**H3-Base** (768p audio-video generation, **open**) and **H3-Regenerate-2K** (regenerates the 768p result at 2K, **not open
yet**; "we will release it once it is ready"). H3-Base is released as two task checkpoints, **both BF16 and both
CFG-distilled** (guidance baked in; one forward pass per step):

- **MiniMax-H3 Base FL2VA** — tasks `t2va`, `fl2va`: 0, 1 or 2 input images → text-to-video, first-frame (I2VA),
  last-frame (L2VA) or first-and-last-frame (FL2VA) to video with audio.
- **MiniMax-H3 Base Ref2VA** — task `ref2va` ("omni-reference"): up to **9 images**, up to **3 videos** (2–15 s each,
  ≤ 15 s total), up to **3 audio clips** (2–15 s each, ≤ 15 s total), **≤ 12 files in all**; an audio reference can never
  be the only reference (diffusers).

Components: **H3-Encoder** = the full Qwen3-VL-32B (Apache-2.0) with the unnormalised hidden state of its **50th layer**
and added special tokens (`<d>` …), so the repo's tokenizer/config are required; **H3-VisualVAE** f16t4d24 (16× spatial,
4× temporal, 24 channels; 1×2×2 patchify → 32× effective; ViT decoder); **H3-AudioVAE** 32 kHz stereo, 40 Hz latent rate
per channel; **H3-Omni-Transformer** 33B dense single-stream, 3D MM-RoPE, "about 13B parameters sit in AdaLN branches,
which can be precomputed and cached, so they need not be loaded for inference-only deployment"; sparse attention trained
but the open release provides full attention only. Output: 24 fps, 4–15 s (the open weights: 5–15 s, 17n+5 frames),
short edge 768 px (16:9 = 1344×768), 32 kHz stereo audio, 11 stable dialogue languages including **Arabic** and English.

File inventory (sizes in bytes and LFS sha256 from the Hub API; the repo is in diffusers layout, ≈ 144 GB per task folder):

| Folder | Files | Bytes | Notes |
|---|---|---|---|
| `FL2VA/transformer/` | 13 shards `model-0000N-of-00013.safetensors` + config + index | 66 280 524 863 | shard 1 sha `0b3386565e476bfdea287e9ea9f269d036e5c649ed14bb9b4afac1dc4661bd2a` … shard 13 `8bfd852d5817e9836de1d3ec8dbac1c5446b167568b717371f08282b22291aa2` |
| `Ref2VA/transformer/` | 13 shards + config + index | 66 280 524 863 | shard 1 sha `902d6ae787f6d394d0104c1ef3ce19528209715fd5b0292f09d4ef7ca19c8504` … shard 13 `572e060b9b727bba6ee6c639e988d74978adfbf94f8bac9aa8e7f5bde88c1ec7` |
| `transformer/` (diffusers, = FL2VA) | 14 shards `diffusion_pytorch_model-0000N-of-00014.safetensors` | 66 280 569 250 | |
| `transformer_ref/` (diffusers, = Ref2VA) | 14 shards | 66 280 569 250 | |
| `text_encoder/` (identical copy under FL2VA/ and Ref2VA/) | 14 shards + tokenizer/processor | 66 726 510 529 | Qwen3-VL-32B bf16 |
| `*/video_vae/source/model.safetensors` | 1 | 10 415 548 320 | sha `5f0c2e161d895a9fee7645ca32d4a7e3a22b90cacfcbeba62ec999cdbbefe0d3` (fp32) |
| `*/audio_vae/model.safetensors` | 1 | 605 429 308 | sha `37dddc2f3e6d5d5139d823d5ea283bbf304dadcb885b1ccda818aa13dade5ea2` |
| `docs/` | `QA-about-License.md`, `VIDEO_PROMPT_WRITING_GUIDE_base_en.md`, `VIDEO_PROMPT_WRITING_GUIDE_ref_en.md` | 43 KB | the official prompting guides (§10) |

These diffusers shards are **not** what ComfyUI's `UNETLoader`/`CLIPLoader` consume; the ComfyUI-loadable form of the same
weights is the Comfy-Org repack below. Byte check: Comfy's `minimax_h3_fl2va_bf16.safetensors` is 66 280 487 368 B against
66 280 485 936 B for the 13 official FL2VA shards (1 432 B of header difference) — the single file is the official BF16
transformer, re-serialised.

### 3.2 Comfy-Org/MiniMax-H3 (the ComfyUI repack; main `e5eb578a89295337b8ff433a035929ce0279e0b6`, 2026-09-29, 37 files)

README: "Repackaged model files for ComfyUI", sources MiniMaxAI/MiniMax-H3, lightx2v/Minimax-h3-Turbo, alibaba-pai
Fun-Controlnet-Union, Kijai experimental; "for diffusion models, `int8_convrot` is preferred if you can run PyTorch with
cu130; `fp8_scaled` only if int8_convrot is not an option; the nvfp4 text encoder does not require a Blackwell GPU."

| File | Bytes | GB | sha256 | Have |
|---|---|---|---|---|
| `diffusion_models/minimax_h3_fl2va_bf16.safetensors` | 66 280 487 368 | 66.28 | `907d4add438438ec1544f5240c3b38532ed934fe6be75677a6bbda2a6fdd6182` | no |
| `diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors` | 34 038 892 334 | 34.04 | `7ad4c73e6e378b822ffd1629f27f632d3787d95f5e468e3af958f98c58df96a5` | no |
| **`diffusion_models/minimax_h3_fl2va_pruned_bf16.safetensors`** | **40 225 724 176** | **40.23** | **`a32572fb90b5508b201ec7c2eddcc184b13ddfd3c6f6d2cf06a0b46535d541b4`** | **no** |
| `diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors` | 20 958 205 608 | 20.96 | `12944c1f7791637e7de12208aef04da82bd26b95271b1b47d817364315ade993` | no |
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20 970 379 616 | 20.97 | `e889202c…3c47a` | **yes** |
| `diffusion_models/minimax_h3_fl2va_pruned_w6a8.safetensors` | 15 983 746 636 | 15.98 | `ac746a2e41628ab25afd44d2b22a7fab8d7e66cd07a01bf89ed9d74b0d3f0c35` | no |
| `diffusion_models/minimax_h3_ref2va_bf16.safetensors` | 66 280 487 368 | 66.28 | `e32c54c1a7b4f5f397f195cea267ccb18806303bb665678c4bee60953bdf3026` | no |
| `diffusion_models/minimax_h3_ref2va_int8_convrot.safetensors` | 34 038 894 550 | 34.04 | `9eef934046a0671bc8a5daf87100705e1478419c574cfde70c50fbe6885f76a9` | no |
| **`diffusion_models/minimax_h3_ref2va_pruned_bf16.safetensors`** | **40 225 724 176** | **40.23** | **`37c0da793e20ca735272ec2be655f08a2e10f97a3ec8fdfb40f5b39a736ed6fe`** | **no** |
| `diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors` | 20 958 205 608 | 20.96 | `f86f2f79ebd2d76eb8eeb46091e83982e6ff51d255747e7b16e92834b392b8e9` | no |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 20 970 379 616 | 20.97 | `9255f52b…0779` | **yes** |
| `diffusion_models/minimax_h3_ref2va_pruned_w6a8.safetensors` | 15 983 746 636 | 15.98 | `ece96bbbce76670ec782de84acc888fd9d9b210bd2ab97c1957b39896734f9f1` | no |
| `text_encoders/qwen3vl_32b_minimax_h3_bf16.safetensors` | 51 506 295 256 | 51.51 | `600d567f6a9629c8574e8e7041b199bdd9c59a986afa7906910a81919610607d` | no |
| **`text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors`** | **27 141 342 152** | **27.14** | **`bc2ced0fbea64757fa9acddccfc0b3f4819d1dcf1da6c124d690d368be283923`** | **no** |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15 687 142 551 | 15.69 | `35a88d51…76c6` | **yes** |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | 605 254 808 | 0.61 | `8e505d95…db48` | **yes** |
| **`vae/minimax_h3_video_vae_fp16.safetensors`** | **5 207 808 496** | **5.21** | **`7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522`** | **no** |
| `vae/minimax_h3_video_vae_int8_convrot.safetensors` | 2 811 065 184 | 2.81 | `52a2c8c7…0c0e` | **yes** |
| `loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors` | 1 956 192 992 | 1.96 | `c396a9a06f58399e9df9754b18299818d84a2ddd371724ba48fe4a41221437dc` | no (draft only) |
| `loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1 956 193 000 | 1.96 | `2339acdf…111e` | yes |
| `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` | 1 956 193 000 | 1.96 | `5b9ab5ad…b84c` | yes |
| `model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_bf16.safetensors` | 8 382 288 792 | 8.38 | `cd48bdc11b1f1a3b934746c898d25123754b335c13d37d5c421f8373079282b4` | no (not in scope) |
| `model_patches/minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors` | 4 531 220 608 | 4.53 | `890af58bb350f0c2f6c409b1c67ea8f4196654297d037769b72de1e6f504c612` | no |
| `model_patches/minimax_h3_fun_controlnet_union_pruned_bf16.safetensors` | 4 222 169 456 | 4.22 | `57fe1e64928a63a55e3cd4586b55cd5d0eb4980648b6f31e5d9dac16fe7f1c48` | no |
| `model_patches/minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors` | 2 296 635 360 | 2.30 | `9c645c0a308c8af361efd43b409710f6f8fec0db297c29503e141a84991fed0c` | no |
| `embeddings/minimaxh3_*.safetensors` (10 community style embeddings, unofficial) | 0.5–1.5 MB each | | | no |

Abbreviations: **FL2VA** first/last-frame (and text) to video+audio; **Ref2VA** reference to video+audio; **pruned** =
AdaLN branches folded into a curve table (§6); **int8_convrot** = int8 with a rotation (ConvRot) transform and Comfy's
custom kernels; **w6a8** 6-bit weights; **nvfp4_awq** 4-bit AWQ. The audio VAE is published only at fp32, i.e. we already
hold it at its highest quality. There is **no separate "audio-capable variant"**: every checkpoint generates stereo audio
natively; audio references are a Ref2VA input.

## 4. Official hardware, VRAM/RAM and offload guidance

- **MiniMax (model card, README)**: no VRAM/RAM matrix. The only deployment example is SGLang on **4 GPUs**
  (`--num-gpus 4 --ulysses-degree 4`); supported frameworks SGLang, vLLM(-Omni), diffusers (modular pipeline), ComfyUI.
- **MiniMax `design.minimax.io/h3`** (official page): 12 GB VRAM runs 480p with the pruned int8 checkpoint (≈ 42 GB of
  downloads); 16–24 GB "comfortable"; RTX 5090 / DGX Spark "reach roughly 4× further" with NVIDIA's Sol stack; **system
  RAM: plan for 32–64 GB — layers that don't fit in VRAM are staged from RAM**; pruned int8 and NF4 are the only
  quantisations it names.
- **diffusers (official integration, modular pipeline)**: "the transformer alone is 61.7 GB in bfloat16 and the Qwen3-VL
  conditioner another 62.1 GB"; on **one 80 GB card**: `ComponentsManager.enable_auto_cpu_offload(memory_reserve_margin="12GB")`;
  on **a consumer card (24–32 GB)**: torchao **int8** weight-only on transformer and encoder, block-level group offload
  (one block per group, CUDA streams) for the transformer, leaf-level for the encoder, VAEs resident; **≈ 75 GB host RAM
  at int8**; two 80 GB cards run full bf16 with no offload. Smaller canvas is "the biggest speed lever": 960×544 ≈ 2.3×
  faster per step than 1344×768. Schedulers `shift=12.0` (video) and `3.0` (audio); no guidance scale.
- **ComfyUI blog (day-0)**: full-precision footprint **123.6 GB** → **42.5 GB** with the smallest variants (−66 %): pruning
  the modulation weights (≈ 40 % of parameters) into "a functionally equivalent lookup table", int8 quantisation with
  custom kernels, and **dynamic VRAM offloading** that lets it run on an RTX 3060. No RAM figure.
- **docs.comfy.org tutorial**: templates use the pruned int8 files; "the bf16 checkpoints need more VRAM than the int8
  ones" (no figure); the unpruned `*_int8_convrot` are "used only with LoRAs distilled on them".

Conclusion: no official source promises BF16 on 32 GB. The official mechanisms that make it possible are (a) MiniMax's own
statement that the AdaLN branches need not be loaded (→ pruned), and (b) ComfyUI's dynamic VRAM / weight streaming from
pinned RAM, which is on in our container (§1) and already proven here on a 40.86 GB bf16 checkpoint (§7).

## 5. ComfyUI support status (official nodes)

- Native, core nodes (`comfy_extras/nodes_minimax_h3.py`, `comfy/ldm/minimax/`), no custom nodes: `MiniMaxH3ImageToVideo`
  (modes `t2va`/`fl2va`, first and/or last frame), `MiniMaxH3ReferenceToVideo` (≤ 9 images, ≤ 3 videos, ≤ 3 audios,
  `ref_image_size` match/max), `MiniMaxH3AddGuide` (frames/audio anchored at a frame index), `MiniMaxH3SigmaShift`,
  `VAEDecodeAudio`. Versions: base T2V/I2V/R2V templates **0.30.0+**, Multiframe Reference **0.34.0+**, Fun ControlNet /
  Model Sparse Attention / Model Attention Backend **0.35.0+**, FastH3 **0.36.0+**, `--use-ck-attention` 0.32.0+. **We run
  0.38.1**: everything above is available.
- Template defaults: `res_multistep` + `simple`, **20 steps with the turbo toggle off**, shift 12 / audio shift 3, 1344×768
  (Megapixels 0.98, multiple 32; avoid 1.0 → 1376×768 over the area cap), 24 fps, `length` 124 = ≈ 5 s. Step guidance in
  the docs: 12–16 for simple content; **high-frequency detail improves up to ≈ 50 steps** (grid artefacts below);
  **reference-driven shots 20, or 25 if the reference drifts**; speech and voice timbre need 12+.
- Precision-specific notes: pruned-build LoRAs vs full-build LoRAs have different AdaLN tensors (shape mismatch → skipped);
  **turbo LoRAs carry no AdaLN tensors and load on either build** (so the draft tier works unchanged on pruned bf16).
  Known issues: "morphing or garbled on-screen text" with Sage attention is **caused by INT8 quantisation — fix: bf16
  checkpoints** (+ Comfy Kitchen attention or `--use-ck-attention`); Comfy Kitchen attention **crashes on int8_convrot**
  (issue #15529, open: `quant_qk_per_thread_int8 … alignment`). Both point the same way: bf16 removes two int8 caveats.
- Blackwell / CUDA: our stack is cu130 + torch 2.13 (Comfy's own preference for int8_convrot assumes cu130);
  `--disable-comfy-compiler` stays (ComfyUI #16342 on Blackwell + H3). Speed-ups available without quality loss claims from
  Comfy: Comfy Kitchen attention on bf16 (0.2.36 installed); Sage attention needs a wheel matching torch 2.13/cu130 (not
  installed; ≈ 2× claimed, "minimal quality loss" — a lossy approximation, so not for the final tier without an A/B).
  Sparse attention (`sol-attn`) is a lossless-claimed community kernel; untested here.
- Dynamic VRAM flags (cli_args of 0.38.1): `--disable-dynamic-vram`, `--vram-headroom`, `--async-offload N`,
  `--disable-pinned-memory`, `--fast-disk`, `--disable-mmap`, `--fp16-intermediates`. Defaults are what we run.

## 6. Pruned vs unpruned, precisions, and the turbo LoRAs

**Pruned.** MiniMax: ≈ 13B of the 33B parameters are AdaLN branches that "can be precomputed and cached" and "do not
need to be loaded for inference-only deployment"; "we release the complete model weights to support further development,
including fine-tuning". Comfy-Org (HF discussion #4): the modulation weights (≈ 40 %) are replaced by "an equivalent lookup
table" with "no loss in output quality" (Lexius); Kijai: "it does change the outputs of the model on same seed though …
not really to the worse or better, just different". ComfyUI 0.38.1 implements it as `adaln_t_table` (a 1025-row
float32 curve of the time embedding, linearly interpolated per step; `comfy/ldm/minimax/model.py` lines 491–742). An
independent numerical analysis of the same fold (multimodalart/MiniMax-H3-Pruned): rank-8 subspace residual ≈ 1.45e-5
relative RMS against ≈ 3.9e-3 for one bf16 rounding step (≈ 250× smaller); worst-case error against float64 **1.715e-3
pruned vs 1.751e-3 released** (the pruned form is marginally closer in 51/51 modules); end-to-end video cosine 0.991,
comparable to merely changing the attention kernel (0.992). **So "pruned bf16" is the released BF16 model in its
inference-only form, not a reduced model**; the unpruned 66.28 GB files matter only for fine-tuning or for full-build LoRAs.

**Precision ladder (DiT), highest first**: bf16 (66.28, fine-tune form) ≈ pruned bf16 (40.23) → int8_convrot (34.04) ≈
pruned int8_convrot (20.97, ours) → pruned fp8_scaled (20.96; Comfy ranks it below int8_convrot) → pruned w6a8 (15.98) →
community nvfp4/GGUF (one community NVFP4 card notes 4-bit "appears to cost some motion quality" against int8_convrot).
The only published quality number: a community ConvRot conversion measured 0.90–1.02 % relative L2 weight error vs bf16
(weights, not video). Nobody has published a bf16-vs-int8 video A/B — ours would be the first for this material.

**Text encoder**: bf16 51.51 GB (official weights) → int8_convrot 27.14 (Comfy, from the official weights) → nvfp4_awq
15.69 (ours; a conversion of a third-party AWQ, "Qwen License" mislabel on its card, MODEL-EVAL §8.1). The encoder runs
once per job, then moves to RAM; its precision affects prompt and reference understanding, not the per-step cost.

**Video VAE**: fp16 5.21 GB vs int8_convrot 2.81 GB (ours). The decoder draws every output frame; the encoder encodes the
first/last frames, references and guides. fp16 is the higher-quality official file and costs 2.4 GB more RAM.

**Turbo LoRAs (lightx2v, Apache-2.0)**: step distillations trained on the base — FL2V 4-step v0.1 ("a preview whose
visual details still need work"), v1.0 8-step and 4-step-768p, v1.2 4-step with "cleaner audio"; Ref2V 4-step v0.1 (ours)
and an 8-step v1.0 (Sept 4, not yet in the Comfy-Org repack). Quality: the official templates ship them **off**;
docs.comfy.org: "turbo's short schedule weakens reference conditioning, which can cause pose or face drift. Leave turbo
off for close reference adherence"; a two-case community diagnostic found the 4-step LoRA "is the one that drifts" while
the base locks to the reference even at 8–10 steps; our own A/B (MODEL-EVAL §8.4) measured SFace 0.33 with three in-take
cuts under turbo vs 0.69 and one continuous shot for the base at 20 steps. **Decision stands: no distilled variant as the
production default.**

## 7. Feasibility of BF16 33B on 32 GB with CPU/RAM offload

### 7.1 Unpruned BF16 (66.28 GB per DiT): not on this machine

Weights of one job: 66.28 (DiT) + 15.69 (TE) + 5.21 + 0.61 (VAEs) = **87.8 GB**, against a 78.5 GiB (84.3 GB) VM and a
72.4 GB pinned-memory budget — before activations, the page cache and the other services. Raising the VM towards the
95.5 GB physical limit leaves Windows nothing. ComfyUI's `--fast-disk` (disk-backed streaming) could in principle run it
but every step would re-read tens of GB from the VHDX. MiniMax's own guidance for full BF16 is an 80 GB card with auto
offload or two 80 GB cards, and the unpruned file buys no quality over the pruned one (§6). **Not recommended.** It is also
3.7 h of downloading per file at 5 MB/s.

### 7.2 Pruned BF16 (40.23 GB per DiT): feasible, with the evidence from this box

- **VRAM**: the DiT does not fit resident (40.2 GB + activations). ComfyUI's dynamic VRAM keeps what fits and faults the
  rest in per layer from pinned host RAM over PCIe 5.0 x16 (async offload, 2 streams by default). This is exactly how the
  **40.86 GB Qwen-Image-2512 bf16** ran here (MODEL-EVAL §10.3): card 31.5–31.7 GB "partially loaded", **43–44 s warm
  against 42–43 s for fp8** (+1 s), 98 s with the cold load, comfyui RAM 48.7 GiB vs 29.5 GiB (+19 GiB). A community
  5090 run of the **unpruned int8 H3 (34 GB, also larger than the card)** at 0.7–1.0 MP measured the same time as pruned
  int8 (≈ 446 s / 833 s per 8 s clip at 25 steps) with all variants pinned at 31.7–31.8 GB — i.e. weight streaming is
  hidden behind H3's compute at our resolution. Current H3 final tier: 350 s / 20 steps ≈ 17 s per step; streaming
  ≈ 15–20 GB per step at tens of GB/s adds ≈ 0.5–1 s per step at worst.
- **Compute**: bf16 matmuls against int8 kernels. Comfy's int8_convrot kernels are tuned, so bf16 may be slower per step
  by anything from 0 % to ≈ 60 % (no published H3 number; FP8 was 8–30 % *slower* than int8 on a 5090 in the community run
  above, so a quantised format is not automatically faster). **Expectation: 350–560 s per 5 s final clip at 1344×768, 20
  steps; a 15 s clip (362 frames) ≈ 3× that or more** (attention grows quadratically in tokens). Deadlines
  (`h3RunTimeoutMs`, 90–180 min) already cover this; `engineFactor` for the final tier should be re-measured.
- **Host RAM**: today 46.0 GiB with 36.7 GB of weights (DiT 21 + TE 15.7); adding 19.3 GB of DiT and 2.4 GB of VAE →
  **≈ 66–68 GiB of the 78.5 GiB VM** (step 1). The 72.4 GB pinned budget holds 61.7 GB of weights. **Adding the int8 TE
  (+11.5 GB) lands at ≈ 78–80 GiB and 73.2 GB of pinned weights — over both limits.** Step 2 therefore needs
  `.wslconfig` `memory=88GB` (leaves Windows ≈ 7.5 GB; to be judged) *or* the VLM/ASR/TTS services unloaded while H3 runs
  (they are already asked to `/unload` by the GPU lease; their RAM footprints are the question), *or* it stays a measured
  option. ComfyUI maps safetensors file-backed (reclaimable page cache), so the measured "RAM" overstates the hard
  requirement — but §10.3 shows the comfyui container's RSS really grew by the weight size.
- **Disk**: 687 GB free; step 1 + 2 need 112.8 GB.
- **What a 32 GB card cannot do regardless of precision**: 2K output (Regenerate-2K is not open; upscale separately),
  Context-IR (hosted; our prompt rewriting stands in), sparse attention from MiniMax (not released).

### 7.3 If pruned BF16 proves unacceptable

The highest-quality supported fallback is what we run: **pruned int8_convrot** DiT (Comfy's preferred quantisation on
cu130; the full int8 adds bytes, not quality), with the fp16 video VAE and the int8 text encoder still worth taking (they
are independent of the DiT choice). fp8_scaled, w6a8, NVFP4 and GGUF are all below it.

## 8. Recommended configuration and the download list

**Target (final tier)**: `UNETLoader minimax_h3_ref2va_pruned_bf16` / `minimax_h3_fl2va_pruned_bf16`, `weight_dtype
default`; `CLIPLoader` int8_convrot encoder (step 2; nvfp4 until then); `VAELoader minimax_h3_video_vae_fp16` and
`minimax_h3_audio_vae_fp32`; **no LoRA; `res_multistep`, `simple`, 20 steps** (25 when a reference drifts, per the
official docs; 50 only for high-frequency-detail shots, measured); shift 12 / 3; 1344×768; frames on 17k+5; BasicGuider;
default PyTorch attention for the acceptance run, Comfy Kitchen attention as a measured speed option (bf16 only);
`--disable-comfy-compiler` kept. **Draft tier unchanged** (turbo LoRAs load on the pruned bf16 too). Switching FL2VA ↔
Ref2VA keeps the `/free` call (two 40 GB DiTs never co-resident).

**Promotion rule** (MODELS.md policy): candidate → the §8.4 harness re-run on the same two shots, seed 970007, all four
arms on bf16 (A: base 20 steps; D: + `max`; and the two draft arms) → SFace, the heard line, framing by eye, card/RAM
peak, engine time → real-UI takes → promote only on a visible gain or parity at acceptable time; the int8 files are deleted
only after that (keep the working model until the replacement is proven).

### 8.1 Download list, priority order (all `Comfy-Org/MiniMax-H3`, pin revision `e5eb578a89295337b8ff433a035929ce0279e0b6`; sha256 = LFS oid, published)

| # | File | Bytes | GB | sha256 | Status | Why / order |
|---|---|---|---|---|---|---|
| 1 | `diffusion_models/minimax_h3_ref2va_pruned_bf16.safetensors` | 40 225 724 176 | 40.23 | `37c0da793e20ca735272ec2be655f08a2e10f97a3ec8fdfb40f5b39a736ed6fe` | **download** (≈ 2.2 h) | every take with references runs Ref2VA; the A/B of §8.4 is Ref2VA |
| 2 | `diffusion_models/minimax_h3_fl2va_pruned_bf16.safetensors` | 40 225 724 176 | 40.23 | `a32572fb90b5508b201ec7c2eddcc184b13ddfd3c6f6d2cf06a0b46535d541b4` | **download** (≈ 2.2 h) | first/last-frame and text-to-video shots |
| 3 | `vae/minimax_h3_video_vae_fp16.safetensors` | 5 207 808 496 | 5.21 | `7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522` | **download** (≈ 17 min) | full-precision decode of every frame and encode of references; independent of the DiT choice |
| — | **Step 1 total** | **85 659 256 848** | **85.66** | | **≈ 4.8 h at 5 MB/s** | |
| 4 | `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | 27 141 342 152 | 27.14 | `bc2ced0fbea64757fa9acddccfc0b3f4819d1dcf1da6c124d690d368be283923` | **download after the RAM decision** (≈ 1.5 h) | official-weights-derived, 8-bit vs 4-bit prompt/reference understanding; clears the third-party AWQ licence label; needs `.wslconfig` 88 GB or a measured RAM plan (§7.2) |
| — | **Step 1 + 2 total** | **112 800 599 000** | **112.80** | | **≈ 6.3 h** | |
| ✓ | `vae/minimax_h3_audio_vae_fp32.safetensors` | 605 254 808 | 0.61 | `8e505d95…` | present | already the only/highest precision |
| ✓ | `loras/…fl2v_turbo_8step_v1.0…`, `loras/…ref2v_turbo_4step_v0.1…` | 2 × 1 956 193 000 | 3.91 | present | draft tier; compatible with pruned bf16 |
| ✓ | `diffusion_models/*_pruned_int8_convrot` (2) | 2 × 20 970 379 616 | 41.94 | present | fallback and the baseline of the A/B; delete only after promotion |
| ✓ | `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15 687 142 551 | 15.69 | present | stays until #4 is proven |
| ✗ | `text_encoders/qwen3vl_32b_minimax_h3_bf16.safetensors` | 51 506 295 256 | 51.51 | `600d567f6a9629c8574e8e7041b199bdd9c59a986afa7906910a81919610607d` | not recommended | 51.5 + 40.2 GB of weights exceeds the VM; the encoder is 8-bit-robust |
| ✗ | `diffusion_models/minimax_h3_{fl2va,ref2va}_bf16.safetensors` (unpruned) | 2 × 66 280 487 368 | 132.56 | `907d4add…6182`, `e32c54c1…3026` | not recommended | fine-tune form; no inference gain (§6); does not fit the VM (§7.1) |
| ✗ | `*_int8_convrot` unpruned, `*_pruned_fp8_scaled`, `*_pruned_w6a8`, Fun ControlNet, embeddings | | | | not needed | below or beside the target |

Manifest shape when the producer approves: a new group (e.g. `video-minimax-h3-bf16`) with #1–#3 (and later #4) pinned to
revision `e5eb578a…`, outside the default `MODEL_GROUPS` until promoted, as `eval-qwen-image-2512-bf16` was. One file at a
time (the link), DiTs first; `fetch.py` verifies the sha256 above. Nothing in this document performs that download.

## 9. Licence (MiniMax H3 Community License Agreement, 2026-08-02, Nanonoble Pte. Ltd.)

Same licence for every Comfy-Org file above (the repack links the MiniMaxAI LICENSE); the precision change alters nothing.
Grant: non-exclusive, royalty-free use, reproduction, modification, distribution **within the Applicable Territory =
worldwide excluding the EU, UK, Republic of Korea and USA**; MiniMax's own `docs/QA-about-License.md` calls this "not
yet, not not ever" and offers a formal licence through **platform.minimax.io/h3-license** after a review of the deployment
and its safeguards (the API is "available globally"). Commercial use allowed; **> US$20M yearly revenue needs prior written
authorisation** (api@minimax.io, subject "MiniMax H3 licensing - authorization request"). **§IV.2: prominently display
"MiniMax H3" on the user interface** of a commercial product (done: LICENSES.md §2); §III.3 encourages "Powered by
MiniMax H3", an AI-generation identifier on files and a public statement; NOTICE text for distributions outside hosted
services. §V.3: no use of the model or its Outputs to improve any other AI model (distillation included). §VI.4: "MiniMax
claims no rights over the Outputs you generate." Exhibit A AUP (20 items, revised 2026-08-02) binds users of a product
built on H3 (§V.2). Governing law Hong Kong SAR. The encoder's base, Qwen3-VL-32B, is Apache-2.0 (named in the LICENSE);
the turbo LoRAs are Apache-2.0 (lightx2v). Comfy sells separate H3 commercial licences for its own cloud and local
users; our position (LICENSES.md, 2026-10-06: commercial use chosen, territory licence being applied for) is unchanged.
Reading of the text, not legal advice.

## 10. Official prompting and reference-conditioning guidance (summary)

Sources: `docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md` and `…_ref_en.md` in MiniMaxAI/MiniMax-H3 (the GitHub skill
`h3-prompt-writing` mirrors them: `npx skills add https://github.com/MiniMax-AI/MiniMax-H3 --skill h3-prompt-writing`),
and docs.comfy.org's H3 prompt guide. MiniMax "strongly recommends" Context-IR or an equivalent rewriting step — ours is
`h3ReferencePrompt`; this section is what it must produce.

**Base modes (T2VA, I2VA, FL2VA, L2VA)** — structure:
1. **Instruction line first, then one blank line** (none for T2VA). I2VA: "<Picture 1> (from [Shot 1]) is fully referenced
   at 0.00 seconds." FL2VA: Picture 1 (from Shot 1) aligned to 0.00 s and Picture 2 (from Shot N) to the end time. L2VA:
   <Picture 1> (from [Shot N]) aligned to the end time. Durations as the effective length with two decimals (S.SS).
2. Three fields in order: `integrated_multimodal_description:` (the timeline: visuals, actions, shots, speakers, dialogue,
   diegetic sound), `overall_soundscape:` (1–4 sentences: ambience, physical sounds, breathing/laughter; no dialogue,
   no diegetic music; `N/A` only for requested silence), `non_diegetic_music:` (1–3 sentences on instrumentation,
   tempo, rhythm, dynamics; no mood words; `N/A` if none).
- Shots: `[Shot 1]` carries no timestamp; later shots are numbered with strictly increasing cut times; cut phrasing "the
  camera cuts to"; a cut must add information (a change of distance/angle alone → camera motion, not a cut). **FL2VA:
  describe the motion path between the two frames, one shot unless asked; the final shot must reach the last frame.**
  I2VA: anchor Shot 1 on the image (style, subjects, composition); then first-frame anchor → action onset → development →
  result. Keep identity, clothing, colours and layout consistent.
- Camera vocabulary: Zoom In/Out, Push In/Pull Out, Pan, Truck, Tilt, Pedestal, Arc, Tracking, Static, Shake
  Slightly/Strongly, POV, Roll; amplitude "with small/large amplitude", speed "at slow/fast speed", written inside sentences.
- Dialogue: stable speaker IDs `(S1)`, `(S2)`, compound `(S1,S2)`; establish a voice on first appearance (age, sex, pitch,
  timbre, rate, accent) **outside** `<d>`; inside `<d>` only the language tag and the exact words: `<d>[English] I get off
  at the next station.</d>` — never translated or rewritten (Iraqi lines stay Iraqi, `[Arabic]`). Voice-over: "says in an
  off-screen voiceover", lips closed. A line across a cut: `<scenetrans>` at both connection points; a line cut by the
  end: `<cutoff>`. On-screen text in double quotes, verbatim. Diegetic music (radio, singing) belongs in the description.
- Everything positive: the templates use `BasicGuider` (no negative branch); naming an unwanted thing adds it.
- Local engine specifics (ComfyUI): 768 px short edge, multiples of 32; `length` in frames on 17k+5 (124 ≈ 5 s);
  `embedding:name` works (the 10 embeddings are unofficial).

**Reference mode (Ref2VA)** — labels and binding:
- `<Subject N>` = reusable visible content (a person, object, place, style, action) — the unit the target uses;
  `<Picture N>` = a concrete frame anchor or storyboard reference; `<Video N>` = a whole-video source (structure, camera,
  pacing, editing/continuation); `<Audio N>` = an audio signal copied or referenced (a video's soundtrack counts as its
  own `<Audio N>`). Numbering follows the **connection order** (the k-th connected picture is `<Picture k>`); in diffusers
  "the order is semantic … reordering the same references is a different request."
- Bind a character: "<Subject 1> is the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver
  necklace." A picture cited only inside a subject definition is not a separate anchor; a sheet or storyboard gets its own
  `<Picture N>`; name what each asset contributes (appearance from an image, motion from a video).
- Voice: `<Audio N>` with a relationship marker — `fully_copy` / `partially_copy` (the signal is reused) or `reference` /
  `weak_reference` (timbre, delivery, rhythm only); map it to the speaker's global ID (`<Subject 1> (S1)`). Visible-content
  markers: `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`. Anchored audio steers timing,
  prosody and timbre; the output audio is always regenerated (our E1 finding agrees).
- Motion: `<Video N>` for camera/cuts/rhythm (`reference generation`); a reused person/action is still a `<Subject N>`.
- Multiple characters: one `<Subject N>` each, consistent across shots; `(S1)`, `(S2)` in order of first vocal event, reused
  at every line. Tie lines to visible events ("when the phone is at his ear") rather than timecodes; if a line still goes to
  the wrong speaker, generate it with a voice tool and supply it as that speaker's audio reference (our dialogue path).
- Length: `detailed_description` ≈ 350–500 English words for generation; dialogue-dense content outranks the word count;
  six sections in order; `[unclear]` for unintelligible speech; never repeat dialogue in the sound fields.
- Reference preparation (nodes/diffusers): images are encoded at their own short edge (`match` scales down to the
  generation's area, `max` to a 2048 short edge — "stronger identity fidelity at the cost of speed"; our A/B saw no gain);
  videos are resampled to 24 fps by dropping/duplicating frames, so a wrong declared fps conditions at the wrong speed;
  audio is resampled to the audio VAE's rate; `num_frames` for a soundtrack = `round(samples / sample_rate × 24)` snapped
  up to 17n+5. Steps for reference shots: 20, or 25 if the reference drifts; turbo off for close adherence.

## 11. Measurements owed before promotion (no GPU time spent in this research)

1. §8.4 harness on `ref2va_pruned_bf16` (arms A and D, plus the draft arms) — SFace, heard line, framing, engine time,
   card and comfyui RAM; the same on `fl2va_pruned_bf16` with a first/last-frame shot.
2. A 15 s (362-frame) final clip on bf16: engine time and RAM (the frames^1.5 estimate is unmeasured).
3. fp16 video VAE alone against int8 (same seed, same DiT): decode quality at full size, RAM.
4. int8 text encoder: RAM with and without the VLM/ASR/TTS services resident; whether `.wslconfig` 88 GB is needed.
5. Comfy Kitchen attention on bf16 (speed; must be visually identical) — and nothing lossy (Sage, Spectrum, caches) in
   the final tier without its own A/B.

## Sources

- MiniMaxAI/MiniMax-H3 model card, README, LICENSE, `docs/QA-about-License.md`, prompt guides:
  https://huggingface.co/MiniMaxAI/MiniMax-H3 · https://github.com/MiniMax-AI/MiniMax-H3 · file API
  `https://huggingface.co/api/models/MiniMaxAI/MiniMax-H3/tree/main?recursive=true`
- Comfy-Org/MiniMax-H3 repack and file API (sizes, LFS sha256, revision e5eb578a): https://huggingface.co/Comfy-Org/MiniMax-H3 ·
  discussion #4 (pruned vs unpruned): https://huggingface.co/Comfy-Org/MiniMax-H3/discussions/4
- ComfyUI day-0 blog: https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui · tutorial and prompt guide:
  https://docs.comfy.org/tutorials/video/minimax/minimax-h3 · Dynamic VRAM blog:
  https://blog.comfy.org/p/dynamic-vram-in-comfyui-saving-local · issue #15529 (ck attention × int8):
  https://github.com/Comfy-Org/ComfyUI/issues/15529
- diffusers MiniMax-H3 (official integration, memory recipes): https://huggingface.co/docs/diffusers/main/en/api/pipelines/minimax_h3
- MiniMax deployment page: https://design.minimax.io/h3 · licence application: https://platform.minimax.io/h3-license
- lightx2v turbo LoRAs: https://huggingface.co/lightx2v/Minimax-h3-Turbo
- Community (marked as such above): multimodalart/MiniMax-H3-Pruned (numerical analysis of the AdaLN fold);
  wan2-7.io "36 FL2VA runs" (5090, full int8 vs pruned int8 vs fp8, VRAM/RAM/time); wildminder/awesome-minimax-H3
  performance guide; ai-muninn 5090 benchmarks.
- Local: `docker/models/manifest.json`, `docs/MODELS.md`, `docs/MODELS-STORAGE.md`, `docs/LICENSES.md`,
  `docs/research/MODEL-EVAL-2026-10.md` §8 and §10.3, `docs/research/GPU-STAGING-2026-10.md`,
  `src/server/workflows/minimax-h3.ts`, `src/domain/video-capability.ts`, the running `vewbox-comfyui-1` container.

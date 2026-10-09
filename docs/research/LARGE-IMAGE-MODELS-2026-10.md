# Large image models (≥ 20B), research 2026-10-09

Question (producer, 2026-10-09): is there a larger, PROVEN, production-legal open-weight image model that should replace
Qwen-Image-2512 (generation) or Qwen-Image-Edit-2511 (editing) on the one RTX 5090 (32 GB)? Policy: the largest proven
high-quality model that runs reliably here; never downgrade for speed; never switch merely because a model is bigger —
only if it is materially better on the exact Vewbox tests AND production-legal.

Method: original sources only — Hugging Face model cards and `/api/models/<repo>/tree/main` listings (byte sizes),
licence files, the vendors' GitHub repos and blogs, the ComfyUI changelog. Marketing pages and aggregator blogs were read
only to find primary sources. Numbers marked [E] are estimates and say why. Nothing was downloaded; no other file was
changed. Arena figures are those already recorded in `MODEL-EVAL-2026-10.md` §7.1 (Artificial Analysis open-weights
boards, fetched 2026-10-06).

Machine facts that decide feasibility (from `MODEL-EVAL-2026-10.md`, `GPU-STAGING-2026-10.md`): one RTX 5090, 32 GB
VRAM; host RAM visible to Docker 46.8 GiB (no `.wslconfig` yet); ≈ 4.7–5 MB/s link (17 GB took 61 min); ComfyUI 0.38.1
(torch 2.13 + cu130) is the only image runtime in the stack; incumbents measured here: Qwen-Image-2512 quality 42 s and
29.8 GB peak, Qwen-Image-Edit-2511 ≈ 100 s and 30.4 GB peak.

## 1. Verdict

**Keep Qwen-Image-2512 and Qwen-Image-Edit-2511. Download nothing.** No ≥ 20B open-weight model found today is at the
same time (a) production-legal for Vewbox without a paid or conditional licence, (b) proven on this card's 32 GB without
unverified offload tricks, and (c) shown anywhere to be materially better than the incumbents on the kind of tests
Vewbox runs. The one model that fits the card and is legal to *evaluate* — FLUX.2 [dev] in its official NVFP4 build —
cannot go into production without buying a Black Forest Labs self-hosted licence, and its public evidence (arena parity
with the incumbents) does not justify that purchase. §6 says exactly what would have to change.

## 2. Comparison table

| Model | Params | Released | Licence → commercial verdict (Vewbox) | Files + GB to download | VRAM/RAM path on the 5090 | Gen / edit / multi-ref | Runtime here | Time per image | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **Qwen-Image-2512** (incumbent) | 20B DiT + Qwen2.5-VL-7B | 2025-12-31 | Apache-2.0 → **yes** | installed (fp8 cast; bf16 40.9 GB optional) | 29.8 GB measured, fits | gen only | ComfyUI core | 42 s measured | Qwen line continues (2.1 is NC, 3.0 API-only) |
| **Qwen-Image-Edit-2511** (incumbent) | 20B + 7B | Dec 2025 | Apache-2.0 → **yes** | installed | 30.4 GB measured, fits | edit, multi-image (2 shown, "multi-person fusion") | ComfyUI core (auto-detected since v0.5.0) | ≈ 100 s measured | last Apache editor from Qwen |
| **FLUX.2 [dev]** | 32B RF transformer + Mistral-Small-3.2-24B VLM encoder | 2025-11-25 | FLUX [dev] Non-Commercial License v2.0: non-commercial, non-production; evaluation by a company allowed; production needs BFL "Platform"/"Professional" licence (no public price) → **no, unless a licence is bought** | bf16: 64.45 GB DiT + 0.34 VAE (gated). NVFP4 (official): 21.04 or 22.77 GB (mixed). Comfy fp8: 35.46 GB DiT + 18.03 GB fp8 TE (or 12.28 fp4 / 35.58 bf16) + VAE | fp8 DiT alone > 32 GB → ComfyUI weight-streaming into 46.8 GiB host RAM (users report 32 GB RAM insufficient). NVFP4 DiT 21–23 GB fits; ComfyUI single-file NVFP4 path for *dev* not documented by BFL | gen + single-ref + multi-ref edit (up to 10 refs, 4 MP) in one model | ComfyUI core since v0.3.72 (templates `image_flux2`, `image_flux2_fp8`); diffusers | no primary 5090 number. [E] fp8 streamed: minutes; NVFP4 in-VRAM: ≈ 1–2 min at 1 MP/28–50 steps | family active (klein Jan 2026, NVFP4 repo, ComfyUI fixes to May 2026); the dev weights unchanged since launch |
| **HunyuanImage-3.0** (base) | 80B MoE, 64 experts, 13B active | 2025-09-28 | Tencent Hunyuan Community License: commercial OK **inside Territory** (world minus EU/UK/South Korea), > 100M MAU needs a licence, outputs may not improve other models, AUP → **conditional yes** | 32 shards, **168.54 GB** bf16/f32 | official: ≥ 3 × 80 GB; no official quant/offload. Community NF4 ≈ 45–48 GB on disk, "24 GB minimum" per node README, ideal 48 GB+, 64 GB+ system RAM | gen only | not in ComfyUI core; community nodes (code CC BY-NC 4.0) or Transformers/vLLM | 96 GB NF4: ≈ 58 s (40 steps); 48 GB NF4: ≈ 4 s/step; 5090: no report | last release Jan 2026 |
| **HunyuanImage-3.0-Instruct** / **-Distil** | same | 2026-01-26 | same → **conditional yes**; the only working ComfyUI nodes are CC BY-NC (commercial use of the node code needs the author's licence) | official: 32 shards, **168.54 GB**. Community NF4 Instruct-Distil v2: 11 shards, **51.39 GB** | official ≥ 8 × 80 GB. NF4: ≈ 29 GB weights + 12–20 GB overhead = 41–49 GB; author: "single 48 GB GPU", "may work on 24 GB with block swap" (unverified); node README: Instruct NF4 minimum 48 GB; 64 GB+ system RAM (Docker sees 46.8 GiB) | gen + edit + multi-image fusion (official ≤ 3), CoT; identity preservation not a named claim | community nodes only | Distil 8 steps: [E] ≈ 1–2 min on a 48 GB card; on 32 GB with block swap unknown | v1.3.0 nodes 2026-02-12 |
| Emu3.5-Image (BAAI) | 34B AR next-token | paper 2025-10-30 | Apache-2.0 → yes | 15 shards, **68.21 GB** bf16 | no VRAM figure; "≥ 2 GPUs" recommended; no quantization documented | T2I + X2I (multi-ref list; no identity claim) | Transformers / vLLM; no ComfyUI | "each image may take several minutes" (DiDA weights unreleased) | news stop 2025-11-28 |
| Qwen-Image-2.1 | 7B DiT + Qwen3-VL-8B (≈ 15B) | 2026-09-20 | Qwen Research License (non-commercial) → **no** | eval int8 set already fetched (17.3 GB, eval group) | 22.4 GB measured | unified gen + edit, ≤ 10 refs, RGBA | ComfyUI core v0.37.0 | 7–14 s measured | active |
| GLM-Image (Z.ai) | 9B AR + 7B DiT (16B) | 2026-01-14 | MIT (VQ/ViT Apache-2.0) → yes | not sized (below the 20B brief) | "~23 GB with `enable_model_cpu_offload`" | gen + edit, identity-preserving, multi-image | diffusers / SGLang; no ComfyUI core entry | not stated ("runtime cost still relatively high") | active |
| JoyAI-Image-Edit(-Plus) | 16B + Qwen3-VL-8B | 2026 | Apache-2.0 → yes | see MODEL-EVAL §7.3 | fits | edit, ≤ 6 refs | ComfyUI core | — | candidate already in §7 |

## 3. FLUX.2 [dev] — findings

**What it is.** 32B rectified-flow transformer coupled with the Mistral-3 24B vision-language model (`Mistral-Small-3.2-
24B-Instruct-2506`) as text encoder and local prompt upsampler; guidance-distilled; text-to-image, single-reference and
multi-reference editing ("Reference up to 10 images simultaneously", editing "at up to 4 megapixels") in ONE model.
Released 2025-11-25. Recommended 50 steps (28 "a good trade-off"), guidance 4.
Sources: https://bfl.ai/blog/flux-2 ; https://github.com/black-forest-labs/flux2 ; https://huggingface.co/black-forest-labs/FLUX.2-dev

**Exact files (HF API trees, decimal GB).**
- `black-forest-labs/FLUX.2-dev` (gated: licence + AUP + contact details): `flux2-dev.safetensors` 64,446,596,128 B
  (64.45 GB, bf16), `ae.safetensors` 336,211,292 B (0.34 GB), `LICENSE.md`. Text encoder not included (diffusers folders
  `text_encoder/`, `transformer/`, … exist but are not sized by the API).
- `black-forest-labs/FLUX.2-dev-NVFP4` (official, gated): `flux2-dev-nvfp4.safetensors` 21,035,602,376 B (21.04 GB);
  `flux2-dev-nvfp4-mixed.safetensors` 22,772,036,568 B (22.77 GB, "a small set of weights in BF16"). Card shows only a
  diffusers snippet; "Diffusion Single File: No code snippets available yet"; no VRAM figures, no ComfyUI mention.
  https://huggingface.co/black-forest-labs/FLUX.2-dev-NVFP4
- `Comfy-Org/flux2-dev` (ComfyUI repack, also tagged non-commercial): `split_files/diffusion_models/flux2_dev_fp8mixed.
  safetensors` 35,455,599,592 B (35.46 GB); `split_files/text_encoders/mistral_3_small_flux2_bf16.safetensors` 35.58 GB,
  `…_fp8.safetensors` 18.03 GB, `…_fp4_mixed.safetensors` 12.28 GB; VAE `flux2-vae.safetensors` ≈ 0.34 GB.
  Smallest ComfyUI-documented set: 35.46 + 18.03 + 0.34 = **53.8 GB** (≈ 3.2 h at 4.7 MB/s). NVFP4-mixed + fp8 TE + VAE
  = **41.1 GB** (≈ 2.4 h), path undocumented for ComfyUI.

**Licence (FLUX [dev] Non-Commercial License v2.0, revised 2025-11-25; covers FLUX.2 [dev] by name).**
https://bfl.ai/legal/non-commercial-license-terms
- Grant §2(a): a "non-exclusive, worldwide, non-transferable, non-sublicensable, revocable, royalty free, and limited
  license" solely for Non-Commercial Purposes.
- §1(c) Non-Commercial Purpose: personal research/study/hobby, "testing or non-production research and development by
  commercial entities", charitable use — "but only so far as you do not receive any direct or indirect payment arising
  from the use of the FLUX [dev] Model"; excluded: "use (a) for revenue-generating activity, (b) in direct interactions
  with or that has impact on end users", "(c) to train, fine tune, or distill other models for commercial use".
- §4(a): the model may not be used "for any commercial or production purposes".
- §2(d) Outputs: "We claim no ownership rights in and to the Outputs"; Outputs may be used for any purpose including
  commercial, except to train a competing model. §1(a): "Outputs are not considered Derivatives". **Reading for Vewbox:**
  the outputs clause does not rescue production use — generating a paid film asset is itself a "production purpose" by
  the model, which §4(a) forbids; BFL's own help centre says locally run FLUX.2 [dev] weights "require commercial license
  from bfl.ai/licensing" (https://help.bfl.ai/articles/3670520907-can-i-use-the-api-for-a-commercial-application).
- §2(e): deployers must "implement and maintain content filtering measures" or review Outputs before distribution.
- Commercial path (https://bfl.ai/pricing/licensing): tiers Builder (klein only; dev as add-on; 10K images/month, "Not
  meant for client use"), **Platform** (klein Base 9B + FLUX.2 [dev], 100K images/month, 10 users, 1 domain, "Purchase"
  in the dashboard), **Professional** (FLUX.2 [dev], "For agencies and service providers", up to 3 domains, "first 3
  clients are included", Contact Sales), Enterprise (custom). No prices are published.
- **Verdict:** evaluation on this machine is permitted (non-production R&D by a commercial entity); production use of the
  weights is not, until a Platform or Professional licence is bought. Vewbox's existing rule (commercial-safe weights
  only, MODEL-EVAL §7) therefore still excludes it from the runtime.

**VRAM / RAM on the 5090.** NVIDIA (2025-11-25): the bf16 model needs "90GB VRAM to load completely", lowVRAM mode
"still 64GB"; the fp8 build with ComfyUI cuts VRAM "by 40%" and ComfyUI's upgraded weight streaming "offload[s] parts of
the model to system memory" at a speed cost (https://blogs.nvidia.com/blog/rtx-ai-garage-flux-2-comfyui). ComfyUI's own
guidance: "Recent GPU (24GB+ strongly recommended for high-res)" (https://blog.comfy.org/p/flux2-state-of-the-art-visual-intelligence).
On a 32 GB card the fp8 DiT (35.46 GB) does not fit on its own, so every step streams weights from host RAM; user
reports under the ComfyUI post describe 5090 + 32 GB RAM crashing and 5090 + 96 GB RAM taking "several minutes" per
image (anecdotes, no settings). Docker here sees 46.8 GiB and H3 video already peaks at 40.8 GiB — the fp8 path is a
real risk on this host. The NVFP4 DiT (21–23 GB) would fit in VRAM with the fp8 Mistral encoder (18 GB) loaded and
unloaded first, which is the only shape that is plausible here; NVIDIA's NVFP4 results for FLUX.2 are data-centre
(B200/B300, TensorRT-LLM prototype; "roughly 2x speedup", quality "remarkably similar" on one sample, extra background
objects on another — https://developer.nvidia.com/blog/scaling-nvfp4-inference-for-flux-2-on-nvidia-blackwell-data-center-gpus).
ComfyUI loads NVFP4 for the klein models (NVIDIA GDC 2026 post); for the dev single file no vendor statement exists.

**Expected time.** No primary RTX 5090 benchmark exists. [E] NVFP4 in VRAM: a 32B model at 1 MP for 28–50 steps on a
5090 should land around 1–2 min (the 20B Qwen-2512 fp8 takes 42 s at 50 steps here); fp8 with weight streaming: several
minutes (one 4090 + 128 GB RAM report: ≈ 230 s with ≈ 55 GB offloaded).

**Quality evidence.** Arena (open weights, 2026-10-06): T2I 1000, Edit 1000 — level with Qwen-Image-2512 (999) and
below Qwen-Image-Edit-2511 (1021). No public head-to-head on canonical-character consistency across realistic, anime and
cartoon finishes — the Vewbox tests — exists; the 10-reference editing claim is BFL's own.

**Maintenance.** The FLUX.2 family is active (klein 4B/9B 2026-01-15; NVFP4 repo; ComfyUI Flux2 fixes through May 2026),
but the dev weights themselves have had no revision since launch and the flux2 GitHub repo shows 12 commits.

## 4. HunyuanImage-3.0 and HunyuanImage-3.0-Instruct — findings

**What it is.** A unified autoregressive (not DiT) multimodal model: 80B total, 64 experts, 13B active per token.
Base (2025-09-28) is text-to-image only and "does not automatically rewrite or enhance input prompts" (its `--rewrite`
needs a DeepSeek API key through Tencent Cloud). **Instruct** and **Instruct-Distil** (2026-01-26) add image-to-image
editing, "multi-image fusion (up to 3 inputs)", prompt self-rewrite and chain-of-thought; Distil runs 8 steps instead
of 50. Identity preservation is not a named feature in the card or README.
Sources: https://huggingface.co/tencent/HunyuanImage-3.0 ; https://huggingface.co/tencent/HunyuanImage-3.0-Instruct ;
https://github.com/Tencent-Hunyuan/HunyuanImage-3.0

**Exact files.** Both official repos: 32 safetensors shards (`model-0001-of-0032` … `0032`), 168,540,402,060 B =
**168.54 GB** (157.0 GiB) each, bf16/f32, plus `trust_remote_code` python files. At 4.7 MB/s that is ≈ 10 hours of
exclusive link time per repo and would not fit the card in any precision Tencent ships. **Do not download the official
weights.**

**Official hardware.** README table: Base "≥ 3 × 80 GB", Instruct "≥ 8 × 80 GB", Instruct-Distil "≥ 8 × 80 GB";
Gradio demo defaults to GPUs 0,1,2,3; FlashInfer first run "about 10 minutes" of kernel compilation. Single-GPU, CPU
offload and quantization are not mentioned by Tencent. Runtimes: Transformers (`trust_remote_code=True`; the repo
directory must be renamed because of the dotted name), vLLM (`vllm_infer`, 2025-10-30). No diffusers pipeline. **Not in
ComfyUI core**: the ComfyUI changelog (Jun 2025 – 2026-10-07) has Hunyuan Image 2.1 (v0.3.58) and Hunyuan3D entries but
no HunyuanImage 3.0 entry (https://docs.comfy.org/changelog).

**Community quantized path (the only one that could touch a 5090).**
- `EricRollei/HunyuanImage-3.0-Instruct-Distil-NF4-v2`: 11 shards, 51,389,194,013 B = **51.39 GB** (≈ 3 h at 4.7
  MB/s). Card: "~29 GB" weights + "~12-20 GB" inference overhead = 41–49 GB; "single 48GB GPU" recommended; "may work on
  24GB GPUs" with ≈ 20 blocks swapped — the author's claim, and the block-swap section says it applies to "INT8 and BF16
  models". Attention projections kept in bf16 "for better image quality"; no NF4-vs-bf16 measurement.
  https://huggingface.co/EricRollei/HunyuanImage-3.0-Instruct-Distil-NF4-v2
- Nodes `EricRollei/Comfy_HunyuanImage3` v1.3.0 (2026-02-12): Instruct table minimum VRAM NF4 **48 GB**, INT8 96 GB,
  bf16 96 GB; system RAM 64 GB+ for NF4; "Low VRAM" loaders "verified on 24–32 GB cards" for the *base* model; the RTX
  5090 is not mentioned. Measured by the author: RTX 6000 Pro 96 GB, NF4, 1024², 40 steps ≈ 58 s; RTX 6000 Ada 48 GB,
  NF4, 50 steps ≈ 4 s/step (≈ 200 s); 2 × 4090 bf16 ≈ 3.5 s/step. Edit node = one image + instruction; Multi-Fusion
  2–5 images, "officially supports up to 3". **The node code is CC BY-NC 4.0** — "Commercial use requires a separate
  license from the author" — so even the runtime would need a second licence. The README also mislabels the model as
  Apache-2.0; the HF `LICENSE` is the Tencent Hunyuan Community License (below).
  https://github.com/EricRollei/Comfy_HunyuanImage3
- No GGUF or fp8 build of HunyuanImage-3.0 was found (GGUF hits are HunyuanVideo). Feasibility on 32 GB + 46.8 GiB
  host RAM is therefore **unproven**: below the author's own minimum for Instruct NF4, below the 64 GB RAM recommendation,
  and with block swap making every step slower than the 4 s/step measured on a 48 GB card.

**Licence (TENCENT HUNYUAN COMMUNITY LICENSE AGREEMENT, `LICENSE` in both repos; HF tag `license: other`).**
https://huggingface.co/tencent/HunyuanImage-3.0/blob/main/LICENSE
- §1(l) Territory: "the worldwide territory, excluding the territory of the European Union, United Kingdom and South
  Korea"; §2 grant "for the Territory only, a non-exclusive, non-transferable and royalty-free limited license".
- §4: if the licensee's products exceed "100 million monthly active users in the preceding calendar month", "You must
  request a license from Tencent, which Tencent may grant to You in its sole discretion".
- §5(b): "You must not use the Tencent Hunyuan Works or any Output … to improve any other AI model (other than Tencent
  Hunyuan or Model Derivatives thereof)". §5(a): the Acceptable Use Policy "is hereby incorporated by reference".
  §3(d): distributions must carry a "Notice" text file. §8(b): on termination "promptly delete and cease use".
- **Verdict:** commercial use is permitted for a studio operating outside the EU/UK/South Korea and far below 100M MAU,
  but it is a conditional, territory-bound licence (an EU co-production or EU-hosted deployment would fall outside it),
  and the only ComfyUI path adds a non-commercial node licence. Together with the unproven 32 GB fit, Hunyuan does not
  qualify under the "proven and production-legal" rule.

**Quality evidence.** Arena (open weights, 2026-10-06): Instruct Edit 1066 — the highest commercial-licensable editor
score seen, 45 points above Qwen-Image-Edit-2511. That is the one reason to keep Hunyuan on the watch list: if a
≤ 32 GB, Apache/MIT-licensed runtime appears (official quant, ComfyUI core support), it becomes the first editor to
re-test.

## 5. Other ≥ 20B / unified candidates checked (2025–2026)

- **Qwen-Image-2.1** (2026-09-20): unified generation + editing, up to 10 references, identity preservation claimed, RGBA;
  7B DiT + Qwen3-VL-8B (below 20B); **Qwen Research License (non-commercial)**. Already measured here (MODEL-EVAL §2.7):
  strongest editor on E1 but fails two gates and is NC — research reference only. https://huggingface.co/Qwen/Qwen-Image-2.1
- **Qwen-Image-2.0 / Qwen Image 3.0 (Pro)**: no open weights found (2.0 absent from the Qwen HF org; 3.0 appears only as
  ComfyUI *partner/API* nodes, v0.32.0, 2026-08-11). No newer Apache Qwen-Image-Edit than 2511 exists.
- **Emu3.5-Image** (BAAI, 34B, Apache-2.0, 68.21 GB bf16): autoregressive T2I/X2I with a list of reference images;
  "each image may take several minutes", "≥ 2 GPUs" recommended, no quantization, no ComfyUI, DiDA-accelerated weights
  still unreleased. Legal but not runnable in the Vewbox stack and far too slow. https://huggingface.co/BAAI/Emu3.5-Image ;
  https://github.com/baaivision/Emu3.5
- **GLM-Image** (Z.ai, 2026-01-14, 9B AR + 7B DiT = 16B, **MIT**): unified gen + edit, "identity-preserving generation
  for people and objects", multi-image input, "~23GB" with CPU offload, 50 steps, diffusers/SGLang, no ComfyUI core
  entry. Below the 20B brief and without a ComfyUI path today; the most interesting *licence-clean* unified model to
  re-check when ComfyUI supports it. https://huggingface.co/zai-org/GLM-Image
- Already assessed in MODEL-EVAL §7.1 and unchanged: FLUX.2 [klein] 9B (NC), HiDream-O1 8B (MIT, ≈ klein 4B), JoyAI-
  Image-Edit 16B (Apache, the live editing candidate), FireRed-Image-Edit 20B (Apache, +0.07 GEdit, not material),
  Ming-Image, Krea-2, Boogu-Image, Mage-Flow.

**Families covering BOTH generation and editing in one model:** FLUX.2 [dev] (and klein), HunyuanImage-3.0-Instruct,
Qwen-Image-2.1, GLM-Image, Emu3.5-Image. Qwen-Image-2512 + Qwen-Image-Edit-2511 remain a two-model pair.

## 6. Editing specifically — can anything replace Qwen-Image-Edit-2511?

| Vewbox editing need | Qwen-Image-Edit-2511 (today) | FLUX.2 [dev] | HunyuanImage-3.0-Instruct | Note |
|---|---|---|---|---|
| Identity-preserving character edit (wardrobe, expression) | yes; "character consistency significantly improved" (card); E1 8/12 measured | yes, claimed; up to 10 refs | yes (edit node: 1 image + instruction) | none measured on Vewbox characters |
| Recurring location (same set, new framing) | plates 6/6, views 0/6 measured | multi-ref consistency claimed | not a named feature | the open weakness; nothing here is proven to fix it |
| Multi-reference composition | 2+ images (card example), "two-person fusion" | ≤ 10 | ≤ 3 official | FLUX.2 has the widest claim |
| Storyboards (sequence consistency) | per-frame edits | per-frame + refs | per-frame + CoT | no model offers a storyboard mode |
| Licence for production | Apache-2.0 | NC → paid licence | Community (territory) + CC BY-NC nodes | only Qwen is clean |
| Fits 32 GB, in ComfyUI core | yes, measured | NVFP4 maybe; fp8 streams | no | |

Conclusion: no legal, runnable replacement for Edit-2511 today. The candidate already queued in MODEL-EVAL §7.3 (JoyAI-
Image-Edit, 16B, Apache, 6 refs, core nodes) is the right next editing test; Hunyuan Instruct (Edit 1066) and GLM-Image
(MIT) are the two to re-check when a ≤ 32 GB ComfyUI-core path exists.

## 7. Recommendation and the conditions that would reopen it

**Recommendation: keep Qwen-Image-2512 (generation) and Qwen-Image-Edit-2511 (editing). Download nothing now.**

If the producer nevertheless wants one large-model evaluation, the only candidate that is legal to evaluate and
plausibly fits the card is **FLUX.2 [dev] NVFP4-mixed** — and it should be fetched only after BFL has quoted a Platform
or Professional licence the studio is willing to buy if it wins, because an NC winner cannot ship:
- `black-forest-labs/FLUX.2-dev-NVFP4/flux2-dev-nvfp4-mixed.safetensors` 22.77 GB (gated; accept licence + AUP),
- `Comfy-Org/flux2-dev/split_files/text_encoders/mistral_3_small_flux2_fp8.safetensors` 18.03 GB,
- `Comfy-Org/flux2-dev/split_files/vae/flux2-vae.safetensors` ≈ 0.34 GB,
- total **≈ 41.1 GB, ≈ 2.4 h** on this link; manifest group outside `MODEL_GROUPS` (eval-only, like `eval-qwen-image-2.1`);
  first check that ComfyUI 0.38.1 loads the dev NVFP4 single file at all (undocumented), else fall back to the 53.8 GB
  fp8 set, which will weight-stream into the 46.8 GiB host RAM and needs `.wslconfig` raised first.
- Why not Hunyuan: 168.5 GB official, 51.4 GB NF4 below its own 48 GB minimum, non-core nodes under CC BY-NC, territory
  licence. Why not Emu3.5: minutes per image, no ComfyUI. Why not GLM-Image / Qwen-2.1: below 20B, no ComfyUI core /
  NC respectively.

**Reopen this decision when any of these is true:** (1) BFL publishes a Platform price and FLUX.2 [dev] shows a ≥ 2-test
win in §8; (2) Tencent or ComfyUI ships an official ≤ 32 GB HunyuanImage-3.0-Instruct path under core nodes; (3) Qwen
releases an Apache-licensed successor to Image-2512 / Edit-2511; (4) ComfyUI core adds GLM-Image.

## 8. The eight Vewbox tests a challenger must beat (one generation each, no best-of-N)

Same harness as MODEL-EVAL §2 (studio graph builders straight against ComfyUI :8188, fixed seed per test, judged by eye
at full size; a failed first attempt is recorded with its cause and never regenerated). The challenger must win or tie
every row and win at least two outright; a loss on any identity row is disqualifying. Incumbent = Qwen-Image-2512 for
rows 1–3, Qwen-Image-Edit-2511 for rows 4–8.

| # | Test | Input | Pass criterion (first attempt) |
|---|---|---|---|
| 1 | Realistic canonical character | the Phase 1 design prompt of character A (full prompt rebuilt from the identity record, canonical wardrobe, distinguishing details visible) | photoreal, no "AI look", every distinguishing detail present and placed as written, wardrobe canonical, no text artefacts |
| 2 | Anime canonical character | same identity, anime finish | finish is anime (not photo, not 3D), identity details kept, clean line work |
| 3 | Cartoon canonical character | same identity, cartoon finish | finish is cartoon, identity details kept (the 2512 cartoon gate that Qwen-2.1 failed) |
| 4 | Same-character edit | canonical image + "same person, new pose/angle" | same face, hair, build and marks; nothing invented or dropped |
| 5 | Wardrobe edit | canonical image + new wardrobe instruction | wardrobe changed exactly as asked; face, body and marks unchanged |
| 6 | Expression edit | canonical image + one named expression | expression reads unambiguously; identity unchanged; no drift of the rest of the frame |
| 7 | Recurring location | location plate + "same place, different view/time" | same architecture, props and layout; only the asked change (the 0/6 views gate) |
| 8 | Multi-reference composition | two canonical characters + one location plate + staging text | both identities and the place recognisable, staged as written, no duplicate or merged figures |

Record for each row: model, precision, steps, seed, wall time, nvidia-smi peak, host RAM peak, verdict and cause of any
failure, into `docs/evidence/model-eval-2026-10/` beside the existing runs.

## 9. Source list

- FLUX.2 [dev] card https://huggingface.co/black-forest-labs/FLUX.2-dev ; tree https://huggingface.co/api/models/black-forest-labs/FLUX.2-dev/tree/main
- FLUX.2 [dev] NVFP4 https://huggingface.co/black-forest-labs/FLUX.2-dev-NVFP4 ; tree https://huggingface.co/api/models/black-forest-labs/FLUX.2-dev-NVFP4/tree/main
- Comfy-Org repack trees https://huggingface.co/api/models/Comfy-Org/flux2-dev/tree/main/split_files/diffusion_models and `/text_encoders`
- FLUX [dev] Non-Commercial License v2.0 https://bfl.ai/legal/non-commercial-license-terms ; licensing tiers https://bfl.ai/pricing/licensing ; help centre https://help.bfl.ai/articles/3670520907-can-i-use-the-api-for-a-commercial-application
- BFL blog https://bfl.ai/blog/flux-2 ; GitHub https://github.com/black-forest-labs/flux2 ; diffusers https://huggingface.co/docs/diffusers/main/en/api/pipelines/flux2
- NVIDIA https://blogs.nvidia.com/blog/rtx-ai-garage-flux-2-comfyui ; https://developer.nvidia.com/blog/scaling-nvfp4-inference-for-flux-2-on-nvidia-blackwell-data-center-gpus ; ComfyUI https://blog.comfy.org/p/flux2-state-of-the-art-visual-intelligence ; changelog https://docs.comfy.org/changelog
- HunyuanImage-3.0 https://huggingface.co/tencent/HunyuanImage-3.0 ; Instruct https://huggingface.co/tencent/HunyuanImage-3.0-Instruct ; trees `/api/models/tencent/HunyuanImage-3.0{,-Instruct}/tree/main` ; LICENSE https://huggingface.co/tencent/HunyuanImage-3.0/blob/main/LICENSE ; GitHub https://github.com/Tencent-Hunyuan/HunyuanImage-3.0
- Community NF4 https://huggingface.co/EricRollei/HunyuanImage-3.0-Instruct-Distil-NF4-v2 (tree `/api/models/EricRollei/HunyuanImage-3.0-Instruct-Distil-NF4-v2/tree/main`) ; nodes https://github.com/EricRollei/Comfy_HunyuanImage3
- Emu3.5-Image https://huggingface.co/BAAI/Emu3.5-Image ; https://github.com/baaivision/Emu3.5 ; GLM-Image https://huggingface.co/zai-org/GLM-Image
- Qwen-Image-2512 https://huggingface.co/Qwen/Qwen-Image-2512 ; Qwen-Image-Edit-2511 https://huggingface.co/Qwen/Qwen-Image-Edit-2511 ; Qwen-Image-2.1 https://huggingface.co/Qwen/Qwen-Image-2.1
- Vewbox: `docs/research/MODEL-EVAL-2026-10.md` §2, §7 (arena figures, measured peaks and times), `docs/research/GPU-STAGING-2026-10.md`.

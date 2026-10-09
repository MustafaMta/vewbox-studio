# Qwen-Image-2512 fp8 vs bf16 on the Phase 1 characters — NOT RUN (2026-10-09)

**Premise failed:** `qwen_image_2512_bf16.safetensors` (40.86 GB) is no longer in the model store. It was fetched and
verified on 2026-10-06 for the §10.3 A/B of `docs/research/MODEL-EVAL-2026-10.md`, judged "bf16 buys nothing visible"
and deleted afterwards, as that section records ("can be deleted from the store"). The store's `diffusion_models`
folder holds only the fp8 2512, the fp8 Edit-2511 and Qwen-Image-2.1 int8; the retired volumes are empty. The earlier
status table in this session listed the bf16 file as "downloaded, verified" from the manifest state record — wrong; the
file is gone. Nothing ran on the GPU; nothing was written to the studio.

## What stands (the 2026-10-06 evidence, three canonical characters, same seeds)

| | fp8_e4m3fn (shipping) | bf16 |
|---|---|---|
| Whole figure | 6/6 | 6/6 |
| Engine, warm | 42–43 s | 43–44 s (98 s cold load) |
| Card peak | 28.9–30.3 GB | 31.5–31.7 GB |
| comfyui RAM | 29.1–29.9 GiB | 48.7–48.8 GiB |
| Picture | same composition, pose, wardrobe, colours per seed; face crops at 500×560: no gain in detail, skin, hair or line work | — |

## Rows of the eight tests

| # | Test | Status |
|---|---|---|
| 1–3 | Realistic / anime / cartoon canonical character | fp8 arm = the existing canonical images (A seed 877849611, B 1276583457, C 443696157; prompts verbatim from provenance, sha256 verified; 768 px proxies in `fp8-canonical-proxies/`). bf16 arm: **not generated** (no weight). Plan in `results.json`. |
| 4, 5, 6, 8 | Same-character / wardrobe / expression edits, multi-reference composition | **NOT APPLICABLE** to a 2512 precision change: Qwen-Image-Edit-2511 makes them. |
| 7 | Recurring location plate | planned (studio location prompt, 1344×768, one seed, both arms); **not generated**. |

## Recommendation (the producer's rule: no promotion unless BF16 clearly improves identity/edit quality enough to justify the heavier runtime)

Do not promote BF16; fp8 stays the production image tier. Re-fetching 40.86 GB (~11 h at ~1 MB/s, behind the voice
downloads) to repeat a test already answered on three faces is a producer decision; if wanted, queue
`eval-qwen-image-2512-bf16` after the voice work and run `scripts/model-eval-images.ts` (recovered from git `c24ef3a`,
arm `2512bf`) as planned in `results.json`.

# Local MiniMax H3 and local music in ComfyUI (verified 2026-10-02)

## MiniMax H3 open weights on one RTX 5090

ComfyUI supports MiniMax H3 natively since v0.30.0 (`MiniMaxH3ImageToVideo`, `MiniMaxH3ReferenceToVideo`,
`MiniMaxH3AddGuide`, `MiniMaxH3SigmaShift`, `EmptyMiniMaxH3LatentAV`). The studio's graph
(`src/server/workflows/minimax-h3.ts`) follows the official template: `UNETLoader` (pruned int8_convrot DiT),
`CLIPLoader type=minimax` (Qwen3-VL-32B nvfp4_awq), video VAE int8_convrot, audio VAE fp32, turbo LoRA (8 steps for
first/last-frame, 4 for reference), `res_multistep` / `simple`, video shift 12, audio shift 3, 24 fps, frame count
on the 17k+5 grid, `CreateVideo` + `SaveVideo` (H.264 MP4 with the generated stereo audio).

Files (Comfy-Org/MiniMax-H3, sha256 in the manifest): FL2VA pruned int8 20.97 GB, Ref2VA pruned int8 20.97 GB,
text encoder nvfp4 15.69 GB, video VAE int8 2.81 GB, audio VAE 0.61 GB, turbo LoRAs 1.96 GB each.

Evidence for 32 GB: community measurements on an RTX 5090 (864×480, 10 s, 10 steps) report 185 s and a 28.6 GB peak
with the text encoder offloaded; 5 s at 768P with the 8-step turbo LoRA is expected in the 2–5 minute range
(unmeasured until this machine runs it — see the acceptance report). Known Blackwell issues: run
`--disable-comfy-compiler` (ComfyUI #16342); do not use the comfy-kitchen attention backend with int8_convrot
(#15529); prefer cu130 PyTorch. The official SGLang/vLLM path lists 2×5090 or 1×4090 with layer-wise offload; the
single-5090 route is ComfyUI.

Licence: MiniMax H3 Community License (commercial below US$20M/year, "MiniMax H3" attribution, no rights claimed over
outputs, EU/UK/Korea/USA excluded). The studio shows "MiniMax H3" on generated takes' provenance.

## Music

- **ACE-Step 1.5 XL** (MIT; Arabic `ar` in the official language list; vocals from tagged lyrics; cover/repaint/
  extend/LoRA; seconds per song on a 5090) — primary local engine via native nodes
  `TextEncodeAceStepAudio1.5`, `EmptyAceStep15LatentAudio`. Files: `acestep_v1.5_xl_turbo_bf16` 9.97 GB,
  `qwen_1.7b_ace15` 3.7 GB, `ace_1.5_vae` 0.34 GB.
- **MiniMax Music 3** open weights (MiniMax-Music3 Community License: attribution, US$20M cap, no territory
  exclusion) — second local engine via `MiniMaxMusic3TextEncode`; int8 DiT 2.5 GB, pruned int8 text encoder 9.2 GB,
  DAV 0.22 GB.
- Arabic singing quality is unverified for every open model; the plan is an A/B on the same lyric once both engines
  have weights, recorded in the acceptance report.

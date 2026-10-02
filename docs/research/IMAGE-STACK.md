# Images — the local stack on one RTX 5090 (decided 2026-10-02)

Pictures (character portraits and reference packs, location plates and views, storyboard frames) are drawn locally
in ComfyUI. Video restrictions do not apply to image models; the choice was made on commercial licence, reference
fidelity and fit in 32 GB.

## Decision

| Role | Model | Licence | Files (pinned in docker/models/manifest.json) |
|---|---|---|---|
| Multi-reference editing: character sheets from a portrait, location views from a plate, storyboard frames placing known characters into known places, costume continuity | **Qwen-Image-Edit-2511** (20B, fp8mixed) + Lightning 4-step LoRA | Apache-2.0 | `qwen_image_edit_2511_fp8mixed.safetensors` 20.5 GB |
| Text to image: new portraits, master plates | **Qwen-Image-2512** (20B, fp8_e4m3fn) + Lightning 8-step LoRA | Apache-2.0 | `qwen_image_2512_fp8_e4m3fn.safetensors` 20.4 GB |
| Shared | Qwen2.5-VL-7B text encoder (fp8 scaled, 9.4 GB), Qwen-Image VAE (0.25 GB) | Apache-2.0 | |

Why not the others: Qwen-Image-2.1 (10–16 references, 2K) is the technically best fit but ships under a
non-commercial research licence; FLUX.2 [dev]/[klein 9B], FLUX.1 [dev]/Kontext and Ideogram 4 are non-commercial;
FLUX.2 [klein] 4B (Apache-2.0) and Z-Image-Turbo (Apache-2.0) are faster but weaker at identity-preserving multi-
reference edits; HiDream-E1 edits poorly; HunyuanImage 3 (80B) does not fit.

## How the studio uses them (`src/server/workflows/qwen-image.ts`, `src/worker/handlers/images.ts`)

- Portrait: text to image from the character record (`characterPrompt`), or Edit-2511 from the producer's uploaded
  reference picture when one is pending.
- Reference pack: front, three-quarter, side, full body, expression sheet — each an Edit-2511 pass with the portrait
  as image 1 and an explicit "same person" instruction.
- Location: master plate (text to image), then reverse angle and landmark views and the other times of day as
  Edit-2511 passes from the master ("same place, same architecture and props").
- Shot frame: Edit-2511 with image 1 = the location plate for that time of day, images 2–3 = the characters in the
  shot; the prompt describes people by appearance, never by name. The frame becomes the first frame MiniMax H3
  animates.
- Every picture is a library asset with prompt, references, seed, workflow hash and ComfyUI prompt id in its
  provenance.

## Runtime

ComfyUI pinned at `v0.38.1`, PyTorch 2.13 + cu130 wheels (Blackwell sm_120), `nvidia/cuda:13.0.1-cudnn-runtime`
base, `--disable-comfy-compiler` (known H3 issue on Blackwell), models on the shared `models` volume via
`extra_model_paths.yaml`. The GPU lease (`src/worker/gpu.ts`) keeps one model family loaded at a time and calls
`/free` when the family changes. Memory plan: the 20 GB DiT stays on the card, the 9 GB text encoder is offloaded to
system RAM by ComfyUI after encoding; at 1328² this fits 32 GB with headroom.

Face restoration (GFPGAN/CodeFormer) was evaluated and not used: CodeFormer is non-commercial, GFPGAN pushes
stylised faces towards photorealism. Faces are refined with the generator itself (an Edit-2511 pass with the
identity sheet) when needed.

Downloads: `huggingface_hub` with revision pinning and sha256 verification (`docker/models/fetch.py`); ComfyUI's own
downloaders do no hashing.

/** GPU LEASE ESTIMATES FOR THE COMFYUI FAMILIES, set to the peaks measured on the RTX 5090 (32,607 MiB) on 2026-10-05
 *  (docs/research/GPU-STAGING-2026-10.md §6; nvidia-smi card total at 250–500 ms, which includes ≈ 0.5–0.8 GB of idle
 *  CUDA contexts). The lease compares an estimate with GPU_VRAM_BUDGET_MB (default 30000) and warns when it is larger
 *  ("the service must offload") — with these values it does for every Qwen and H3 job, which is what the card really
 *  holds: the budget itself is a separate decision (§6, last paragraph). The LLM family's estimate follows the model
 *  (`llmLeaseMb`, providers/llm.ts). */

/** IMAGE on ComfyUI: Qwen-Image-2512 quality/Lightning 29.8 GB, Qwen-Image-Edit-2511 (edit, Image Reference
 *  rollback) 30.0–30.4 GB, FLUX.2 klein 4B 20.1 GB — one estimate for the family, the highest peak (was 24000). */
export const IMAGE_VRAM_MB = 30400;

/** VIDEO on ComfyUI: MiniMax H3 Ref2VA int8, 4-step turbo, 5 s at 1344×768 — 28.4–31.9 GB, the highest for a
 *  continuation (V4) (was 28000). */
export const VIDEO_H3_VRAM_MB = 31900;

/** HOST RAM while ComfyUI stages H3 (the 15.7 GB nvfp4 text encoder moved to RAM after encoding, plus the page cache
 *  of the 21 GB DiT): 40.8 GiB of the 46.8 GiB the Docker VM has without `.wslconfig` (§6, MODEL-EVAL §5) — ≈ 6 GiB
 *  of headroom, so H3 runs with every other family unloaded (the lease does that) and no idle speech service loaded.
 *  Not a lease figure (the lease counts VRAM); recorded here so the video handler can say what it needs. */
export const VIDEO_H3_HOST_RAM_MB = Math.round(40.8 * 1024);
/** The Docker VM's RAM as measured (`MemTotal 49,059,472 kB`) until `.wslconfig` raises it to 80 GB. */
export const DOCKER_VM_RAM_MB = Math.round(49_059_472 / 1024);

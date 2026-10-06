/** GPU LEASE ESTIMATES FOR THE COMFYUI FAMILIES, set to the peaks measured on the RTX 5090 (32,607 MiB) on 2026-10-05
 *  (docs/research/GPU-STAGING-2026-10.md §6; nvidia-smi card total at 250–500 ms, which includes ≈ 0.5–0.8 GB of idle
 *  CUDA contexts). The lease compares an estimate with GPU_VRAM_BUDGET_MB (default 32000, the RTX 5090's memory) and warns when it is larger
 *  ("the service must offload") — with these values it does for every Qwen and H3 job, which is what the card really
 *  holds: the budget itself is a separate decision (§6, last paragraph). The LLM family's estimate follows the model
 *  (`llmLeaseMb`, providers/llm.ts). */

/** IMAGE on ComfyUI: Qwen-Image-2512 quality/Lightning 29.8 GB, Qwen-Image-Edit-2511 (edit, Image Reference
 *  rollback) 30.0–30.4 GB, FLUX.2 klein 4B 20.1 GB — one estimate for the family, the highest peak (was 24000). */
export const IMAGE_VRAM_MB = 30400;

/** VIDEO on ComfyUI: MiniMax H3 Ref2VA int8, 5 s at 1344×768 — 28.4–31.9 GB, the highest for a continuation (V4)
 *  (was 28000); the final tier (base model, 20 steps) peaks the same, 27.0–31.9 GB (MODEL-EVAL §8.4). */
export const VIDEO_H3_VRAM_MB = 31900;

/** HOST RAM while ComfyUI stages H3 (the 15.7 GB nvfp4 text encoder moved to RAM after encoding, plus the page cache
 *  of the 21 GB DiT): 46.0–46.5 GiB of the 78.5 GiB Docker VM, both tiers, 2026-10-06 (§6; 40.8 GiB of the old 46.8 GiB
 *  VM on 2026-10-05 — the cache grows into the room). ≈ 32 GiB of headroom. Not a lease figure (the lease counts
 *  VRAM); recorded here so the video handler can say what it needs. */
export const VIDEO_H3_HOST_RAM_MB = Math.round(46.5 * 1024);
/** The Docker VM's RAM as measured 2026-10-06 (`docker info` MemTotal 84,336,570,368 B, `.wslconfig` applied). */
export const DOCKER_VM_RAM_MB = Math.round(84_336_570_368 / 1024 / 1024);

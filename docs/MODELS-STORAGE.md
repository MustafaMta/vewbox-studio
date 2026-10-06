# Model storage

**Policy (producer, 2026-10-06):** every AI model weight, now and later, lives under ONE root on the D: drive, in clear
category folders. No large weights stay on C:. Downloads go straight there. Application data (PostgreSQL `vewbox_pgdata`,
the source, Git, `var/`) is not part of it.

## The store

| | |
|---|---|
| Physical file | `D:\models\vewbox-models.vhdx`: ext4, 1 TiB virtual, dynamically expanding (it grows as weights are added; D: free space is the real limit) |
| Attach (no admin) | `wsl --mount --vhd D:\models\vewbox-models.vhdx --name models` |
| Docker engine path | `/run/desktop/mnt/host/wsl/models` = **`VEWBOX_MODELS_ROOT`** |
| WSL distros' path | `/mnt/wsl/models` (NOT visible to Docker Desktop's engine: a bind of it silently creates an empty directory on Docker Desktop's own disk) |
| In every container | `/models` (Ollama: `/root/.ollama`) |
| Marker | `/models/.vewbox-models`. resume-local, the watchdog and the fetcher refuse a root without it |
| Settings | `.env`: `VEWBOX_MODELS_ROOT`, `VEWBOX_MODELS_VHDX` (`.env.example`); every compose path derives from the root |

**Why a VHDX and not a folder bind of `D:\models`.** Measured 2026-10-06 on the 20.97 GB MiniMax H3 DiT, with a full-touch
safetensors load (every tensor copied, as `load_state_dict` does) and the VM page cache dropped before each cold read:

| Read | Named volume (old, on C:) | **ext4 VHDX on D: (chosen)** | Folder bind of D:\ (Docker Desktop 9p) |
|---|---|---|---|
| safetensors load, cold | 14.7–23.7 s | 27.8–34.3 s | 135 s |
| safetensors load, warm | 15.2 s | 11.6 s | 39 s |
| dd sequential, cold | 157 MB/s | 1.5 GB/s | 150–163 MB/s (437 MB/s with 4 streams) |

The disk itself reads 2.8 GB/s natively; the 9p file-sharing layer is the bottleneck of a folder bind. A whole H3 set
(about 42 GB) reloads in about 1 min from the VHDX, against about 4.5 min from a folder bind. The VHDX's filesystem
lives in the same VM as Docker, so it shares the page cache: a warm reload is as fast as before.

## Layout inside the store

```
/models  (= D:\models\vewbox-models.vhdx)
├── .vewbox-models            marker
├── .manifest-state.json      the fetcher's record (sha256, revision, licence) keyed by LOGICAL path
├── comfyui/                  ComfyUI's typed tree (extra_model_paths.yaml base_path /models/comfyui)
│   ├── diffusion_models/     video (MiniMax H3), images (Qwen-Image 2512/Edit 2511, FLUX.2 klein, JoyAI), music
│   ├── text_encoders/  vae/  loras/  detection/
├── asr/                      faster-whisper large-v3, the Arabic-dialect fine-tune (hf + ct2)
├── align/                    wav2vec2 (EN, AR) for forced alignment
├── tts/                      voices: indextts-2.5, habibi, voxcpm2, bench/ (voice-bench engines)
├── lipsync/                  LatentSync 1.6
├── identity/  qa/            face ONNX models; MediaPipe landmarker, SyncNet
├── eval/                     ECAPA speaker encoder
├── llm/ollama/               Ollama's /root/.ollama (models/blobs, models/manifests)
└── cache/
    ├── hf/                   HF_HOME (HF_HUB_CACHE, TRANSFORMERS_CACHE = cache/hf/hub)
    └── torch/                TORCH_HOME (Demucs htdemucs)
```

`docker/models/layout.json` is the single source for the logical → physical rule, read by `docker/models/fetch.py` and
`scripts/lib/models-store.mjs`. The manifest, the state file and the services keep the logical names: a ComfyUI type
folder `X` is `comfyui/X`, `hf-home` is `cache/hf`, `demucs` is `cache/torch`, and every other folder keeps its name.

## Compose

- The volumes `models` (named `vewbox_models_store`) and `ollama` (`vewbox_ollama_store`) are local-driver **binds** of
  `${VEWBOX_MODELS_ROOT}` and `${VEWBOX_MODELS_ROOT}/llm/ollama`. Every service keeps `models:/models`.
- If the store is not attached, a service that mounts it cannot start (the error is "no such file or directory"), so
  nothing ever runs without its weights. The watchdog starts such services once the store is back.
- The old volumes `vewbox_models` and `vewbox_ollama` are no longer referenced. Removing the new volume objects (even
  with `docker compose down -v`) removes only Docker's record of the bind, never the store's files (verified).
- **Read-only:** ComfyUI, tts-design, asr, lipsync and the bench services mount `/models:ro`. A service gets a writable
  sub-folder only where it must write:

  | Service | Writable sub-folder | Why |
  |---|---|---|
  | all GPU services | `cache/hf` | HF cache |
  | tts, tts-habibi | `tts/` | the entrypoint downloads missing voice weights on a fresh machine |
  | asr | `qa/` | the Face Landmarker fetched once |
  | asr | `cache/torch` | Demucs |
  | asr-convert | `asr/` | the converted copy |

  The fetcher (`models`) and Ollama write their whole roots.
- `HF_HOME`, `HF_HUB_CACHE`, `TRANSFORMERS_CACHE` and `TORCH_HOME` point into the store in every service that could
  download, and `OLLAMA_MODELS=/root/.ollama/models`. No weights are baked into images.
- The fetcher mounts the repository's `fetch.py`, `manifest.json` and `layout.json`, so a manifest change needs no image
  rebuild. It sets `MODELS_REQUIRE_MARKER=1`.

## Operations

- **Start of day / after a reboot:** the watchdog's sign-in task (scripts/docker-watchdog.ts `--fix`) attaches the
  store BEFORE it starts Docker Desktop.
  - `scripts/relaunch-outside-job.ps1` step 4 does the same.
  - `node scripts/resume-local.mjs --go` runs a `store` step (attach, idempotent) and a `store-marker` step (the engine
    sees the marker). After the services are up, its `mounts` step fails if any container loads `/models` or
    `/root/.ollama` from anything but the store.
- **What detaches it:** a WSL VM shutdown, which happens on a reboot, on `wsl --shutdown`, or when Docker Desktop has
  quit and the VM has idled out. Re-attach with the command above; "already mounted" is fine.
- **Never** run `wsl --unmount` while services run. Never attach the same VHDX twice under two names.
- **Add a model:** add it to `docker/models/manifest.json` with its logical folder, then
  `docker compose -p vewbox --profile models run --rm models --manifest manifest.json --root /models --groups <group>`.
  Ollama models: `docker compose -p vewbox exec llm ollama pull <tag>`, or the `llm-pull` one-off. Both write straight
  into the store; nothing is downloaded to C: and moved afterwards.
- **Look at the files from Windows:** `\\wsl.localhost\docker-desktop\mnt\host\wsl\models\` (while Docker Desktop runs).
- **Create the store on a new machine** (no admin):
  1. `wsl --import vb-init D:\models\_init <tiny rootfs .tar> --version 2` gives a 1 TiB dynamic ext4.vhdx.
  2. Copy it to `D:\models\vewbox-models.vhdx`, then run `wsl --unregister vb-init`.
  3. Attach it with `--bare`. From a privileged container, format the one device carrying that copy's ext4 UUID:
     `mkfs.ext4 -L vewbox-models -m 0`.
  4. Detach it, attach it as `models`, and write the marker.

## Retiring the old copies and reclaiming C:

- **What to run.** `scripts/models-store-retire.ps1` deletes model folders from the old volumes `vewbox_models` and
  `vewbox_ollama`. The producer runs it; the default is a dry run.
- **Checks before each folder:**
  - every file is in the store at its size, and its sha256 was checked at copy time (`/models/.migration/copy-log.jsonl`);
  - no running container still reads that folder from the old volume.
- **Removing the volumes:** `-DropVolumes` removes both volumes once no container references them.
- **No space back yet.** Deleting inside a volume does not shrink Docker's `docker_data.vhdx` on C:. That file is not
  sparse, and its ext4 is mounted without `discard`. The script ends with `fstrim` on Docker's data disk (no downtime),
  which marks the freed blocks unused.
- **Getting the space back takes an offline compaction** (Hyper-V's `Optimize-VHD` is not installed here, so it is
  diskpart, in an admin shell):
  1. Quit Docker Desktop gracefully.
  2. Run `wsl --shutdown`. This also detaches the model store.
  3. In an admin `diskpart`, run `select vdisk file="%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx"`, then
     `attach vdisk readonly`, `compact vdisk` and `detach vdisk`.
  4. Start again with `docker-watchdog --start-docker`, which attaches the store first.
- **Downtime:** all of Docker, about 20–40 min for a 430 GB file.
- **Do not use instead:**
  - Docker Desktop's "Clean / Purge data" (it wipes the volumes);
  - making the VHDX sparse (WSL documents sparse VHDs as experimental; the disk also holds pgdata).

## Guards against old storage

**Tombstones (model-paths: allow).**
- After retirement, the old names `vewbox_models` and `vewbox_ollama` are re-created as local bind volumes. Their
  device is `<store>/.retired-volume-DO-NOT-USE`, a path that never exists; `models-store-retire.ps1 -Execute
  -DropVolumes` creates them.
- Compose never recreates an existing volume. A stale compose file that still binds those names therefore fails to
  start its container ("no such file or directory") instead of starting a service on old or empty storage. This was
  tested on 2026-10-06.
- Never create that path.

**resume-local and the watchdog** fail, or warn `MODEL_MOUNTS`, when:
- any container, running or stopped, of any project or an ad-hoc `docker run`, takes `/models` or `/root/.ollama`
  from a tombstone, from a named volume other than `vewbox_models_store` / `vewbox_ollama_store`, or from a path
  outside the store;
- a tombstone is wrong, or its path exists.

**`node scripts/check-model-paths.mjs`** scans this checkout and every worktree under `.claude/worktrees`:
- **what it checks:** compose files, `.env*`, scripts, `docker/`, tools and src;
- **what it flags:**
  - retired volume names;
  - stale `models`/`ollama` compose volumes;
  - the old in-container layout (`/models/hf-home`, `/models/demucs`, ComfyUI's flat `/models/<type>/`, `base_path: /models`);
  - model or cache paths on C:;
  - `/mnt/wsl` bind sources;
  - cache variables outside the store;
- **how it fails:** exit 1 on a hit in this checkout, with file and line. Worktree hits are listed for their owners
  (`--strict` fails on them too).
- **intentional mentions:** a line that names the old storage on purpose carries the marker `model-paths: allow`.

## Migration record (2026-10-06)

See the inventory table below: the old path, the new path, the size, the checksum status, the service using the model
and whether the old copy was removed. The copy log, one line per file with its sha256 and what it was checked against,
is in the store at `/models/.migration/copy-log.jsonl`.

| Model | Old path | New path | Size | Checksum | Service | Old copy removed |
|---|---|---|---|---|---|---|
| align/wav2vec2-base-960h | `vewbox_models:/align/wav2vec2-base-960h/` | `D:\models\vewbox-models.vhdx:/align/wav2vec2-base-960h/` | 0.38 GB | sha256 ok vs fetcher record (6) | asr | no (retire window) |
| align/wav2vec2-large-xlsr-53-arabic | `vewbox_models:/align/wav2vec2-large-xlsr-53-arabic/` | `D:\models\vewbox-models.vhdx:/align/wav2vec2-large-xlsr-53-arabic/` | 1.26 GB | sha256 ok vs fetcher record (5) | asr | no (retire window) |
| asr/faster-whisper-large-v3 | `vewbox_models:/asr/faster-whisper-large-v3/` | `D:\models\vewbox-models.vhdx:/asr/faster-whisper-large-v3/` | 3.09 GB | sha256 ok vs fetcher record (5) | asr | no (retire window) |
| asr/whisper-large-v3-arabic-dialectal-v2-ct2 | `vewbox_models:/asr/whisper-large-v3-arabic-dialectal-v2-ct2/` | `D:\models\vewbox-models.vhdx:/asr/whisper-large-v3-arabic-dialectal-v2-ct2/` | 3.09 GB | sha256 ok (0 vs fetcher record, 5 vs source) | asr | no (retire window) |
| asr/whisper-large-v3-arabic-dialectal-v2-hf | `vewbox_models:/asr/whisper-large-v3-arabic-dialectal-v2-hf/` | `D:\models\vewbox-models.vhdx:/asr/whisper-large-v3-arabic-dialectal-v2-hf/` | 6.18 GB | sha256 ok vs fetcher record (7) | asr | no (retire window) |
| demucs | `vewbox_models:/demucs/` | `D:\models\vewbox-models.vhdx:/cache/torch/` | 0.08 GB | sha256 ok (0 vs fetcher record, 1 vs source) | asr | no (retire window) |
| detection/mediapipe_face_fp32.safetensors | `vewbox_models:/detection/mediapipe_face_fp32.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/detection/mediapipe_face_fp32.safetensors` | 0.01 GB | sha256 ok (0 vs fetcher record, 1 vs source) | comfyui | no (retire window) |
| diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors | `vewbox_models:/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors` | 9.97 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/flux-2-klein-4b.safetensors | `vewbox_models:/diffusion_models/flux-2-klein-4b.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/flux-2-klein-4b.safetensors` | 7.75 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/flux-2-klein-base-4b.safetensors | `vewbox_models:/diffusion_models/flux-2-klein-base-4b.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/flux-2-klein-base-4b.safetensors` | 7.75 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/joyai_image_edit_int8_convrot.safetensors | `vewbox_models:/diffusion_models/joyai_image_edit_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/joyai_image_edit_int8_convrot.safetensors` | 16.43 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors | `vewbox_models:/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors | `vewbox_models:/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 20.97 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/minimax_music3_dit_int8_convrot.safetensors | `vewbox_models:/diffusion_models/minimax_music3_dit_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/minimax_music3_dit_int8_convrot.safetensors` | 2.50 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/qwen_image_2.1_int8_convrot.safetensors | `vewbox_models:/diffusion_models/qwen_image_2.1_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/qwen_image_2.1_int8_convrot.safetensors` | 7.26 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors | `vewbox_models:/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors` | 20.43 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors | `vewbox_models:/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors` | 20.53 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| eval | `vewbox_models:/eval/` | `D:\models\vewbox-models.vhdx:/eval/` | 0.09 GB | sha256 ok vs fetcher record (5) | tts-design (+bench) | no (retire window) |
| hf-home | `vewbox_models:/hf-home/` | `D:\models\vewbox-models.vhdx:/cache/hf/` | 0.05 GB | sha256 ok (0 vs fetcher record, 4 vs source) | tts, tts-habibi | no (retire window) |
| identity/ccip | `vewbox_models:/identity/ccip/` | `D:\models\vewbox-models.vhdx:/identity/ccip/` | 0.15 GB | sha256 ok vs fetcher record (3) | asr (+lipsync) | no (retire window) |
| identity/dinov2-small | `vewbox_models:/identity/dinov2-small/` | `D:\models\vewbox-models.vhdx:/identity/dinov2-small/` | 0.09 GB | sha256 ok vs fetcher record (1) | asr (+lipsync) | no (retire window) |
| identity | `vewbox_models:/identity/` | `D:\models\vewbox-models.vhdx:/identity/` | 0.04 GB | sha256 ok vs fetcher record (2) | asr (+lipsync) | no (retire window) |
| lipsync/latentsync-1.6 | `vewbox_models:/lipsync/latentsync-1.6/` | `D:\models\vewbox-models.vhdx:/lipsync/latentsync-1.6/` | 5.15 GB | sha256 ok vs fetcher record (2) | lipsync | no (retire window) |
| lipsync/sd-vae-ft-mse | `vewbox_models:/lipsync/sd-vae-ft-mse/` | `D:\models\vewbox-models.vhdx:/lipsync/sd-vae-ft-mse/` | 0.33 GB | sha256 ok vs fetcher record (2) | lipsync | no (retire window) |
| loras/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors | `vewbox_models:/loras/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors` | 0.85 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors | `vewbox_models:/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | 0.85 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors | `vewbox_models:/loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | 0.85 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors | `vewbox_models:/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1.96 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors | `vewbox_models:/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` | 1.96 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| loras/qwen-image-edit-2511-multiple-angles-lora.safetensors | `vewbox_models:/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors` | 0.30 GB | sha256 ok (0 vs fetcher record, 1 vs source) | comfyui | no (retire window) |
| ollama blobs+manifests (gemma4:31b-it-qat, qwen3.6:27b-q8_0, qwen3:14b) | `vewbox_ollama:/` | `D:\models\vewbox-models.vhdx:/llm/ollama/` | 58.10 GB | sha256 ok (24 files; blobs = their filename) | llm | no (retire window) |
| qa | `vewbox_models:/qa/` | `D:\models\vewbox-models.vhdx:/qa/` | 0.01 GB | sha256 ok (0 vs fetcher record, 2 vs source) | asr (+lipsync) | no (retire window) |
| text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors | `vewbox_models:/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors` | 9.20 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen3.5_4b_bf16.safetensors | `vewbox_models:/text_encoders/qwen3.5_4b_bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen3.5_4b_bf16.safetensors` | 9.32 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors | `vewbox_models:/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15.69 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen3vl_8b_int8_convrot.safetensors | `vewbox_models:/text_encoders/qwen3vl_8b_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen3vl_8b_int8_convrot.safetensors` | 9.35 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen3vl_8b_joyimage_edit_int8_convrot.safetensors | `vewbox_models:/text_encoders/qwen3vl_8b_joyimage_edit_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen3vl_8b_joyimage_edit_int8_convrot.safetensors` | 10.06 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen_0.6b_ace15.safetensors | `vewbox_models:/text_encoders/qwen_0.6b_ace15.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen_0.6b_ace15.safetensors` | 1.19 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen_1.7b_ace15.safetensors | `vewbox_models:/text_encoders/qwen_1.7b_ace15.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen_1.7b_ace15.safetensors` | 3.71 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors | `vewbox_models:/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | 9.38 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| text_encoders/qwen_3_4b.safetensors | `vewbox_models:/text_encoders/qwen_3_4b.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/text_encoders/qwen_3_4b.safetensors` | 8.04 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| tts/bench/dots.tts-soar | `vewbox_models:/tts/bench/dots.tts-soar/` | `D:\models\vewbox-models.vhdx:/tts/bench/dots.tts-soar/` | 5.16 GB | sha256 ok vs fetcher record (13) | tts-bench-* | no (retire window) |
| tts/habibi | `vewbox_models:/tts/habibi/` | `D:\models\vewbox-models.vhdx:/tts/habibi/` | 1.35 GB | sha256 ok (0 vs fetcher record, 7 vs source) | tts-habibi | no (retire window) |
| tts/indextts-2.5 | `vewbox_models:/tts/indextts-2.5/` | `D:\models\vewbox-models.vhdx:/tts/indextts-2.5/` | 10.80 GB | sha256 ok (0 vs fetcher record, 67 vs source) | tts | no (retire window) |
| tts/voxcpm2 | `vewbox_models:/tts/voxcpm2/` | `D:\models\vewbox-models.vhdx:/tts/voxcpm2/` | 4.96 GB | sha256 ok vs fetcher record (6) | tts-design (+bench) | no (retire window) |
| vae/ace_1.5_vae.safetensors | `vewbox_models:/vae/ace_1.5_vae.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/ace_1.5_vae.safetensors` | 0.34 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/flux2-vae.safetensors | `vewbox_models:/vae/flux2-vae.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/flux2-vae.safetensors` | 0.34 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/minimax_h3_audio_vae_fp32.safetensors | `vewbox_models:/vae/minimax_h3_audio_vae_fp32.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/minimax_h3_video_vae_int8_convrot.safetensors | `vewbox_models:/vae/minimax_h3_video_vae_int8_convrot.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/minimax_h3_video_vae_int8_convrot.safetensors` | 2.81 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/minimax_music3_dav.safetensors | `vewbox_models:/vae/minimax_music3_dav.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/minimax_music3_dav.safetensors` | 0.22 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/qwen_image_2.1_vae_bf16.safetensors | `vewbox_models:/vae/qwen_image_2.1_vae_bf16.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/qwen_image_2.1_vae_bf16.safetensors` | 0.68 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/qwen_image_vae.safetensors | `vewbox_models:/vae/qwen_image_vae.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/qwen_image_vae.safetensors` | 0.25 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |
| vae/wan_2.1_vae.safetensors | `vewbox_models:/vae/wan_2.1_vae.safetensors` | `D:\models\vewbox-models.vhdx:/comfyui/vae/wan_2.1_vae.safetensors` | 0.25 GB | sha256 ok vs fetcher record (1) | comfyui | no (retire window) |

TOTAL 323.1 GB in 201 files

All 201 store files were re-hashed on 2026-10-06 14:00Z (sha256 + size against the copy log): 0 mismatches. Old copies are deleted by `scripts/models-store-retire.ps1 -Execute -DropVolumes` (vewbox_models 246.84 GB, vewbox_ollama 54.11 GB); C: gets the space back at the compaction (`scripts/compact-docker-disk.ps1`).

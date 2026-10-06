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

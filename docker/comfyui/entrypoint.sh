#!/usr/bin/env bash
set -euo pipefail
cd /opt/comfyui
echo "[comfyui] torch=$(python -c 'import torch;print(torch.__version__)') cuda=$(python -c 'import torch;print(torch.version.cuda)') gpu=$(python -c 'import torch;print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none")')"
# --disable-comfy-compiler: known Blackwell issue with the comfy compiler on MiniMax H3 sampling (ComfyUI #16342)
exec python main.py --listen 0.0.0.0 --port 8188 \
  --output-directory /opt/comfyui/output --input-directory /opt/comfyui/input --temp-directory /opt/comfyui/temp \
  --extra-model-paths-config /opt/comfyui/extra_model_paths.yaml \
  --reserve-vram "${COMFY_RESERVE_VRAM:-1.0}" --disable-auto-launch --disable-comfy-compiler "$@"

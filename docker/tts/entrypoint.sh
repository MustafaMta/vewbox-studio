#!/usr/bin/env bash
# Fetch weights on first start (resumable, into the shared models volume), then serve.
set -euo pipefail
ROOT="${MODEL_ROOT:-/models/tts}"
mkdir -p "$ROOT"
if [ "$VEWBOX_ENGINE" = "indextts" ]; then
  cd /opt/index-tts
  CK="$ROOT/indextts-2.5"
  mkdir -p "$CK/hf_cache"
  if [ ! -f "$CK/gpt.pth" ] || [ ! -f "$CK/s2mel.pth" ] || [ ! -f "$CK/qwen0.6bemo4-merge/config.json" ]; then
    echo "[tts] downloading IndexTeam/IndexTTS-2.5 into $CK"
    uv run hf download IndexTeam/IndexTTS-2.5 --local-dir "$CK"
  fi
  # auxiliary models the loader would otherwise fetch on first use
  if [ ! -f "$CK/hf_cache/w2v-bert-2.0/model.safetensors" ]; then uv run hf download facebook/w2v-bert-2.0 --local-dir "$CK/hf_cache/w2v-bert-2.0"; fi
  if [ ! -f "$CK/hf_cache/semantic_codec_model.safetensors" ]; then uv run hf download amphion/MaskGCT semantic_codec/model.safetensors --local-dir /tmp/maskgct && mv /tmp/maskgct/semantic_codec/model.safetensors "$CK/hf_cache/semantic_codec_model.safetensors"; fi
  if [ ! -f "$CK/hf_cache/campplus_cn_common.bin" ]; then uv run hf download funasr/campplus campplus_cn_common.bin --local-dir "$CK/hf_cache"; fi
  if [ ! -f "$CK/hf_cache/bigvgan/bigvgan_generator.pt" ]; then uv run hf download nvidia/bigvgan_v2_22khz_80band_256x config.json bigvgan_generator.pt --local-dir "$CK/hf_cache/bigvgan"; fi
  # infer_v2_5 reads ./checkpoints relative to the repo
  rm -rf /opt/index-tts/checkpoints && ln -s "$CK" /opt/index-tts/checkpoints
  exec uv run uvicorn vewbox_app:app --host 0.0.0.0 --port "${PORT:-8020}" --workers 1
else
  cd /opt/habibi
  HB="$ROOT/habibi"
  if [ ! -f "$HB/Specialized/IRQ/model_100000.safetensors" ]; then
    echo "[tts] downloading SWivid/Habibi-TTS (Specialized/IRQ) into $HB"
    hf download SWivid/Habibi-TTS --include "Specialized/IRQ/*" --local-dir "$HB"
  fi
  exec uvicorn vewbox_app:app --host 0.0.0.0 --port "${PORT:-8021}" --workers 1
fi

#!/bin/sh
# The store's Hugging Face cache entry for openai/whisper-base (the SoulX-Singer SVC evaluation's content encoder): a
# snapshot of RELATIVE links to the pinned files under eval/soulx-singer/whisper-base, so `from_pretrained("openai/
# whisper-base")` resolves offline inside the store. Run once, with the store writable:
#   docker run --rm -v vewbox_models_store:/models -v "$PWD/scripts:/s:ro" alpine sh /s/svc-eval-hf-layout.sh
set -eu
REV=e37978b90ca9030d5170a5c07aadb050351a65bb
HUB=/models/cache/hf/hub/models--openai--whisper-base
mkdir -p "$HUB/snapshots/$REV" "$HUB/refs"
printf '%s' "$REV" > "$HUB/refs/main"
for f in config.json preprocessor_config.json generation_config.json model.safetensors; do
  ln -sfn "../../../../../../eval/soulx-singer/whisper-base/$f" "$HUB/snapshots/$REV/$f"
done
ls -la "$HUB/snapshots/$REV"

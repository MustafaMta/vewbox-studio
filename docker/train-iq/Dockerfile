# syntax=docker/dockerfile:1.7
# VEWBOX-IQ TRAINER — the adaptation image (docs/VEWBOX-IQ.md): the tts-iq image (the same torch 2.8.0 cu128 stack, the
# chatterbox library at the same pinned commit, upstream's pins) plus what the trainer needs: peft (LoRA), safetensors
# (already pinned upstream), pyarrow (the Omnilingual parquet files), soundfile and librosa (already pinned upstream).
# Build tts-iq first: `docker compose --profile iq build tts-iq`, then `docker compose --profile train build train-iq`.
# The training code is NOT baked in: docker/train-iq/train is mounted at /opt/train by compose (a fix needs no rebuild);
# the shared loader docker/tts-iq/iq_model.py is mounted at /opt/iq (the image carries a copy of both for a run without
# the repo). Weights read-only from the store; the dataset tree read-write at /training. Non-root; offline.
ARG BASE_IMAGE=vewbox/tts-iq:dev
FROM ${BASE_IMAGE}
USER root
RUN --mount=type=cache,id=uv-tts-iq,target=/root/.cache/uv \
    uv pip install --python /opt/venv/bin/python "peft==0.21.0" "pyarrow==26.0.0" \
 && python -c "import peft, pyarrow, safetensors, soundfile, librosa, torch; assert torch.__version__.startswith('2.8.0'), torch.__version__; print('peft', peft.__version__, 'pyarrow', pyarrow.__version__, 'safetensors', safetensors.__version__, 'librosa', librosa.__version__)"
COPY docker/train-iq/train /opt/train
RUN chown -R iq /opt/train
USER iq
ENV PYTHONPATH=/opt/iq:/opt/train VEWBOX_TRAINING_ROOT=/training
WORKDIR /opt/train
ENTRYPOINT ["python"]
CMD ["-c", "print('usage: docker compose --profile train run --rm train-iq /opt/train/<prepare_tokens|train_lora|eval_checkpoint|extract_omnilingual>.py --help')"]

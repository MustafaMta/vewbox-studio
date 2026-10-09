# Vewbox-IQ — the Iraqi (Baghdadi) voice: Chatterbox Multilingual V3 + the studio's adaptation

The decisions and evidence are in `docs/research/iraqi-voice-production.md`; this is how the pieces fit, the exact
commands, what is frozen and why, the stop rules, and what a Vewbox-IQ checkpoint carries. Nothing here claims native
quality: the ear decides (§6), the machine numbers are stop rules, not approvals.

Engine id `vewbox-iq` — an **evaluation engine** (`src/server/providers/voice-eval-engines.ts`): `pickEngine`,
`pinnable` and `englishEngine` never return it; a VOICE_PREVIEW that names it speaks through it (the Character A pack,
`scripts/character-a-pack.ts speak --engine vewbox-iq`). Promotion = the stop rules held AND a blind native Baghdadi
listening pass, both recorded.

## 1. The pieces

| Piece | Where | What |
|---|---|---|
| Base weights | store `/models/voice/chatterbox-mtl-v3` (manifest group `voice-chatterbox-mtl-v3`, 4.3 GB, MIT) | `ResembleAI/chatterbox` @ `5bb1f6ee` — `t3_mtl23ls_v3.safetensors` (**the v3 T3, never v2**), `s3gen.pt` (official pairing) and `s3gen_v3.safetensors` (A/B by ear), `ve.pt`, the grapheme vocabulary |
| Library | `resemble-ai/chatterbox` @ **`65b18437192794391a0308a8f705b1e33e633948`** | the commit tagged "v3 multilingual and single language pack release" (2026-06-10, the day of the weights revision). Its `from_local(ckpt_dir, device, t3_model=…)` selects the v3 file; its pyproject pins transformers 5.2.0 — the image keeps every upstream pin except torch (2.8.0 cu128 for sm_120), resemble-perth (PyPI 1.0.1 instead of git master, as the official V3 Space) and gradio (dropped). The later master commits (up to `5de7a54a`) were not reviewed, so they are not pinned. |
| Loader | `docker/tts-iq/iq_model.py` | one place that loads the base through the library's `from_local(..., t3_model="v3")`, verifies one `text_emb` row against the file (a wrong file is refused), swaps S3Gen on `IQ_S3GEN`, and applies a checkpoint (`IQ_ADAPTER_DIR`: a PEFT adapter directory merged at load, or the merged `t3_merged.safetensors`). Shared by the service and the trainer. |
| Service | `docker/tts-iq/app.py`, compose `tts-iq` (profile `iq`, 127.0.0.1:8027) | the studio's `/synthesize` contract over the library's own `generate`: `language ar\|en → language_id`, the reference wav → `audio_prompt_path`, `exaggeration` (0.5), `cfg_weight` (0.5), `temperature` (0.8), the seed applied to torch/cuda/random before each generation, one generation per request, 24 kHz, `raw=1` = float WAV without the limiter, the FireRed headers (+ `x-watermark: perth-implicit`). `/health` names base, S3Gen, adapter, provenance, and the watermark. |
| Trainer image | `docker/train-iq/Dockerfile` (on the tts-iq image + peft 0.21.0, pyarrow 26.0.0), compose `train-iq` (profile `train`) | the trainer package `docker/train-iq/train/` mounted at `/opt/train`; store read-only; `D:\vewbox-data\training\iraqi` read-write at `/training` |
| Trainer package | `extract_omnilingual.py` · `prepare_tokens.py` · `train_lora.py` · `eval_checkpoint.py` (+ `common.py`) | §3 |
| Dataset pipeline | `scripts/iraqi-dataset.ts` (host) | `raw/<source>` → `prepared/<source>/manifest.jsonl` (24 kHz mono, measurements, provenance) → `train/validation/test` manifests |

Flow: **data pipeline → tokens → Stage A smoke → Stage A → Stage B → eval → serve.**

```
raw/<source>/wavs + metadata.jsonl ──(iraqi-dataset.ts prepare/split)──► train/manifest.jsonl, validation/manifest.jsonl
        │                                                                          │
   extract_omnilingual.py                                               prepare_tokens.py (S3 tokens, VE, text ids)
                                                                                   ▼
                                                   tokens/train, tokens/replay-en ──► train_lora.py --smoke ──► train_lora.py (Stage A)
                                                                                   ▼
                                     checkpoints/<name>/step-NNNNNN/{adapter/, t3_merged.safetensors, provenance.json}
                                                                                   ▼
                       eval_checkpoint.py (the five lines, raw wavs + metrics.json) ──► studio: ECAPA (tts-design) + CER (asr) + the ear
                                                                                   ▼
                                                   IQ_ADAPTER_DIR=/training/checkpoints/<name>/step-NNNNNN  →  tts-iq serves it
```

## 2. Commands (in order)

Every GPU step runs under the lease (`scripts/gpu-hold.ts TTS`); the network is not needed by any of them.

```powershell
# 0. images (later, when the network is free; weights are never baked in)
docker compose --profile iq build tts-iq
docker compose --profile train build train-iq

# 1. data: the Omnilingual Iraqi rows into the folder format the pipeline reads (prints the parquet schema first)
docker compose --profile train run --rm train-iq /opt/train/extract_omnilingual.py --dry-run
docker compose --profile train run --rm train-iq /opt/train/extract_omnilingual.py
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts prepare omnilingual-asr-corpus-iraqi
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts prepare iraqi-dialect-tts-corpus   # once its adapter exists
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-dataset.ts split --seed 7

# 2. tokens (per manifest; validates every character against the V3 vocabulary and every id against t3.text_emb)
docker compose --profile train run --rm train-iq /opt/train/prepare_tokens.py --manifest /training/train/manifest.jsonl --out /training/tokens/train --language ar
docker compose --profile train run --rm train-iq /opt/train/prepare_tokens.py --manifest /training/validation/manifest.jsonl --out /training/tokens/validation --language ar
docker compose --profile train run --rm train-iq /opt/train/prepare_tokens.py --manifest /training/prepared/<english-or-msa-source>/manifest.jsonl --out /training/tokens/replay-en --language en

# 3. the baseline, before any training (the numbers every stop rule compares against)
docker compose --profile train run --rm train-iq /opt/train/eval_checkpoint.py --checkpoint none --reference /training/eval/ref-ar.wav --english-reference /training/eval/ref-en.wav --long-line-file /training/eval/long-line.json --out /training/eval/base

# 4. Stage A smoke — the producer's small controlled experiment: 200 steps on ≤ 30 min, a checkpoint every 50 steps
docker compose --profile train run --rm train-iq /opt/train/train_lora.py --tokens /training/tokens/train --out /training/checkpoints --name stage-a-smoke --smoke --bf16 --commit <git sha>
docker compose --profile train run --rm train-iq /opt/train/eval_checkpoint.py --checkpoint /training/checkpoints/stage-a-smoke/step-000200 --reference /training/eval/ref-ar.wav --english-reference /training/eval/ref-en.wav --long-line-file /training/eval/long-line.json --out /training/eval/stage-a-smoke-200

# 5. Stage A (the recipe: r32/α64, lr 3e-6 cosine, 500 warm-up, batch 16, clip 0.5, 25 % EN/MSA replay)
docker compose --profile train run --rm train-iq /opt/train/train_lora.py --tokens /training/tokens/train --replay-tokens /training/tokens/replay-en --replay-ratio 0.25 --out /training/checkpoints --name stage-a --steps 8000 --batch 16 --micro-batch 4 --bf16 --checkpoint-every 500 --eval-file /training/eval/verdict.json --base-ecapa-sim <base SIM> --base-cer-en <base CER> --commit <git sha>

# 6. serve a checkpoint (the merged form; IQ_ADAPTER_FORM=peft loads the adapter instead)
#    .env.local: IQ_ADAPTER_DIR=/training/checkpoints/stage-a/step-002000
docker compose --profile iq up -d tts-iq
curl -s http://127.0.0.1:8027/health
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/character-a-pack.ts speak --engine vewbox-iq
```

`long-line.json` is `docs/evidence/character-a-voice/long-line.json` copied beside the data (or `--long-line "…"`); the
reference wavs are the character's canonical reference pack (an Arabic clip and an English clip of the same actor —
research §5: the reference should match the language tag).

**Stage B** (partial FT of `t3.tfmr.layers.18–29` + the Arabic rows after merging the Stage A adapter, lr 1e-5 linear
decay, ≥ 20 h multi-speaker data, checkpoint every 500 steps, keep the earliest acceptable) is the next script
(`train_partial.py`, same cache, same checkpoint layout, `t3_merged.safetensors` as its input); it is not written yet —
Stage A has to earn it first.

## 3. What is trained, what is frozen, and why

Stage A trains **≈ 1.5 %** of T3 (printed at start: trainable / total, the LoRA layer count, the row count):

- **LoRA r32 / α64 / dropout 0.05** on `t3.tfmr.layers.{0..29}.self_attn.{q,k,v,o}_proj` and `.mlp.{gate,up,down}_proj`
  (PEFT, regex-targeted; asserted by name).
- **`t3.text_emb`, Arabic-block rows only**: PEFT keeps a trainable copy of the embedding (`modules_to_save`); a gradient
  hook zeroes every non-Arabic row's gradient, that parameter group has weight decay 0, and after every optimizer step the
  non-Arabic rows are copied back from the base — exact, not approximate. `--text-emb-rows arabic+lang` adds the `[ar]`
  tag row; `none` freezes the embedding entirely.
- **Frozen by name** (asserted, the trainer refuses to start otherwise): `cond_enc.spkr_enc`, `cond_enc.perceiver`,
  `cond_enc.emotion_adv_fc` — the only road a speaker identity takes into T3; `speech_emb`, `speech_head` — the meaning of
  the S3 tokens S3Gen decodes; `text_head`; `text_pos_emb`, `speech_pos_emb`; the base Llama weights (LoRA sits beside them).
- **Frozen by construction**: `ve.*` (the voice encoder) and `s3gen.*` (tokenizer, CAMPPlus, flow, HiFT) are never
  instantiated by the trainer — `prepare_tokens.py` ran them once; S3Gen reproduces timbre from the reference x-vector at
  inference, untouched. The Perth watermark is applied by the library at inference; training is unaffected.
- **Loss** = T3's own `loss()`: text CE + speech CE (speech targets = the cached S3 tokens; `--text-loss-weight`).
- **Prompt**: the 150 prompt speech tokens come from *another* utterance of the same speaker (default) — at inference the
  prompt is the reference, never the line — tiled when shorter than 6 s (counted in the log and provenance).
- **Replay**: 20–30 % English/MSA utterances from a second token cache protect `[en]` and MSA (`--replay-ratio 0.25`).
- **Optimiser**: AdamW β(0.9, 0.95), wd 0.01, peak lr 3e-6, 500 linear warm-up steps, cosine to `--lr-min`, grad-accum to
  batch 16, grad-clip 0.5, bf16 autocast only with `--bf16`, a fixed seed (`--deterministic` for the slow exact mode).

## 4. Stop rules

Measured on the **validation** split and the Character A pack after every checkpoint (`eval_checkpoint.py` writes the
wavs; the studio's tts-design `/embed` (ECAPA) and asr services measure; the studio writes
`/training/eval/verdict.json` = `{ "step", "stop", "reason", "ecapa_sim", "cer_en" }`):

1. **Held-out ECAPA similarity** to the reference must not drop more than **0.03** below the base model's
   (`--base-ecapa-sim`): identity is the one thing the adaptation may not spend.
2. **English CER** on the English line(s) must not regress past the base (`--base-cer-en`): `[en]` must survive.
3. **Loss is not quality**: a lower loss with a worse ear verdict is a worse checkpoint. The Egyptian community run judged
   step 2000 best and later steps robotic.
4. **The ear decides**: a native Baghdadi listener's blind pass on the Character A pack (human enough, Iraqi enough, the
   same person, professional enough — `docs/evidence/character-a-voice/`). No machine number promotes a checkpoint.
5. Keep the **earliest** acceptable checkpoint; a non-finite gradient stops the run.

`train_lora.py` stops itself on rule 1, 2 or an explicit `"stop": true` verdict (`--wait-eval-seconds` makes it wait for
the verdict of the checkpoint it just wrote).

## 5. Provenance of a Vewbox-IQ checkpoint

`checkpoints/<name>/step-NNNNNN/provenance.json` (also echoed by `/health` → `adapter.provenance` and in the WAV comment):

| Field | Meaning |
|---|---|
| `name`, `stage`, `step`, `created_at` | which run, which stage (A / B), which optimizer step |
| `base.repo`, `base.revision`, `base.t3_file`, `base.t3_sha256`, `base.code` | `ResembleAI/chatterbox` @ `5bb1f6ee…`, `t3_mtl23ls_v3.safetensors`, its sha256 (hashed at run start unless `--no-base-hash`), the library commit `65b18437…` |
| `adapter` | type (peft-lora), r, α, dropout, the target regex, `modules_to_save`, which `text_emb` rows moved |
| `datasets[]` | every token cache used: its manifests' paths and **sha256**, utterance count, hours, role (main / replay); `replay_ratio` |
| `config` | every command-line argument as run (steps, lr, warm-up, batch, clip, bf16, prompt source, …) |
| `seed` | the seed (data order, LoRA init, dropout) |
| `vewbox_commit` | the studio commit (`--commit`, else `VEWBOX_COMMIT` = `CODE_VERSION` in compose) |
| `frozen` | trainable / total parameters, LoRA layer count, the frozen prefixes, the modules frozen by construction |
| `versions` | torch, peft, transformers |
| `losses`, `merged_sha256`, `prompts` | mean losses over the checkpoint window, the sha256 of `t3_merged.safetensors`, prompt statistics |

Beside it: `adapter/` (PEFT `adapter_config.json` + `adapter_model.safetensors`, the embedding copy included) and
`t3_merged.safetensors` (base + LoRA deltas + the trained rows: the exact T3 state the service loads; its key set is
asserted equal to the base checkpoint's). `train-log.jsonl`, `config.json` and `summary.json` sit in the run folder.

Attribution that travels with every checkpoint's model card: Chatterbox (Resemble AI, MIT); Kharrufa, Taha, Baraq (2024),
DOI 10.5281/zenodo.11170567, CC BY 4.0, modified; Halabi's Arabic Speech Corpus, CC BY 4.0; Omnilingual ASR Corpus
(Meta FAIR), CC BY 4.0, modified — `licensed/*.json` in the dataset tree.

## 6. Open points (to verify on the first real run)

- `PeftModel.from_pretrained` / `get_peft_model` on T3 (a plain `nn.Module`, not a `PreTrainedModel`) with
  `modules_to_save=["text_emb"]`: the parameter name the trainer expects is `text_emb.modules_to_save.default.weight`;
  it dies with the real names if PEFT 0.21 names it otherwise.
- `T3.loss` under bf16 autocast with PEFT layers: the loop uses `t3.loss` on the in-place-wrapped module (not
  `PeftModel.forward`).
- The tokenizer's Chinese table (`Cangjie5_TC.json`) is fetched by the library through `hf_hub_download` into the
  read-only store folder: offline this fails and the library logs a warning (zh only) — confirm it is a warning, not an
  error, at load.
- `s3gen_v3.safetensors` pairing (undocumented upstream): loaded with `strict=False`, refused if any non-buffer key stays
  unloaded; A/B by ear against `s3gen.pt`.
- VRAM: 8 000 MB is an estimate from the NVIDIA model card (≈ 3.5 GB for the model); replace it with the measured
  `x-peak-vram-mb` after the first run.
- The Omnilingual parquet schema (audio struct, transcript and speaker columns) is read at run time and printed; the
  column choice can be forced.

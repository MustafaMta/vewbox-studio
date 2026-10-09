# FireRedTTS3-Base as an evaluation voice service — what upstream is, and how it is run here (2026-10-09)

Research and integration notes for `docker/tts-firered` (compose service `tts-firered`, profile `firered`, engine id
`fireredtts3`). EVALUATION ONLY: the engine is listened to blind against Habibi IRQ and MOSS; it is never returned by
`pickEngine`, never pinnable, never the English default (tests in tests/unit/voice-engines.test.ts). Nothing here claims
Iraqi quality — the research pass (docs/research/IRAQI-ARABIC-TTS-2026-10.md §2.4) found NO Iraqi evidence; the figures
below are upstream's own. Weights are fetched by the studio's fetcher only (manifest group `eval-tts-fireredtts3-base`,
revision dcf1bdcd1b8b25b382fa84c3e34eb82e3054a610); this document and the service never download anything.

## 1. Sources (read 2026-10-09)

- Code: https://github.com/FireRedTeam/FireRedTTS3 — `LICENSE` Apache-2.0; no `setup.py`/`pyproject.toml`, only
  `requirements.txt`; latest commit **7a1f3a7282ff184cc1c7f070556baaf5f08b5216** (2026-09-08, "update readme"; the code
  itself last moved at 844a6e07 "add gradio", 2026-09-08). Pinned in the Dockerfile (`FIRERED_COMMIT`).
  - `requirements.txt`: **torch==2.8.0, torchaudio==2.8.0, torchcodec==0.7.0, flash_attn==2.8.3, transformers==5.6.2,
    einops==0.8.2**, and unpinned `dotenv`, `regex`, `wetext`, `fasttext`, `faster-whisper`.
  - `fireredtts3/core.py` (`FireRedTTS3`), `fireredtts3/llm/fireredtts3_base.py` (`FireRedTTS3Base`, the Qwen3 backbone
    + DiT), `fireredtts3/redae/redae.py` (RedAE audio autoencoder), `fireredtts3/campp/` (CAM++ speaker embedding),
    `fireredtts3/utils/text_tokenizer.py` (language tags), `fireredtts3/utils/utils.py` (`fix_seed`),
    `fireredtts3/utils/text_normalize.py` and `fireredtts3/utils/llm_tn/` (optional text front-ends), `gradio_base.py`.
- Weights: https://huggingface.co/FireRedTeam/FireRedTTS3 (Apache-2.0; Base released 2026-08-05, Instruct + code
  2026-08-13). Files used by Base: `fireredtts3_base/{model.safetensors 8.48 GB, config.json}`,
  `redae/{model.safetensors 3.78 GB, config.json}`, `campp/campplus_voxceleb.bin` (29 MB),
  `text_tokenizer/{tokenizer.json, tokenizer_config.json, vocab.json}`. **Usage Disclaimer** on the card and README:
  zero-shot voice cloning is "intended solely for academic research purposes" — recorded in the registry's licence
  string; the producer decides what that means for any later promotion.
- Report: https://arxiv.org/abs/2608.17492 — Qwen3-1.7B backbone, RedAE semantic-acoustic autoencoder, 24 languages
  including Arabic, no per-language hours, no RTF/VRAM figures.

## 2. The Base model's API, as the code has it

- Construction: `FireRedTTS3(pretrained_model_dir, use_fasttext=True, use_llm_tn=False, use_wetext=True, ...)`.
  `FireRedTTS3Base.__init__` asserts and loads four paths under the directory: `redae/` (`RedAE.from_pretrained`),
  `fireredtts3_base/` (`FireRedTTS3BaseCore.from_pretrained`), `text_tokenizer/` (`AutoTokenizer.from_pretrained`),
  `campp/campplus_voxceleb.bin` (`torch.load(weights_only=True)`). Device is hard-coded `cuda`; no dtype is set, so
  the weights sit on the card as stored; the backbone step runs under `torch.autocast(bfloat16)`.
- Generation: `generate(text, language=None, prompt_text="", prompt_audio=None, prompt_audio_sr=None,
  stop_threshold=0.5, n_timesteps=10, inference_cfg=2.0, seed=1234, do_clean=True, do_tn=True, do_split=True,
  token_max_n=80, token_min_n=60, merge_len=20, cross_fade_ms=50.0, max_text_len=300)` → `(audio[1, T] cpu tensor,
  sample_rate)`. No temperature/top-p: the acoustic path is flow matching (`n_timesteps`, `inference_cfg`); the stop
  decision is `stop_threshold`. `max_text_len` is accepted but not enforced; long text is split into sentences
  (`token_max_n` tokens) and cross-faded (`cross_fade_ms`).
- **Zero-shot cloning = in-context continuation.** The backbone prompt is
  `<|{language}|><|sot|>{prompt_text}{text}<|eot|>` with the reference's RedAE latents prepended: the reference
  TRANSCRIPT is part of the input, so the service requires `reference_text` (as Fish does). The reference wav is
  down-mixed to its first channel, resampled to RedAE's 24 000 Hz, left-padded to a multiple of 960×patch, and also
  fed to CAM++ (which resamples to 16 kHz itself) for the speaker embedding.
- **Language**: the tag must be one of `MULTI_LANG_TAGS` — full names, `<|Arabic|>`, `<|English|>`, … (24) — or a
  `ZH_*` dialect tag; `assert lang_tag in …` otherwise. No Arabic dialect exists. The service maps the studio's
  `language=ar` → `Arabic`, `en` → `English`, and refuses anything else (auto-detection is a fastText/heuristic
  front-end that we do not ship).
- **Sample rate**: RedAE `audio_sample_rate` = 24 000 (config default; read from the loaded model at run time).
- **Seed**: `fix_seed(seed)` = `random.seed`, `torch.manual_seed`, `torch.cuda.manual_seed(_all)`; the flow sampler
  draws `torch.randn` without a generator, so the seed is honoured globally. The service seeds the same way before the
  call and passes `seed` through; one request = one generation (no candidates, no internal retry).
- **Length**: at most 400 generation steps × 4 latent frames × 960 samples / 24 000 Hz ≈ 64 s per sentence; the
  service keeps the studio's 2000-character limit.
- **Emotion/style controls**: none on Base (delivery follows the reference; "use a prompt in the desired language or
  dialect"). Instruct (voice design, template-only speed/pitch/volume edits) is a different checkpoint, not fetched.

## 3. Running it on Blackwell (RTX 5090, sm_120) — decisions

1. **torch 2.8.0+cu128 / torchaudio 2.8.0+cu128 / torchcodec 0.7.0+cu128** from https://download.pytorch.org/whl/cu128
   (cp312 manylinux wheels listed there). Upstream's exact pins; cu128 is the CUDA line of every other service and
   supports sm_120. Python 3.12, the same base image as docker/tts-fish (`nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04`).
2. **No flash-attn; PyTorch SDPA instead.** `flash_attn==2.8.3` is pinned, but no module imports it: upstream only sets
   `attn_implementation='flash_attention_2'` in the Qwen3 configs it builds (`Qwen3_1_7B_ConfigDict` in
   fireredtts3_base.py; RedAE's encoder and its `Qwen3ClsDownsample` in redae.py; the RedAE decoder sets none). The
   DiT's own attention is already `F.scaled_dot_product_attention` (modules.py). transformers 5 raises at model
   construction when flash_attention_2 is asked for and the package is missing, so the service sets
   `config._attn_implementation = 'sdpa'` on every `Qwen3Model`/`Qwen3ForCausalLM` it constructs (a wrapper around
   `__init__`, applied once before upstream is imported; `FIRERED_ATTN=flash_attention_2` restores upstream's choice if
   a wheel is ever installed). Why not the wheel: the release wheels are built for sm80/sm90 CUDA 12 and carry no
   sm_120 kernels we could verify, a compile from source is hours on this machine, and a 1 MB/s link. SDPA with the
   same masks (incl. RedAE's sliding window, which transformers implements as a mask under SDPA) is numerically the
   same attention; `x-engine-version` and `/health` report `attn sdpa` so every listening result names it.
3. **No text front-end.** `use_fasttext=False` (needs `lid.176.ftz`, not fetched; the language is always given),
   `use_wetext=False` (Chinese/English only, and it fetches FST models on first use — the containers run
   `HF_HUB_OFFLINE=1` with no network), `use_llm_tn=False` (an OpenAI-compatible endpoint + key — the producer's
   secrets rule). `do_tn=False` on every call; the studio prepares the line itself (`prepareLineText`). `wetext`,
   `fasttext` (needs a compiler) and `faster-whisper` (the Gradio demo's prompt transcription) are therefore not
   installed; `dotenv` is installed as `python-dotenv` (upstream's `llm_tn` imports it inside a try/except).
4. **Memory**: stored weights are fp32 (8.48 GB for ≈2.1B backbone+DiT parameters; RedAE 3.78 GB) and upstream loads
   them unchanged → ≈12.3 GB of weights on the card plus bf16 autocast activations. Registry estimate **16 000 MB**
   until measured (`x-peak-vram-mb` on every answer, `/health` `peak_vram_mb`).
5. **Secrets**: none needed — weights are local, `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`; the image copies no `.env`;
   the app never prints its environment.
6. **transformers 5.6.2** (exact upstream pin; requires Python ≥3.10). PyPI lists CVE-2026-9856 as fixed in 5.10.0 —
   the service parses only local, pinned checkpoints, so it stays on upstream's pin for fidelity; noted for review.

## 4. The service (docker/tts-firered)

Same contract as docker/tts-fish/app.py: `POST /synthesize` (multipart `text`, `language` ar|en, `reference`,
`reference_text` (required), `seed?`, `n_timesteps?` 1–50 (10), `inference_cfg?` 0–5 (2.0), `stop_threshold?`
0.05–0.95 (0.5), `do_split?` (true), `cross_fade_ms?` 0–500 (50), `raw?`) → audio/wav PCM-16 through the shared peak
limiter, or `raw=1` 32-bit float untouched; headers `x-engine fireredtts3`, `x-model FireRedTTS3-Base`,
`x-engine-version`, `x-seed`, `x-params`, `x-duration`, `x-sample-rate`, `x-raw`, `x-peak-vram-mb`, `x-true-peak`,
`x-gain-reduction`, `x-input-true-peak`, `x-ms`, `x-license`. `POST /unload` drops the model (the GPU lease calls it);
`GET /health` reports weights present, loaded, attention implementation, licence, GPU memory. Port 8026 on 127.0.0.1,
`TTS_FIREREDTTS3_URL` (default http://127.0.0.1:8026). Model path: `/models/voice/fireredtts3-base` (the manifest
folder; the `models` volume mounted read-only like tts-fish).

## 5. Open points

- Unmeasured until the weights land: load time, peak VRAM, RTF, and whether SDPA output is audibly identical to
  upstream's flash-attn demos (it should be; a listening check, not an assumption).
- transformers 5.6.2's handling of `config._attn_implementation` assignment before `PreTrainedModel.__init__` is what
  the SDPA fallback relies on; `/health` shows the implementation actually in effect after load.
- Arabic is MSA-type in upstream's evidence (MLS Arabic CER 1.75 / SIM 78.9, self-reported); Iraqi dialect is the
  listening question, nothing else.

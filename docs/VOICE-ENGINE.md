# Voice engine — production voices, Iraqi Arabic, evaluation

The studio speaks every line through local engines behind one HTTP contract, plus MiniMax (hosted) when a character's
voice is a MiniMax clone. This document covers how a line becomes speech, the Iraqi text path, the pronunciation
dictionary, the evaluation engines (Fish Audio S2 Pro), the evaluation harness, and the Voice Studio page.

Nothing in this document claims native Baghdadi quality. Quality is decided by a native listener (§7).

## 1. Engines

| Engine | Role | Languages | Licence | Where |
| --- | --- | --- | --- | --- |
| Habibi-TTS Specialized IRQ | Iraqi production engine (producer decision 2026-10-07) | AR (Iraqi) | Apache-2.0 (model card) | `tts-habibi` :8021 |
| MOSS-TTS v1.5 | English and general engine (`VOICE_ENGINE_EN`) | EN, AR | Apache-2.0 | :8023 |
| IndexTTS 2.5 | Previous English default; other Arabic | EN, AR | bilibili Model Use License | `tts` :8020 |
| VoxCPM2, dots.tts | Bench engines | EN | Apache-2.0 | profile `bench` |
| MiniMax speech | Hosted voices (not replaced) | many | MiniMax terms | API |
| **Fish Audio S2 Pro** | **Evaluation only** | EN (tier 1), AR (tier 2) | **Fish Audio Research License — non-commercial** | `tts-fish` :8025, profile `fish` |
| **FireRedTTS3-Base** | **Evaluation only** (unheard) | EN, AR (no dialect) | Apache-2.0 (README: cloning "for academic research" — noted) | `tts-firered` :8026, profile `firered` |
| **Vewbox-IQ** (Chatterbox MTL V3 + Iraqi adaptation) | **Evaluation only** until the native pass (docs/VEWBOX-IQ.md) | EN, AR (Baghdadi by adaptation) | MIT + Vewbox-IQ adaptation | `tts-iq` :8027, profile `iq` |

- **Production registry.** `src/server/providers/voice-engines.ts` lists only commercial-safe engines. This is tested:
  no licence there may read non-commercial or research.
- **Evaluation registry.** `src/server/providers/voice-eval-engines.ts` lists engines the studio may listen to but
  never ship.
  - `pickEngine`, `pinnable` and `englishEngine` never return them.
  - A "pinned" name that is not a production engine is ignored (tested).

## 2. The router

`pickEngine` (src/server/providers/speech.ts), in order:
1. The identity's pinned engine, if it is a production engine for that language.
2. Iraqi Arabic → Habibi.
3. English → `VOICE_ENGINE_EN` (MOSS).
4. Other Arabic → IndexTTS.

- `routeLine` sends a Latin or mixed line from a Habibi voice to the English engine.
- A MiniMax identity speaks through MiniMax.
- An engine is never switched automatically on quality grounds. Switching is a producer decision made after listening.

## 3. One line, from script to speech

1. **Line preparation** (`prepareLineText`, src/server/providers/iraqi-text.ts). This changes only what the engine
   hears; the script itself is never rewritten.
   - NFC normalisation, and removal of invisible marks and tatweel.
   - Latin `? , ;` become Arabic marks after Arabic letters, and runs of marks are collapsed.
   - Numbers are spelled the Baghdadi way («3 ساعات» → «ثلاث ساعات», «7:30» → «سبعة ونص»).
   - **The pronunciation dictionary**, native-approved entries only (§4).
   - Every change is named in the job's events.
2. **Synthesis** through `/synthesize`, under the GPU lease (family TTS). It sends the text, the reference clip and its
   transcript (for engines that use it), the seed and the identity's pinned parameters.
3. **Verification.**
   - The transcript is checked against the original script, with the Iraqi fold.
   - Dialect words containing چ or گ go through the phoneme gate.
4. **One attempt per line.** There is no hidden retry and no best-of-N.

**Raw parity (2026-10-08, LAB TEST).** The upstream Habibi CLI and the Vewbox service produce bit-identical audio at the
same seed. The 48 kHz resample changes nothing audible (−56 dB residual). The robotic delivery the producer heard comes
from the model with this prompt, not from Vewbox's integration (docs/PRODUCTION-EXECUTION-STATUS.md, Phase 3).

## 4. The pronunciation dictionary and its native review

`src/domain/pronunciation.ts`, stored in `settings.voice.pronunciations`. Each entry says how an engine should hear a
word: a Baghdadi spelling, a name spelled out, or a loanword.

- **Commands:** `proposePronunciation`, `reviewPronunciation`, `removePronunciation`. A settings patch cannot write the
  dictionary.
- **The native review rule:**
  - Anyone may propose an entry, but a proposal is not spoken.
  - Only a *native* reviewer's approval puts it into effect.
  - A non-native approval is recorded and changes nothing.
  - Any rejection rejects the entry.
- **Matching:** whole words only. An Arabic word keeps an attached prefix (و ف ب ل ال …). Entries are filtered by
  language, dialect and, optionally, engine.

## 5. Fish Audio S2 Pro (evaluation)

- **Weights:** manifest group `eval-tts-fish-s2-pro` (fishaudio/s2-pro @ 1de9996, 11 GB). Every file is pinned with its
  byte size and sha256. Fetch them one group at a time:

  ```
  docker compose -p vewbox --profile models run -d --name vewbox-models-fetch-fish models --manifest manifest.json --root /models --groups eval-tts-fish-s2-pro
  ```
- **Code:** `docker/tts-fish/Dockerfile` builds the official repository at a pinned commit
  (fishaudio/fish-speech @ 214da3c), the way its own Dockerfile does: its lock, `uv sync --frozen`, the cu128 extra,
  Python 3.12, a non-root user.
- **Inference path:** `docker/tts-fish/app.py` loads upstream's own `ModelManager` and calls upstream's `/v1/tts`
  inference wrapper, so a result is exactly what upstream gives.
- **Contract:** the studio's `/synthesize`, plus Fish's own `temperature`, `top_p`, `repetition_penalty`,
  `chunk_length`, `max_new_tokens` and `normalize` fields. Every response carries `x-license`.
- **Acting control:** S2 Pro's real mechanism is free-form inline tags before the words they colour, e.g.
  `[whispering] اسكت شوية...`.
- **GPU:** run it under `scripts/gpu-hold.ts TTS`. It loads lazily, and `/unload` stops upstream's model thread.
- **Licence:** research and non-commercial use only. Commercial use needs a separate licence from Fish Audio, so it can
  never be a production engine until (a) that licence is on file and (b) a native listener passes it.

## 5b. FireRedTTS3-Base (evaluation)

- **Weights:** manifest group `eval-tts-fireredtts3-base` (FireRedTeam/FireRedTTS3 @ dcf1bdcd, 12.3 GB: Base backbone,
  RedAE, CAM++, text tokenizer), read-only at `/models/voice/fireredtts3-base`.
- **Code:** `docker/tts-firered/Dockerfile` builds the official repository at a pinned commit (7a1f3a7) with upstream's
  pins (torch 2.8.0+cu128, transformers 5.6.2) — minus flash-attn: the Qwen3 modules run on PyTorch SDPA (no sm_120
  wheel), and minus the optional text front-ends (the studio prepares the line). docs/research/FIREREDTTS3-INTEGRATION-2026-10.md.
- **Inference path:** `docker/tts-firered/app.py` calls upstream's `FireRedTTS3.generate` with `language` Arabic|English,
  the reference and its transcript (required: the model continues the transcript into the line), a fixed seed.
- **Contract:** the studio's `/synthesize`, plus `n_timesteps`, `inference_cfg`, `stop_threshold`, `do_split`,
  `cross_fade_ms`. Base has no acting control: delivery follows the reference.
- **Reaching it:** `synthesize({ engine: 'fireredtts3', raw: true, … })` (src/server/providers/speech.ts) speaks through
  it when a preview names it; `ttsVramFor('fireredtts3')` sizes its lease (16 000 MB estimate). The router never picks it.

## 6. The evaluation harness

`scripts/voice-acting-eval.ts` with `tests/fixtures/voice/acting-eval-2026-10.json`.

- **Tests:** the producer's six. Five are Iraqi lines (warmth, anger, a whisper, hurt, joy); one is English.
- **Arms:** `habibi` (Arabic only), `fish-plain` (reference only) and `fish-tagged` (inline tags). The words never change
  between arms.
- **Attempts:** one per arm per test, at a fixed seed. A failed request is recorded, not retried.
- **References:**
  - AR: the upstream Habibi demo clip. **LAB TEST ONLY: no speaker permission.**
  - EN: Marcus Bell's designed (synthetic) voice.
- **Phases:** `refs` → `synth --arm … --base …` (TTS lease) → `score --asr … --ecapa …` (ASR lease) → `report` →
  `grades`.
- **Machine numbers recorded:**
  - CER and coverage, using the studio's folds
  - the Iraqi phoneme gate
  - ECAPA similarity to the reference
  - loudness, pauses, and silences at the start and end
  - RTF and peak VRAM

  They are supporting evidence only.

## 7. Listening — the authority

- **Voice Studio → Voice comparison** (`/characters/voices`):
  - Each test's versions play blind as A, B, C.
  - Listeners rate natural, Baghdadi, emotion fit, pronunciation and same-voice (1–5), and write what they heard.
  - The server stores the ratings unblinded and fills nothing in.
  - Engines are named only after someone has rated.
- **Offline:** `listen.html` in the run folder does the same and downloads `ratings.json`. Import it with
  `voice-acting-eval.ts grades --file`.
- **No score is ever written that a person did not give.**

## 8. Voice Studio page

`/characters/voices`, under Characters:
- **Character voices:** each voice's engine, state and dialect judgement.
- **Dialogue editor:** what an engine will hear for a line.
- **Pronunciations:** the dictionary and its review.
- **Voice comparison:** §7.
- **Generation monitor:** the voice jobs.

The interface is English; Arabic content is marked `lang="ar"` and `dir="auto"` and isolated.

## 9. Security

- The Hugging Face token is used only through `HF_TOKEN` or the local credential store. It is never written to source,
  logs, reports or documents.
- The services listen on 127.0.0.1 only.
- A comparison clip is served by (test, letter): no path ever comes from a request (tested with a traversal attempt →
  404).

# Voices, transcription, lip sync and audio tooling (decided 2026-10-02)

## Voices (local, GPU)

| Need | Choice | Why |
|---|---|---|
| English + Arabic character speech with zero-shot cloning and emotion control | **IndexTTS 2.5** (bilibili, released 2026-08-10) | Officially supports Chinese, English, Japanese, Spanish and **Arabic** (~20k h licensed Arabic); emotion by reference audio, 8-dim vector or text with `emo_alpha`; speed control; ~6 GB VRAM; torch 2.8 cu128 (Blackwell OK; the old sm_70 BigVGAN hard-code is gone). Licence: bilibili Model Use License — commercial use allowed below 100M MAU / RMB 1B revenue. |
| Iraqi (Baghdadi) Arabic specifically | **Habibi-TTS, IRQ specialised model** (SWivid / SJTU, 2026-01) | The only open model trained on Iraqi speech (70.7 h; `[IRQ]` dialect token; no diacritics needed). Native-speaker dialect ratings beat ElevenLabs v3 on Iraqi; speaker similarity far higher; naturalness slightly lower. The IRQ checkpoint is **Apache-2.0** (the unified model is CC-BY-NC-SA). F5-TTS architecture, pure PyTorch. |
| Hosted alternative | MiniMax `speech-2.8-hd` (`language_boost: Arabic`, voice clone) | Used when `voiceProvider: MINIMAX` and a key exists. No Arabic dialect controls. |

Routing (`src/worker/handlers/voice.ts`): dialect `IRAQI_BAGHDADI` → Habibi IRQ; other Arabic and English →
IndexTTS 2.5; the character's chosen voice recording is the cloning reference; the identity (provider, model,
reference asset, revision) is stored on the character so every line uses the same voice.

Rejected: XTTS-v2 (non-commercial), Fish/OpenAudio S1/S2 (non-commercial), CosyVoice 3 and Qwen3-TTS (no Arabic),
Chatterbox-Multilingual (MIT, Arabic, but pinned to torch 2.6 without Blackwell wheels), Higgs TTS 3 and Voxtral TTS
(non-commercial), VibeVoice/Kokoro/Orpheus/Dia (no Arabic).

## Transcription (local, GPU)

**faster-whisper 1.2.1 + CTranslate2 4.8.2, `Systran/faster-whisper-large-v3` in float16, word timestamps + VAD.**
Large-v3 rather than large-v3-turbo because the Arabic error rate gap is large (Common Voice 17.8 % vs 25.7 % WER);
turbo stays available for English. CT2 wheels are built for CUDA 12.8 + cuDNN 9; INT8 on sm_120 needs CT2 ≥4.7 (fixed
by PR #1982), float16 is used. All public evidence says zero-shot Whisper degrades on Iraqi dialect; the service
forces `language=ar` and passes an Iraqi-style `initial_prompt`; results are used for validation and timing, and
the producer's text remains the subtitle source of truth.

## Lip sync

MiniMax H3 generates speech and lip movement natively (dialogue tags in the prompt, reference audio for timbre), in
Arabic among its 11 "stable" languages. That is the studio's primary path: a speaking shot is generated with its
line, not dubbed afterwards. Post-hoc video-to-video re-sync was surveyed for the case where a take must keep its
pixels: MuseTalk 1.5 (MIT, real-time, 256² mouth region) and KeySync (Apache-2.0, SVD-based, 512²) are the only
permissively licensed options not built on Wan/LTX/Hunyuan; neither documents Arabic or singing; both pin pre-
Blackwell torch. LatentSync is excluded by policy; X-Dub, TBDub, EchoMimic v3, Hallo-Live, JUST-DUB-IT are excluded
because they are Wan/LTX based. No post-hoc lip-sync model is shipped in this build; it is listed as a limitation.

## Audio tooling (worker image)

- ffmpeg 7 (Debian bookworm) for conform, concat, mixing, two-pass EBU R128 `loudnorm` (−23 LUFS episodes/shorts,
  −14 LUFS music videos, −1 dBTP), subtitle burn-in with libass (Noto fonts for Arabic shaping).
- ffprobe for every accepted file; a full decode pass for every generated take.
- Source separation (python-audio-separator + Kim Mel-Band RoFormer, MIT) and pyannote diarization were evaluated and
  are not needed by the current pipeline (stems come from generation, dialogue is generated per line).

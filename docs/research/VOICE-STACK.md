# Voice stack — research, code review, contract and Phase-2 plan

Agent 6 (Voice and Audio), 2026-10-02. Phase 1: reading, measuring on the CPU, research. No GPU endpoint was called, no
source file changed. Phase 2 (listening tests) runs when the MiniMax batch has released the card.

Services at the time of writing (`GET /health` only): tts-1 IndexTTS 2.5 weights present, not loaded; tts-habibi-1 IRQ
weights present, not loaded; asr-1 large-v3 fp16 + htdemucs present, not loaded; GPU 14.0 / 32.6 GB in use by the video batch.

## 1. The pipeline as it is

| Stage | Code | What it does today |
|---|---|---|
| Reference clip | `src/worker/handlers/voice.ts:33-43` `referenceWav` | first 12 s after a 0.2 s skip (the comment says "most speech-like 12 s"; the code takes the head), mono 24 kHz, **single-pass** `loudnorm=I=-20:TP=-2:LRA=9` (without measured values ffmpeg runs loudnorm in dynamic mode: a limiter/compressor on the timbre reference, not a gain). Candidate order: selected sample → uploads → any audio; bundled samples excluded. |
| Reference text | `voice.ts:47-54` | Whisper `language: auto` once per reference, only for Habibi. Empty on failure → Habibi then runs its own `openai/whisper-large-v3-turbo` download in-container (`preprocess_ref_audio_text`, F5 `utils_infer.py`). |
| Routing | `speech.ts:36-40` `pickEngine`, `voice.ts:66-69` | AR + IRAQI_BAGHDADI → Habibi; everything else → IndexTTS; any line with ≥2 Latin letters next to Arabic → IndexTTS regardless of the identity. |
| Synthesis params | `voice.ts:71`, `docker/tts/app.py:78-93,115-124` | speed fixed 1.0, **no seed**, emotion string → IndexTTS `emo_vector` (8-dim, `emo_alpha` 0.7); Habibi ignores emotion entirely (F5 has no emotion input). Habibi: `nfe_step=32, cfg_strength=2.0, sway=-1.0, cross_fade=0.15, target_rms=0.1, dialect_id=None`, vocos, 24 kHz. IndexTTS: bf16, `use_random=False`, `interval_silence=200`, `max_text_tokens_per_segment=120`, `duration_factor=1/speed`, `use_qwen_emo=False` (so no `emo_text`), 22 050 Hz. |
| Output | `app.py:189-193` | float → `PCM_16` via soundfile with **no peak limiting**; headers x-sample-rate/x-duration/x-engine/x-model. |
| Verify | `voice.ts:75-80`, `speech.ts:119-149` | faster-whisper large-v3, language forced, Iraqi `initial_prompt` (`docker/asr/app.py:26`), VAD; WER over `normalizeArabic` (strips diacritics/tatweel, folds alef/ة/ى only). Gate 0.35; one regeneration; then flag. |
| Identity | `voice.ts:101-103` | `{provider, model: 'habibi'|'indextts', referenceAssetId, language, dialect}`; `VoiceIdentity.params` and the model version are never filled (`src/domain/types.ts:314-324`). Proof line WER ≤ 0.35 → ACCEPT. |
| Take | `src/worker/handlers/take.ts:69-105,180-200` | lines recorded first, `joinSpeech` (0.4 s lead, 0.35 s gaps), length from the recording, anchored as an H3 audio guide (context, not a pinned soundtrack — AUDIOVISUAL-QA E1); the clip is transcribed, `scriptCoverage ≥ 0.7` gates, WER reported. |

## 2. Listening by reading: the suite's failure classes and their likely causes

Suite `scripts/iraqi-voice-suite.mjs` → `docs/evidence/iraqi-suite.md` (mean WER 0.37; male 0.27, female 0.46). CPU measurements
made today on the 32 evidence WAVs (ffmpeg `astats`/`ebur128`/`silencedetect`, no GPU):

| # | Observation | Measurement | Hypothesis (code reference) |
|---|---|---|---|
| D1 | **Hard clipping** of engine output | 25/32 files peak at 0.00 dBFS with astats *flat factor* 10–17 and 13–294 clipped peaks (female-long 294, male-sad 108); only the quiet failures are unclipped | F5 `target_rms` logic amplifies a quiet reference to RMS 0.1 but only scales the output *down* when the reference was quieter than 0.1; our reference is normalised to −20 LUFS ≈ RMS 0.1, so vocos output above ±1.0 is written straight into PCM_16 (`app.py:190`). Fix: peak-normalise to −1 dBTP (or −3) in float before `sf.write`, same for IndexTTS. Clipping also inflates WER and poisons any clone made from these files (see D6). |
| D2 | Female voice worse (0.46 vs 0.27), **short lines lose their opening** («شخبارك.» for «شلونك حبيبي، شخبارك؟», «روح.» for «هسه وين نروح؟») | female outputs are 15–25 % shorter than male for every line (0.89 vs 1.13 s, 1.42 vs 1.80 s, 8.36 vs 10.63 s) and the failures are quiet: female-what −32 LUFS / 0.85 s, female-where −24 LUFS, female-greet −21.7 LUFS | (a) The female reference was an **English clip** (AUDIOVISUAL-QA §Iraqi suite) and the suite transcribed it with `language: 'ar'` forced (`iraqi-voice-suite.mjs:50,68`): the IRQ model was conditioned on a hallucinated Arabic transcript of English speech. (b) F5 budgets the output length as `ref_frames + ref_frames/ref_text_bytes × gen_text_bytes / speed` (`utils_infer.py`): with a reference transcript in another script (ASCII 1 byte/letter, Arabic 2) or a wrong transcript the budget is arbitrary; too short a budget squeezes the line and the first syllables go. (c) Habibi's IRQ data is 58.9 → 70.7 h of in-house ASR data with a stated gender imbalance (paper, Table 1 / QASR remark), so female timbre is less covered. The worker avoids (a) (`auto`), not (b) or (c). |
| D3 | «باچر» → «بسر», «گلتلي» → «قلتلي», «اثنعش» → «اثنى عشر» | male WER 0.25/0.40/0.22 on lines that are otherwise correct | The IRQ `vocab.txt` (1 928 symbols) **does** contain گ چ پ ڤ, diacritics and both digit sets (checked on the HF file), so these are not out-of-vocabulary; they are rare in ASR-derived training text (corpora spell گ as ك/ق, چ as ج/تش) and Whisper writes them back in MSA spelling. `normalizeArabic` (`speech.ts:119-121`) folds neither گ/ق/ك nor چ/ج nor dialect numerals, so the metric charges orthography as error. Whether «باچر» is *pronounced* /s/ or only *transcribed* so is a Phase-2 listening item. |
| D4 | Code-switching fails on Habibi (tech 0.78/0.89, switch 1.00/1.00) | — | Latin letters are in the vocab but there is no English in the IRQ training set; the model has symbols without pronunciations. The worker already routes mixed lines to IndexTTS (`voice.ts:68`); the suite does not mirror that routing, so its table overstates production failure. New risk: a character's voice now alternates between two engines within one scene (timbre discontinuity) — measure in Phase 2 (§5). |
| D5 | WER counts Whisper's own dialect errors | Iraqi WER of a Whisper fine-tune on **real** Iraqi speech is 0.254 (oddadmix/whisper-large-v3-arabic-dialectal-v2, 200 clips); vanilla large-v3 is worse | The 0.35 gate leaves ~0.1 of head-room above the ASR floor; the Arab Voices survey (arXiv 2601.13319) recommends CER / normalised metrics because dialects have no standard orthography. Gate on CER + dialect-folded coverage instead (§4.4). |
| D6 | The character references in the library are **synthesised engine output** | `var/library/audio/2026/10/up-8bde923b06.wav` = 8.362667 s / −15.1 LUFS / peak 0 dBFS, identical to `female-long.wav`; `up-dbb2bcbf56.wav` = 10.634667 s = `male-long.wav`; `up-30064319e6/62ad4cc679.wav` are 22 050 Hz (IndexTTS's rate), 6.3–6.8 s | The "uploaded" voices are clipped TTS lines cloned back into TTS (a feedback loop that flattens timbre and adds artefacts). The suite's original `var/ref-male.wav`/`ref-female.wav` no longer exist, so the suite is not reproducible as documented. There is no curated voice library (§4.2). |
| D7 | Reference preparation | `-ss 0.2 -t 12` + dynamic loudnorm | Head-of-file is not "most speech-like"; dynamic loudnorm alters micro-dynamics of the timbre prompt; F5 clips to ≤12 s at silences itself, IndexTTS truncates at 15 s (`infer_v2_5.py`, `max_audio_length_seconds=15`), F5's own guidance is "<12 s, ~1 s silence at the end". Prefer: VAD-pick the cleanest 6–10 s of continuous speech, static gain to −20 LUFS (two-pass or `volume`), 0.5–1 s tail. |
| D8 | No seed, no params in the identity | `voice.ts:71`, `voice.ts:101` | Both engines honour `torch.manual_seed` (`app.py:81,121`); the worker never sends one, so two takes of one line are two draws. Identity should pin `{seed, nfe, cfg, speed, emotionAlpha, engineVersion}`. |
| D9 | Emotion is a no-op for Iraqi | `app.py:115-124` | F5/Habibi only inherits prosody from the reference. Emotional Iraqi delivery therefore needs an emotion-tagged reference set per voice (§4.2) or IndexTTS for emotional lines (accent risk; test). |

## 3. Research: what the engines actually are (sources fetched 2026-10-02)

| Engine | Arabic | Dialects | Cloning / control | Licence | VRAM / rate | Notes |
|---|---|---|---|---|---|---|
| **IndexTTS 2.5** (bilibili) | yes (added in 2.5; evaluated on an *in-house* Arabic set only) | none claimed | zero-shot, 8-dim emotion vector, `emo_text` via Qwen (off here), `duration_factor` 0.5–2 | **bilibili Model Use License**: commercial use allowed below 100 M MAU / RMB 1 bn; may not be used to improve other models; PRC law | unspecified by upstream; bf16 recommended; 22 050 Hz | no Arabic text normaliser in `infer_v2_5.py` (generic path; Arabic numerals/diacritics untested). github.com/index-tts/index-tts · huggingface.co/IndexTeam/IndexTTS-2.5 |
| **Habibi-TTS IRQ** (F5-TTS v1 DiT + vocos) | yes | 12 dialects; specialised IRQ model: 70.7 h | zero-shot with reference text; no emotion; `dialect_id` tag only for the unified model | IRQ/ALG/EGY/MAR/MSA **Apache-2.0**; Unified/SAU/UAE CC-BY-NC-SA; code MIT | ~4–6 GB; 24 kHz | Paper (arXiv 2601.13802): IRQ test WER-O 17.7 / SIM 0.763 / UTMOS 2.63 vs ElevenLabs v3 14.95 / 0.572 / 2.74; 1 857 h total; gender imbalance stated. github.com/SWivid/Habibi-TTS · huggingface.co/SWivid/Habibi-TTS |
| F5-TTS Arabic fine-tunes (IbrahimSalah MSA, NAMAA Saudi V2, KasbahTTS Algerian, silma derja) | yes | MSA / Najdi / Algerian / Tunisian — **no Iraqi** | as F5 | F5 v1 base weights are **CC-BY-NC** (Emilia); each fine-tune declares its own | as F5 | none replaces Habibi IRQ; relevant only as MSA fallbacks |
| CosyVoice 3 (Fun-CosyVoice3-0.5B) | **no** (9 languages + Chinese dialects) | — | zero-shot, instruct | Apache-2.0 | 0.5 B | out. github.com/FunAudioLLM/CosyVoice |
| Fish-Speech / OpenAudio S1, S2 | yes (S1 lists `ar`; S2 "80+ languages") | none | zero-shot, inline emotion cues | code Apache; **weights CC-BY-NC-SA-4.0** | S1-mini ~0.5 B | non-commercial weights → out for a studio. docs.fish.audio |
| Chatterbox Multilingual (Resemble) | yes (23 languages) | none | zero-shot, `exaggeration`, `cfg_weight`; Perth watermark in every output | **MIT** | 0.5 B Llama; small | no published Arabic eval; reference "must match the language tag" (accent transfer). Candidate challenger for mixed/MSA lines. huggingface.co/ResembleAI/chatterbox |
| XTTS-v2 (Coqui) | yes (17 languages) | none | 6 s zero-shot | **Coqui Public Model License — non-commercial** | 24 kHz | unmaintained; out. huggingface.co/coqui/XTTS-v2 |
| Kokoro-82M | **no** (Nabra-82M is an Arabic fine-tune, fixed voices) | — | no cloning | Apache-2.0 | tiny | out for cloning |
| Orpheus-TTS (Canopy) | Saudi model (`orpheus-arabic-saudi`, gated on HF, hosted on Groq) | Saudi only | fixed voices; cloning only via few-shot prompting of the pretrained model | Apache-2.0 | Llama-3B | out for Iraqi |
| Qwen3-TTS | **no** natively (Emirati community fine-tune exists) | — | 3 s cloning, cross-lingual | Apache-2.0 | 0.6/1.7 B | watch; not for Iraqi today |
| **MiniMax speech-2.8-hd** (hosted; `env MINIMAX_SPEECH_MODEL` default) | yes, `language_boost: Arabic` | none stated | clone from 10 s–5 min (mp3/m4a/wav, ≤20 MB), optional ≤8 s prompt clip; speed 0.5–2, pitch ±12, emotion enum | commercial API | — | already wired (`src/server/providers/minimax.ts:171-182`); dialect fidelity for Iraqi unverified → Phase-2 A/B when a key exists. platform.minimax.io/docs/api-reference/speech-t2a-http · /guides/speech-voice-clone |

ASR for verification: faster-whisper large-v3 (current). Dialect fine-tune `oddadmix/whisper-large-v3-arabic-dialectal-v2`
(Apache-2.0, Iraqi WER 0.254 / CER 0.068 on real speech) can be converted with `ct2-transformers-converter` and swapped in by
`ASR_MODEL_DIR`; test on the suite before adopting (it may normalise *toward* dialect spelling, which helps the metric).

Speaker-embedding models for consistency (CPU): `speechbrain/spkrec-ecapa-voxceleb` (Apache-2.0, EER 0.8 %, torch — the asr
image already has torch 2.8 → `pip install speechbrain`); WeSpeaker (code Apache-2.0; pyannote's `wespeaker-voxceleb-resnet34-LM`
copy is CC-BY-4.0); Resemblyzer (Apache-2.0, 256-d, needs `webrtcvad`, "works best on English"). Recommend ECAPA. Caveat for all:
VoxCeleb-trained, language-agnostic but not Arabic-tuned; use it for *relative* consistency, not for identity claims.

### Recommended stack (keep / change)

- **Keep Habibi IRQ** for Iraqi lines — it is the only open Iraqi model, Apache-2.0, SIM 0.763 on its own IRQ test; nothing in the
  table replaces it. Change: fix D1/D7/D8, give it a real Iraqi reference with a correct transcript, and run the A/B `dialect_id='IRQ'` vs `None`.
- **Keep IndexTTS 2.5** for English, MSA and mixed-script lines (licence acceptable at our scale; verify the "may not improve other
  models" clause against any future fine-tuning). Change: Arabic numerals/diacritics pre-normalisation in the worker; emotion alpha per line.
- **Add Chatterbox Multilingual as the challenger** for mixed-script and MSA lines only if Phase-2 listening rejects IndexTTS's Arabic
  accent (MIT, small; watermark acceptable).
- **MiniMax hosted** stays the opt-in path (key present); it is the only candidate with pitch/speed/emotion on a cloned Arabic voice.
- **Verification**: keep large-v3 now; switch the gate from WER to CER + dialect-folded coverage (§4.4); evaluate the dialectal fine-tune.

## 4. The voice identity contract

### 4.1 Reference-audio validation (CPU, before any build; a failed check is a classified refusal, not an attempt)

| Check | Rule | How |
|---|---|---|
| Container/format | decodable by ffmpeg; ≥16 kHz source (upsampled 8 kHz telephone audio rejected) | `ffprobe -show_streams` |
| Duration | 5–30 s accepted; 6–12 s of *speech* used (F5 ≤12 s, IndexTTS ≤15 s) | `silencedetect -35dB` → speech windows; pick the longest clean run |
| Speech present | ≥3 s of voiced audio; VAD (webrtc/silero) or energy | silero-vad on CPU |
| SNR | noise floor from the quietest 10 % of 100 ms frames vs speech RMS; ≥20 dB pass, 15–20 warn, <15 reject | `astats` + custom frame RMS |
| Clipping | true-peak ≤ −0.5 dBTP and flat factor ≈ 0; the four current references fail this | `astats` Flat_factor/Peak_count, `ebur128=peak=true` |
| Loudness | integrated −26…−14 LUFS before gain; apply a *static* gain to −20 LUFS, TP −2 (two-pass loudnorm or `volume`) | `ebur128` |
| Single speaker | ECAPA embeddings of 1.5 s windows: all pairwise cosine ≥ 0.6; otherwise "more than one voice" | speechbrain, CPU |
| Language | Whisper `auto` on the clip: `language_probability ≥ 0.8` and equal to the character's language; an English clip on an Iraqi character is refused with the message the skill promises | existing `/transcribe` (GPU lease) |
| Provenance | the asset records `consent: {source, rightsHolder, authorisedBy, date}`; without it the voice is `UNAUTHORISED` and cannot be pinned | asset provenance |

### 4.2 Voice modes

- **Automatic**: engine from `pickEngine` plus a studio reference chosen by `{sex, ageBand, language, dialect}` from a **curated
  library of authorised recordings**. The studio has none today (the bundled `public/sample/audio/voice-*.m4a` are UI placeholders;
  the library's "uploads" are engine output, D6). Needed: ≥2 male + ≥2 female Iraqi speakers, ≥2 + 2 English, 3 age bands, each
  10–20 s clean studio speech with a written transcript, recorded or licensed with a signed release (own recordings, commissioned
  voice actors, or CC-BY/CC0 datasets whose terms allow synthesis — check per dataset; Habibi's own corpora are ASR data, not
  releases). Each reference gets `referenceText`, `validation` (§4.1) and `consent`. Emotion variants (neutral/angry/sad/happy) per
  speaker are what gives Habibi any emotional range (D9).
- **Manual**: `{language, dialect, engine, pitch, pace, timbre notes}`. Honest mapping: `pace` → `speed` (F5 speed / IndexTTS
  `duration_factor`); `pitch` → only MiniMax (`pitch` ±12) — for local engines it selects a library reference, it does not transform;
  `timbre notes` → reference selection only; `emotion` → IndexTTS `emo_vector/alpha`, MiniMax `emotion`, Habibi reference variant.
- **Reference (cloning)**: what each engine preserves — Habibi: timbre and the reference's prosody/pace (SIM 0.76); emotion not
  controllable; accent follows the model (Iraqi) not the clip. IndexTTS: timbre + emotion vector; cross-lingual, so an English
  reference speaking Arabic carries an English accent. MiniMax: timbre with full control; dialect unverified. The UI must say this.

### 4.3 Identity persistence (extend `VoiceIdentity.params`, bump `revision` on any change)

`{ provider, engine, engineVersion (image tag / git ref / model file sha256), referenceAssetId, referenceSha256, referenceText,
referenceWindow {from,to}, params { seed, speed, nfeStep, cfgStrength, swayCoef, emotionAlpha, dialectId, sampleRate },
validation (§4.1 result), consent, revision, createdAt }`. Every generated line's provenance already carries `engine/model/
text/reference/check` (`voice.ts:112`); add `params` and `identityRevision` so a line can be regenerated identically.

### 4.4 Consistency across independently generated segments

Same reference window, same transcript, same params, same seed (both engines honour it; add a per-identity seed), one engine per
character per production (a mixed line should not silently switch engines: either the identity is built on IndexTTS for a
bilingual character, or the Latin words are transliterated for Habibi — Phase-2 A/B). Measure: ECAPA cosine between each line and
the reference (target ≥ 0.70 vs reference; ≥ 0.80 between lines of the same character; report min/mean per production), plus
median F0 drift ≤ 15 % between lines, plus loudness −23…−16 LUFS and TP ≤ −1 dBTP per line. Gate text with **CER ≤ 0.15 after
a dialect fold** that maps both sides to one class (ق/گ/ك-as-g → one class, چ/ج/تش → one class, ذ/ز, ث/س, ة/ه, ى/ي, hamza
forms, Arabic-Indic ↔ ASCII digits, spelled numbers «اثنعش» ≈ «اثنى عشر») and LCS coverage ≥ 0.85; keep raw WER in the report.

## 5. Phase-2 test plan (GPU free; run in this order)

0. Preconditions: `curl 127.0.0.1:8020/health 8021 8030` show `loaded:false`, GPU < 2 GB used; the worker's GPU lease idle. Code
   changes first (separate PR, with unit tests on the normaliser): D1 peak limit in `app.py`; suite reference transcription with
   `language: 'auto'`; suite routing parity (`mixed → indextts`); `--seed`, `--nfe`, `--cfg`, `--speed`, `--dialect-id` flags; per-line
   loudness/TP/clipping, F0 and ECAPA similarity columns; CER and folded coverage next to WER.
1. Reference set: record or license 2 male + 2 female Iraqi speakers (10–20 s, transcript), validate with §4.1 (`ffprobe`, `ffmpeg
   -af astats,ebur128,silencedetect`, ECAPA single-speaker check); keep them under `docs/evidence/references/` with consent notes.
   Reproduce the old run once with the same two references the suite used, if they can be recovered, otherwise mark the old table historical.
2. Vocab/engine facts: `docker exec vewbox-tts-habibi-1 grep -c "[A-Za-z]" /models/tts/habibi/Specialized/IRQ/vocab.txt` and the
   same for گ چ; `docker exec vewbox-tts-habibi-1 pip show habibi-tts f5-tts` → `engineVersion`.
3. Extended suite (`node scripts/iraqi-voice-suite.mjs --male R1 --female R2 --seed 7 --out docs/evidence/iraqi-suite-v2.md`),
   phrase classes (each in male and female, Iraqi wording from `skills/iraqi-dialogue`):
   conversational short (8: greetings, «شنو صار؟», «ماكو شي», «يلا خلينا نروح»), long (3 × 8–12 s), emotions (angry/sad/happy/
   afraid/tired — on Habibi via emotion-tagged references, on IndexTTS via `emotion`), names (Iraqi, Kurdish, Western in Arabic
   script), numbers (digits ASCII + Arabic-Indic + spelled: «اثنعش», «خمسطعش», «ميتين», times, prices), questions with rising
   intonation, Arabic/English switching (worker routing, so IndexTTS: «شغّل الـ wifi», «OK سمير…»; Habibi with transliteration
   «واي فاي» as the A/B), pronunciation consistency: the same 5 words («باچر», «گلتلي», «هواية», «شلونك», «الأعظمية») inside 6
   different sentences, scored by CER on the word and by a native listener.
   A/B matrix on the male reference, 6 lines each: `nfe 16/32/64`, `cfg 1.5/2.0/2.5`, `speed 0.9/1.0/1.1`, `dialect_id None/IRQ`,
   reference window 6 s vs 12 s, reference gain static vs dynamic loudnorm. Seeds 7 and 8 for repeatability.
4. Engine comparison on the same 12 lines: Habibi IRQ vs IndexTTS 2.5 (AR) vs Chatterbox Multilingual (`ar`, run from a throw-away
   container, MIT) vs MiniMax speech-2.8-hd (if `MINIMAX_API_KEY`), each with the same reference; report CER, coverage, ECAPA
   similarity, LUFS/TP, seconds, ms.
5. Automatic measures per file (all CPU except ASR): CER/WER/coverage (folded), duration vs expected syllable rate (flag < 70 % or
   > 160 % of the male baseline), integrated LUFS, true peak, clipped-sample count (must be 0), F0 median/IQR (`librosa.pyin` or
   `praat-parselmouth`), ECAPA cosine to reference and between lines; ASR `language_probability`.
6. Native-listener review ("subjective quality pending review"): a labelled folder `docs/evidence/iraqi-suite-v2/listen/` with
   files named `<voice>-<class>-<id>-<engine>-seed<n>.wav` and a sheet `listen.csv` (file, line, 1–5 dialect authenticity,
   1–5 naturalness, 1–5 same-voice-as-reference, free note), blind to engine. Acceptance for a pinned voice: authenticity ≥ 4 and
   same-voice ≥ 4 on ≥ 80 % of its lines; otherwise the identity stays REVIEW.
7. Decide: adopt the parameter set and metric; update `skills/iraqi-dialogue`, `docs/AUDIOVISUAL-QA.md` and the identity schema.

Sources: github.com/index-tts/index-tts · huggingface.co/IndexTeam/IndexTTS-2.5 (+ LICENSE) · github.com/SWivid/Habibi-TTS ·
huggingface.co/SWivid/Habibi-TTS (README, Specialized/IRQ/vocab.txt) · arxiv.org/abs/2601.13802 · github.com/SWivid/F5-TTS
(README, src/f5_tts/infer/README.md, utils_infer.py) · github.com/FunAudioLLM/CosyVoice · docs.fish.audio · huggingface.co/
ResembleAI/chatterbox · huggingface.co/coqui/XTTS-v2 · github.com/canopyai/Orpheus-TTS · huggingface.co/NAMAA-Space/
NAMAA-Saudi-TTS-V2 · huggingface.co/MenaVoice/KasbahTTS-V0 · platform.minimax.io/docs (speech-t2a-http, speech-voice-clone) ·
huggingface.co/oddadmix/whisper-large-v3-arabic-dialectal-v2 · arxiv.org/abs/2601.13319 · huggingface.co/speechbrain/
spkrec-ecapa-voxceleb · github.com/wenet-e2e/wespeaker · huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM ·
github.com/resemble-ai/Resemblyzer.

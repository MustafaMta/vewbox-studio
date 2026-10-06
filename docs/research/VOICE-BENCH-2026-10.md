# Voice engines, October 2026 — candidates and the English benchmark

Voice-model engineer, 2026-10-06. FINAL-LOCAL-DIRECTIVE §§15, 18, 25, 28; MODEL-UPGRADE-DIRECTIVE §§5, 9. Producer's rule
(2026-10-06): commercial-safe models only in the runtime.

## 1. Candidates (primary sources, read 2026-10-06)

| Model | Size | Licence (source) | Published EN cloning (Seed-TTS-eval WER / SIM) | Duration | Emotion | Arabic | Verdict |
|---|---|---|---|---|---|---|---|
| **IndexTTS 2.5** (incumbent) `IndexTeam/IndexTTS-2.5@c39ce5b` | ≈1.5 B | bilibili Model Use License — commercial below 100 M MAU / RMB 1 bn; §3.4c no outputs to train other models (repo `LICENSE`) | IndexTTS2: 2.23 / 70.6 (MOSS table) | `duration_factor` 0.5–2 (the "precise duration" of IndexTTS2 is not enabled in 2.5, README) | 8-dim vector, reference, text | yes | baseline |
| **dots.tts-soar** `dots-studio/dots.tts-soar@2f9b3e1` (rednote-hilab, Jun 2026; code v0.3.1) | 2 B | Apache-2.0 (HF card, GitHub `LICENSE`, pyproject) | **1.30 / 77.1** (card) | none | none (from the reference) | yes (24 langs) | **candidate** |
| **VoxCPM2** `openbmb/VoxCPM2@32279ef` | 2 B | Apache-2.0 (HF card) | 1.84 / 75.3 (dots table) | none | "(style)" instruction prefix | yes (30 langs) | **candidate** (zero download) |
| **MOSS-TTS v1.5** `OpenMOSS-Team/MOSS-TTS-v1.5@cdd3b91` + `MOSS-Audio-Tokenizer@3cd226b` | 8 B (Qwen3-8B) | Apache-2.0 (HF card) | 1.0: 1.84 / 70.9 (8 B) | **token-level** (`tokens=N`, 12.5 frames/s) + `[pause X.Ys]` | none | yes (31 langs) | **candidate** (high capacity, duration) |
| Qwen3-TTS-12Hz-1.7B-Base | 1.7 B | Apache-2.0 | 1.23 / 71.7 | — | CustomVoice variant | **no** | not chosen (SIM, no Arabic) |
| Fun-CosyVoice3-0.5B-2512 | 0.5 B | Apache-2.0 | 1.68 / 69.5 | — | instruct | no | not chosen |
| Chatterbox / Turbo / Multilingual V3 | 0.35–0.5 B | MIT (Perth watermark) | — | — | `exaggeration` | V3 yes | not chosen (light) |
| Fish Audio S2 Pro `fishaudio/s2-pro@1de9996` | 4.4 B | **Fish Audio Research License: non-commercial** | — | — | free-form `[tags]` | Tier 2 | research reference (Iraqi phase only) |
| Voxtral TTS (Mistral) | 4 B | **CC BY-NC 4.0** | — | — | yes | yes | rejected (licence) |
| Higgs Audio v2 | 5.8 B | **Boson research / non-commercial weights** | — | — | yes | — | rejected (licence) |
| F5-TTS base | 0.3 B | **CC-BY-NC** (Emilia) | — | — | — | — | rejected (licence) |
| XTTS-v2 | — | **CPML (non-commercial)** | — | — | — | yes | rejected |
| MisoTTS 8B | 8 B | modified MIT, MAU/MRR thresholds | — | — | — | EN only | not chosen |
| MiniMax speech-2.x | — | hosted API only (no weights) | — | — | — | — | not local; H3's native speech is an Iraqi-phase arm |

## 2. Benchmark design

- Corpus `tests/fixtures/voice/english-bench-2026-10.json`: 28 lines — the 20 of MODEL-EVAL §4 plus one/two-word lines,
  hard names, a flight-number line and two 22–30 s monologues; 8 lines repeat in session 2; 3 lines carry duration
  targets ×0.8 and ×1.25 of the line's own natural length.
- Speakers (one clip each, `docs/evidence/voice-eval-2026-10/speakers.json`): four Common Voice 17.0 contributors chosen
  by their own labels — female teens, male teens, female seventies, male seventies (CC0-1.0) — plus the repository
  fixture. The datasets-server could not list multi-clip speakers, so there is no held-out real clip (ceiling unmeasured).
- Engines through the same `/synthesize` contract: IndexTTS on the live `tts`; candidates in `docker/tts-bench`
  containers (compose profile `bench`, models volume read-only). Seed 7 in session 1, seed 11 in session 2 after
  `/unload` (cross-session), seed 7 repeated (determinism). Engine-internal retries off: attempt #1 is what is measured.
- Machine checks (`scripts/voice-bench.ts score`): large-v3 transcript, the studio's gate (coverage ≥ 0.85, CER ≤ 0.15),
  folded WER, ECAPA cosine to the reference, loudness/true peak, silences, speaking rate, flags (extra words, short line
  over 2.5 s, long pauses), spectrogram PNG per take. Human listening is still required for naturalness, emotion and
  same-voice: `docs/evidence/voice-eval-2026-10/index.html` has every take with its player.

## 3. Results

(Filled from `docs/evidence/voice-eval-2026-10/report.json` when the runs complete.)

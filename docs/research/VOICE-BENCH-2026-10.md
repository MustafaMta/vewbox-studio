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

**The broad bench was stopped by the PRODUCTION-STACK-DIRECTIVE (2026-10-06): MOSS-TTS v1.5 is the English production
candidate; the comparison narrows to MOSS vs the incumbent on the acceptance scene's real lines (§3.2).** What exists
from the broad run stays on disk, unscored, as the record (`docs/evidence/voice-eval-2026-10/takes/*.json`; WAVs under
`media/`, git-ignored):

| Engine | Takes spoken (attempt #1) | Request failures | Note |
|---|---|---|---|
| IndexTTS 2.5 | 170 (session 1, 5 speakers × 28 lines + 30 duration takes) + 35 (session 2) | 0 | `duration_factor` lands within ±1 % of the asked length on 30/30 (0.8× and 1.25×) — the quality of those takes is scored in §3.2 |
| VoxCPM2 clone | 170 + 35 | 0 | RTF ≈ 0.6; one-word lines 0.16–1.3 s (no trailing syllable seen in the durations) |
| dots.tts-soar | 56 (2 speakers) | 0 | RTF 1.5–2 on this image (no torch.compile: the runtime image has no C compiler); session 2 and 3 speakers not run |
| MOSS-TTS v1.5 | — | — | goes straight to the focused validation |

### 3.2 Focused validation: MOSS-TTS v1.5 vs IndexTTS 2.5 on the acceptance lines

Set `tests/fixtures/voice/acceptance-clara-2026-10.json` (Clara's two lines as written and as first written, the two
realistic-take lines of g13, three one-word lines); reference = Clara's pinned designed seed (`gen-b23150ec5e`, 8.8 s);
sessions 1 and 2 (unload between), seed-7 repeat, duration targets ×0.8 / ×1.25 on Clara's lines (MOSS: token budget;
IndexTTS: `duration_factor`). Evidence `docs/evidence/voice-eval-2026-10/moss-vs-indextts/` (report.json, index.html,
review-blind.html; WAV/PNG under `media/`, git-ignored). Run 2026-10-06 18:26–18:46 (MOSS at background priority after
a 30-min wait, IndexTTS and the scoring at normal priority on the producer's instruction). Attempt #1 only.

| | IndexTTS 2.5 | MOSS-TTS v1.5 |
|---|---|---|
| Full lines (5): coverage / CER | 5/5 coverage ≥ 0.83, CER ≤ 0.05 — every word heard; `g13-1` REVIEW on both is the ASR writing "wood smoke" for "woodsmoke" | same: 5/5, every word heard |
| **ECAPA to Clara's reference, full lines** | **0.44–0.67** (mean 0.52) | **0.67–0.86** (mean 0.80); duration-controlled takes 0.78–0.84 |
| Session 2 (unload, reload, seed 11): ECAPA to ref / to the session-1 take | 0.49–0.67 / 0.47–0.86 (`g13-2` fell to 0.47) | 0.69–0.86 / 0.81–0.89 |
| Same seed after a reload | bit-identical | bit-identical |
| Duration control (Clara's lines ×0.8 and ×1.25) | `duration_factor`: within 0.3 % of the target on 4/4, words intact, ECAPA 0.50–0.62 | token budget (12.5 tokens/s): within 2 % on 4/4 (80 ms grid), words intact, ECAPA 0.78–0.84 |
| One-word lines, sent bare (3) | «Nothing.» OK 1.56 s; «Now?» → "No!" (FAIL); «Thanks.» OK — the known defect, cured in production by the lead-in + cut | «Now?» OK 0.72 s; «Thanks.» OK 0.80 s; **«Nothing.» ran on to 5.68 s: "Nothing. Toe. Nothing."** (word, 1.1 s gap, a sung syllable, 2.2 s of near-silence, the word again) |
| Latency, RTF (median) | 2.2 s per line, 1.0 | 2.4 s per line, 1.2; first line 6.6 s |
| Card while loaded | ≈ 6 GB | torch peak 23,986 MB (bf16, SDPA); card total peaked 31.3 GB with other services resident |
| Output | 22.05 kHz | 24 kHz |

**What I could judge from the files:** every full line is spoken completely and in Clara's timbre far more closely on
MOSS (ECAPA +0.28 on average, and higher than IndexTTS's best on every line); MOSS's spectrograms show continuous voiced
phrases with the harmonics intact up to the top of its band, no clicks, no gaps inside a line; loudness and true peak
within the studio's gates on both. **What I could not judge:** naturalness, emotional delivery ("curious", "happy",
"warm") and whether the voice *sounds* like Clara to a person — machine scores only; the blind page
(`review-blind.html`, 8 rows, A/B shuffled, key in `blind-key.json`) is for a listener, and the acceptance engineer's
real-UI proof is the acceptance.

**One-word lines on MOSS:** the fix is the engine's own duration control, not IndexTTS's lead-in: a one-word line is
asked for a 0.9 s budget (`oneWordBudgetSeconds`, `durationFor` in voice-engines.ts; the lead-in stays IndexTTS-only).
Check on the three one-word lines with `duration=0.9` (`takes/moss-budget.json`, 19:00): **3/3 clean** — «Nothing.»
→ "Nothing." 1.12 s, «Now?» → "Now?" 1.12 s, «Thanks.» → "Thanks." 1.04 s (asked 0.88 s = 11 tokens; the engine pads
≈ 0.2 s). The lead-in sentence and the cut are not needed on MOSS.

**Verdict: MOSS-TTS v1.5 is at least as good on pronunciation and duration control and clearly better on persistent
identity and cross-session consistency; it becomes the engine for NEW English voices (`VOICE_ENGINE_EN=moss`).**
IndexTTS 2.5 stays installed (Arabic MSA, mixed lines, the Iraqi phase's code-switched lines) and off the English
default route; Clara's pinned identity keeps IndexTTS until it is rebuilt.

## 4. Integration (in the code, default unchanged)

`src/server/providers/voice-engines.ts` describes every local engine as capability data — URL, languages, duration
control (`speed` / `tokens` / none), emotion input (`vector` / `style` / reference only), whether the reference
transcript conditions it, whether one-word lines need the IndexTTS lead-in, licence, VRAM. `speech.ts` routes by it:

- `VOICE_ENGINE_EN` (env, default `indextts`) chooses the engine for NEW English voices; an identity keeps the engine it
  was pinned with (`VoiceIdentity.model`), so switching the default never changes an existing character's voice.
- Latin-script lines stay on the voice's own engine when it speaks English (a pinned candidate keeps its timbre);
  Habibi voices fall back to IndexTTS as before; mixed Arabic/Latin lines stay on IndexTTS.
- The reference transcript is sent to engines that use it (Habibi, dots); a `durationSeconds` target is sent to an
  engine with token-level control (MOSS); the one-word lead-in applies to IndexTTS only.
- The candidates run as compose profile `bench` services (`tts-bench-voxcpm2` :8040, `tts-bench-dots` :8041,
  `tts-bench-moss` :8042); a promotion adds the chosen one to the default profile and sets `VOICE_ENGINE_EN` — only after
  the real-UI test (FINAL-LOCAL-DIRECTIVE §25).

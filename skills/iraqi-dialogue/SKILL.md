---
name: iraqi-dialogue
description: Iraqi (Baghdadi) Arabic as a first-class production language — wording in the script, the reference recording a voice is built from, engine routing per line, code-switching, the pronunciation suite and its metric, and what only a native listener can judge. Use when writing, recording or checking Iraqi lines.
license: Proprietary to this studio
allowed-tools: story.structured_answer speech.synthesize speech.transcribe
metadata:
  version: "1.2.1"
  kind: "PROCEDURE"
  source: this studio; docs/CONTRACTS-CHARACTER-VOICE.md §1.4–1.5; docs/research/VOICE-STACK.md; suite scripts/iraqi-voice-suite.mjs → docs/evidence/iraqi-suite-v2.md (plan: docs/evidence/iraqi-suite-phase2-plan.md)
  models: qwen3:14b, Habibi-TTS IRQ (F5-TTS v1), IndexTTS 2.5, faster-whisper large-v3
---

# Iraqi Arabic dialogue

## Writing

- Baghdadi wording, never Modern Standard Arabic in dialogue: شلونك، شخبارك، هسه، شنو، ليش، باچر، دير بالك، ماكو، هواية.
- The letters گ and چ are written as such (گلتلي، باچر). Numbers are spoken the Iraqi way (اثنعش، خمسطعش، ميتين).
- Every line carries `textAr` (what is spoken) and `text` (a faithful English gloss for review and subtitles).
- Emotion and delivery are written as a direction on the line (`delivery`), not as extra words. Habibi has no emotion
  input: an Iraqi voice's delivery comes from its reference recording, so an emotional scene needs a reference recorded
  in that register (or IndexTTS with `emotion`, which carries an accent risk — listen first).
- A line that must stay on the Iraqi engine is written in Arabic script throughout: «الواي فاي», not «الـ wifi».

## The reference recording

- **The reference is an upload, never a generated line.** A voice is built only from a real recording of a speaker who
  authorised it; GENERATED and SAMPLE audio is refused (`MISSING_REFERENCE`). The voice service tags every file it
  writes as synthetic, and the suite refuses such a file as a reference.
- Validation before any build (`validateVoiceReference`, CPU): 3–30 s, ≥ 16 kHz, −30…−10 LUFS, no clipping, speech
  present, Arabic by ASR (`language: auto`). Refusals are classified: `TOO_SHORT | TOO_LONG | NO_SPEECH | TOO_QUIET |
  CLIPPING | WRONG_LANGUAGE | BAD_FORMAT`, each with a message that says what to record instead.
- What is sent to the engine: the longest run of speech (short pauses included) ≤ 12 s, cut at silence boundaries and
  chosen by content, not the head of the file; one **static** gain to −20 LUFS (peak ≤ −1 dBTP), 24 kHz mono. The
  window, the transcript and the gain are stored on the identity (`referenceWindow`, `referenceText`).
- Habibi conditions on the reference transcript; it is transcribed once with `language: auto`, and an English clip on an
  Iraqi character is refused rather than conditioned on a hallucinated Arabic transcript.

## Recording

- Routing follows the **line's script**, identically in the worker and the suite (`routeLine`): Arabic script → the
  character's engine (Iraqi dialect → Habibi-TTS IRQ); two or more Latin letters next to Arabic (`MIXED`) or a Latin-only
  line → IndexTTS 2.5, with a job event naming the fallback. The identity's `model` is never changed by a fallback.
- Every line is spoken with the identity's pinned `seed`, `speed` and `emotionAlpha`; the service reports the engine
  version, the seed it used, and the true peak after its limiter (−1 dBTP, no clipping).
- Verification (`verifyLine` → `judgeHeard`): transcribe in the line's language, then **CER ≤ 0.15 and coverage ≥
  0.85** after the Iraqi fold (`normalizeIraqi`: گ/ق/ك and چ/ج as one class each, hamza forms, ة/ه, ى/ي, diacritics,
  attached ما/و, spelled numbers, the Iraqi/MSA word table — اني/انا, هسه/الان, شلون/كيف, باچر/بكرة…). `verdict()` gives
  PASS / REVIEW / FAIL; FAIL regenerates once, REVIEW is kept and flagged for a person, and an ASR outage flags the
  line as unverified — never a silent pass. Raw WER is reported next to it, not gated: it charges Whisper's MSA
  spellings («گلتلي» → «قلتلي») as errors.

## The suite

`pnpm exec tsx scripts/iraqi-voice-suite.mjs --references male=<wav>,female=<wav> --seed 7` — only with the GPU free.
Short lines, emotions, names, numbers (spelled, digits, Arabic-Indic), rising questions, code-switching with its
transliterated twin, and the same words («باچر», «گلتلي», «هواية», «شلونك», «الأعظمية») inside different sentences for
pronunciation consistency; per row: engine and fallback, seconds, LUFS, true peak, clipping, WER, CER, coverage, verdict.
The published table in `docs/evidence/iraqi-suite.md` was made with synthesised references and is historical.

## What the engine hears

Before `/synthesize`, `prepareLineText` (src/server/providers/iraqi-text.ts) spells digits as Baghdadi number words
(«7:30» → «سبعة ونص», «250 ألف» → «ميتين وخمسين ألف», «3 سنين» → «ثلاث سنين»), removes the tatweel and the characters
the Iraqi engine's vocabulary would cut (curly double quotes, zero-width marks, line breaks), and turns a Latin «?»
after Arabic letters into «؟». The script stays as written and the line is verified against it. A line may still be
written with digits, but spelled Iraqi numerals are the clearer script.

## The evaluation set

`docs/voice/IRAQI-EVAL-SET-2026-10.md` and `tests/fixtures/voice/iraqi-eval-set.json`: 60 Baghdadi lines (features,
gloss, emotion, expected sex, whether an MSA reading would sound wrong), spoken by `scripts/voice-eval.mjs` against the
real services and rated by a native listener on its `review.html` (natural / understandable / wrong, dialect, emotion,
same voice). The pass bar and what "verified" may claim before the review are in that document (§6).

## What the machine cannot decide

Whisper proves the words are intelligible, not that the dialect sounds Baghdadi. Dialect authenticity, accent and
naturalness are a native listener's call: the suite writes `listen.csv` next to the files, and the QA report marks them
**subjective quality pending review** until a person has listened. A pinned voice needs authenticity ≥ 4/5 and
same-voice ≥ 4/5 on ≥ 80 % of its lines; otherwise the identity stays `REVIEW`.

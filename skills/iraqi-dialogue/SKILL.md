---
name: iraqi-dialogue
description: Iraqi (Baghdadi) Arabic as a first-class production language — wording in the script, engine routing for voices, code-switching, the pronunciation suite and what only a native listener can judge. Use when writing, recording or checking Iraqi lines.
license: Proprietary to this studio
allowed-tools: story.structured_answer speech.synthesize speech.transcribe
metadata:
  version: "1.1.0"
  source: this studio; suite scripts/iraqi-voice-suite.mjs → docs/evidence/iraqi-suite.md
  models: qwen3:14b, Habibi-TTS IRQ, IndexTTS 2.5, faster-whisper large-v3
---

# Iraqi Arabic dialogue

## Writing

- Baghdadi wording, never Modern Standard Arabic in dialogue: شلونك، شخبارك، هسه، شنو، ليش، باچر، دير بالك.
- The letters گ and چ are written as such (گلتلي، باچر). Numbers are spoken the Iraqi way.
- Every line carries `textAr` (what is spoken) and `text` (a faithful English gloss for review and subtitles).
- Emotion and delivery are written as a direction on the line (`delivery`), not as extra words.

## Recording

- Iraqi voices need an **Arabic reference clip**; a male and a female reference are kept in the character library.
- Engine routing (`pickEngine`): Iraqi dialect → Habibi-TTS IRQ; a line with two or more Latin letters next to
  Arabic → IndexTTS 2.5 (Habibi turns English into Arabic-shaped noise, see the suite).
- Habibi conditions on the reference transcript; the worker supplies it (transcribed once per reference).
- Verification: faster-whisper large-v3 in Arabic; WER ≤ 0.35 passes. The suite phrases:
  «شلونك حبيبي، شخبارك؟» «هسه وين نروح؟» «شنو السالفة؟» «ليش ما گلتلي من البداية؟» «باچر نروح للمكان نفسه.»
  «دير بالك على نفسك.» — male and female, several emotions, numbers, one code-switched line.

## What the machine cannot decide

Whisper proves the words are intelligible, not that the dialect sounds Baghdadi. Dialect authenticity, accent and
naturalness are a native listener's call: the QA report marks them **subjective quality pending review** until a
person has listened.

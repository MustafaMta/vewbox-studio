---
name: audio-first-dialogue
description: The audio-first procedure for a speaking shot — record every line in the character's canonical voice, verify it by transcription, set the shot length from the recording, anchor it as a guide, then prove the take by listening back. Use for GENERATE_TAKE and DIALOGUE_AUDIO on any shot with dialogue.
license: Proprietary to this studio
allowed-tools: speech.synthesize speech.transcribe video.minimax_generate media.probe
metadata:
  version: "1.1.0"
  source: docs/AUDIOVISUAL-QA.md experiments E0, E1, E2a, E2b, E2c
  models: IndexTTS 2.5, Habibi-TTS IRQ, faster-whisper large-v3, MiniMax-H3
---

# Audio-first speaking shots

## Procedure

1. **Reference.** `referenceWav` picks the character's chosen recording (a real upload over a bundled sample),
   trims it to 12 s mono 24 kHz with light loudness normalisation. An Iraqi voice needs an Arabic reference clip.
2. **Record.** `speakLine` per line: Habibi for Iraqi Arabic, IndexTTS for English, Arabic and any line that mixes
   Latin and Arabic script (Habibi has no English). Habibi needs the reference transcript; the worker transcribes
   the reference once and passes it.
3. **Verify.** `verifyLine` transcribes the recording; WER > 0.35 → regenerate once, then flag. A flagged line is
   reviewed by a person, never accepted silently.
4. **Join.** `joinSpeech` with 0.4 s lead-in, 0.35 s gaps, 0.3 s tail; the windows are the line timings.
5. **Length.** `seconds = min(15, max(4, min(max(planned, need), need + 2)))` where `need = ceil(duration + 0.5)`.
6. **Anchor.** The joined track is an audio guide at the first speaking frame (after any continuation guide).
7. **Prove.** After the take: transcribe the clip; `scriptCoverage ≥ 0.7` passes `script-spoken`; WER is reported,
   not gated. Lines are placed on the take by `alignLyrics` and stored as `take.soundtrack.lines` for cues and the
   mix.

## Why

MiniMax H3 renders its own speech natively in sync with the mouths; conditioning audio is context, not a
soundtrack (E1). The words come from the `<d>` tags, so the recording's job is timing, timbre and the proof. A take
that does not say its lines is rejected (`LIP_SYNC_FAILURE`), not patched.

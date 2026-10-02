---
name: audio-first-dialogue
description: The audio-first procedure for a speaking shot — record every line in the character's canonical voice from a validated reference with pinned parameters, verify it by transcription with the dialect-folded gate, set the shot length from the recording, anchor it as a guide, then prove the take by listening back. Use for GENERATE_TAKE and DIALOGUE_AUDIO on any shot with dialogue.
license: Proprietary to this studio
allowed-tools: speech.synthesize speech.transcribe video.minimax_generate media.probe
metadata:
  version: "1.2.0"
  source: docs/AUDIOVISUAL-QA.md experiments E0, E1, E2a, E2b, E2c; docs/CONTRACTS-CHARACTER-VOICE.md §1.4; docs/research/VOICE-STACK.md §2 (D1, D7, D8)
  models: IndexTTS 2.5, Habibi-TTS IRQ, faster-whisper large-v3, MiniMax-H3
---

# Audio-first speaking shots

## Procedure

1. **Reference.** The identity's reference is the producer's **upload** (`identity.referenceAssetId`, else the selected
   sample if `UPLOADED`, else any `UPLOADED` sample; never a GENERATED or SAMPLE clip — refuse with `MISSING_REFERENCE`).
   It was validated on upload (3–30 s, ≥ 16 kHz, −30…−10 LUFS, no clipping, speech in the character's language) and
   trimmed to the stored `referenceWindow`: the longest speech-active run ≤ 12 s at silence boundaries, one static gain
   to −20 LUFS, 24 kHz mono — not the head of the file, no dynamic loudnorm on a timbre reference.
2. **Record.** One line per call, routed by the line's script (`routeLine`): Arabic script → the character's engine
   (Habibi for Iraqi), Latin or mixed → IndexTTS with a job event naming the fallback. Habibi receives the stored
   `referenceText`. Every call sends the identity's `params` (`seed`, `speed`, `nfeStep`, `cfgStrength`,
   `swaySamplingCoef`, `emotionAlpha`) and records the `engineVersion`, the seed and the true peak the service returns.
   The service limits its output to −1 dBTP; a line is never clipped.
3. **Verify.** `verifyLine` transcribes the recording in the line's language and computes WER (reported), CER and
   coverage after the dialect fold; `verdict({ context: 'line' })` → PASS at CER ≤ 0.15 and coverage ≥ 0.85; FAIL
   regenerates once, then flags; REVIEW (just below the gate, or ASR unavailable) is for a person. A line is never
   accepted silently.
4. **Reuse.** A take records a line only when `d.audioAssetId` is missing or stale (identity revision changed);
   recorded lines are written back with `setDialogueAudio` and the take's soundtrack is joined from them.
5. **Join.** `joinSpeech` with 0.4 s lead-in, 0.35 s gaps, 0.3 s tail; the windows are the line timings.
6. **Length.** `seconds = min(15, max(4, min(max(planned, need), need + 2)))` where `need = ceil(duration + 0.5)`.
7. **Anchor.** The joined track is an audio guide at the first speaking frame (after any continuation guide).
8. **Prove.** After the take: transcribe the clip; `verdict({ context: 'take' })` passes `script-spoken` at coverage
   ≥ 0.7 and CER ≤ 0.15 (folded); WER is reported, not gated. Lines are placed on the take by `alignLyrics` and stored
   as `take.soundtrack.lines` for cues and the mix.

## Why

MiniMax H3 renders its own speech natively in sync with the mouths; conditioning audio is context, not a
soundtrack (E1). The words come from the `<d>` tags, so the recording's job is timing, timbre and the proof. A take
that does not say its lines is rejected (`LIP_SYNC_FAILURE`), not patched. The gate moved from WER 0.35 to CER +
coverage because a dialect has no standard spelling: Whisper writes «گلتلي» as «قلتلي» and «اثنعش» as «اثنى عشر», and a
word-level rate charged those as errors (VOICE-STACK.md D3, D5). Pinned seeds and parameters make two takes of one
line the same take (D8); the limiter removes the clipping that 25 of 32 suite files had (D1).

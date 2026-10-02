---
name: voice-identity
description: How a character's voice becomes a persistent identity — the reference rule (only the producer's upload is cloned from), the trimmed reference window, the proof line spoken with the parameters that are pinned and heard back, the single write of proof and identity, per-line routing by script, and the voice lock. Used by Voice Casting and the Dialogue Director.
license: Proprietary to this studio
allowed-tools: speech.synthesize speech.transcribe speech.clone_voice
metadata:
  version: "1.0.0"
  kind: "PROCEDURE"
  source: "src/worker/handlers/voice.ts (pickReference, referenceWav, voiceBuild, routeLine, speakLine, lineRecordingCurrent), src/domain/rules.ts (voiceLock, guardVoiceChange, isCloneSource), src/server/studio/voice-reference.ts, src/server/org/preflight.ts (referenceAudioProblem); docs/CONTRACTS-CHARACTER-VOICE.md §1.4"
  models: "IndexTTS 2.5, Habibi-TTS IRQ, faster-whisper large-v3, MiniMax speech (hosted, only with a key)"
---

# Voice identity: reference, proof, routing, lock

1. **The reference is the producer's upload.** In order: the identity's reference recording, the chosen sample when it
   is an upload, any upload. A generated line (a proof or a preview), a bundled sample voice, or a file the studio's
   own engine made (its synthetic-speech tag is read) is never cloned from; with nothing usable the build is refused
   as `MISSING_REFERENCE` before any engine runs.
2. **The engine hears a window of it**: the trimmed window stored with the upload when it exists, otherwise a run of
   speech of at most 12 s cut at silences (the head of the file when no clear run is found), brought to one static
   gain, 24 kHz mono.
3. **The identity to prove**: the engine for the character's language and dialect (Iraqi Arabic → Habibi-TTS IRQ,
   otherwise IndexTTS 2.5; a MiniMax clone only with a key and when chosen), the speed from the character's pace, and a
   seed.
4. **The proof line**: a fixed sentence in the character's language, spoken with exactly those parameters and
   heard back in that language by the Audio Synchronization Inspector. Coverage ≥ 0.85 and CER ≤ 0.15 after the
   dialect fold make the identity ACTIVE; anything less, or a transcription that could not be made, leaves it in
   REVIEW. WER is reported, not gated.
5. **One write**: the proof audio is stored first; the asset, the proof sample and the identity that cites them are
   written in one batch. A build that fails leaves the character exactly as it was.
6. **Routing per line**: Arabic script → the character's Arabic engine; Latin-only or mixed lines → IndexTTS, with the
   fallback named in the job events. A fallback never rewrites the identity's engine.
7. **Pinned parameters**: every line is spoken with the identity's speed and seed. A stored line recording is current
   only while the identity revision it was made with is the character's current one.
8. **Lock**: once the character has spoken in a video, the voice is preserved (`VOICE_LOCKED`): a voice with an
   identity is never rebuilt, and one locked by its chosen recording alone is built only from that recording.

---
name: voice-identity
description: How a character's voice becomes a persistent identity — its origin (a consented recording or a studio-designed synthetic voice, Rule V-DESIGN), the automatic plan, the design candidates and their measured gates, the trimmed reference window, the proof line spoken with the parameters that are pinned and heard back, the single write of proof and identity, per-line routing by script, listening records and the voice lock. Used by Voice Casting and the Dialogue Director.
license: Proprietary to this studio
allowed-tools: speech.synthesize speech.transcribe speech.clone_voice speech.design_voice speech.embed_voice
metadata:
  version: "2.0.0"
  kind: "PROCEDURE"
  source: "src/worker/handlers/voice.ts (pickReference, referenceWav, voiceBuild, routeLine, speakLine, judgeHeard), src/worker/handlers/voice-design.ts (designAndMeasure, voiceDesign), src/domain/voice-identity.ts (automaticVoicePlan, describeVoiceFromProfile, descriptionProblem, candidateGate, rankDesignCandidates, designedSeedProblem), src/domain/rules.ts, src/server/media/arabic-align.ts, src/server/studio/voice-reference.ts, src/server/org/preflight.ts; docs/CONTRACTS-CHARACTER-VOICE.md §1.4, docs/CONTRACTS-VOICE-IDENTITY-V2.md"
  models: "VoxCPM2 (design), ECAPA-TDNN (similarity), IndexTTS 2.5, Habibi-TTS IRQ, faster-whisper large-v3, MiniMax speech (hosted, only with a key)"
---

# Voice identity: origin, consent, design, proof, routing, lock

1. **Every voice names its origin.** `UPLOAD_CONSENTED`: a real person's recording with the producer's consent
   statement (MY_VOICE or SPEAKER_PERMISSION; the upload is refused without one, `CONSENT_REQUIRED`). `DESIGNED`: a
   studio-designed synthetic voice made from a text description only — "Studio-designed synthetic voice — not a real
   person". `HOSTED`: MiniMax, only with a key. A generated line (proof, preview, dialogue) is never a clone source.
2. **Rule V-DESIGN at the clone boundary.** A file is cloned from only if it is a consented upload, or a design
   candidate whose sha256, hashed from the file as found, equals its design record's (and the asset's, and the pinned
   identity's). A file carrying the studio's synthetic-speech tag with no matching record is refused, whatever path
   brought it in. Only the design seed is cloned (depth 1).
3. **AUTOMATIC.** A consented recording of the character, when there is one. Otherwise English and MSA are designed:
   a deterministic description from the profile (sex, age, pitch, pace, timbre, the language's accent; no names) →
   three candidates speaking the calibration sentence → gates per candidate (CER ≤ 0.10 EN / ≤ 0.15 AR, loudness
   −30…−10 LUFS, true peak ≤ 0 dBTP, 0 clipped samples, ≤ 11.5 s) → two preview sentences per passing candidate through
   the line engine, ECAPA(seed, rendering) averaged → the highest is pinned; every number is recorded on the design
   record. Iraqi is cloned only from an Iraqi consented recording; without one: "Iraqi voices are cloned from a real
   Iraqi recording — record or upload 5–12 seconds of the voice." The `allowDesignedIraqi` experiment (off by default)
   designs an Arabic seed for Habibi, screened on the four Iraqi probe lines by letter coverage then CER; it is always
   REVIEW with the dialect UNVERIFIED.
4. **DESIGN.** The producer's description → three measured candidates with line-engine previews → the producer
   chooses one → that seed is pinned.
5. **The engine hears a window of a recording**: the trimmed window stored with the upload when it exists, otherwise a
   run of speech of at most 12 s cut at silences, brought to one static gain, 24 kHz mono. A design seed is already
   the 24 kHz reference.
6. **The proof line**: a fixed sentence in the character's language, spoken with exactly the pinned parameters and
   heard back. Coverage ≥ 0.85 and CER ≤ 0.15 after the dialect fold make the identity ACTIVE; anything less, or a
   transcription that could not be made, leaves it in REVIEW. Arabic coverage is space-insensitive (a word written
   with other spaces is heard; a word heard with other letters is not), and a line that fails only on «چ» words is
   REVIEW ("چ not confirmable by ASR"), never failed. The evaluation (CER, coverage, loudness, true peak, clipping,
   ECAPA seed→line) is stored on the identity. Naturalness and dialect are never claimed from these numbers.
7. **One write**: the proof audio is stored first; the asset, the proof sample and the identity that cites them are
   written in one batch. A build that fails leaves the character exactly as it was; a design's candidates and record
   are kept either way.
8. **Routing per line**: Arabic script → the character's Arabic engine; Latin-only or mixed lines → IndexTTS, with the
   fallback named in the job events. A fallback never rewrites the identity's engine.
9. **Listening is recorded, never inferred**: "I listened" (naturalness 1–5; for Arabic, authentic yes/no) is the only
   thing that moves the dialect status to LISTENER_APPROVED or LISTENER_REJECTED. It is allowed on a locked voice.
10. **Lock**: once the character has spoken in a video, the voice is preserved (`VOICE_LOCKED`): a voice with an
    identity is never rebuilt, and one locked by its chosen recording alone is built only from that recording.

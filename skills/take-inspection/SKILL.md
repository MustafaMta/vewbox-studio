---
name: take-inspection
description: How a take, cut or export is inspected and how failures are classified — the measured picture and sound checks, the script-spoken proof, thresholds, the failure classes and what a second attempt must change. Use for QA reports and reliability events.
license: Proprietary to this studio
allowed-tools: media.qa_take speech.transcribe media.validate_export
metadata:
  version: "1.2.0"
  kind: "PROCEDURE"
  source: src/server/media/ffmpeg.ts (qaTake), src/server/org/runs.ts (classifyFailure), src/server/org/preflight.ts
  models: ffmpeg/ffprobe, faster-whisper large-v3
---

# Take inspection and failure classes

## Measured checks on a take (Visual Quality Inspector)

Decodable; duration within tolerance of the request; size at least the expected; black frames; frozen frames;
flicker; silence (when sound is expected); true peak. A failed check rejects the take (`OUTPUT_CORRUPTION`).

## The script heard back (Audio Synchronization Inspector)

A speaking take is transcribed; `scriptCoverage ≥ 0.7` of the script in order passes `script-spoken`; the WER is
reported. Failure → `LIP_SYNC_FAILURE`, the take is rejected and the Produce "re-record speaking shots" path makes a
new one through the audio-first pipeline. Lip-sync at frame level and acting are a person's review; a still cannot
prove sync.

## Cuts and exports (Technical Media Inspector)

`validateExport`: lengths within a frame, frame rate, size, timestamps, black stretches. The EDIT handoff also checks
one sound per stretch and loudness at target.

## Failure classes

`INVALID_INPUT` · `UNSUPPORTED_CAPABILITY` · `MISSING_REFERENCE` · `INCONSISTENT_PLAN` · `PROMPT_AMBIGUITY` ·
`WRONG_PARAMETERS` · `INFRASTRUCTURE` · `PROVIDER` · `RESOURCE_EXHAUSTION` · `CHARACTER_INCONSISTENCY` ·
`ENVIRONMENT_INCONSISTENCY` · `VOICE_MISMATCH` · `LIP_SYNC_FAILURE` · `AUDIO_DUPLICATION` · `OUTPUT_CORRUPTION` ·
`CANCELLED` · `UNKNOWN`.

Only `INFRASTRUCTURE`, `PROVIDER` and `RESOURCE_EXHAUSTION` may be retried without a change (bounded, with backoff).
Every other class needs a stated correction before the next attempt; every failure writes a reliability event and
a later success resolves it with the change that was made.

---
name: audio-mix-policy
description: The authoritative audio timeline and mix policy of a cut — typed tracks at sample offsets, one sound per stretch, song master versus take audio versus recorded dialogue, loudness targets, lag alignment, export validation. Use for ASSEMBLE, EXPORT and any mix question.
license: Proprietary to this studio
allowed-tools: media.assemble media.align_lag
metadata:
  version: "2.0.1"
  kind: "PROCEDURE"
  source: src/server/media/assembly.ts (buildMixPlan, assemble, validateExport), src/server/media/sync.ts
  models: ffmpeg/ffprobe
---

# Authoritative audio tracks and mix policy

## Tracks

`MASTER_MUSIC`, `LEAD_VOCAL`, `DIALOGUE`, `GENERATED_VIDEO_AUDIO`, `AMBIENCE`, `SFX` — each with a source asset, a
start sample, a duration in samples, a gain, a mute flag and the policy that placed it. The cut clock is whole frames
at 24 fps; audio is whole samples at 48 kHz.

## Policies

- **Music video**: the song master is the soundtrack from sample 0 at gain 1; every take's own audio is muted (the
  singer's rendered voice would double the vocal). Target −14 LUFS.
- **Film (episode, short)**: a take's own audio carries its recorded line at gain 1; recorded dialogue lines are
  placed only under takes that have no audio; a song bed, when present, at 0.35. Target −23 LUFS.
- **A source appears once.** The plan refuses double routing; the EDIT handoff checks `one-sound-per-stretch`.
- True peak −1 dBTP; two-pass EBU R128.

## Sync

A music-video take's lag against the master stretch is measured on 20 ms loudness envelopes (±600 ms, zero
preferred, needs a +0.01 margin). A lag ≥ 60 ms with a clearly better correlation drops up to 14 head frames of the
take. Nothing is time-stretched; the song is never touched.

## Validation (every cut and export)

Decodable; size; frame rate; audio present; duration within a frame of the plan; audio and video lengths within a
frame; timestamps start at zero; no black stretch ≥ 0.8 s. A failed check fails the job (`OUTPUT_CORRUPTION`) and
is recorded by the Technical Media Inspector.

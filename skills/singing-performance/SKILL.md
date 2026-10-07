---
name: singing-performance
description: Mapping a song to its performers and to time — assigning sections (solo, duet, alternating, ensemble, instrumental), aligning the written lyrics to the real vocal with word timings, and carrying the assignment onto the shots. Use for GENERATE_SONG, PLAN_SHOTS with performanceOnly, and lyric cues.
license: Proprietary to this studio
allowed-tools: story.structured_answer speech.transcribe lyrics.align audio.separate_stems
metadata:
  version: "1.2.0"
  kind: "PROCEDURE"
  source: src/server/media/lyrics.ts (alignLyrics), src/worker/handlers/music.ts (alignSongLyrics), src/server/story/engine.ts (planPerformance)
  models: Qwen3.8-27B-NVFP4, faster-whisper large-v3, ACE-Step 1.5, MiniMax Music 3
---

# Singing performance and lyric timing

## Who sings

- Each lyric section gets a performance mode and singer ids from the lyrics and the story (`planPerformance`).
  A wizard's "everyone sings everything" is a placeholder, not a decision.
- Each shot learns who performs in its window (`performanceFor`); only an assigned performer sings in a shot and
  the prompt says so (`singingTags`); when nobody on screen sings, "the song continues off camera".

## When they sing

- After the song is composed: Demucs separates the vocal stem; faster-whisper transcribes it with word timings;
  `alignLyrics` places each written line monotonically on the words (ALIGNED when matched, SPREAD when interpolated).
- Sections whose lines mostly aligned take their sung extent; every section keeps `lineTimes` for cues and shot
  windows. Sections stay ordered without overlap.
- A music-video take anchors its stretch of the song as the audio guide, so the mouths follow the real vocal; in the
  cut the takes' own sound is muted under the song master and a late take loses head frames (never stretched).

## Checks

Song handoff: duration as planned (±15 % or 5 s), stems separated, ≥ 50 % of the lines placed on the vocal.
Lyric cues are one per line on the vocal's timing, with a right-to-left mark for Arabic.

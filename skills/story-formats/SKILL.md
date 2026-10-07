---
name: story-formats
description: The storytelling strategy of each format the studio makes — a focused short, a serial show, the continuation of a season or an episode from the show's full history, a music video built on its song — with the engagement standard they share and how a story is written in its language (an Iraqi story in Baghdadi Arabic from the first word). Use when developing, writing or reviewing an Auto Idea.
license: Proprietary to this studio
allowed-tools: story.structured_answer
metadata:
  version: "1.0.0"
  kind: "PROCEDURE"
  source: "src/server/story/development/strategy.ts (rules, structure bounds), context.ts (the show's history via showContinuity), resolve.ts (cast and places), rubric.ts (checks); docs/CONTRACTS-AUTO-IDEA.md §2"
  models: "Qwen3.8-27B-NVFP4"
---

# Format strategies and continuation

| Format | Strategy | Structure |
|---|---|---|
| Short | **SHORT_FOCUSED** — one central character, a recognisable conflict, a hook in the first shot (3–5 s), visual storytelling, escalation, a satisfying or deliberate ending; scenes and lines scaled to the seconds | 3–6 scenes (about one per 20 s) |
| New show | **SHOW_SERIAL** — a premise that generates episodes, a recurring cast with relationships, a world, a season arc, a conflict per episode that moves it, characters who change, a meaningful season end; a cliffhanger only when earned | 3–6 episodes of the first season |
| Next season | **SEASON_CONTINUATION** — continue from the last ending; keep language, dialect, voices, identities; reuse cast and places by id; pick up the open storylines; newcomers only with a story purpose | 3–8 episodes, each continuing the last |
| Next episode | **EPISODE_CONTINUATION** — start where the last episode ended; the regulars carry it; at least one open storyline; a guest only when needed | 3–6 scenes |
| Music video | **MUSIC_FIRST** — the song first (lyrics, mood, tempo, structure, performers, emotional progression); sections map to the song's sections in order; performers sing their sections on screen; editing on the beat | 3–6 sections, each titled with its song section |

The show's history comes from `showContinuity()`: every season and its arc, the episodes with where each ended, the
bible (timeline, relationships, open storylines) and the locked cast and places. A show's language and dialect never
change; a continuation's research follows the show's own genre.

**Engagement standard**: an opening that earns attention, clarity, originality, emotion, a character to care about,
pacing without dead air, a real conflict, curiosity, a visual story, progression, an ending that pays off. Every scene
has a purpose; no arbitrary twists, constant action or manipulative retention tricks.

**Language**: an Arabic story is written in its dialect from the concept on — titles, hook, logline, premise,
structure, spoken lines — with an English gloss for review, never translated from English. Iraqi stories use natural
Baghdadi wording and spelling (چ، گ) and everyday Iraqi texture.

Checked in code by the Story Editor's step: structure size for the format, an Arabic story actually in Arabic script,
a continuation's language, returning cast and open storylines, a music video's tagged song.

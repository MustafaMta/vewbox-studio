---
name: screenwriting
description: Developing a brief into a story and writing scenes for generated film — scene breakdowns with purpose and emotional objective, beats that can be shown in seconds, short speakable lines, Arabic with English gloss, the regulars rule for episodes. Use for DEVELOP_STORY, WRITE_SCRIPT and story review.
license: Proprietary to this studio
allowed-tools: story.structured_answer studio.read studio.command
metadata:
  version: "1.1.0"
  source: src/server/story/engine.ts (developStory, writeScript, libraryGuests), src/server/story/prompts.ts
  models: qwen3:14b or the configured hosted LLM
---

# Screenwriting for generated film

## Developing

- From the brief and the show's World Bible: logline, synopsis, genre, mood, and a scene breakdown where every scene
  has a title, a place, a time of day, the people in it, a purpose, an emotional objective, an entry and exit state.
- **Episodes are carried by their show's regulars.** Characters from other shows appear only when the brief names
  them (`libraryGuests`: at most two). Any other library name the model uses is dropped and reported.
- New characters and places are created with a full design (appearance, wardrobe, personality; layout, landmarks,
  props) so Casting and World can draw them without guessing.
- Ids are trusted only when the name agrees; otherwise the name is resolved against the cast.

## Writing

- Present tense, what we see, one beat at a time; each beat fits a shot of a few seconds.
- Lines are short — spoken in under six seconds — and in the production's language. Arabic productions: the dialect
  in `textAr`, a faithful English gloss in `text`. Every line names its speaker from the cast.
- A line, once approved, is never paraphrased downstream: it goes into the take's `<d>` tags verbatim.

## The handoff checks

Story: scenes present, every scene located, every scene cast, no foreign characters.
Script: every scene written, every line glossed (Arabic), no line over 28 words.

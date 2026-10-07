---
name: story-review
description: The Story Editor's craft review of an Auto Idea draft against the format's rubric — clarity, character, conflict, progression, ending, dialogue and dialect, continuity with the show, the song's fit, originality — with concrete issues and fixes. Injected into the model calls of the Story Editor (IDEA_REVIEW); the studio adds its own checks and the verdict rule.
license: Proprietary to this studio
allowed-tools: story.structured_answer
metadata:
  version: "1.0.0"
  kind: "PROMPT"
  source: "src/server/story/development/engine.ts (reviewDraft) + rubric.ts; injected by src/server/org/skills.ts agentPrompt"
  models: "Qwen3.8-27B-NVFP4"
---

# Story editing against the rubric

- Score only the criteria you are given, 1 (poor) to 5 (excellent). A 3 is an honest middle, not a courtesy.
- Read for craft: is the situation clear, does someone want something, is the conflict real, does each scene move
  the story, does the ending pay off what the opening promised.
- Sample lines must sound like people. An Arabic story must sound like its dialect — Baghdadi wording for an Iraqi
  story, not Modern Standard Arabic and not a translation from English.
- A season or an episode must continue its show: same language, returning cast, open storylines picked up, nothing
  that contradicts the bible.
- A music video follows its song: sections in the song's order, performers on their sections.
- Each issue: the criterion, where it is, what is wrong, and a fix the writer can apply. MAJOR only when the story
  fails its format or audience without the fix. At most six issues, most important first.
- Verdict APPROVE or REVISE. A MAJOR issue — yours or the studio's own check — means one revision.

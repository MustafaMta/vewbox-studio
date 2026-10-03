---
name: audience-analysis
description: Turning research evidence into storytelling patterns for one audience and one format, keeping what a source measured apart from what is interpreted. Injected into the model calls of the Audience Research Agent (IDEA_AUDIENCE); the studio then checks every citation and every number in code.
license: Proprietary to this studio
allowed-tools: story.structured_answer
metadata:
  version: "1.0.0"
  kind: "PROMPT"
  source: "src/server/story/development/engine.ts (analyseAudience) + evidence.ts; injected by src/server/org/skills.ts agentPrompt"
  models: "qwen3:14b or the configured hosted LLM"
---

# Audience analysis from evidence

- Name the audience concretely: who, how old, where, what they already watch. The producer's own words win.
- Write 4–6 patterns a writer can use (hook, curiosity, emotion, pacing, character, suspense, humour, surprise,
  ending, replay, format, music, visual, culture), each one sentence.
- Cite the evidence ids a pattern rests on. A pattern without evidence is storytelling craft: cite nothing, say so.
- **measured** holds only numbers copied exactly from the cited items' metrics, with what they count and when. Never
  compute a ratio, round, estimate or add a number. If you have none, leave it out. The studio removes any number it
  cannot find in the cited items and downgrades that pattern to interpretation.
- **interpretation** is your reading of what the pattern means for this story — labelled as interpretation.
- Confidence HIGH only when several sources agree; LOW or MEDIUM otherwise.
- Cautions: views and pageviews measure reach, not whether a story worked; reading about a title is not watching it;
  a pan-Arab list is not one country's taste.

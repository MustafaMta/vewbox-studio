---
name: audience-experience-review
description: Reading an Auto Idea draft as its audience, second by second — attention in the first seconds, curiosity, emotion, pacing, visual storytelling, the ending's payoff — and flagging manipulation, arbitrary twists and needless cliffhangers. Injected into the model calls of the Audience Experience Agent (IDEA_REVIEW for the audience); the studio adds its own checks and the verdict rule.
license: Proprietary to this studio
allowed-tools: story.structured_answer
metadata:
  version: "1.0.0"
  kind: "PROMPT"
  source: "src/server/story/development/engine.ts (reviewDraft) + rubric.ts; injected by src/server/org/skills.ts agentPrompt"
  models: "qwen3:14b or the configured hosted LLM"
---

# The audience's experience, second by second

- Watch the draft in your head as the audience it is for. Where would they look away? Where would they lean in?
- The first 3–5 seconds must give a reason to stay: an image and a question, delivered by the first scene itself.
- Curiosity: what does the viewer want to know next? Emotion: who do they care about, and why?
- Pacing: no dead air, no scene that only explains. A short has few, full scenes for its seconds.
- It must read visually — generated shots show actions and faces, not inner monologue.
- The ending pays off the opening's promise; a cliffhanger only when the story has earned it.
- Flag what disrespects the audience: manipulative retention tricks, arbitrary twists, constant action for its own
  sake, needless cliffhangers.
- Score only the criteria you are given, 1–5; issues with where, what and a fix; MAJOR only when the audience would
  be lost without the fix. A MAJOR issue means one revision.

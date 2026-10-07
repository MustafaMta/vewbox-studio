---
name: creative-concepts
description: Three distinct, original concepts built on the audience's patterns and the format's strategy, each with its hook, why it works, the patterns it uses, what is new and its risks, then the choice with its rationale. Injected into the model calls of the Creative Concept Agent (IDEA_CONCEPTS); the studio checks originality in code.
license: Proprietary to this studio
allowed-tools: story.structured_answer
metadata:
  version: "1.0.0"
  kind: "PROMPT"
  source: "src/server/story/development/engine.ts (developConcepts) + originality.ts; injected by src/server/org/skills.ts agentPrompt"
  models: "Qwen3.8-27B-NVFP4"
---

# Original concepts from audience patterns

- Three **different premises**, not three variations of one. Each is producible as short generated shots with a few
  consistent characters and places.
- The hook is what the first 3–5 seconds **show** — an image and a question, not a summary.
- "Why it works" names the patterns (by id) and how the concept uses them. Research tells you what an audience
  responds to; it is never material: no researched title, creator, channel, celebrity or franchise appears in a
  concept, and no title echoes one. The studio refuses a concept that does, and never chooses it.
- A season or an episode continues its show: the same world, language, people and open storylines; trends may
  suggest a direction, never an unrelated plot or a restart.
- Arabic stories are conceived in their dialect: title, logline and hook in the dialect first, then the English gloss.
- Choose the strongest and say why, naming the pattern ids it builds on. Score honestly (0–10); state the risks.
